extends CanvasLayer
## Themed tabbed meta-menu: Quests / Pass / Cards / Teams / Shop. Fetches live
## data from Net and exposes claim/create/join/contribute/buy actions.

signal closed
signal wallet_changed

const TABS := ["Quests", "Pass", "Cards", "Teams", "Shop", "Settings"]

var tab := 0
var busy := false
var _gen := 0  # bumped each refresh; stale async builds bail out (no interleaving)
var cfg: Dictionary = {}
var content: VBoxContainer
var title_label: Label
var tab_buttons: Array[Button] = []
var status_label: Label

func _ready() -> void:
	layer = 50
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.theme = UiTheme.build()
	add_child(root)

	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.62)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	dim.gui_input.connect(func(e): if e is InputEventMouseButton and e.pressed: _close())
	root.add_child(dim)

	var card := PanelContainer.new()
	card.set_anchors_preset(Control.PRESET_FULL_RECT)
	card.add_theme_constant_override("margin_left", 0)
	card.offset_left = 14; card.offset_top = 70; card.offset_right = -14; card.offset_bottom = -70
	root.add_child(card)
	var pad := MarginContainer.new()
	for s in ["margin_left", "margin_right", "margin_top", "margin_bottom"]: pad.add_theme_constant_override(s, 14)
	card.add_child(pad)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	pad.add_child(col)

	var header := HBoxContainer.new()
	col.add_child(header)
	title_label = Label.new(); title_label.theme_type_variation = "Title"
	title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title_label)
	status_label = Label.new(); status_label.theme_type_variation = "Dim"
	header.add_child(status_label)
	var x := Button.new(); x.theme_type_variation = "Ghost"; x.text = "✕"; x.focus_mode = Control.FOCUS_NONE
	x.custom_minimum_size = Vector2(40, 36)
	x.pressed.connect(_close)
	header.add_child(x)

	var tabs_row := HBoxContainer.new()
	tabs_row.add_theme_constant_override("separation", 5)
	col.add_child(tabs_row)
	for i in TABS.size():
		var b := Button.new(); b.text = TABS[i]; b.focus_mode = Control.FOCUS_NONE
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.add_theme_font_size_override("font_size", 12)
		b.clip_text = true
		var idx := i
		b.pressed.connect(func(): _switch(idx))
		tabs_row.add_child(b)
		tab_buttons.append(b)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(scroll)
	content = VBoxContainer.new()
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.add_theme_constant_override("separation", 8)
	scroll.add_child(content)

func open() -> void:
	cfg = await Net.get_config()
	await _refresh()

func _close() -> void:
	closed.emit()

func _switch(i: int) -> void:
	tab = i
	Sfx.play("tab", -14)
	await _refresh()

func _refresh() -> void:
	_gen += 1
	title_label.text = TABS[tab]
	for i in tab_buttons.size():
		tab_buttons[i].theme_type_variation = "Primary" if i == tab else "Ghost"
	_clear()
	status_label.text = "…"
	match tab:
		0: await _build_quests()
		1: await _build_pass()
		2: await _build_cards()
		3: await _build_teams()
		4: _build_shop()
		5: _build_settings()
	status_label.text = ""

func _clear() -> void:
	for c in content.get_children():
		c.free()

# ── reusable rows ──
func _card_row(left_text: String, sub_text: String, right_text: String) -> HBoxContainer:
	var p := PanelContainer.new(); p.theme_type_variation = "Card2"
	content.add_child(p)
	var h := HBoxContainer.new(); p.add_child(h)
	var v := VBoxContainer.new(); v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 0)
	h.add_child(v)
	var l := Label.new(); l.text = left_text; v.add_child(l)
	if sub_text != "":
		var s := Label.new(); s.theme_type_variation = "Dim"; s.text = sub_text; v.add_child(s)
	if right_text != "":
		var r := Label.new(); r.theme_type_variation = "Stat"; r.text = right_text
		r.add_theme_color_override("font_color", UiTheme.GOLD)
		h.add_child(r)
	return h

func _info(text: String) -> void:
	var l := Label.new(); l.theme_type_variation = "Dim"; l.text = text
	content.add_child(l)

func _action(text: String, enabled: bool, cb: Callable, variation := "Primary") -> Button:
	var b := Button.new(); b.text = text; b.focus_mode = Control.FOCUS_NONE
	b.theme_type_variation = variation
	b.disabled = not enabled
	b.custom_minimum_size = Vector2(0, 46)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.pressed.connect(cb)
	content.add_child(b)
	return b

func _do(fn: Callable) -> void:
	if busy: return
	busy = true
	await fn.call()
	Sfx.play("purchase", -7)
	wallet_changed.emit()
	busy = false
	await _refresh()

# ── tabs ──
func _build_quests() -> void:
	var g := _gen
	var r := await Net.quests()
	if _gen != g: return
	var list: Array = r.get("_list", [])
	var any := false
	for q in list:
		var done: bool = q.get("complete", false)
		var claimed: bool = q.get("claimed", false)
		var tag := "  ✓ claimed" if claimed else ("  ✓ ready" if done else "")
		_card_row(str(q.get("label", "")), "%d/%d%s" % [int(q.get("progress", 0)), int(q.get("target", 1)), tag], "")
		if done and not claimed: any = true
	_action("Claim rewards", any, func(): await _do(func(): await Net.quests_claim()), "Primary" if any else "Ghost")

func _build_pass() -> void:
	var g := _gen
	var p := await Net.pass_status()
	if _gen != g: return
	_card_row("Tier %d / %d" % [int(p.get("tier", 0)), int(p.get("maxTier", 30))], "XP %d / %d into next" % [int(p.get("xpIntoTier", 0)), int(p.get("xpPerTier", 100))], "")
	_info("Free rewards ready: %d" % int(p.get("claimableFree", 0)))
	if p.get("active", false):
		_info("Premium ready: %d  ⭐" % int(p.get("claimablePremium", 0)))
	else:
		_info("Premium track locked — buy the Season Pass in Shop")
	var claimable: int = int(p.get("claimableFree", 0)) + int(p.get("claimablePremium", 0))
	_action("Claim pass rewards", claimable > 0, func(): await _do(func(): await Net.pass_claim()), "Primary" if claimable > 0 else "Ghost")

func _build_cards() -> void:
	var g := _gen
	var c := await Net.cards()
	if _gen != g: return
	_card_row("%d cards · +%d%% coins" % [int(c.get("ownedCards", 0)), int(c.get("totalBonusPct", 0))], "", "")
	for s in c.get("sets", []):
		var tag := "  ✓ complete" if s.get("complete", false) else ""
		_card_row(str(s.get("name", "")), "%d/%d%s" % [int(s.get("owned", 0)), int(s.get("total", 6)), tag], "+%d%%" % int(s.get("bonusPct", 0)))

func _build_teams() -> void:
	var g := _gen
	var t := await Net.team_mine()
	if _gen != g: return
	if t.has("id"):
		_card_row(str(t.get("name", "")), "%d members" % int(t.get("memberCount", 1)), "")
		var proj = t.get("project")
		if proj != null:
			_card_row(str(proj.get("kind", "Project")), "%d%% complete" % int(proj.get("pct", 0)), "")
		for m in t.get("members", []):
			var pid := str(m.get("playerId", ""))
			_info("Friend %s · %d🪙" % [pid.substr(0, 4), int(m.get("contributed", 0))])
		_action("Contribute 1000 🪙", true, func(): await _do(func(): await Net.team_contribute(1000)))
		_action("Leave team", true, func(): await _do(func(): await Net.team_leave()), "Ghost")
	else:
		_info("You are not in a team")
		_action("Create a team", true, func(): await _do(func(): await Net.team_create("Bloomers %d" % (randi() % 900 + 100))))
		var lst := await Net.team_list()
		if _gen != g: return
		for tm in lst.get("_list", []):
			var h := _card_row(str(tm.get("name", "")), "%d members" % int(tm.get("memberCount", 1)), "")
			var jb := Button.new(); jb.text = "Join"; jb.focus_mode = Control.FOCUS_NONE
			jb.custom_minimum_size = Vector2(72, 0)
			var tid := str(tm.get("id", ""))
			jb.pressed.connect(func(): await _do(func(): await Net.team_join(tid)))
			h.add_child(jb)

func _build_shop() -> void:
	var iap: Dictionary = cfg.get("iap", {})
	_info("Spins")
	for pk in iap.get("spinPacks", []):
		var h := _card_row("🪙 %d spins" % int(pk.get("spins", 0)), "", "₹%d" % int(pk.get("inr", 0)))
		var sku := str(pk.get("sku", ""))
		var b := Button.new(); b.text = "Buy"; b.focus_mode = Control.FOCUS_NONE; b.custom_minimum_size = Vector2(70, 0)
		b.pressed.connect(func(): await _do(func(): await Net.purchase(sku)))
		h.add_child(b)
	var sub: Dictionary = iap.get("boostSub", {})
	var pass_p: Dictionary = iap.get("seasonPass", {})
	if not sub.is_empty():
		var h := _card_row("✨ Boost Sub", "+%d%% coins · daily spins" % int(sub.get("coinBonusPct", 20)), "₹%d" % int(sub.get("inr", 99)))
		var sku := str(sub.get("sku", "boost_monthly"))
		var b := Button.new(); b.text = "Buy"; b.focus_mode = Control.FOCUS_NONE; b.custom_minimum_size = Vector2(70, 0)
		b.pressed.connect(func(): await _do(func(): await Net.purchase(sku)))
		h.add_child(b)
	if not pass_p.is_empty():
		var h := _card_row("⭐ Season Pass", "premium reward track", "₹%d" % int(pass_p.get("inr", 399)))
		var sku := str(pass_p.get("sku", "season_pass"))
		var b := Button.new(); b.text = "Buy"; b.focus_mode = Control.FOCUS_NONE; b.custom_minimum_size = Vector2(70, 0)
		b.pressed.connect(func(): await _do(func(): await Net.purchase(sku)))
		h.add_child(b)
	_info("Sandbox — purchases are simulated")

func _build_settings() -> void:
	_info("Audio")
	_audio_row("Music", Settings.music_on, Settings.music_vol,
		func(on): Settings.set_music_on(on),
		func(val): Settings.set_music_vol(val))
	_audio_row("SFX", Settings.sfx_on, Settings.sfx_vol,
		func(on): Settings.set_sfx_on(on),
		func(val): Settings.set_sfx_vol(val))
	_info("Saved on this device.")
	if Settings.phone != "":
		_info("Signed in as %s" % Settings.phone)

# a Card2 row: checkbox to enable the channel + a volume slider (+ live %)
func _audio_row(name: String, on: bool, vol: float, on_cb: Callable, vol_cb: Callable) -> void:
	var p := PanelContainer.new(); p.theme_type_variation = "Card2"
	content.add_child(p)
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 8)
	p.add_child(v)
	var head := HBoxContainer.new(); v.add_child(head)
	var cb := CheckBox.new(); cb.text = name; cb.button_pressed = on; cb.focus_mode = Control.FOCUS_NONE
	cb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(cb)
	var pct := Label.new(); pct.theme_type_variation = "Dim"; pct.text = "%d%%" % int(round(vol * 100.0))
	head.add_child(pct)
	var sl := HSlider.new()
	sl.min_value = 0.0; sl.max_value = 1.0; sl.step = 0.01; sl.value = vol
	sl.custom_minimum_size = Vector2(0, 30); sl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sl.editable = on
	v.add_child(sl)
	cb.toggled.connect(func(pressed: bool):
		on_cb.call(pressed)
		sl.editable = pressed
		Sfx.play("ui_tap", -12))
	sl.value_changed.connect(func(val: float):
		vol_cb.call(val)
		pct.text = "%d%%" % int(round(val * 100.0)))
