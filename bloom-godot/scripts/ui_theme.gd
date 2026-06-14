class_name UiTheme
extends RefCounted
## Single source of UI styling for BLOOM — a pastel POP-ART look: cream "comic
## page" panels, thick ink outlines, chunky rounded buttons, sunny/mint/coral/
## bubblegum pastels, and a bold outlined title. Build once, apply to a root; all
## controls inherit. Variants use Theme type-variations (Primary/Ghost/Chip).

const FONT := preload("res://fonts/lilita_one_regular.ttf")

# ── pop-art palette ──
const INK := Color("2c2150")        # deep grape — every outline + dark text
const PAPER := Color("fff3e9")       # warm cream comic page (panels)
const PAPER_2 := Color("f1e9ff")     # pale lavender (inner cards)
const PAPER_DIS := Color("e6e0f0")   # disabled fill

# pastel accents (kept under their legacy names so callers keep working)
const GOLD := Color("ffce4f")        # sunny yellow — primary CTA / accents
const GOLD_EDGE := Color("ffe49a")
const GREEN := Color("84e3ad")       # mint
const GREEN_EDGE := Color("b6f1d0")
const PINK := Color("ff9cc9")        # bubblegum
const SKY := Color("8fd2ff")         # sky blue
const LAV := Color("c6a9ff")         # lavender
const FIRE := Color("ff8a5c")        # coral (momentum fill)
const FIRE_DIM := Color("ffd9c6")    # light coral track
const RED := Color("ff7d8c")         # coral-red (cancel / error accent)

const TEXT := INK                    # dark text on the light surfaces
const DIM := Color("6a5d92")         # muted grape — darkened for AA contrast on cream
const BG := PAPER                    # legacy alias

# ── stylebox factory ──
static func _flat(bg: Color, radius := 14, border := 0, border_col := INK, pad := 10, shadow := false) -> StyleBoxFlat:
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
	if shadow:
		s.shadow_color = Color(INK.r, INK.g, INK.b, 0.22)
		s.shadow_size = 5
		s.shadow_offset = Vector2(2, 4)
	return s

# chunky pop-art button: pastel fill, thick ink outline, dark ink label
static func _button_set(t: Theme, type: String, fill: Color, radius := 16, border := 3, shadow := false) -> void:
	if type != "Button":
		t.set_type_variation(type, "Button")
	t.set_stylebox("normal", type, _flat(fill, radius, border, INK, 14, shadow))
	t.set_stylebox("hover", type, _flat(fill.lightened(0.10), radius, border, INK, 14, shadow))
	t.set_stylebox("pressed", type, _flat(fill.darkened(0.10), radius, border, INK, 14, false))
	t.set_stylebox("disabled", type, _flat(PAPER_DIS, radius, border, Color(INK.r, INK.g, INK.b, 0.35), 14))
	t.set_color("font_color", type, INK)
	t.set_color("font_hover_color", type, INK)
	t.set_color("font_pressed_color", type, INK)
	t.set_color("font_focus_color", type, INK)
	t.set_color("font_disabled_color", type, DIM)

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
	t.set_color("font_color", "Label", INK)

	# Buttons — each a different pastel so the UI reads candy-coloured
	_button_set(t, "Button", GREEN, 16, 3)               # default = mint action
	_button_set(t, "Primary", GOLD, 18, 3, true)         # sunny call-to-action (with shadow)
	_button_set(t, "Ghost", PAPER_2, 14, 3)              # lavender secondary
	_button_set(t, "Chip", SKY, 12, 2)                   # small sky-blue pill

	# Panels (cards) — cream comic page with a thick ink outline + soft shadow
	t.set_stylebox("panel", "PanelContainer", _flat(PAPER, 20, 3, INK, 14, true))
	t.set_type_variation("Card2", "PanelContainer")
	t.set_stylebox("panel", "Card2", _flat(PAPER_2, 16, 3, INK, 12))
	t.set_stylebox("panel", "Panel", _flat(PAPER, 20, 3, INK, 0, true))

	# Labels
	t.set_type_variation("Title", "Label")               # big outlined pop title
	t.set_color("font_color", "Title", GOLD)
	t.set_color("font_outline_color", "Title", INK)
	t.set_constant("outline_size", "Title", 8)
	t.set_font_size("font_size", "Title", 32)
	t.set_type_variation("Dim", "Label")
	t.set_color("font_color", "Dim", DIM)
	t.set_font_size("font_size", "Dim", 13)
	t.set_type_variation("Stat", "Label")                # chunky numbers — ink outline so
	t.set_color("font_color", "Stat", INK)               # accent-coloured stats (gold price,
	t.set_color("font_outline_color", "Stat", INK)       # coral momentum) stay readable on cream
	t.set_constant("outline_size", "Stat", 4)
	t.set_font_size("font_size", "Stat", 20)

	# ProgressBar (momentum) — coral fill on a light track, ink-outlined
	var pb_bg := _flat(FIRE_DIM, 9, 2, INK, 0)
	pb_bg.content_margin_left = 0; pb_bg.content_margin_right = 0
	pb_bg.content_margin_top = 0; pb_bg.content_margin_bottom = 0
	var pb_fill := _flat(FIRE, 9, 0)
	pb_fill.content_margin_left = 0; pb_fill.content_margin_right = 0
	t.set_stylebox("background", "ProgressBar", pb_bg)
	t.set_stylebox("fill", "ProgressBar", pb_fill)
	t.set_color("font_color", "ProgressBar", Color(0, 0, 0, 0))  # hide built-in % text

	# TabBar / TabContainer (menu) — selected = sunny, others = lavender
	for klass in ["TabBar", "TabContainer"]:
		t.set_stylebox("tab_selected", klass, _flat(GOLD, 12, 3, INK, 12))
		t.set_stylebox("tab_unselected", klass, _flat(PAPER_2, 12, 3, INK, 12))
		t.set_stylebox("tab_hovered", klass, _flat(PINK, 12, 3, INK, 12))
		t.set_color("font_selected_color", klass, INK)
		t.set_color("font_unselected_color", klass, DIM)
		t.set_color("font_hovered_color", klass, INK)
	t.set_stylebox("panel", "TabContainer", _flat(PAPER, 20, 3, INK, 8, true))

	# HSlider (volume) — crisp white groove so the mint fill pops, ink outline
	var groove := _flat(Color("ffffff"), 8, 2, INK, 0)
	for m in ["content_margin_left", "content_margin_right", "content_margin_top", "content_margin_bottom"]:
		groove.set(m, 0)
	t.set_stylebox("slider", "HSlider", groove)
	t.set_stylebox("grabber_area", "HSlider", _flat(GREEN, 8, 2, INK, 0))
	t.set_stylebox("grabber_area_highlight", "HSlider", _flat(GREEN_EDGE, 8, 2, INK, 0))

	# CheckBox (settings) — CheckBox derives from Button, so clear the inherited
	# pastel button fill; keep just the check icon + ink label on the card.
	for cstate in ["normal", "hover", "pressed", "disabled", "focus"]:
		var empty := StyleBoxEmpty.new()
		empty.content_margin_left = 2; empty.content_margin_right = 6
		empty.content_margin_top = 4; empty.content_margin_bottom = 4
		t.set_stylebox(cstate, "CheckBox", empty)
	for cstate in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		t.set_color(cstate, "CheckBox", INK)

	# LineEdit (login) — cream field, ink outline, coral caret
	t.set_stylebox("normal", "LineEdit", _flat(PAPER, 12, 3, INK, 12))
	t.set_stylebox("focus", "LineEdit", _flat(PAPER, 12, 3, GOLD, 12))
	t.set_color("font_color", "LineEdit", INK)
	t.set_color("font_placeholder_color", "LineEdit", DIM)
	t.set_color("caret_color", "LineEdit", FIRE)

	return t
