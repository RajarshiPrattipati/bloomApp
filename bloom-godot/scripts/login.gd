extends CanvasLayer
## Login — mobile number + OTP gate (modal overlay). The OTP is fixed to 1234 for
## now (client-side only; no server call). Emits `verified(phone)` on success.

signal verified(phone)

const DEMO_OTP := "1234"

var phone_edit: LineEdit
var otp_edit: LineEdit
var send_btn: Button
var verify_btn: Button
var status: Label
var otp_sent := false

func _ready() -> void:
	layer = 100
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.theme = UiTheme.build()
	add_child(root)

	var dim := ColorRect.new()
	dim.color = Color(0.05, 0.06, 0.09, 0.97)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP   # block the game behind us
	root.add_child(dim)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(center)

	var card := PanelContainer.new()
	card.theme_type_variation = "Card2"
	card.custom_minimum_size = Vector2(440, 0)
	center.add_child(card)
	var pad := MarginContainer.new()
	for s in ["margin_left", "margin_right", "margin_top", "margin_bottom"]:
		pad.add_theme_constant_override(s, 22)
	card.add_child(pad)
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 14)
	pad.add_child(v)

	var title := Label.new(); title.text = "🌸 BLOOM"; title.theme_type_variation = "Title"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(title)
	var sub := Label.new(); sub.text = "Sign in with your mobile number"; sub.theme_type_variation = "Dim"
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(sub)

	phone_edit = _line("Mobile number")
	phone_edit.max_length = 15
	phone_edit.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_PHONE
	v.add_child(phone_edit)

	send_btn = _button("Send OTP", "Primary")
	send_btn.pressed.connect(_on_send)
	v.add_child(send_btn)

	otp_edit = _line("Enter 4-digit OTP")
	otp_edit.max_length = 4
	otp_edit.alignment = HORIZONTAL_ALIGNMENT_CENTER
	otp_edit.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_NUMBER
	otp_edit.visible = false
	v.add_child(otp_edit)

	verify_btn = _button("Verify & Play", "Primary")
	verify_btn.pressed.connect(_on_verify)
	verify_btn.visible = false
	v.add_child(verify_btn)

	status = Label.new(); status.theme_type_variation = "Dim"
	status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(status)

	phone_edit.text_submitted.connect(func(_t): _on_send())
	otp_edit.text_submitted.connect(func(_t): _on_verify())
	phone_edit.grab_focus()

func _digits(s: String) -> String:
	var out := ""
	for c in s:
		if c >= "0" and c <= "9": out += c
	return out

func _on_send() -> void:
	if otp_sent: return
	if _digits(phone_edit.text).length() < 10:
		_status("Enter a valid 10-digit mobile number", UiTheme.RED)
		Sfx.play("error", -8)
		return
	otp_sent = true
	otp_edit.visible = true
	verify_btn.visible = true
	send_btn.disabled = true
	send_btn.text = "OTP sent ✓"
	phone_edit.editable = false
	_status("Demo OTP is %s" % DEMO_OTP, UiTheme.GREEN_EDGE)
	Sfx.play("ui_open", -8)
	otp_edit.grab_focus()

func _on_verify() -> void:
	if not otp_sent: return
	if _digits(otp_edit.text) == DEMO_OTP:
		Sfx.play("level_up", -6)
		verified.emit(_digits(phone_edit.text))
	else:
		_status("Incorrect OTP — try %s" % DEMO_OTP, UiTheme.RED)
		Sfx.play("error", -8)
		otp_edit.text = ""
		otp_edit.grab_focus()

func _status(text: String, col: Color) -> void:
	status.text = text
	status.add_theme_color_override("font_color", col)

func _line(placeholder: String) -> LineEdit:
	var e := LineEdit.new()
	e.placeholder_text = placeholder
	e.custom_minimum_size = Vector2(0, 50)
	e.add_theme_font_size_override("font_size", 20)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(1, 1, 1, 0.08)
	sb.set_corner_radius_all(10)
	sb.content_margin_left = 12; sb.content_margin_right = 12
	sb.content_margin_top = 8; sb.content_margin_bottom = 8
	e.add_theme_stylebox_override("normal", sb)
	var sf := sb.duplicate() as StyleBoxFlat
	sf.border_color = UiTheme.GOLD; sf.set_border_width_all(2)
	e.add_theme_stylebox_override("focus", sf)
	return e

func _button(text: String, variation: String) -> Button:
	var b := Button.new(); b.text = text; b.theme_type_variation = variation
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(0, 52)
	return b
