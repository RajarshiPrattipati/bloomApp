extends Node
# Dev screenshot helper. Run:  Godot --path . -- --shot=/tmp/x.png [--shot-delay=2.0]
# Waits a moment for the scene to render, captures the root viewport, saves PNG, quits.
# A no-op during normal runs (no --shot arg).

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	args.append_array(OS.get_cmdline_args())
	var path := ""
	var delay := 2.0
	for a in args:
		if a.begins_with("--shot="):
			path = a.substr("--shot=".length())
		elif a.begins_with("--shot-delay="):
			delay = a.substr("--shot-delay=".length()).to_float()
	if path != "":
		_capture(path, delay)

func _capture(path: String, delay: float) -> void:
	await get_tree().create_timer(delay).timeout
	await get_tree().process_frame
	await get_tree().process_frame
	var img := get_viewport().get_texture().get_image()
	var err := img.save_png(path)
	print("[screenshot] ", path, " err=", err)
	get_tree().quit()
