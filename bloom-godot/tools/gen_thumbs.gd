extends Node3D
## Dev tool: render every catalog building to a transparent PNG thumbnail under
## res://thumbnails/. Run windowed (needs the GPU):
##   godot --path . tools/gen_thumbs.tscn
## Re-run whenever the catalog changes; commit the generated PNGs.

func _ready() -> void:
	DirAccess.make_dir_absolute("res://thumbnails")
	for entry in Buildings.CATALOG:
		await _render(entry["model"])
	print("THUMBS DONE: ", Buildings.CATALOG.size())
	get_tree().quit()

func _render(model_path: String) -> void:
	var vp := SubViewport.new()
	vp.size = Vector2i(220, 220)
	vp.transparent_bg = true
	vp.msaa_3d = Viewport.MSAA_4X
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(vp)

	var we := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_CLEAR_COLOR
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.88, 0.9, 0.98)
	env.ambient_light_energy = 1.5
	we.environment = env
	vp.add_child(we)
	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-45, -52, 0)
	key.light_energy = 1.1
	vp.add_child(key)

	var n := (load("res://models/%s.glb" % model_path) as PackedScene).instantiate()
	vp.add_child(n)
	await get_tree().process_frame   # let transforms settle so the AABB is valid

	var box := _aabb(n)
	var center := box.get_center()
	var span: float = max(box.size.x, box.size.y, box.size.z)
	var cam := Camera3D.new()
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	cam.size = span * 1.55
	vp.add_child(cam)
	var dir := Vector3(1.0, 0.85, 1.0).normalized()
	cam.position = center + dir * (span + 8.0)
	cam.look_at(center, Vector3.UP)

	await get_tree().process_frame
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := vp.get_texture().get_image()
	img.save_png("res://thumbnails/%s.png" % model_path.get_file())
	vp.queue_free()

func _aabb(node: Node) -> AABB:
	var box := AABB()
	var first := true
	for mi in _meshes(node):
		var a: AABB = mi.global_transform * mi.get_aabb()
		if first:
			box = a; first = false
		else:
			box = box.merge(a)
	return box if not first else AABB(Vector3(-0.5, 0, -0.5), Vector3(1, 1, 1))

func _meshes(node: Node) -> Array:
	var out: Array = []
	if node is MeshInstance3D: out.append(node)
	for c in node.get_children(): out += _meshes(c)
	return out
