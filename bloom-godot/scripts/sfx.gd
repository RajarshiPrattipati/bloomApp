extends Node
## Sfx — procedural sound bank (autoload). Synthesises a cohesive SFX palette into
## AudioStreamWAV resources at startup (no external assets), played from a voice
## pool. Cohesive "warm arcade" character: sine/triangle chimes, saw zaps, soft noise.

const RATE := 44100
const VOICES := 18

var bank: Dictionary = {}
var players: Array[AudioStreamPlayer] = []
var voice := 0
var music_player: AudioStreamPlayer

func _ready() -> void:
	for i in VOICES:
		var p := AudioStreamPlayer.new()
		p.bus = "Master"
		add_child(p)
		players.append(p)
	_build_bank()

func play(name: String, volume_db := -7.0, pitch := 1.0) -> void:
	var wav: AudioStreamWAV = bank.get(name)
	if wav == null:
		return
	var p := players[voice]
	voice = (voice + 1) % players.size()
	p.stream = wav
	p.volume_db = volume_db
	p.pitch_scale = pitch
	p.play()

# ── tiny synth ────────────────────────────────────────────────────────────────
func _buf(dur: float) -> PackedFloat32Array:
	var b := PackedFloat32Array()
	b.resize(int(dur * RATE))
	b.fill(0.0)
	return b

func _osc(phase: float, wave: String) -> float:
	match wave:
		"square": return 1.0 if sin(phase) >= 0.0 else -1.0
		"saw": return fmod(phase / TAU, 1.0) * 2.0 - 1.0
		"tri": return absf(fmod(phase / TAU, 1.0) * 4.0 - 2.0) - 1.0
		"noise": return randf() * 2.0 - 1.0
		_: return sin(phase)

# add a note (optionally pitch-swept to `to`) with a simple attack/release envelope
func _note(b: PackedFloat32Array, freq: float, start: float, dur: float, wave: String, vol: float, atk := 0.005, rel := 0.06, to := 0.0, harmonic := 0.0) -> void:
	var n0 := int(start * RATE)
	var n := int(dur * RATE)
	var phase := 0.0
	var phase2 := 0.0
	for i in n:
		var idx := n0 + i
		if idx < 0 or idx >= b.size():
			continue
		var prog := float(i) / float(n)
		var f := freq if to <= 0.0 else lerpf(freq, to, prog)
		phase += TAU * f / RATE
		phase2 += TAU * f * 2.0 / RATE
		var t := float(i) / RATE
		var env := 1.0
		if t < atk:
			env = t / atk
		elif t > dur - rel:
			env = maxf(0.0, (dur - t) / rel)
		var s := _osc(phase, wave)
		if harmonic > 0.0:
			s += _osc(phase2, "sine") * harmonic
		b[idx] += s * vol * env

func _wav(b: PackedFloat32Array) -> AudioStreamWAV:
	var peak := 0.0001
	for s in b:
		peak = maxf(peak, absf(s))
	var g := 0.92 / peak
	var bytes := PackedByteArray()
	bytes.resize(b.size() * 2)
	for i in b.size():
		bytes.encode_s16(i * 2, int(clampf(b[i] * g, -1.0, 1.0) * 32767.0))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = RATE
	w.stereo = false
	w.data = bytes
	return w

func _chime(b: PackedFloat32Array, freqs: Array, start: float, gap: float, dur: float, wave: String, vol: float, harm := 0.25) -> void:
	for i in freqs.size():
		_note(b, float(freqs[i]), start + i * gap, dur, wave, vol, 0.004, dur * 0.6, 0.0, harm)

# ── the bank ──────────────────────────────────────────────────────────────────
func _build_bank() -> void:
	# UI
	var b := _buf(0.06); _note(b, 660, 0, 0.05, "square", 0.5, 0.002, 0.04); bank["ui_tap"] = _wav(b)
	b = _buf(0.05); _note(b, 520, 0, 0.04, "tri", 0.4, 0.002, 0.035); bank["tab"] = _wav(b)
	b = _buf(0.18); _chime(b, [523, 784], 0, 0.06, 0.12, "sine", 0.5); bank["ui_open"] = _wav(b)
	b = _buf(0.18); _chime(b, [784, 523], 0, 0.06, 0.12, "sine", 0.45); bank["ui_close"] = _wav(b)
	b = _buf(0.2); _note(b, 150, 0, 0.18, "saw", 0.5, 0.005, 0.12, 110); bank["error"] = _wav(b)

	# reel + spin
	b = _buf(0.035); _note(b, 880, 0, 0.028, "square", 0.45, 0.001, 0.02); bank["reel_tick"] = _wav(b)
	b = _buf(0.35); _note(b, 220, 0, 0.32, "saw", 0.3, 0.02, 0.12, 660); _note(b, 0, 0, 0.32, "noise", 0.08, 0.05, 0.2); bank["spin_start"] = _wav(b)

	# wins
	b = _buf(0.3); _chime(b, [988, 1319], 0, 0.07, 0.18, "sine", 0.55, 0.3); bank["coin"] = _wav(b)
	b = _buf(0.35); _chime(b, [659, 988], 0, 0.06, 0.2, "tri", 0.5, 0.25); bank["mystery"] = _wav(b)
	b = _buf(1.5)
	_chime(b, [523, 659, 784, 1046], 0.0, 0.11, 0.5, "tri", 0.5, 0.35)
	_chime(b, [1046, 1319, 1568, 2093], 0.5, 0.07, 0.7, "sine", 0.35, 0.3)
	_note(b, 0, 0.5, 0.9, "noise", 0.05, 0.1, 0.6)
	bank["jackpot"] = _wav(b)
	b = _buf(0.45); _note(b, 300, 0, 0.4, "saw", 0.5, 0.005, 0.18, 1500); _note(b, 0, 0, 0.4, "noise", 0.12, 0.02, 0.3); bank["spark"] = _wav(b)
	b = _buf(0.7); _chime(b, [1318, 1760, 2093, 1760, 2349], 0, 0.07, 0.4, "sine", 0.35, 0.2); bank["card"] = _wav(b)

	# build / world
	b = _buf(0.28); _note(b, 120, 0, 0.16, "square", 0.6, 0.002, 0.1, 70); _note(b, 320, 0, 0.08, "tri", 0.3, 0.002, 0.06); bank["build"] = _wav(b)
	b = _buf(0.9); _chime(b, [392, 494, 587, 784], 0, 0.0, 0.85, "sine", 0.32, 0.4); bank["golden_hour"] = _wav(b)  # G major pad
	b = _buf(0.22); _chime(b, [587, 880], 0, 0.06, 0.14, "sine", 0.5, 0.25); bank["help"] = _wav(b)
	b = _buf(0.5); _chime(b, [659, 880, 1047], 0, 0.08, 0.28, "sine", 0.42, 0.3); bank["gratitude"] = _wav(b)
	b = _buf(0.6); _chime(b, [784, 988, 1175], 0, 0.06, 0.32, "tri", 0.45, 0.3); bank["milestone"] = _wav(b)
	b = _buf(0.85); _chime(b, [523, 659, 784, 1046, 1319], 0, 0.09, 0.4, "tri", 0.42, 0.35); bank["level_up"] = _wav(b)
	b = _buf(0.4); _chime(b, [880, 1175, 1568], 0, 0.05, 0.22, "sine", 0.4, 0.3); bank["purchase"] = _wav(b)

# gentle looping ambience pad (kept very quiet under everything)
func start_ambience() -> void:
	if music_player != null:
		return
	music_player = AudioStreamPlayer.new()
	music_player.bus = "Master"
	add_child(music_player)
	var amb: AudioStream = load("res://sounds/ambience.ogg")
	if amb:
		if amb is AudioStreamOggVorbis:
			amb.loop = true
		music_player.stream = amb
		music_player.volume_db = -26.0
		music_player.play()
