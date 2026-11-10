#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Users/benjamin/Downloads/Xcode.app/Contents/Developer}"
export NODE_BINARY="${NODE_BINARY:-/opt/homebrew/bin/node}"
export RCT_NO_LAUNCH_PACKAGER=1
build_dir="${SOL_BUILD_DIR:-$HOME/Library/Caches/Sol-local-build}"
sign_identity="${SOL_SIGN_IDENTITY:-BF77E847780CFB6F5B2C9585E4E590F2C71FB341}"
backup_dir="$HOME/Backups/Sol-$(date +%Y%m%d-%H%M%S)"
if [[ "${1:-}" == "--bump" ]]; then
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $(($(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' macos/sol-macOS/Info.plist) + 1))" macos/sol-macOS/Info.plist
fi
# Recreate this build product so macOS does not protect resources in a previously launched bundle.
previous_app="$build_dir/Build/Products/Release/Sol-previous-build.app"
if [[ -d "$build_dir/Build/Products/Release/Sol.app" ]]; then
  if [[ -d "$previous_app" ]]; then rm -rf "$previous_app"; fi
  mv "$build_dir/Build/Products/Release/Sol.app" "$previous_app"
fi
bun run typecheck
bun test
xcodebuild -workspace macos/sol.xcworkspace -scheme release -configuration Release \
  -destination 'platform=macOS,arch=arm64' -derivedDataPath "$build_dir" \
  CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES ARCHS=arm64 build
app="$build_dir/Build/Products/Release/Sol.app"
# Sign nested code from the inside out with the same identity on every update.
while IFS= read -r nested; do
  codesign --force --sign "$sign_identity" --options runtime --timestamp=none "$nested"
done < <(find "$app/Contents" -type d \( -name '*.framework' -o -name '*.xpc' -o -name '*.app' \) -print | awk '{ print length, $0 }' | sort -rn | cut -d' ' -f2-)
codesign --force --sign "$sign_identity" --options runtime --timestamp=none --entitlements macos/sol-macOS/sol-macOS.entitlements "$app"
codesign --verify --deep --strict "$app"
mkdir -p "$backup_dir"
[[ ! -d /Applications/Sol.app ]] || ditto /Applications/Sol.app "$backup_dir/Sol.app"
[[ ! -d "$HOME/.config/sol" ]] || ditto "$HOME/.config/sol" "$backup_dir/config"
# Gracefully stop only this fork's current installed instance before replacement.
/usr/bin/pkill -TERM -f '^/Applications/Sol.app/Contents/MacOS/Sol$' 2>/dev/null || true
for attempt in {1..20}; do
  /usr/bin/pgrep -f '^/Applications/Sol.app/Contents/MacOS/Sol$' >/dev/null || break
  sleep 0.1
done
if [[ -d /Applications/Sol.app ]]; then mv /Applications/Sol.app "$backup_dir/replaced-Sol.app"; fi
ditto "$app" /Applications/Sol.app
codesign --verify --deep --strict /Applications/Sol.app
open /Applications/Sol.app
printf 'Installed %s; backup: %s\n' /Applications/Sol.app "$backup_dir"
