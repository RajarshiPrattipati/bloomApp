extends Node
## Settings — audio buses + persisted player preferences (autoload, loaded first
## so the Music/SFX buses exist before the audio autoloads create their players).

const PATH := "user://settings.json"
const MUSIC_BUS := "Music"
const SFX_BUS := "SFX"

# audio prefs
var sfx_on := true
var music_on := true
var sfx_vol := 0.8    # 0..1
var music_vol := 0.7  # 0..1
# login
var logged_in := false
var phone := ""

func _ready() -> void:
	_ensure_bus(MUSIC_BUS)
	_ensure_bus(SFX_BUS)
	_load()
	apply()

func _ensure_bus(bus_name: String) -> void:
	if AudioServer.get_bus_index(bus_name) >= 0:
		return
	var idx := AudioServer.bus_count
	AudioServer.add_bus(idx)
	AudioServer.set_bus_name(idx, bus_name)
	AudioServer.set_bus_send(idx, "Master")

func apply() -> void:
	_apply_channel(SFX_BUS, sfx_on, sfx_vol)
	_apply_channel(MUSIC_BUS, music_on, music_vol)

func _apply_channel(bus_name: String, on: bool, vol: float) -> void:
	var idx := AudioServer.get_bus_index(bus_name)
	if idx < 0:
		return
	AudioServer.set_bus_mute(idx, not on)
	AudioServer.set_bus_volume_db(idx, linear_to_db(clampf(vol, 0.0001, 1.0)))

func set_sfx_on(v: bool) -> void: sfx_on = v; apply(); save()
func set_music_on(v: bool) -> void: music_on = v; apply(); save()
func set_sfx_vol(v: float) -> void: sfx_vol = v; apply(); save()
func set_music_vol(v: float) -> void: music_vol = v; apply(); save()

func mark_logged_in(p: String) -> void:
	logged_in = true
	phone = p
	save()

func _load() -> void:
	if not FileAccess.file_exists(PATH):
		return
	var d: Variant = JSON.parse_string(FileAccess.open(PATH, FileAccess.READ).get_as_text())
	if d is Dictionary:
		sfx_on = bool(d.get("sfx_on", true))
		music_on = bool(d.get("music_on", true))
		sfx_vol = float(d.get("sfx_vol", 0.8))
		music_vol = float(d.get("music_vol", 0.7))
		logged_in = bool(d.get("logged_in", false))
		phone = str(d.get("phone", ""))

func save() -> void:
	var f := FileAccess.open(PATH, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify({
			"sfx_on": sfx_on, "music_on": music_on,
			"sfx_vol": sfx_vol, "music_vol": music_vol,
			"logged_in": logged_in, "phone": phone,
		}))
		f.close()
