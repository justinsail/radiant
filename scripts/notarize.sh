#!/usr/bin/env bash
# Notarize + staple the built DMG and app using a notarytool keychain profile.
# Prereq (one-time, run by the developer — never commit the password):
#   xcrun notarytool store-credentials radiant --apple-id <you@example.com> --team-id 5VY66S6G3M
# Then: scripts/notarize.sh
set -euo pipefail

PROFILE="${NOTARY_PROFILE:-radiant}"
DMG=$(ls release/Radiant-*-arm64.dmg | head -1)
APP="release/mac-arm64/Radiant.app"

echo "▸ Submitting $DMG to Apple notary service (this can take a few minutes)…"
xcrun notarytool submit "$DMG" --keychain-profile "$PROFILE" --wait

echo "▸ Stapling the notarization ticket to the app and DMG…"
xcrun stapler staple "$APP"
xcrun stapler staple "$DMG"

echo "▸ Refreshing the zip from the stapled app…"
ZIP=$(ls release/Radiant-*-arm64-mac.zip | head -1)
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"

echo "▸ Gatekeeper check:"
spctl -a -vv "$APP"
echo "✓ Notarized and stapled."
