extends Node
# Builds a few houses (needs server run with BLOOM_GH_MS small + BLOOM_START_COINS).

func _ready() -> void:
	print("=== SEED VILLAGE ===")
	await Net.ensure_auth()
	for r in range(5):
		var v: Dictionary = await Net.sync_world()
		var coins := int(v.get("wallet", {}).get("coins", 0))
		var cost := int(v.get("nextBuildCost", 999999))
		if coins >= cost and v.get("canBuild", false):
			var b: Dictionary = await Net.build()
			print("build #", r, " ok=", b.get("ok"))
		else:
			print("skip #", r, " coins=", coins, " cost=", cost, " canBuild=", v.get("canBuild"))
		await get_tree().create_timer(6.0).timeout
	var fin: Dictionary = await Net.sync_world()
	print("buildingsBuilt=", fin.get("village", {}).get("buildingsBuilt"), " level=", fin.get("wallet", {}).get("level"))
	print("=== SEED DONE ===")
	get_tree().quit()
