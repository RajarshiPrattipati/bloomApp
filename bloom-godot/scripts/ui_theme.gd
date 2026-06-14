class_name UiTheme
extends RefCounted
## Single source of UI styling for BLOOM. Build once, apply to the HUD root; all
## controls inherit. Button variants use Theme type-variations (Primary/Ghost/Chip)
## so there is no per-button StyleBox duplication.

const FONT := preload("res://fonts/lilita_one_regular.ttf")

# ── palette ──
const BG := Color("17110c")
const PANEL := Color("231a12")
const PANEL_2 := Color("2a1f16")
const EDGE := Color("3d2e20")
const GOLD := Color("e8b04b")
const GOLD_EDGE := Color("f6cf86")
const GREEN := Color("3f7d5a")
const GREEN_EDGE := Color("6fae8a")
const TEXT := Color("f3e9d8")
const DIM := Color("b29a7e")
const FIRE := Color("ff7a3d")
const FIRE_DIM := Color("5a3320")
const RED := Color("c0504b")

static func _flat(bg: Color, radius := 14, border := 0, border_col := EDGE, pad := 10) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.set_corner_radius_all(radius)
	if border > 0:
		s.set_border_width_all(border)
		s.border_color = border_col
	s.content_margin_left = pad
	s.content_margin_right = pad
	s.content_margin_top = max(6, pad - 2)
	s.content_margin_bottom = max(6, pad - 2)
	return s

static func _button_set(t: Theme, type: String, base: Color, edge: Color, fg: Color, radius := 18) -> void:
	if type != "Button":
		t.set_type_variation(type, "Button")
	t.set_stylebox("normal", type, _flat(base, radius, 2, edge, 14))
	t.set_stylebox("hover", type, _flat(base.lightened(0.08), radius, 2, edge, 14))
	t.set_stylebox("pressed", type, _flat(base.darkened(0.14), radius, 2, edge, 14))
	t.set_stylebox("disabled", type, _flat(Color("4a3c2e"), radius, 2, EDGE, 14))
	t.set_color("font_color", type, fg)
	t.set_color("font_hover_color", type, fg)
	t.set_color("font_pressed_color", type, fg)
	t.set_color("font_disabled_color", type, DIM)
	t.set_constant("outline_size", type, 0)

static func _font_with_emoji() -> Font:
	# Lilita One for chunky game text, with a system emoji fallback so 🪙🔥🌟🤝 render.
	var f := FONT.duplicate() as FontFile
	var emoji := SystemFont.new()
	emoji.font_names = PackedStringArray(["Apple Color Emoji", "Noto Color Emoji", "Segoe UI Emoji"])
	f.fallbacks = [emoji]
	return f

static func build() -> Theme:
	var t := Theme.new()
	t.default_font = _font_with_emoji()
	t.default_font_size = 18
	t.set_color("font_color", "Label", TEXT)

	# Buttons
	_button_set(t, "Button", GREEN, GREEN_EDGE, TEXT)             # default = green action
	_button_set(t, "Primary", GOLD, GOLD_EDGE, BG, 22)           # gold call-to-action
	_button_set(t, "Ghost", PANEL, EDGE, GOLD, 12)               # dark secondary
	_button_set(t, "Chip", PANEL, EDGE, TEXT, 10)                # small pill

	# Panels (cards)
	t.set_stylebox("panel", "PanelContainer", _flat(PANEL, 16, 2, EDGE, 14))
	t.set_type_variation("Card2", "PanelContainer")
	t.set_stylebox("panel", "Card2", _flat(PANEL_2, 14, 2, EDGE, 12))
	t.set_stylebox("panel", "Panel", _flat(PANEL, 16, 2, EDGE, 0))

	# Label variations
	t.set_type_variation("Title", "Label")
	t.set_color("font_color", "Title", GOLD)
	t.set_font_size("font_size", "Title", 30)
	t.set_type_variation("Dim", "Label")
	t.set_color("font_color", "Dim", DIM)
	t.set_font_size("font_size", "Dim", 13)
	t.set_type_variation("Stat", "Label")
	t.set_color("font_color", "Stat", TEXT)
	t.set_font_size("font_size", "Stat", 20)

	# ProgressBar (momentum)
	var pb_bg := _flat(FIRE_DIM, 6, 0)
	pb_bg.content_margin_left = 0; pb_bg.content_margin_right = 0
	pb_bg.content_margin_top = 0; pb_bg.content_margin_bottom = 0
	var pb_fill := _flat(FIRE, 6, 0)
	pb_fill.content_margin_left = 0; pb_fill.content_margin_right = 0
	t.set_stylebox("background", "ProgressBar", pb_bg)
	t.set_stylebox("fill", "ProgressBar", pb_fill)
	t.set_color("font_color", "ProgressBar", Color(0, 0, 0, 0))  # hide built-in % text

	# TabBar / TabContainer (for the menu)
	t.set_stylebox("tab_selected", "TabBar", _flat(GOLD, 10, 0, EDGE, 12))
	t.set_stylebox("tab_unselected", "TabBar", _flat(PANEL_2, 10, 0, EDGE, 12))
	t.set_stylebox("tab_hovered", "TabBar", _flat(PANEL_2.lightened(0.06), 10, 0, EDGE, 12))
	t.set_color("font_selected_color", "TabBar", BG)
	t.set_color("font_unselected_color", "TabBar", TEXT)
	t.set_color("font_hovered_color", "TabBar", TEXT)
	t.set_stylebox("panel", "TabContainer", _flat(PANEL, 16, 2, EDGE, 8))
	t.set_stylebox("tab_selected", "TabContainer", _flat(GOLD, 10, 0, EDGE, 12))
	t.set_stylebox("tab_unselected", "TabContainer", _flat(PANEL_2, 10, 0, EDGE, 12))
	t.set_color("font_selected_color", "TabContainer", BG)
	t.set_color("font_unselected_color", "TabContainer", TEXT)

	return t
