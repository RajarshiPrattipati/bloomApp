# BLOOM — Mobile (Android / iOS)

The Godot client is configured to ship to phones. This covers the setup and export.

## What's already configured
- **Renderer**: `rendering_method.mobile="mobile"` (Vulkan Mobile on device; Forward+ on desktop).
- **Orientation**: portrait-locked (`window/handheld/orientation=1`).
- **Display**: 540×960 design res, `stretch/mode="canvas_items"` + `aspect="keep"` → scales to any
  phone aspect with no layout breakage (the HUD is anchor/container-based).
- **Textures**: ETC2/ASTC VRAM compression enabled for mobile GPUs.
- **Touch input**: one-finger **drag = pan**, two-finger **pinch = zoom** + **twist = rotate**, tap =
  place/upgrade. `pointing/emulate_touch_from_mouse` lets the same code run on desktop.
- **Export presets**: `export_presets.cfg` (Android + iOS), bundle id `com.bloom.village`,
  Android `INTERNET` permission enabled, portrait-only, a bundled debug keystore.

## ⚠️ Server URL (important)
`scripts/net.gd` has `BASE = "http://localhost:4000"`. On a **phone, `localhost` is the phone**, not
your dev machine — so change `BASE` before exporting to one of:
- your machine's LAN IP while testing, e.g. `http://192.168.1.106:4000` (run the server with
  `PORT=4000 npm -w @bloom/server run start` and ensure the phone is on the same Wi-Fi), or
- a deployed server URL (HTTPS for store builds).

## Prerequisites (this machine already has the SDKs)
- **Godot 4.6** export templates — install once (≈1.25 GB):
  `Godot ▸ Editor ▸ Manage Export Templates ▸ Download and Install`, or drop the
  `Godot_v4.6-stable_export_templates.tpz` into
  `~/Library/Application Support/Godot/export_templates/4.6.stable/`.
- **Android**: Android SDK (`$ANDROID_HOME` set ✓) + JDK 17 (✓). In Godot ▸ Editor Settings ▸
  Export ▸ Android, three fields must be set (stored in `editor_settings-4.6.tres`):
  - **Android SDK path** → `~/Library/Android/sdk`
  - **Java SDK path** → your JDK 17 home (e.g. `/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home`)
  - **Debug keystore** → `debug.keystore` (user `androiddebugkey`, pass `android`) — also referenced
    by the preset. Godot's Editor Settings expect a global keystore at
    `~/Library/Application Support/Godot/keystores/debug.keystore`; copy the project one there.
- **iOS**: Xcode (✓). Two preset fields are required before the Xcode project will export:
  - **Apple Team ID** (`application/app_store_team_id`) — your 10-char Developer Team ID; only you
    have this, so set it in the iOS preset (Godot ▸ Project ▸ Export ▸ iOS).
  - **min iOS version 14.0+** (already set) — Godot 4.6's Metal renderer requires iOS 14+.
  Export then produces an Xcode project you open + run/sign on a device.

## Export — Android (APK)
```bash
GODOT=/Applications/Godot.app/Contents/MacOS/Godot
mkdir -p build
$GODOT --headless --path . --export-debug "Android" build/bloom.apk
# install on a connected device:
adb install -r build/bloom.apk
```

## Export — iOS (Xcode project)
```bash
$GODOT --headless --path . --export-debug "iOS" build/ios/BLOOM.xcodeproj
open build/ios/BLOOM.xcodeproj   # set signing team, pick a device, Run
```

## Notes
- `gradle_build/use_gradle_build=false` uses the prebuilt template APK (simplest; no Android Studio).
  For plugins / custom Android, enable the Gradle build + install the Android build template.
- The procedural audio (SFX + music) and 3D run fine on the Mobile renderer; consider lowering
  `msaa_3d` to 0 on low-end devices for perf.
- Build outputs and `debug.keystore` are git-ignored.
