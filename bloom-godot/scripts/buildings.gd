class_name Buildings
extends RefCounted
## The build catalog: every placeable building, its display name and the player
## level at which it unlocks. Earlier tiers are cosy homes; later tiers grow the
## village into a city (shops → offices → skyscrapers). `model` is the path under
## res://models/ (without .glb). Index in CATALOG is the stable id stored in the
## local layout, so APPEND new entries — don't reorder existing ones.

const CATALOG := [
	# Lv 1 — starter homes
	{"model": "building-small-a", "name": "Cosy House", "lvl": 1},
	{"model": "building-small-b", "name": "Brick House", "lvl": 1},
	{"model": "suburban/building-type-a", "name": "Cottage", "lvl": 1},
	{"model": "suburban/building-type-b", "name": "Bungalow", "lvl": 1},
	# Lv 2
	{"model": "building-small-c", "name": "Townhouse", "lvl": 2},
	{"model": "building-small-d", "name": "Family Home", "lvl": 2},
	{"model": "suburban/building-type-c", "name": "Garden House", "lvl": 2},
	{"model": "suburban/building-type-d", "name": "Porch House", "lvl": 2},
	# Lv 3
	{"model": "building-garage", "name": "Garage", "lvl": 3},
	{"model": "suburban/building-type-e", "name": "Villa", "lvl": 3},
	{"model": "suburban/building-type-f", "name": "Two-Storey", "lvl": 3},
	{"model": "suburban/building-type-g", "name": "Manor", "lvl": 3},
	# Lv 4
	{"model": "suburban/building-type-h", "name": "Modern Home", "lvl": 4},
	{"model": "suburban/building-type-i", "name": "Ranch", "lvl": 4},
	{"model": "suburban/building-type-j", "name": "Chalet", "lvl": 4},
	{"model": "suburban/building-type-k", "name": "Estate", "lvl": 4},
	# Lv 5
	{"model": "suburban/building-type-l", "name": "Duplex", "lvl": 5},
	{"model": "suburban/building-type-m", "name": "Terrace", "lvl": 5},
	{"model": "suburban/building-type-n", "name": "Loft House", "lvl": 5},
	{"model": "suburban/building-type-o", "name": "Mansion", "lvl": 5},
	# Lv 6 — homes give way to the first shops
	{"model": "suburban/building-type-p", "name": "Greenhouse", "lvl": 6},
	{"model": "suburban/building-type-q", "name": "Studio", "lvl": 6},
	{"model": "commercial/building-a", "name": "Corner Shop", "lvl": 6},
	{"model": "commercial/building-b", "name": "Bakery", "lvl": 6},
	# Lv 7
	{"model": "commercial/building-c", "name": "Cafe", "lvl": 7},
	{"model": "commercial/building-d", "name": "Boutique", "lvl": 7},
	{"model": "commercial/building-e", "name": "Diner", "lvl": 7},
	{"model": "commercial/building-f", "name": "Bank", "lvl": 7},
	# Lv 8
	{"model": "commercial/building-g", "name": "Office", "lvl": 8},
	{"model": "commercial/building-h", "name": "Plaza", "lvl": 8},
	{"model": "commercial/building-i", "name": "Hotel", "lvl": 8},
	{"model": "commercial/building-j", "name": "Mall", "lvl": 8},
	# Lv 9
	{"model": "commercial/building-k", "name": "Tower Block", "lvl": 9},
	{"model": "commercial/building-l", "name": "Emporium", "lvl": 9},
	{"model": "commercial/building-skyscraper-a", "name": "Skyscraper", "lvl": 9},
	{"model": "commercial/building-skyscraper-b", "name": "Glass Tower", "lvl": 9},
	# Lv 10 — landmarks
	{"model": "commercial/building-skyscraper-c", "name": "The Spire", "lvl": 10},
	{"model": "commercial/building-skyscraper-d", "name": "Megatower", "lvl": 10},
	{"model": "commercial/building-skyscraper-e", "name": "Landmark", "lvl": 10},
]

const MAX_LEVEL := 10

static func model(i: int) -> String:
	return CATALOG[clampi(i, 0, CATALOG.size() - 1)]["model"]

static func unlocked(i: int, level: int) -> bool:
	return level >= int(CATALOG[clampi(i, 0, CATALOG.size() - 1)]["lvl"])

static func thumb_path(i: int) -> String:
	# thumbnails are named after the model's leaf (suburban/building-type-a → building-type-a)
	var m: String = CATALOG[i]["model"]
	return "res://thumbnails/%s.png" % m.get_file()
