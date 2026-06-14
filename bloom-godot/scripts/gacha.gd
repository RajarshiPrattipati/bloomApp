extends CanvasLayer
## Juiced gacha spin overlay. begin() starts the reel (anticipation while the
## server responds); reveal(result) decelerates, lands, and celebrates by rarity;
## emits `finished` when it has faded out.

signal finished

const DW := 540.0
const DH := 960.0
const ICONS := ["🪙", "🎟", "🔨", "🎁", "🔁", "🃏", "💎", "🔥"]
const KIND_ICON := {
	"coins": "🪙", "help_tokens": "🎟", "build_boost": "🔨", "mystery_gift": "🎁",
	"extra_spins": "🔁", "rare_card": "🃏", "jackpot": "💎", "momentum_spark": "🔥",
}
const KIND_COLOR := {
	"coins": Color("e8b04b"), "help_tokens": Color("6fae8a"), "build_boost": Color("6fae8a"),
	"mystery_gift": Color("9d7bc0"), "extra_spins": Color("5aa0d0"), "rare_card": Color("d08fe0"),
	"jackpot": Color("ffd54a"), "momentum_spark": Color("ff7a3d"),
}

var center := Vector2(DW / 2.0, DH * 0.40)
var bg: ColorRect
var flash: ColorRect
var machine: Control
var ring: Panel
var reel: Label
var name_label: Label
var sub_label: Label
var particles: CPUParticles2D

var cycling := false
var resolving := false
var accum := 0.0
var interval := 0.05
var decel_t := 0.0
var decel_dur := 1.15
var glow_phase := 0.0
var result: Dictionary = {}

func _ready() -> void:
	layer = 60
	_build()

func _build() -> void:
	bg = ColorRect.new(); bg.color = Color(0, 0, 0, 0.0); bg.size = Vector2(DW, DH); bg.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(bg)

	machine = Control.new(); machine.position = center
	add_child(machine)

	# pulsing glow ring behind the reel
	ring = Panel.new()
	var rs := StyleBoxFlat.new(); rs.bg_color = Color("e8b04b"); rs.set_corner_radius_all(120)
	ring.add_theme_stylebox_override("panel", rs)
	ring.size = Vector2(220, 220); ring.position = Vector2(-110, -110)
	ring.modulate = Color(1, 1, 1, 0.25)
	machine.add_child(ring)

	var capsule := Panel.new()
	var cs := StyleBoxFlat.new(); cs.bg_color = Color("231a12"); cs.set_corner_radius_all(28); cs.set_border_width_all(4); cs.border_color = Color("e8b04b")
	capsule.add_theme_stylebox_override("panel", cs)
	capsule.size = Vector2(190, 190); capsule.position = Vector2(-95, -95)
	machine.add_child(capsule)

	reel = Label.new()
	reel.add_theme_font_size_override("font_size", 110)
	reel.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	reel.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	reel.size = Vector2(190, 190); reel.position = Vector2(-95, -95)
	reel.text = "🎰"
	machine.add_child(reel)

	particles = CPUParticles2D.new()
	particles.emitting = false
	particles.amount = 60
	particles.one_shot = true
	particles.explosiveness = 0.95
	particles.lifetime = 1.1
	particles.direction = Vector2(0, -1)
	particles.spread = 180.0
	particles.gravity = Vector2(0, 980)
	particles.initial_velocity_min = 180.0
	particles.initial_velocity_max = 420.0
	particles.scale_amount_min = 4.0
	particles.scale_amount_max = 8.0
	particles.color = Color("e8b04b")
	machine.add_child(particles)

	name_label = Label.new()
	name_label.add_theme_font_size_override("font_size", 30)
	name_label.add_theme_color_override("font_color", Color("f3e9d8"))
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_label.size = Vector2(DW, 40); name_label.position = Vector2(0, center.y + 130)
	add_child(name_label)

	sub_label = Label.new()
	sub_label.add_theme_font_size_override("font_size", 18)
	sub_label.add_theme_color_override("font_color", Color("b29a7e"))
	sub_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub_label.size = Vector2(DW, 26); sub_label.position = Vector2(0, center.y + 172)
	sub_label.text = "tap pulse…"
	add_child(sub_label)

	flash = ColorRect.new(); flash.color = Color(1, 1, 1, 0.0); flash.size = Vector2(DW, DH); flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(flash)

func begin() -> void:
	cycling = true
	resolving = false
	interval = 0.05
	accum = 0.0
	name_label.text = ""
	sub_label.text = "spinning…"
	machine.scale = Vector2(0.3, 0.3)
	var tw := create_tween()
	tw.parallel().tween_property(bg, "color", Color(0, 0, 0, 0.66), 0.22)
	tw.parallel().tween_property(machine, "scale", Vector2.ONE, 0.32).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	Sfx.play("spin_start", -9)

func reveal(res: Dictionary) -> void:
	result = res
	resolving = true
	decel_t = 0.0

func _process(delta: float) -> void:
	glow_phase += delta * 6.0
	if ring:
		var a: float = 0.18 + 0.18 * sin(glow_phase)
		ring.modulate.a = a
		ring.scale = Vector2.ONE * (1.0 + 0.04 * sin(glow_phase))
		ring.pivot_offset = Vector2(110, 110)

	if not cycling:
		return
	if resolving:
		decel_t += delta
		var p: float = clampf(decel_t / decel_dur, 0.0, 1.0)
		interval = lerpf(0.05, 0.26, p * p)
		if p >= 1.0:
			_land()
			return
	accum += delta
	if accum >= interval:
		accum = 0.0
		reel.text = ICONS[randi() % ICONS.size()]
		var pitch: float = 1.5 - clampf(decel_t / decel_dur, 0.0, 1.0) * 0.7 if resolving else 1.3
		Sfx.play("reel_tick", -19, pitch)
		# little punch each tick
		reel.scale = Vector2(1.12, 1.12)
		create_tween().tween_property(reel, "scale", Vector2.ONE, 0.08)

func _land() -> void:
	cycling = false
	var kind := str(result.get("kind", "coins"))
	reel.text = KIND_ICON.get(kind, "🪙")
	var col: Color = KIND_COLOR.get(kind, Color("e8b04b"))
	particles.color = col
	# capsule border colour to match
	var caps := machine.get_child(1) as Panel
	var sb := caps.get_theme_stylebox("panel") as StyleBoxFlat
	if sb: sb.border_color = col

	# punch + flash + particles
	reel.scale = Vector2(1.7, 1.7)
	create_tween().tween_property(reel, "scale", Vector2.ONE, 0.45).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)
	particles.restart()
	particles.emitting = true

	name_label.text = _result_text(kind)
	name_label.add_theme_color_override("font_color", col)
	sub_label.text = ""

	var big := kind == "jackpot" or kind == "rare_card" or kind == "momentum_spark"
	var ft := create_tween()
	ft.tween_property(flash, "color", Color(1, 1, 1, 0.55 if big else 0.28), 0.05)
	ft.tween_property(flash, "color", Color(1, 1, 1, 0.0), 0.45)

	_play_win_sound(kind)
	if big:
		_shake(0.35, 14.0 if kind == "jackpot" else 9.0)

	# hold, then fade out
	var hold := 1.3 if big else 0.9
	var out := create_tween()
	out.tween_interval(hold)
	out.parallel().tween_property(bg, "color", Color(0, 0, 0, 0.0), 0.3)
	out.parallel().tween_property(machine, "scale", Vector2(0.3, 0.3), 0.3)
	out.parallel().tween_property(name_label, "modulate:a", 0.0, 0.3)
	out.tween_callback(func(): finished.emit())

func _result_text(kind: String) -> String:
	var coins := int(result.get("coinsAwarded", 0))
	match kind:
		"jackpot": return "💎 JACKPOT!  +%d 🪙" % coins
		"coins": return "+%d Coins" % coins
		"mystery_gift": return "🎁 Mystery!  +%d 🪙" % coins
		"momentum_spark": return "🔥 Momentum Surge!"
		"extra_spins": return "🔁 +%d Spins" % int(result.get("extraSpins", 0))
		"help_tokens": return "🎟 +%d Help Tokens" % int(result.get("tokensAwarded", 0))
		"build_boost": return "🔨 Build Boost!"
		"rare_card": return "🃏 RARE CARD!"
	return str(result.get("label", ""))

func _play_win_sound(kind: String) -> void:
	match kind:
		"jackpot": Sfx.play("jackpot", -3)
		"momentum_spark": Sfx.play("spark", -5)
		"rare_card": Sfx.play("card", -5)
		"coins": Sfx.play("coin", -7)
		"mystery_gift": Sfx.play("mystery", -7)
		"extra_spins": Sfx.play("coin", -9, 1.25)
		"help_tokens": Sfx.play("help", -9)
		"build_boost": Sfx.play("milestone", -9)
		_: Sfx.play("coin", -9)

func _shake(dur: float, mag: float) -> void:
	var t := 0.0
	while t < dur:
		machine.position = center + Vector2(randf_range(-mag, mag), randf_range(-mag, mag))
		await get_tree().create_timer(0.02).timeout
		t += 0.02
	machine.position = center
