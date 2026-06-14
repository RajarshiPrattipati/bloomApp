extends Node
## Music — generative background score (autoload). A tiny real-time sequencer plays
## a cozy chord progression (Am7–Fmaj7–Cmaj7–G7) using three synthesised
## instruments (pad / bass / pluck). Sparkle density rises with `intensity`
## (momentum); volume ducks during the gacha. No external audio assets.

const RATE := 44100
const BASE := 261.63 # C4
const STEPS_PER_CHORD := 16 # eighth-notes (2 bars)

# vi–IV–I–V in C — warm and hopeful. {root semitone, chord intervals}
const PROG := [
	{"root": 9, "ints": [0, 3, 7, 10]},  # Am7
	{"root": 5, "ints": [0, 4, 7, 11]},  # Fmaj7
	{"root": 0, "ints": [0, 4, 7, 11]},  # Cmaj7
	{"root": 7, "ints": [0, 4, 7, 10]},  # G7
]

var bpm := 78.0
var intensity := 0.3
var duck := 0.0
var step := 0
var rng := RandomNumberGenerator.new()

var pad_wav: AudioStreamWAV
var bass_wav: AudioStreamWAV
var pluck_wav: AudioStreamWAV
var pad_pool: Array[AudioStreamPlayer] = []
var bass_pool: Array[AudioStreamPlayer] = []
var pluck_pool: Array[AudioStreamPlayer] = []
var pad_i := 0
var bass_i := 0
var pluck_i := 0

func _ready() -> void:
	rng.randomize()
	var chord_secs := float(STEPS_PER_CHORD) * (60.0 / bpm / 2.0)
	pad_wav = _render(chord_secs + 0.6, _pad)
	bass_wav = _render(1.5, _bass)
	pluck_wav = _render(0.6, _pluck)
	_make_pool(pad_pool, 8)
	_make_pool(bass_pool, 3)
	_make_pool(pluck_pool, 6)
	var seq := Timer.new()
	seq.wait_time = 60.0 / bpm / 2.0 # eighth notes
	seq.autostart = true
	add_child(seq)
	seq.timeout.connect(_tick)

func set_intensity(x: float) -> void:
	intensity = clampf(x, 0.0, 1.0)

func set_ducked(on: bool) -> void:
	duck = -7.0 if on else 0.0

# ── sequencer ─────────────────────────────────────────────────────────────────
func _freq(semi: float) -> float:
	return BASE * pow(2.0, semi / 12.0)

func _voice(pool: Array, instr: int, wav: AudioStreamWAV, freq: float, vol: float) -> void:
	var p: AudioStreamPlayer
	match instr:
		0: p = pool[pad_i]; pad_i = (pad_i + 1) % pool.size()
		1: p = pool[bass_i]; bass_i = (bass_i + 1) % pool.size()
		_: p = pool[pluck_i]; pluck_i = (pluck_i + 1) % pool.size()
	p.stream = wav
	p.pitch_scale = freq / BASE
	p.volume_db = vol + duck
	p.play()

func _tick() -> void:
	var chord: Dictionary = PROG[(step / STEPS_PER_CHORD) % PROG.size()]
	var root: int = chord["root"]
	var ints: Array = chord["ints"]
	var sic := step % STEPS_PER_CHORD

	if sic == 0:
		for iv in ints:
			_voice(pad_pool, 0, pad_wav, _freq(root + int(iv)), -23.0 + intensity * 2.0)
		_voice(bass_pool, 1, bass_wav, _freq(root - 24), -19.0)
	elif sic == 8:
		_voice(bass_pool, 1, bass_wav, _freq(root - 24 + 7), -21.0)

	# sparkle melody — denser & brighter when momentum is hot
	if sic % 2 == 1 and rng.randf() < 0.10 + intensity * 0.5:
		var tone: int = int(ints[rng.randi() % ints.size()])
		var oct := 12 if rng.randf() > intensity * 0.6 else 24
		_voice(pluck_pool, 2, pluck_wav, _freq(root + tone + oct), -22.0 + intensity * 3.0)
	step += 1

# ── synth (small, self-contained) ─────────────────────────────────────────────
func _make_pool(arr: Array[AudioStreamPlayer], n: int) -> void:
	for i in n:
		var p := AudioStreamPlayer.new()
		p.bus = "Master"
		add_child(p)
		arr.append(p)

func _osc(phase: float, wave: String) -> float:
	match wave:
		"tri": return absf(fmod(phase / TAU, 1.0) * 4.0 - 2.0) - 1.0
		"saw": return fmod(phase / TAU, 1.0) * 2.0 - 1.0
		_: return sin(phase)

func _render(dur: float, voice_fn: Callable) -> AudioStreamWAV:
	var n := int(dur * RATE)
	var buf := PackedFloat32Array(); buf.resize(n); buf.fill(0.0)
	voice_fn.call(buf, dur)
	var peak := 0.0001
	for s in buf: peak = maxf(peak, absf(s))
	var g := 0.9 / peak
	var bytes := PackedByteArray(); bytes.resize(n * 2)
	for i in n: bytes.encode_s16(i * 2, int(clampf(buf[i] * g, -1.0, 1.0) * 32767.0))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = RATE
	w.stereo = false
	w.data = bytes
	return w

func _env(t: float, dur: float, atk: float, rel: float) -> float:
	if t < atk: return t / atk
	if t > dur - rel: return maxf(0.0, (dur - t) / rel)
	return 1.0

# instrument generators write directly into the buffer (base note = C4)
func _pad(buf: PackedFloat32Array, dur: float) -> void:
	var p1 := 0.0; var p2 := 0.0
	for i in buf.size():
		var t := float(i) / RATE
		p1 += TAU * BASE / RATE
		p2 += TAU * BASE * 2.0 / RATE
		var e := _env(t, dur, 0.55, 1.8)
		buf[i] = (sin(p1) * 0.7 + _osc(p2, "tri") * 0.18) * e

func _bass(buf: PackedFloat32Array, dur: float) -> void:
	var p1 := 0.0
	for i in buf.size():
		var t := float(i) / RATE
		p1 += TAU * BASE / RATE
		var e := _env(t, dur, 0.01, 0.9)
		buf[i] = (sin(p1) * 0.8 + _osc(p1, "tri") * 0.15) * e

func _pluck(buf: PackedFloat32Array, dur: float) -> void:
	var p1 := 0.0; var p2 := 0.0
	for i in buf.size():
		var t := float(i) / RATE
		p1 += TAU * BASE / RATE
		p2 += TAU * BASE * 3.0 / RATE
		var e := exp(-t * 5.0) * _env(t, dur, 0.004, 0.1)
		buf[i] = (sin(p1) * 0.6 + _osc(p2, "tri") * 0.2) * e
