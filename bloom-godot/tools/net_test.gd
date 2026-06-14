extends Node
# Headless smoke test for the Net client. Run:
#   Godot --headless --path . res://tools/net_test.tscn

func _ready() -> void:
	print("=== NET TEST START ===")
	await Net.register()
	print("registered: playerId=", Net.player_id, " tokenLen=", Net.token.length())

	var s: Dictionary = await Net.session()
	print("session: spins=", _wallet(s, "spins"), " coins=", _wallet(s, "coins"), " nextBuildCost=", s.get("nextBuildCost"))

	for i in range(40):
		await Net.spin()
	var v: Dictionary = await Net.sync_world()
	print("after 40 spins: coins=", _wallet(v, "coins"), " momentum=", _wallet(v, "momentum"), " level=", _wallet(v, "level"))

	var b: Dictionary = await Net.build()
	print("build: ok=", b.get("ok"), " reason=", b.get("reason", ""), " goldenHour=", b.get("view", {}).get("goldenHour") != null)

	var pool: Array = v.get("strangerPool", [])
	if pool.size() > 0:
		var h: Dictionary = await Net.help_bot(int(pool[0]["botId"]))
		print("help_bot: ok=", h.get("ok"), " coins=", h.get("coins"))

	var q: Dictionary = await Net.quests()
	print("quests: count=", q.get("_list", []).size())
	var cfg: Dictionary = await Net.get_config()
	print("config: dropTable size=", cfg.get("dropTable", []).size())

	print("=== NET TEST DONE ===")
	get_tree().quit()

func _wallet(view: Dictionary, key: String) -> Variant:
	return view.get("wallet", {}).get(key)
