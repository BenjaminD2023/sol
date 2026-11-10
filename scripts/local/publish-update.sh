#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ "$(git remote get-url origin)" == 'https://github.com/BenjaminD2023/sol.git' ]] || { echo 'Origin must be BenjaminD2023/sol'; exit 1; }
[[ "$(git branch --show-current)" == 'local/benjamin-sol' ]] || { echo 'Publish from local/benjamin-sol'; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo 'Commit the reviewed local changes first.'; exit 1; }
app='/Applications/Sol.app'
codesign --verify --deep --strict "$app"
build="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$app/Contents/Info.plist")"
expected="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' macos/sol-macOS/Info.plist)"
[[ "$build" == "$expected" ]] || { echo 'Installed app version does not match source'; exit 1; }
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Contents/Info.plist")" == 'com.benjamind2023.sol' ]]
release_dir="$HOME/Library/Caches/Sol-update-staging/$build"
mkdir -p "$release_dir"
archive="$release_dir/Sol-$build.zip"
ditto -c -k --sequesterRsrc --keepParent "$app" "$archive"
macos/Pods/Sparkle/bin/generate_appcast --account benjamin-sol --maximum-deltas 0 \
  --download-url-prefix "https://github.com/BenjaminD2023/sol/releases/download/benjamin-$build/" \
  -o "$release_dir/benjamin-appcast.xml" "$release_dir"
git push origin HEAD:refs/heads/benjamin/local
printf 'Signed local build %s. Source: %s\n' "$build" "$(git rev-parse HEAD)" > "$release_dir/notes.txt"
gh release create "benjamin-$build" "$archive" "$release_dir/benjamin-appcast.xml" \
  --repo BenjaminD2023/sol --target benjamin/local --title "Sol build $build" --notes-file "$release_dir/notes.txt" --latest
