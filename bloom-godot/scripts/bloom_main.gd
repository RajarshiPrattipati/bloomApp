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
var zoom := 17.0
var touches: Dictionary = {}
var drag_moved := false
var pinch_prev := 0.0
var twist_prev := 0.0
var has_two := false

# ── placement ──
var placing := false
var ghost: Node3D
var ghost_foot: MeshInstance3D
var ghost_cell := Vector2i(999, 999)

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

var prev_level := 1

func _ready() -> void:
	_build_world()
	_build_base()
	_setup_camera()
	_setup_hud()
	Sfx.start_ambience()
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
		if a == "--placing": _on_build_pressed()
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
	var e: Environment = load("res://scenes/main-environment.tres")
	if e: env.environment = e
	add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55, -52, 0)
	sun.light_energy = 1.15
	sun.shadow_enabled = true
	add_child(sun)
	for x in range(GRID_MIN, GRID_MAX + 1):
		for z in range(GRID_MIN, GRID_MAX + 1):
			_put("grass", Vector2i(x, z))

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
			if touches.size() == 2:
				has_two = true
				var pts: Array = touches.values()
				pinch_prev = pts[0].distance_to(pts[1])
				twist_prev = (pts[1] - pts[0]).angle()
		else:
			if touches.size() == 1 and not drag_moved:
				_handle_tap(event.position)
			touches.erase(event.index)
			if touches.size() < 2: has_two = false
	elif event is InputEventScreenDrag:
		touches[event.index] = event.position
		if touches.size() == 1 and not has_two:
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
	var fmat := StandardMaterial3D.new()
	fmat.albedo_color = Color(UiTheme.GOLD.r, UiTheme.GOLD.g, UiTheme.GOLD.b, 0.6)
	fmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ghost_foot.material_override = fmat
	add_child(ghost_foot)
	_update_ghost()
	_update_palette_selection()
	_update_action_rows()
	_toast("Pick a style + plot, then ✓ Place", UiTheme.DIM)

func _set_model(m: int) -> void:
	selected_model = m
	_update_palette_selection()
	if placing and ghost:
		ghost.queue_free()
		ghost = _instance(BUILDING_MODELS[selected_model])
		add_child(ghost)
		_update_ghost()

func _update_palette_selection() -> void:
	for i in palette_buttons.size():
		palette_buttons[i].theme_type_variation = "Primary" if i == selected_model else "Ghost"

func _update_ghost() -> void:
	if ghost: ghost.position = Vector3(ghost_cell.x, 0.0, ghost_cell.y)
	if ghost_foot: ghost_foot.position = Vector3(ghost_cell.x, 0.08, ghost_cell.y)

func _exit_placing() -> void:
	placing = false
	for m in place_markers: m.queue_free()
	place_markers.clear()
	if ghost: ghost.queue_free(); ghost = null
	if ghost_foot: ghost_foot.queue_free(); ghost_foot = null
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
	confirm_btn = _new_button("✓ Place here", "Primary")
	confirm_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	confirm_btn.custom_minimum_size = Vector2(0, 54)
	confirm_btn.pressed.connect(_on_confirm_place)
	cancel_btn = _new_button("✕ Cancel", "Ghost")
	cancel_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cancel_btn.custom_minimum_size = Vector2(0, 54)
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
		_toast("Pick a glowing plot", UiTheme.RED); return
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
	if view.is_empty(): return
	var target := float(_wallet("coins", 0))
	coins_shown = lerpf(coins_shown, target, clampf(delta * 6.0, 0, 1))
	if abs(target - coins_shown) < 0.5: coins_shown = target
	if not spinning and momentum_shown > 1.0:
		var dps := float(cfg.get("momentum", {}).get("decayPerSec", 0.0028))
		momentum_shown = max(1.0, momentum_shown - dps * delta)
	Music.set_intensity((momentum_shown - 1.0) / 2.0)
	_refresh_hud()
