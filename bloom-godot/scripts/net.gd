extends Node
## BloomNet — signed HTTP client for the BLOOM backend (autoloaded as "Net").
## Mirrors the web client: HMAC-SHA256 over (nonce.ts.body) + one-time nonce +
## timestamp + Bearer JWT. The server is authoritative for everything.

const BASE := "https://bloom-app-xi.vercel.app"
# Baked per release; rotate alongside the server's HMAC_SECRET.
const HMAC_SECRET := "33e53d6654a492a03ac18b2803d16d0772566a5e838ed2aefce0697a9fcca175"
const APP_VERSION := "godot-0.1.0"

var token := ""
var player_id := ""
var device_id := ""

func _ready() -> void:
	device_id = _load_device_id()

func _load_device_id() -> String:
	var path := "user://device_id.txt"
	if FileAccess.file_exists(path):
		return FileAccess.open(path, FileAccess.READ).get_as_text().strip_edges()
	var id := "godot-" + Crypto.new().generate_random_bytes(8).hex_encode()
	var f := FileAccess.open(path, FileAccess.WRITE)
	f.store_string(id)
	f.close()
	return id

func _platform() -> String:
	if OS.has_feature("ios"): return "ios"
	if OS.has_feature("android"): return "android"
	return "web"

func _hmac_hex(msg: String) -> String:
	var ctx := HMACContext.new()
	ctx.start(HashingContext.HASH_SHA256, HMAC_SECRET.to_utf8_buffer())
	ctx.update(msg.to_utf8_buffer())
	return ctx.finish().hex_encode()

func _nonce() -> String:
	return Crypto.new().generate_random_bytes(16).hex_encode()

## Core signed POST. Retries a 401 once after re-registering.
func signed_post(path: String, body: Dictionary, authed: bool = true, _retried: bool = false) -> Dictionary:
	if authed and token == "":
		await register()
	var raw := JSON.stringify(body)
	var nonce := _nonce()
	var ts := str(int(Time.get_unix_time_from_system() * 1000.0))
	var sig := _hmac_hex(nonce + "." + ts + "." + raw)
	var headers := [
		"content-type: application/json",
		"x-bloom-nonce: " + nonce,
		"x-bloom-ts: " + ts,
		"x-bloom-signature: " + sig,
		"x-bloom-app: " + APP_VERSION,
	]
	if authed and token != "":
		headers.append("authorization: Bearer " + token)

	var req := HTTPRequest.new()
	add_child(req)
	var err := req.request(BASE + path, headers, HTTPClient.METHOD_POST, raw)
	if err != OK:
		req.queue_free()
		return {"_error": "request_failed"}
	var result: Array = await req.request_completed
	req.queue_free()
	# result = [result, response_code, headers, body]
	var code: int = result[1]
	var text: String = (result[3] as PackedByteArray).get_string_from_utf8()
	var data: Variant = JSON.parse_string(text)

	if code == 401 and authed and not _retried:
		await register()
		return await signed_post(path, body, authed, true)
	if typeof(data) == TYPE_DICTIONARY:
		return data
	if typeof(data) == TYPE_ARRAY:
		return {"_list": data}
	return {"_error": "bad_response", "code": code}

func get_json(path: String) -> Dictionary:
	var req := HTTPRequest.new()
	add_child(req)
	var err := req.request(BASE + path)
	if err != OK:
		req.queue_free()
		return {"_error": "request_failed"}
	var result: Array = await req.request_completed
	req.queue_free()
	var data: Variant = JSON.parse_string((result[3] as PackedByteArray).get_string_from_utf8())
	return data if typeof(data) == TYPE_DICTIONARY else {}

func register() -> void:
	var r := await signed_post("/api/auth/device", {
		"deviceId": device_id, "platform": _platform(), "appVersion": APP_VERSION,
	}, false)
	if r.has("token"):
		token = r["token"]
		player_id = r.get("playerId", "")

func ensure_auth() -> void:
	if token == "":
		await register()

# ── typed convenience calls ──
func get_config() -> Dictionary: return await get_json("/api/config")
func session() -> Dictionary: return await signed_post("/api/session", {})
func sync_world() -> Dictionary: return await signed_post("/api/sync", {})
func spin() -> Dictionary: return await signed_post("/api/spin", {})
func build() -> Dictionary: return await signed_post("/api/build", {})
func help_bot(bot_id: int) -> Dictionary: return await signed_post("/api/help", {"botId": bot_id})
func help_live() -> Dictionary: return await signed_post("/api/help/live", {})
func help_player(target_id: String) -> Dictionary: return await signed_post("/api/help/player", {"targetPlayerId": target_id})
func quests() -> Dictionary: return await signed_post("/api/quests", {})
func quests_claim() -> Dictionary: return await signed_post("/api/quests/claim", {})
func pass_status() -> Dictionary: return await signed_post("/api/pass", {})
func pass_claim() -> Dictionary: return await signed_post("/api/pass/claim", {})
func cards() -> Dictionary: return await signed_post("/api/cards", {})
func team_mine() -> Dictionary: return await signed_post("/api/team", {})
func team_create(team_name: String) -> Dictionary: return await signed_post("/api/team/create", {"name": team_name})
func team_list() -> Dictionary: return await signed_post("/api/team/list", {})
func team_contribute(amount: int) -> Dictionary: return await signed_post("/api/team/contribute", {"amount": amount})
func purchase(product_id: String) -> Dictionary:
	return await signed_post("/api/purchase/verify", {
		"platform": "android", "productId": product_id,
		"receipt": "sandbox-ok:" + product_id,
		"transactionId": "godot-" + _nonce(),
	})
func event(type: String, data: Dictionary = {}) -> void:
	signed_post("/api/event", {"type": type, "data": data})
