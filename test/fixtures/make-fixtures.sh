#!/usr/bin/env bash
# Regenerates the tiny IPA/APK fixtures used by the CLI tests. Needs macOS (plutil) and the
# Android SDK (aapt2 + a platform android.jar).
set -euo pipefail
cd "$(dirname "$0")"
SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
AAPT2="$(ls -d "$SDK"/build-tools/*/aapt2 | sort -V | tail -1)"
ANDROID_JAR="$(ls -d "$SDK"/platforms/android-*/android.jar | sort -V | tail -1)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# APK: label and versionName both come from string resources, with a French override.
mkdir -p "$WORK/apk/res/values" "$WORK/apk/res/values-fr"
cat > "$WORK/apk/AndroidManifest.xml" <<'XML'
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.dropper" android:versionCode="42" android:versionName="@string/version">
  <application android:label="@string/app_name" />
</manifest>
XML
cat > "$WORK/apk/res/values/strings.xml" <<'XML'
<resources><string name="app_name">Dropper Test</string><string name="version">1.2.3</string></resources>
XML
cat > "$WORK/apk/res/values-fr/strings.xml" <<'XML'
<resources><string name="app_name">Dropper Essai</string></resources>
XML
"$AAPT2" compile --dir "$WORK/apk/res" -o "$WORK/res.zip"
"$AAPT2" link -o app.apk -I "$ANDROID_JAR" --manifest "$WORK/apk/AndroidManifest.xml" "$WORK/res.zip"

# IPA: binary Info.plist plus an ad-hoc provisioning profile wrapped in junk bytes like CMS.
APP="$WORK/ipa/Payload/Dropper.app"
mkdir -p "$APP"
cat > "$APP/Info.plist" <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key><string>Dropper ✈︎</string>
  <key>CFBundleIdentifier</key><string>com.example.dropper</string>
  <key>CFBundleShortVersionString</key><string>1.2.3</string>
  <key>CFBundleVersion</key><string>42</string>
  <key>UIDeviceFamily</key><array><integer>1</integer><integer>2</integer></array>
  <key>LSRequiresIPhoneOS</key><true/>
</dict>
</plist>
XML
plutil -convert binary1 "$APP/Info.plist"
{
  printf '\x30\x82\x0b\x00junk'
  cat <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>Entitlements</key><dict><key>get-task-allow</key><false/></dict>
  <key>ExpirationDate</key><date>2027-01-02T03:04:05Z</date>
  <key>ProvisionedDevices</key><array><string>00008110-000000000000001E</string></array>
</dict>
</plist>
XML
  printf '\x00\x01trailing'
} > "$APP/embedded.mobileprovision"
rm -f app.ipa
(cd "$WORK/ipa" && zip -qrX "$OLDPWD/app.ipa" Payload)
ls -la app.apk app.ipa
