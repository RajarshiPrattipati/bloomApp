extends Node3D
## BLOOM — 3D village builder. Thoughtful base, player-controlled camera
## (one-finger pan, two-finger rotate/zoom), connected-growth placement with
## persistent local layout, and a themed, responsive container HUD. The server
## (Net autoload) is authoritative for the spin/economy/anti-cheat loop.

const DW := 540.0
const DH := 960.0
const GRID_MIN := -5
const GRID_MAX := 5
const BUILDING_MODELS: Array[String] = [
	"building-small-a", "building-small-b", "building-small-c",
	"building-small-d", "building-garage",
]

# ── server state ──
var view: Dictionary = {}
var cfg: Dictionary = {}
var coins_shown := 0.0
var momentum_shown := 1.0

# ── ambient scenery animation ──
var _t := 0.0
var _boats: Array = []   # {node, base_y, speed, phase}
var _birds: Array = []   # {node, radius, speed, phase, cx, cz, y}
var spinning := false
var menu_open := false
var gh_ends_at_ms := 0

# ── grid ──
var no_build: Dictionary = {}
var seed_cells: Dictionary = {}
var built: Dictionary = {}        # Vector2i -> Node3D
var layout: Array = []            # [{x,y,m}] persisted placement choices
var place_markers: Array[Node] = []

# ── camera ──
var cam: Camera3D
var cam_target := Vector3(0, 0.4, 0)
var yaw := 45.0
var pitch := 36.0
var zoom := 21.0
var touches: Dictionary = {}
var drag_moved := false
var pinch_prev := 0.0
var twist_prev := 0.0
var has_two := false

# ── placement ──
const OK_GREEN := Color(0.23, 0.80, 0.44)   # valid plot / confirm
const BAD_RED := Color(0.87, 0.31, 0.29)    # invalid plot / cancel
const GRAB_PX := 140.0                       # touch radius to grab the move handle
var placing := false
var ghost: Node3D
var ghost_foot: MeshInstance3D
var ghost_handle: Node3D                      # draggable move gizmo under the ghost
var ghost_cell := Vector2i(999, 999)
var ghost_valid := false
var _last_valid := -1                         # gate re-tinting to validity changes
var dragging_building := false

# ── HUD refs ──
var hud: CanvasLayer
var coins_label: Label
var spins_label: Label
var level_label: Label
var momentum_bar: ProgressBar
var momentum_label: Label
var hot_label: Label
var result_label: Label
var spin_btn: Button
var build_btn: Button
var help_btn: Button
var confirm_btn: Button
var cancel_btn: Button
var actions_row: HBoxContainer
var confirm_row: HBoxContainer
var palette_row: HBoxContainer
var palette_buttons: Array[Button] = []
var selected_model := 0
var gh_banner: PanelContainer
var gh_label: Label
var toast_box: VBoxContainer
var menu_node: CanvasLayer
var login_node: CanvasLayer

var prev_level := 1

func _ready() -> void:
	_build_world()
	_build_base()
	_setup_camera()
	_setup_hud()
	_maybe_login()
	Sfx.start_ambience()
	if "--placing" in OS.get_cmdline_user_args(): _enter_placing()  # dev: force placement UI pre-network
	await Net.ensure_auth()
	_load_layout()
	cfg = await Net.get_config()
	_apply_view(await Net.session())
	coins_shown = float(_wallet("coins", 0.0))
	momentum_shown = float(_wallet("momentum", 1.0))
	Net.event("session_start_godot")
	var t := Timer.new()
	t.wait_time = 1.5
	t.autostart = true
	add_child(t)
	t.timeout.connect(_on_sync)
	for a in OS.get_cmdline_user_args():
		if a == "--autospin": _auto_spin()
		if a == "--autobuild": _auto_build()
		if a.begins_with("--menu"): _open_menu_dev(a)

func _open_menu_dev(arg: String) -> void:
	_on_menu()
	if "=" in arg and is_instance_valid(menu_node):
		await get_tree().create_timer(0.6).timeout
		await menu_node._switch(int(arg.split("=")[1]))

# ── 3D world / base ───────────────────────────────────────────────────────────
func _instance(model: String) -> Node3D:
	return (load("res://models/%s.glb" % model) as PackedScene).instantiate()

func _put(model: String, cell: Vector2i, rot_y := 0.0, y := 0.0) -> Node3D:
	var n := _instance(model)
	n.position = Vector3(cell.x, y, cell.y)
	n.rotation_degrees.y = rot_y
	add_child(n)
	return n

func _build_world() -> void:
	var env := WorldEnvironment.new()
	env.environment = _make_environment()
	add_child(env)
	# warm key sun + a cool fill so nothing reads as flat grey
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-52, -50, 0)
	sun.light_energy = 1.25
	sun.light_color = Color(1.0, 0.95, 0.84)
	sun.shadow_enabled = true
	add_child(sun)
	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-30, 130, 0)
	fill.light_energy = 0.35
	fill.light_color = Color(0.78, 0.86, 1.0)
	add_child(fill)
	_build_scenery()
	for x in range(GRID_MIN, GRID_MAX + 1):
		for z in range(GRID_MIN, GRID_MAX + 1):
			_put("grass", Vector2i(x, z))

# Pastel sky + soft atmosphere — replaces the flat grey background.
func _make_environment() -> Environment:
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var sm := ProceduralSkyMaterial.new()
	sm.sky_top_color = Color("8fb6ff")        # periwinkle
	sm.sky_horizon_color = Color("ffe2d0")     # warm peach
	sm.sky_curve = 0.10
	sm.ground_horizon_color = Color("ffe2d0")
	sm.ground_bottom_color = Color("a8e6df")   # pastel teal (water haze)
	sm.ground_curve = 0.05
	sm.sun_angle_max = 24.0
	sm.energy_multiplier = 1.05
	sky.sky_material = sm
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 1.15
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_white = 1.1
	# gentle aerial haze so the far hills melt into the sky (subtle at our depth)
	env.fog_enabled = true
	env.fog_light_color = Color("dbe6ff")
	env.fog_sun_scatter = 0.1
	env.fog_density = 0.0026
	env.fog_aerial_perspective = 0.6
	env.fog_sky_affect = 0.0
	# a kiss of bloom for the pastel glow
	env.glow_enabled = true
	env.glow_intensity = 0.35
	env.glow_bloom = 0.08
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
	return env

func _mark(cell: Vector2i, is_seed: bool) -> void:
	no_build[cell] = true
	if is_seed: seed_cells[cell] = true

func _build_base() -> void:
	_put("pavement-fountain", Vector2i(0, 0))
	_mark(Vector2i(0, 0), true)
	for c in [Vector2i(0, 1), Vector2i(0, -1), Vector2i(1, 0), Vector2i(-1, 0), Vector2i(1, 1), Vector2i(-1, -1), Vector2i(1, -1), Vector2i(-1, 1)]:
		_put("pavement", c)
		_mark(c, true)
	for x in [2, 3, 4, 5, -2, -3, -4, -5]:
		_put(("road-straight-lightposts" if abs(x) == 3 else "road-straight"), Vector2i(x, 0), 90.0)
		_mark(Vector2i(x, 0), true)
	for z in [2, 3, -2, -3]:
		_put("road-straight", Vector2i(0, z), 0.0)
		_mark(Vector2i(0, z), true)
	for c in [Vector2i(4, 4), Vector2i(-4, 4), Vector2i(4, -4), Vector2i(-4, -4), Vector2i(5, 2), Vector2i(-5, -2), Vector2i(3, -4), Vector2i(-3, 4), Vector2i(2, 4), Vector2i(-2, -4)]:
		_put(("grass-trees-tall" if (c.x + c.y) % 2 == 0 else "grass-trees"), c)
		no_build[c] = true

# ── fixed decorative environment (island, water, forest ring, hills, clouds) ──
const C_MEADOW := Color("8fcf63")     # wild meadow green (a touch deeper than the lawn tiles)
const C_CLIFF := Color("d9b06f")      # sandy cliff
const C_BEACH := Color("f1dca6")      # pale shore sand
const C_WATER := Color("63c3c0")      # pastel teal sea
const C_SHALLOW := Color("a7e8de")    # bright shallows

func _mat(color: Color, rough := 0.9, metallic := 0.0, unshaded := false) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = rough
	m.metallic = metallic
	if unshaded:
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	if color.a < 1.0:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	return m

func _disc(radius: float, height: float, y: float, color: Color, rough := 0.9) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = radius; cm.bottom_radius = radius; cm.height = height
	cm.radial_segments = 48
	mi.mesh = cm
	mi.material_override = _mat(color, rough)
	mi.position = Vector3(0, y, 0)
	add_child(mi)
	return mi

func _build_scenery() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 13377

	# ── the island: grassy top, sandy cliff sides, a pale beach, sitting in the sea
	_disc(11.4, 1.7, -0.9, C_CLIFF, 0.95)            # cliff body
	_disc(12.4, 0.18, -0.12, C_BEACH, 1.0)           # beach shelf rim
	_disc(11.2, 0.16, -0.04, C_MEADOW, 0.95)         # meadow top (around the lawn tiles)

	# ── the sea: a huge calm plane + a brighter shallows ring hugging the island
	var sea := MeshInstance3D.new()
	var pm := PlaneMesh.new(); pm.size = Vector2(600, 600)
	sea.mesh = pm
	sea.material_override = _mat(C_WATER, 0.15, 0.1)
	sea.position = Vector3(0, -0.42, 0)
	add_child(sea)
	_disc(18.0, 0.1, -0.34, Color(C_SHALLOW.r, C_SHALLOW.g, C_SHALLOW.b, 0.8), 0.25)
	# a soft foam ring where the shore meets the sea
	var foam := MeshInstance3D.new()
	var tm := TorusMesh.new(); tm.inner_radius = 11.7; tm.outer_radius = 12.6; tm.rings = 48; tm.ring_segments = 16
	foam.mesh = tm
	foam.material_override = _mat(Color(1, 1, 1, 0.7), 1.0, 0.0, true)
	foam.position = Vector3(0, -0.2, 0)
	add_child(foam)

	# ── rocky Kenney coastline: tall rocks ring the shore, with chunky headlands
	var coast := ["nature/rock_largeA", "nature/rock_largeB", "nature/rock_largeC", "nature/rock_largeE", "nature/rock_tallA", "nature/rock_tallC"]
	var n_coast := 30
	for i in n_coast:
		var ang := (TAU / n_coast) * i + rng.randf_range(-0.07, 0.07)
		var rad := rng.randf_range(11.1, 12.0)
		_put_model(coast[rng.randi() % coast.size()], Vector3(cos(ang) * rad, -0.18, sin(ang) * rad), rng.randf() * TAU, rng.randf_range(0.7, 1.25))
	for i in 6:
		var ang := rng.randf() * TAU
		var rad := rng.randf_range(10.9, 11.7)
		_put_model("nature/cliff_block_rock", Vector3(cos(ang) * rad, -0.95, sin(ang) * rad), rng.randf() * TAU, 1.05)

	# ── lush forest ring: varied nature trees (with autumn pops) around the edge
	var trees := ["nature/tree_default", "nature/tree_detailed", "nature/tree_fat", "nature/tree_oak", "nature/tree_tall", "nature/tree_pineRoundA", "nature/tree_pineRoundC", "nature/tree_pineTallA", "nature/tree_blocks", "nature/tree_cone"]
	var trees_fall := ["nature/tree_default_fall", "nature/tree_oak_fall", "nature/tree_detailed_fall", "nature/tree_tall_fall"]
	for x in range(-10, 11):
		for z in range(-10, 11):
			var c := Vector2i(x, z)
			var d := Vector2(x, z).length()
			if d < 6.0 or d > 10.2: continue
			if no_build.has(c): continue
			if rng.randf() > 0.55: continue
			var jit := Vector3(rng.randf_range(-0.3, 0.3), 0, rng.randf_range(-0.3, 0.3))
			var pick: String = trees_fall[rng.randi() % trees_fall.size()] if rng.randf() < 0.18 else trees[rng.randi() % trees.size()]
			_put_model(pick, Vector3(x, 0, z) + jit, rng.randf() * TAU, rng.randf_range(0.85, 1.25))

	# ── boulders & stones scattered on the island
	var rocks := ["nature/rock_smallA", "nature/rock_smallB", "nature/rock_smallC", "nature/stone_smallA", "nature/rock_largeD", "nature/stone_largeA"]
	for i in 15:
		var ang := rng.randf() * TAU
		var rad := rng.randf_range(6.0, 10.8)
		_put_model(rocks[rng.randi() % rocks.size()], Vector3(cos(ang) * rad, 0.0, sin(ang) * rad), rng.randf() * TAU, rng.randf_range(0.7, 1.2))

	# ── wildflowers, mushrooms, bushes & grass tufts across the meadow
	var deco := ["nature/flower_purpleA", "nature/flower_redA", "nature/flower_yellowA", "nature/flower_purpleC", "nature/flower_redB", "nature/flower_yellowB", "nature/mushroom_red", "nature/mushroom_tan", "nature/plant_bush", "nature/plant_bushSmall", "nature/grass_leafs", "nature/grass", "nature/plant_flatShort"]
	for i in 70:
		var ang := rng.randf() * TAU
		var rad := rng.randf_range(5.4, 10.6)
		var p := Vector3(cos(ang) * rad, 0.0, sin(ang) * rad)
		if Vector2(p.x, p.z).length() < 6.2 and no_build.has(Vector2i(roundi(p.x), roundi(p.z))): continue
		_put_model(deco[rng.randi() % deco.size()], p, rng.randf() * TAU, rng.randf_range(0.8, 1.3))

	# ── canoes drifting in the shallows (animated)
	for i in 4:
		var ang := rng.randf() * TAU
		var rad := rng.randf_range(13.2, 16.5)
		var b := _put_model("nature/canoe", Vector3(cos(ang) * rad, -0.32, sin(ang) * rad), rng.randf() * TAU, 1.0)
		if b: _boats.append({"node": b, "base_y": -0.32, "speed": rng.randf_range(0.6, 1.1), "phase": rng.randf() * TAU})

	# ── a cosy campsite landmark on the shore (campfire + logs + tent)
	var camp := Vector3(8.0, 0.0, 7.6)
	_put_model("nature/campfire_stones", camp, 0.0, 1.0)
	_put_model("nature/log", camp + Vector3(1.0, 0, 0.4), 0.6, 1.0)
	_put_model("nature/log", camp + Vector3(-0.9, 0, -0.5), 2.1, 1.0)
	_put_model("nature/tent_smallOpen", camp + Vector3(0.3, 0, -1.7), 3.2, 1.1)

	# ── reedy grass tufts in the shallows
	for i in 8:
		var ang := rng.randf() * TAU
		var rad := rng.randf_range(12.6, 16.5)
		_put_model("nature/grass_leafs", Vector3(cos(ang) * rad, -0.3, sin(ang) * rad), rng.randf() * TAU, rng.randf_range(0.8, 1.4))

	# ── a couple of little bird flocks circling overhead
	for i in 3:
		var ang := rng.randf() * TAU
		var rad := rng.randf_range(16.0, 28.0)
		var fl := _flock(rng)
		_birds.append({"node": fl, "radius": rad, "speed": rng.randf_range(0.12, 0.24),
			"phase": ang, "cx": rng.randf_range(-2, 2), "cz": rng.randf_range(-2, 2), "y": rng.randf_range(15.0, 22.0)})

# instance a Kenney model by "subfolder/name"; safely skips if the name is wrong
func _put_model(name: String, pos: Vector3, rot_y := 0.0, scl := 1.0) -> Node3D:
	var p := "res://models/%s.glb" % name
	if not ResourceLoader.exists(p):
		print("MISSING model: ", p)
		return null
	var n := (load(p) as PackedScene).instantiate()
	n.position = pos
	n.rotation.y = rot_y
	n.scale = Vector3.ONE * scl
	add_child(n)
	return n

# a small flock of V-shaped birds (one Node3D we slide around the sky)
func _flock(rng: RandomNumberGenerator) -> Node3D:
	var root := Node3D.new()
	var mat := _mat(Color("4b4068"), 1.0, 0.0, true)
	for i in rng.randi_range(3, 5):
		var bird := MeshInstance3D.new()
		var pm := PrismMesh.new(); pm.size = Vector3(0.5, 0.16, 0.02)
		bird.mesh = pm; bird.material_override = mat
		bird.position = Vector3(rng.randf_range(-1.2, 1.2), rng.randf_range(-0.4, 0.4), rng.randf_range(-1.0, 1.0))
		bird.rotation.x = PI / 2
		bird.scale = Vector3.ONE * rng.randf_range(0.7, 1.1)
		root.add_child(bird)
	add_child(root)
	return root

# gentle ambient motion — bobbing boats, circling birds
func _animate_scenery(_delta: float) -> void:
	for b in _boats:
		var n: Node3D = b["node"]
		if not is_instance_valid(n): continue
		n.position.y = b["base_y"] + sin(_t * b["speed"] + b["phase"]) * 0.05
		n.rotation.z = sin(_t * b["speed"] * 0.8 + b["phase"]) * 0.08
	for f in _birds:
		var n: Node3D = f["node"]
		if not is_instance_valid(n): continue
		var a: float = f["phase"] + _t * f["speed"]
		n.position = Vector3(f["cx"] + cos(a) * f["radius"], f["y"], f["cz"] + sin(a) * f["radius"])
		n.rotation.y = -a + PI / 2

# ── camera (pan + orbit + zoom) ───────────────────────────────────────────────
func _setup_camera() -> void:
	cam = Camera3D.new()
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	add_child(cam)
	_update_camera()

func _update_camera() -> void:
	pitch = clampf(pitch, 22.0, 70.0)
	zoom = clampf(zoom, 9.0, 30.0)
	cam_target.x = clampf(cam_target.x, GRID_MIN - 1.0, GRID_MAX + 1.0)
	cam_target.z = clampf(cam_target.z, GRID_MIN - 1.0, GRID_MAX + 1.0)
	var py := deg_to_rad(pitch)
	var yw := deg_to_rad(yaw)
	var dir := Vector3(cos(py) * sin(yw), sin(py), cos(py) * cos(yw))
	cam.position = cam_target + dir * 50.0
	cam.look_at(cam_target, Vector3.UP)
	cam.size = zoom

func _pan(screen_delta: Vector2) -> void:
	var right := cam.global_transform.basis.x
	var fwd := -cam.global_transform.basis.z
	right.y = 0.0; fwd.y = 0.0
	right = right.normalized(); fwd = fwd.normalized()
	var per_px := (zoom * 2.0) / DH
	cam_target += (-right * screen_delta.x + fwd * screen_delta.y) * per_px
	_update_camera()

func _unhandled_input(event: InputEvent) -> void:
	if menu_open:
		return
	if event is InputEventScreenTouch:
		if event.pressed:
			touches[event.index] = event.position
			drag_moved = false
			if placing and touches.size() == 1:
				dragging_building = _near_handle(event.position)
			if touches.size() == 2:
				has_two = true
				dragging_building = false
				var pts: Array = touches.values()
				pinch_prev = pts[0].distance_to(pts[1])
				twist_prev = (pts[1] - pts[0]).angle()
		else:
			if touches.size() == 1 and not drag_moved:
				_handle_tap(event.position)
			touches.erase(event.index)
			dragging_building = false
			if touches.size() < 2: has_two = false
	elif event is InputEventScreenDrag:
		touches[event.index] = event.position
		if touches.size() == 1 and not has_two:
			if placing and dragging_building:
				if event.relative.length() > 1.0: drag_moved = true
				_drag_building_to(event.position)
			else:
				if event.relative.length() > 3.0: drag_moved = true
				_pan(event.relative)
		elif touches.size() == 2:
			var pts: Array = touches.values()
			var d: float = (pts[0] as Vector2).distance_to(pts[1] as Vector2)
			var ang: float = ((pts[1] as Vector2) - (pts[0] as Vector2)).angle()
			if pinch_prev > 0.0 and d > 0.0:
				zoom *= pinch_prev / d
			yaw += rad_to_deg(angle_difference(twist_prev, ang)) * 0.8
			pinch_prev = d; twist_prev = ang
			_update_camera()
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP: zoom -= 1.5; _update_camera()
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN: zoom += 1.5; _update_camera()
	elif event is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
		yaw -= event.relative.x * 0.3
		pitch += event.relative.y * 0.2
		_update_camera()

func _cell_from_screen(pos: Vector2) -> Vector2i:
	var hit = Plane(Vector3.UP, 0.0).intersects_ray(cam.project_ray_origin(pos), cam.project_ray_normal(pos))
	if hit == null: return Vector2i(999, 999)
	return Vector2i(roundi(hit.x), roundi(hit.z))

func _handle_tap(pos: Vector2) -> void:
	var cell := _cell_from_screen(pos)
	if placing:
		if _buildable(cell):
			ghost_cell = cell
			_update_ghost()
	elif built.has(cell):
		_upgrade_building(cell)

# ── placement / constraints ───────────────────────────────────────────────────
func _in_grid(c: Vector2i) -> bool:
	return c.x >= GRID_MIN and c.x <= GRID_MAX and c.y >= GRID_MIN and c.y <= GRID_MAX

func _buildable(cell: Vector2i) -> bool:
	if not _in_grid(cell) or no_build.has(cell) or built.has(cell): return false
	for n in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
		var c: Vector2i = cell + n
		if seed_cells.has(c) or built.has(c): return true
	return false

func _frontier_cells() -> Array:
	var out: Array = []
	for x in range(GRID_MIN, GRID_MAX + 1):
		for z in range(GRID_MIN, GRID_MAX + 1):
			var c := Vector2i(x, z)
			if _buildable(c): out.append(c)
	out.sort_custom(func(a, b): return Vector2(a.x, a.y).length() < Vector2(b.x, b.y).length())
	return out

const TIER_SCALE := [1.0, 1.2, 1.42]
const MAX_TIER := 2

func _materialize(cell: Vector2i, model_idx: int, tier := 0, animate := true) -> void:
	if built.has(cell): return
	var n := _put(BUILDING_MODELS[model_idx % BUILDING_MODELS.size()], cell, float((model_idx * 90) % 360))
	built[cell] = n
	n.set_meta("tier", tier)
	n.set_meta("model", model_idx)
	var s: float = TIER_SCALE[clampi(tier, 0, MAX_TIER)]
	if animate:
		n.scale = Vector3(0.01, 0.01, 0.01)
		create_tween().tween_property(n, "scale", Vector3.ONE * s, 0.5).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		Sfx.play("build", -8)
	else:
		n.scale = Vector3.ONE * s

# tap a placed building to upgrade its tier (free customisation; persisted)
func _upgrade_building(cell: Vector2i) -> void:
	var n: Node3D = built[cell]
	var tier := int(n.get_meta("tier", 0))
	if tier >= MAX_TIER:
		_toast("Max tier reached", UiTheme.DIM); return
	tier += 1
	n.set_meta("tier", tier)
	var s: float = TIER_SCALE[tier]
	var tw := create_tween()
	tw.tween_property(n, "scale", Vector3.ONE * s * 1.12, 0.18).set_trans(Tween.TRANS_BACK)
	tw.tween_property(n, "scale", Vector3.ONE * s, 0.2)
	for e in layout:
		if int(e.get("x", 999)) == cell.x and int(e.get("y", 999)) == cell.y:
			e["t"] = tier
	_save_layout()
	Sfx.play("level_up", -8)
	_toast("🏙 Upgraded to tier %d!" % (tier + 1), UiTheme.GOLD)

# place buildings up to the server's count: prefer saved layout, else frontier
func _sync_building_count(target: int) -> void:
	while built.size() < target:
		var idx := built.size()
		var cell: Vector2i
		var model_idx := idx
		var tier := 0
		if idx < layout.size():
			cell = Vector2i(int(layout[idx]["x"]), int(layout[idx]["y"]))
			model_idx = int(layout[idx].get("m", idx))
			tier = int(layout[idx].get("t", 0))
			if not _in_grid(cell) or built.has(cell):
				cell = _pick_frontier()
		else:
			cell = _pick_frontier()
			layout.append({"x": cell.x, "y": cell.y, "m": model_idx, "t": 0})
			_save_layout()
		if cell == Vector2i(999, 999): return
		_materialize(cell, model_idx, tier, false)

func _pick_frontier() -> Vector2i:
	var c := _frontier_cells()
	return c[0] if c.size() > 0 else Vector2i(999, 999)

# ── login (mobile + OTP) ──────────────────────────────────────────────────────
# Show the OTP login gate unless already logged in (persisted) or a dev flag is
# set. The game keeps initialising behind the modal; it dismisses on verify.
func _maybe_login() -> void:
	var args := OS.get_cmdline_user_args()
	var dev := false
	for a in args:
		if a in ["--skiplogin", "--placing", "--autospin", "--autobuild"] or a.begins_with("--menu"):
			dev = true
	if Settings.logged_in or dev:
		return
	login_node = (load("res://scripts/login.gd") as GDScript).new()
	add_child(login_node)
	login_node.verified.connect(func(p: String):
		Settings.mark_logged_in(p)
		if is_instance_valid(login_node): login_node.queue_free()
		login_node = null)

# ── layout persistence (local) ────────────────────────────────────────────────
func _layout_path() -> String:
	return "user://layout_%s.json" % Net.player_id

func _save_layout() -> void:
	var f := FileAccess.open(_layout_path(), FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(layout))
		f.close()

func _load_layout() -> void:
	var p := _layout_path()
	if FileAccess.file_exists(p):
		var data: Variant = JSON.parse_string(FileAccess.open(p, FileAccess.READ).get_as_text())
		if data is Array:
			layout = data

# ── placement UI flow ─────────────────────────────────────────────────────────
func _enter_placing() -> void:
	var cells := _frontier_cells()
	if cells.is_empty():
		_toast("No room to build — village is full!", UiTheme.RED); return
	placing = true
	ghost_cell = cells[0]
	for c in cells:
		var m := MeshInstance3D.new()
		var bm := BoxMesh.new(); bm.size = Vector3(0.92, 0.06, 0.92)
		m.mesh = bm
		var mat := StandardMaterial3D.new()
		mat.albedo_color = Color(0.25, 0.9, 0.45, 0.32)
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.material_override = mat
		m.position = Vector3(c.x, 0.06, c.y)
		add_child(m); place_markers.append(m)
	ghost = _instance(BUILDING_MODELS[selected_model])
	add_child(ghost)
	ghost_foot = MeshInstance3D.new()
	var fm := BoxMesh.new(); fm.size = Vector3(1.0, 0.12, 1.0)
	ghost_foot.mesh = fm
	ghost_foot.material_override = StandardMaterial3D.new()
	add_child(ghost_foot)
	ghost_handle = _build_ghost_handle()
	add_child(ghost_handle)
	_last_valid = -1
	_update_ghost()
	_update_palette_selection()
	_update_action_rows()
	_toast("Drag the handle to move · ✓ Confirm / ✕ Cancel", UiTheme.DIM)

func _set_model(m: int) -> void:
	selected_model = m
	_update_palette_selection()
	if placing and ghost:
		ghost.queue_free()
		ghost = _instance(BUILDING_MODELS[selected_model])
		add_child(ghost)
		_last_valid = -1   # force re-tint of the freshly-instanced ghost
		_update_ghost()

func _update_palette_selection() -> void:
	for i in palette_buttons.size():
		palette_buttons[i].theme_type_variation = "Primary" if i == selected_model else "Ghost"

func _update_ghost() -> void:
	ghost_cell.x = clampi(ghost_cell.x, GRID_MIN, GRID_MAX)
	ghost_cell.y = clampi(ghost_cell.y, GRID_MIN, GRID_MAX)
	var p := Vector3(ghost_cell.x, 0.0, ghost_cell.y)
	if ghost: ghost.position = p
	if ghost_foot: ghost_foot.position = p + Vector3(0, 0.08, 0)
	if ghost_handle: ghost_handle.position = p + Vector3(0, 0.02, 0)
	_set_validity(_buildable(ghost_cell))

# colour the ghost + footprint green (valid) or red (invalid); gate the confirm
func _set_validity(valid: bool) -> void:
	ghost_valid = valid
	if int(valid) == _last_valid: return
	_last_valid = int(valid)
	var col: Color = OK_GREEN if valid else BAD_RED
	_tint_ghost(col)
	if ghost_foot:
		var fmat := StandardMaterial3D.new()
		fmat.albedo_color = Color(col.r, col.g, col.b, 0.5)
		fmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		fmat.emission_enabled = true; fmat.emission = col
		fmat.emission_energy_multiplier = 0.5
		ghost_foot.material_override = fmat
	if confirm_btn:
		confirm_btn.disabled = not valid
		confirm_btn.modulate = Color.WHITE if valid else Color(1, 1, 1, 0.45)

func _tint_ghost(col: Color) -> void:
	if not ghost: return
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(col.r, col.g, col.b, 0.42)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.emission_enabled = true; mat.emission = col
	mat.emission_energy_multiplier = 0.45
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	for mi in _mesh_instances(ghost):
		mi.material_override = mat

func _mesh_instances(n: Node) -> Array:
	var out: Array = []
	if n is MeshInstance3D: out.append(n)
	for c in n.get_children(): out += _mesh_instances(c)
	return out

# a glowing move-gizmo that floats just in front of the ghost's base: a ground
# ring + 4-way arrows + a grab knob on a post. Drawn on top (no depth test) so it
# stays visible over the building, signalling "drag me to move".
func _build_ghost_handle() -> Node3D:
	var root := Node3D.new()
	var accent := Color(0.30, 0.95, 1.0)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = accent
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.emission_enabled = true; mat.emission = accent
	mat.emission_energy_multiplier = 1.0
	mat.no_depth_test = true          # always visible, even through the building
	mat.render_priority = 2
	# flat ring on the ground
	var ring := MeshInstance3D.new()
	var tm := TorusMesh.new(); tm.inner_radius = 0.30; tm.outer_radius = 0.46
	ring.mesh = tm; ring.material_override = mat; ring.position.y = 0.04
	root.add_child(ring)
	# 4-way move arrows around the ring
	for i in 4:
		var a := MeshInstance3D.new()
		var pm := PrismMesh.new(); pm.size = Vector3(0.18, 0.20, 0.07)
		a.mesh = pm; a.material_override = mat
		var ang := deg_to_rad(i * 90)
		a.rotation_degrees = Vector3(90, i * 90, 0)
		a.position = Vector3(sin(ang) * 0.40, 0.05, cos(ang) * 0.40)
		root.add_child(a)
	# post + grab knob rising from the ring
	var post := MeshInstance3D.new()
	var sc := CylinderMesh.new(); sc.top_radius = 0.05; sc.bottom_radius = 0.05; sc.height = 0.5
	post.mesh = sc; post.material_override = mat; post.position.y = 0.3
	root.add_child(post)
	var knob := MeshInstance3D.new()
	var sp := SphereMesh.new(); sp.radius = 0.17; sp.height = 0.34
	knob.mesh = sp; knob.material_override = mat; knob.position.y = 0.62
	root.add_child(knob)
	return root

func _near_handle(pos: Vector2) -> bool:
	if not ghost_handle: return false
	var hp: Vector3 = ghost_handle.global_position + Vector3(0, 0.4, 0)
	if cam.is_position_behind(hp): return false
	return cam.unproject_position(hp).distance_to(pos) <= GRAB_PX

func _drag_building_to(pos: Vector2) -> void:
	var cell := _cell_from_screen(pos)
	if cell == Vector2i(999, 999): return
	ghost_cell = cell
	_update_ghost()

func _exit_placing() -> void:
	placing = false
	dragging_building = false
	for m in place_markers: m.queue_free()
	place_markers.clear()
	if ghost: ghost.queue_free(); ghost = null
	if ghost_foot: ghost_foot.queue_free(); ghost_foot = null
	if ghost_handle: ghost_handle.queue_free(); ghost_handle = null
	_update_action_rows()

# ── HUD (themed, responsive containers) ───────────────────────────────────────
func _new_label(text: String, variation := "") -> Label:
	var l := Label.new()
	l.text = text
	if variation != "": l.theme_type_variation = variation
	return l

func _new_button(text: String, variation := "") -> Button:
	var b := Button.new()
	b.text = text
	if variation != "": b.theme_type_variation = variation
	b.focus_mode = Control.FOCUS_NONE
	b.pressed.connect(func(): Sfx.play("ui_tap", -13))
	return b

# solid filled button in a flat colour (used for the green Confirm / red Cancel)
func _style_solid_button(b: Button, col: Color) -> void:
	b.focus_mode = Control.FOCUS_NONE
	b.pressed.connect(func(): Sfx.play("ui_tap", -13))
	for st in ["normal", "hover", "pressed", "disabled"]:
		var sb := StyleBoxFlat.new()
		var c := col
		if st == "hover": c = col.lightened(0.12)
		elif st == "pressed": c = col.darkened(0.12)
		elif st == "disabled": c = Color(col.r, col.g, col.b, 0.4)
		sb.bg_color = c
		sb.set_corner_radius_all(16)
		sb.set_border_width_all(3); sb.border_color = UiTheme.INK   # pop-art ink outline
		sb.content_margin_top = 10; sb.content_margin_bottom = 10
		sb.content_margin_left = 14; sb.content_margin_right = 14
		b.add_theme_stylebox_override(st, sb)
	for fc in ["font_color", "font_hover_color", "font_pressed_color"]:
		b.add_theme_color_override(fc, Color.WHITE)
	b.add_theme_color_override("font_disabled_color", Color(1, 1, 1, 0.7))
	b.add_theme_font_size_override("font_size", 21)

func _hsep() -> Control:
	var s := Control.new()
	s.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return s

func _setup_hud() -> void:
	hud = CanvasLayer.new()
	add_child(hud)
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = UiTheme.build()
	hud.add_child(root)

	# top area
	var top := MarginContainer.new()
	top.set_anchors_preset(Control.PRESET_TOP_WIDE)
	for s in ["margin_left", "margin_right", "margin_top"]: top.add_theme_constant_override(s, 14)
	root.add_child(top)
	var top_v := VBoxContainer.new()
	top_v.add_theme_constant_override("separation", 8)
	top.add_child(top_v)

	var header := HBoxContainer.new()
	top_v.add_child(header)
	var menu_btn := _new_button("☰", "Ghost")
	menu_btn.custom_minimum_size = Vector2(48, 36)
	menu_btn.pressed.connect(_on_menu)
	header.add_child(menu_btn)
	var title := _new_label("BLOOM", "Title")
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	header.add_child(title)
	var spacer := Control.new(); spacer.custom_minimum_size = Vector2(48, 36)
	header.add_child(spacer)

	var stats := PanelContainer.new()
	top_v.add_child(stats)
	var stats_v := VBoxContainer.new()
	stats_v.add_theme_constant_override("separation", 6)
	stats.add_child(stats_v)
	var mrow := HBoxContainer.new(); stats_v.add_child(mrow)
	mrow.add_child(_new_label("MOMENTUM", "Dim"))
	hot_label = _new_label("", "Dim"); hot_label.add_theme_color_override("font_color", UiTheme.FIRE)
	hot_label.add_theme_color_override("font_outline_color", UiTheme.INK)
	hot_label.add_theme_constant_override("outline_size", 4)
	mrow.add_child(hot_label)
	mrow.add_child(_hsep())
	momentum_label = _new_label("1.0×", "Stat"); momentum_label.add_theme_color_override("font_color", UiTheme.FIRE)
	mrow.add_child(momentum_label)
	momentum_bar = ProgressBar.new()
	momentum_bar.min_value = 1.0; momentum_bar.max_value = 3.0; momentum_bar.value = 1.0
	momentum_bar.show_percentage = false
	momentum_bar.custom_minimum_size = Vector2(0, 12)
	stats_v.add_child(momentum_bar)
	var wrow := HBoxContainer.new(); stats_v.add_child(wrow)
	coins_label = _new_label("🪙 0", "Stat"); wrow.add_child(coins_label)
	wrow.add_child(_hsep())
	level_label = _new_label("Lv 1", "Dim"); wrow.add_child(level_label)
	wrow.add_child(_hsep())
	spins_label = _new_label("🎟 0", "Dim"); wrow.add_child(spins_label)

	gh_banner = PanelContainer.new()
	gh_banner.theme_type_variation = "Card2"
	top_v.add_child(gh_banner)
	gh_label = _new_label("", ""); gh_label.add_theme_color_override("font_color", UiTheme.GOLD)
	gh_label.add_theme_color_override("font_outline_color", UiTheme.INK)
	gh_label.add_theme_constant_override("outline_size", 5)
	gh_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	gh_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	gh_banner.add_child(gh_label)
	gh_banner.visible = false

	# zoom controls (right-center)
	var zoombox := VBoxContainer.new()
	zoombox.set_anchors_preset(Control.PRESET_CENTER_RIGHT)
	zoombox.position += Vector2(-58, -40)
	zoombox.add_theme_constant_override("separation", 8)
	root.add_child(zoombox)
	var zin := _new_button("+", "Ghost"); zin.custom_minimum_size = Vector2(46, 46)
	zin.add_theme_font_size_override("font_size", 26)
	zin.pressed.connect(func(): zoom -= 2.0; _update_camera())
	var zout := _new_button("-", "Ghost"); zout.custom_minimum_size = Vector2(46, 46)
	zout.add_theme_font_size_override("font_size", 26)
	zout.pressed.connect(func(): zoom += 2.0; _update_camera())
	zoombox.add_child(zin); zoombox.add_child(zout)

	# centre result + toasts
	result_label = _new_label("", "Title")
	result_label.set_anchors_preset(Control.PRESET_CENTER)
	result_label.position += Vector2(-150, -10)
	result_label.custom_minimum_size = Vector2(300, 40)
	result_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	root.add_child(result_label)

	toast_box = VBoxContainer.new()
	toast_box.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	toast_box.position += Vector2(0, -200)
	toast_box.add_theme_constant_override("separation", 6)
	toast_box.alignment = BoxContainer.ALIGNMENT_END
	for s in ["margin_left", "margin_right"]: pass
	root.add_child(toast_box)

	# bottom controls (anchored to the bottom edge; explicit height so it shows)
	var bottom := MarginContainer.new()
	bottom.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	bottom.offset_top = -276
	bottom.grow_vertical = Control.GROW_DIRECTION_BEGIN
	for s in ["margin_left", "margin_right", "margin_bottom"]: bottom.add_theme_constant_override(s, 16)
	root.add_child(bottom)
	var bottom_v := VBoxContainer.new()
	bottom_v.add_theme_constant_override("separation", 10)
	bottom_v.alignment = BoxContainer.ALIGNMENT_END
	bottom.add_child(bottom_v)

	actions_row = HBoxContainer.new()
	actions_row.add_theme_constant_override("separation", 8)
	bottom_v.add_child(actions_row)
	build_btn = _new_button("🔨 Build", "")
	build_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	build_btn.custom_minimum_size = Vector2(0, 54)
	build_btn.pressed.connect(_on_build_pressed)
	help_btn = _new_button("🤝 Help", "")
	help_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	help_btn.custom_minimum_size = Vector2(0, 54)
	help_btn.pressed.connect(_on_help)
	actions_row.add_child(build_btn); actions_row.add_child(help_btn)

	# building-style palette (shown while placing)
	palette_row = HBoxContainer.new()
	palette_row.add_theme_constant_override("separation", 6)
	bottom_v.add_child(palette_row)
	var style_icons := ["🏠", "🏡", "🏢", "🏬", "🏭"]
	for i in BUILDING_MODELS.size():
		var sb := _new_button(style_icons[i] if i < style_icons.size() else "🏠", "Ghost")
		sb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		sb.custom_minimum_size = Vector2(0, 44)
		sb.add_theme_font_size_override("font_size", 22)
		var mi := i
		sb.pressed.connect(func(): _set_model(mi))
		palette_row.add_child(sb)
		palette_buttons.append(sb)
	palette_row.visible = false

	confirm_row = HBoxContainer.new()
	confirm_row.add_theme_constant_override("separation", 8)
	bottom_v.add_child(confirm_row)
	confirm_btn = Button.new()
	confirm_btn.text = "✓ Confirm"
	confirm_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	confirm_btn.custom_minimum_size = Vector2(0, 58)
	_style_solid_button(confirm_btn, OK_GREEN)
	confirm_btn.pressed.connect(_on_confirm_place)
	cancel_btn = Button.new()
	cancel_btn.text = "✕ Cancel"
	cancel_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cancel_btn.custom_minimum_size = Vector2(0, 58)
	_style_solid_button(cancel_btn, BAD_RED)
	cancel_btn.pressed.connect(_exit_placing)
	confirm_row.add_child(confirm_btn); confirm_row.add_child(cancel_btn)
	confirm_row.visible = false

	spin_btn = _new_button("SPIN", "Primary")
	spin_btn.custom_minimum_size = Vector2(0, 74)
	spin_btn.pressed.connect(_on_spin)
	bottom_v.add_child(spin_btn)

func _update_action_rows() -> void:
	actions_row.visible = not placing
	palette_row.visible = placing
	confirm_row.visible = placing

func _toast(text: String, accent: Color) -> void:
	var p := PanelContainer.new()
	p.theme_type_variation = "Card2"
	var sb := (p.get_theme_stylebox("panel", "Card2") as StyleBoxFlat).duplicate()
	sb.border_color = accent
	p.add_theme_stylebox_override("panel", sb)
	var l := _new_label(text, "")
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	p.add_child(l)
	toast_box.add_child(p)
	var tw := create_tween()
	tw.tween_interval(2.2)
	tw.tween_property(p, "modulate:a", 0.0, 0.4)
	tw.tween_callback(p.queue_free)
	while toast_box.get_child_count() > 4:
		toast_box.get_child(0).free()

# ── server view ───────────────────────────────────────────────────────────────
func _wallet(key: String, def: Variant = 0) -> Variant:
	return view.get("wallet", {}).get(key, def)

func _apply_view(v) -> void:
	if typeof(v) != TYPE_DICTIONARY or v.is_empty() or v.has("_error"): return
	view = v
	momentum_shown = float(_wallet("momentum", 1.0))
	var gh = v.get("goldenHour")
	if gh != null: gh_ends_at_ms = Time.get_ticks_msec() + int(gh.get("msLeft", 0))
	_sync_building_count(int(v.get("village", {}).get("buildingsBuilt", 0)))
	_process_events(v.get("events", []))
	var lvl := int(_wallet("level", 1))
	if lvl > prev_level:
		prev_level = lvl
		Sfx.play("level_up", -6)
		_toast("⬆ Level %d!" % lvl, UiTheme.GOLD)
	_refresh_hud()

func _process_events(events: Array) -> void:
	for e in events:
		match str(e.get("type", "")):
			"helper_joined":
				Sfx.play("help", -15)
				_toast("🤝 %s joined your Golden Hour" % str(e.get("name", "")), UiTheme.GREEN)
			"gh_milestone":
				Sfx.play("milestone", -8)
				_toast("⭐ Milestone! +%d spins +%d🪙" % [int(e.get("spins", 0)), int(e.get("coins", 0))], UiTheme.GOLD)
			"gh_closed":
				Sfx.play("level_up", -6)
				_toast("🏡 Built! %d%% helped back (+%d🪙)" % [int(e.get("benefitPct", 0)), int(e.get("refund", 0))], UiTheme.GOLD)
			"thank_you":
				Sfx.play("gratitude", -7)
				_toast("💝 %s thanks you — +%d spins!" % [str(e.get("fromBot", "")), int(e.get("spins", 0))], UiTheme.GREEN)
			"card_dropped":
				Sfx.play("card", -8)
				_toast("🃏 New %s card!" % str(e.get("rarity", "")), UiTheme.GOLD)
			"set_completed":
				Sfx.play("milestone", -5)
				_toast("✨ Set complete! +%d%% coins forever" % int(e.get("bonusPct", 0)), UiTheme.GOLD)
			"momentum_warning":
				_toast("🔥 Momentum cooling — spin while hot!", UiTheme.FIRE)

func _refresh_hud() -> void:
	if view.is_empty(): return
	var hot_t := float(cfg.get("momentum", {}).get("hotThreshold", 1.5))
	momentum_bar.value = momentum_shown
	momentum_label.text = "%.1f×" % momentum_shown
	momentum_label.add_theme_color_override("font_color", UiTheme.FIRE if momentum_shown >= hot_t else UiTheme.DIM)
	hot_label.text = "🔥 HOT" if momentum_shown >= hot_t else ("❄ cooling" if momentum_shown > 1.05 else "")
	coins_label.text = "🪙 %d" % int(round(coins_shown))
	level_label.text = "Lv %d" % int(_wallet("level", 1))
	spins_label.text = "🎟 %d" % int(_wallet("helpTokens", 0))

	var in_gh: bool = view.get("goldenHour") != null
	gh_banner.visible = in_gh and not placing
	if in_gh:
		var secs: int = max(0, (gh_ends_at_ms - Time.get_ticks_msec()) / 1000)
		var gh = view.get("goldenHour", {})
		gh_label.text = "🌟 GOLDEN HOUR %d:%02d · %d/%d helping" % [secs / 60, secs % 60, int(gh.get("helpers", 0)), int(gh.get("maxHelpers", 10))]
	if not placing:
		var cost := int(view.get("nextBuildCost", 0))
		build_btn.disabled = in_gh or int(_wallet("coins", 0)) < cost or not view.get("canBuild", false)
		build_btn.text = "building…" if in_gh else "🔨 Build · 🪙%d" % cost

# ── actions ───────────────────────────────────────────────────────────────────
func _on_spin() -> void:
	if spinning or menu_open: return
	spinning = true
	spin_btn.text = "…"
	if placing: _exit_placing()
	Net.event("spin_tap")
	Music.set_ducked(true)
	var gacha: CanvasLayer = (load("res://scripts/gacha.gd") as GDScript).new()
	add_child(gacha)
	gacha.begin()
	var r: Dictionary = await Net.spin()
	if r.has("_error"):
		gacha.queue_free(); spinning = false; spin_btn.text = "SPIN"
		Music.set_ducked(false)
		_toast("reconnecting…", UiTheme.RED); return
	gacha.reveal(r.get("result", {}))
	await gacha.finished
	gacha.queue_free()
	Music.set_ducked(false)
	spin_btn.text = "SPIN"; spinning = false
	_apply_view(r.get("view", {}))

func _on_build_pressed() -> void:
	if placing: return
	if view.get("goldenHour") != null:
		_toast("A Golden Hour is already running", UiTheme.DIM); return
	if int(_wallet("coins", 0)) < int(view.get("nextBuildCost", 0)):
		_toast("Not enough coins", UiTheme.RED); return
	_enter_placing()

func _on_confirm_place() -> void:
	if not placing: return
	var cell := ghost_cell
	if not _buildable(cell):
		_toast("Drag to a green spot first", BAD_RED); return
	confirm_btn.disabled = true
	var r: Dictionary = await Net.build()
	confirm_btn.disabled = false
	if r.get("ok", false):
		var model_idx := selected_model
		_exit_placing()
		_materialize(cell, model_idx, 0, true)
		layout.append({"x": cell.x, "y": cell.y, "m": model_idx, "t": 0})
		_save_layout()
		get_tree().create_timer(0.28).timeout.connect(func(): Sfx.play("golden_hour", -11))
		_toast("🔨 Built! Golden Hour open — get help!", UiTheme.GOLD)
	else:
		_toast(str(r.get("reason", "can't build")), UiTheme.RED)
		_exit_placing()
	_apply_view(r.get("view", {}))

func _on_help() -> void:
	var pool: Array = view.get("strangerPool", [])
	if pool.is_empty():
		_toast("No one to help right now", UiTheme.DIM); return
	var r: Dictionary = await Net.help_bot(int(pool[0]["botId"]))
	if r.get("ok", false):
		_toast("🤝 Helped %s · +%d🪙" % [str(pool[0].get("name", "a friend")), int(r.get("coins", 0))], UiTheme.GREEN)
		Sfx.play("help", -8)
	_apply_view(r.get("view", {}))

func _on_menu() -> void:
	if menu_open: return
	menu_open = true
	Sfx.play("ui_open", -10)
	menu_node = (load("res://scripts/menu.gd") as GDScript).new()
	add_child(menu_node)
	menu_node.closed.connect(_on_menu_closed)
	menu_node.wallet_changed.connect(func(): _on_sync())
	menu_node.open()

func _on_menu_closed() -> void:
	Sfx.play("ui_close", -11)
	if is_instance_valid(menu_node): menu_node.queue_free()
	menu_node = null
	menu_open = false

func _on_sync() -> void:
	if spinning: return
	var v: Dictionary = await Net.sync_world()
	if not v.has("_error"): _apply_view(v)

# ── dev hooks ──
func _auto_spin() -> void:
	for i in range(8):
		while spinning: await get_tree().create_timer(0.1).timeout
		await _on_spin()
		await get_tree().create_timer(0.6).timeout

func _auto_build() -> void:
	await get_tree().create_timer(1.0).timeout
	_on_build_pressed()
	await get_tree().create_timer(0.4).timeout
	await _on_confirm_place()

# ── per-frame ─────────────────────────────────────────────────────────────────
func _process(delta: float) -> void:
	_t += delta
	_animate_scenery(delta)
	if view.is_empty(): return
	var target := float(_wallet("coins", 0))
	coins_shown = lerpf(coins_shown, target, clampf(delta * 6.0, 0, 1))
	if abs(target - coins_shown) < 0.5: coins_shown = target
	if not spinning and momentum_shown > 1.0:
		var dps := float(cfg.get("momentum", {}).get("decayPerSec", 0.0028))
		momentum_shown = max(1.0, momentum_shown - dps * delta)
	Music.set_intensity((momentum_shown - 1.0) / 2.0)
	_refresh_hud()
