#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Users/benjamin/Downloads/Xcode.app/Contents/Developer}"
mode="${1:-publish}"
[[ "$#" -le 1 && ( "$mode" == publish || "$mode" == --prepare ) ]] || { echo 'Usage: publish-update.sh [--prepare]'; exit 2; }
repo='BenjaminD2023/sol'
origin_url='https://github.com/BenjaminD2023/sol.git'
feed_url='https://github.com/BenjaminD2023/sol/releases/latest/download/benjamin-appcast.xml'
[[ "$(git remote get-url --all origin)" == "$origin_url" && "$(git remote get-url --push --all origin)" == "$origin_url" ]] || { echo 'Origin fetch and push URLs must both be BenjaminD2023/sol'; exit 1; }
[[ "$(git branch --show-current)" == 'local/benjamin-sol' ]] || { echo 'Publish from local/benjamin-sol'; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo 'Commit the reviewed local changes first.'; exit 1; }
revision="$(git rev-parse HEAD)"
app='/Applications/Sol.app'
info="$app/Contents/Info.plist"
codesign --verify --deep --strict "$app"
build="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$info")"
expected="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' macos/sol-macOS/Info.plist)"
[[ "$build" =~ ^[1-9][0-9]*$ && "$build" == "$expected" ]] || { echo 'Installed app build must match the increasing numeric source build'; exit 1; }
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$info")" == 'com.benjamind2023.sol' ]]
[[ "$(/usr/libexec/PlistBuddy -c 'Print :SUFeedURL' "$info")" == "$feed_url" ]]
[[ "$(/usr/libexec/PlistBuddy -c 'Print :SUPublicEDKey' "$info")" == "$(/usr/libexec/PlistBuddy -c 'Print :SUPublicEDKey' macos/sol-macOS/Info.plist)" ]] || { echo 'Installed and source update public keys differ'; exit 1; }
tag="benjamin-$build"
# Read failures abort; they must never be mistaken for a missing remote tag.
remote_tag="$(git ls-remote --tags origin "refs/tags/$tag")"
[[ -z "$remote_tag" ]] || { echo "Tag $tag already exists; increase the build number."; exit 1; }
staging_root="$HOME/Library/Caches/Sol-update-staging"
mkdir -p "$staging_root"
release_dir="$(mktemp -d "$staging_root/$build.XXXXXX")"
chmod 700 "$release_dir"
archive="$release_dir/Sol-$build.zip"
feed="$release_dir/benjamin-appcast.xml"
download_url="https://github.com/$repo/releases/download/$tag/Sol-$build.zip"
# The list includes drafts, preventing accidental reuse of an unfinished release.
gh release list --repo "$repo" --limit 100 --json tagName,isDraft,isPrerelease > "$release_dir/existing-releases.json"
python3 - "$release_dir/existing-releases.json" "$build" "$tag" <<'PY'
import json,re,sys
releases=json.load(open(sys.argv[1])); build=int(sys.argv[2]); tag=sys.argv[3]
for release in releases:
    if release['tagName']==tag:
        raise SystemExit('This release already exists; increase the build number.')
    match=re.fullmatch(r'benjamin-([0-9]+)',release['tagName'])
    if match and int(match[1])>=build:
        raise SystemExit('Build number must exceed every existing Benjamin release.')
PY
# Check the public feed if a published release exists. A missing first feed is
# expected only for an empty/prerelease-only repository.
if python3 - "$release_dir/existing-releases.json" <<'PY'
import json,sys
raise SystemExit(0 if any(not r['isDraft'] and not r['isPrerelease'] for r in json.load(open(sys.argv[1]))) else 1)
PY
then
  curl --fail --location --proto '=https' --max-time 30 "$feed_url" -o "$release_dir/previous-appcast.xml"
  python3 - "$release_dir/previous-appcast.xml" "$build" <<'PY'
import sys,xml.etree.ElementTree as ET
root=ET.parse(sys.argv[1]).getroot(); ns='{http://www.andymatuschak.org/xml-namespaces/sparkle}'
versions=[e.text for e in root.iter(ns+'version')]
versions += [e.get(ns+'version') for e in root.iter('enclosure') if e.get(ns+'version')]
if not versions or any(not v or not v.strip().isdigit() for v in versions):
    raise SystemExit('Existing public feed does not contain valid numeric builds.')
if max(int(v) for v in versions)>=int(sys.argv[2]):
    raise SystemExit('Build number must exceed the existing public feed.')
PY
fi
# Only new archive files enter this directory; old feeds cannot retain stale
# signatures when a previously prepared build is regenerated.
archives_dir="$release_dir/archives"
mkdir "$archives_dir"
ditto -c -k --sequesterRsrc --keepParent "$app" "$archive"
cp "$archive" "$archives_dir/$(basename "$archive")"
macos/Pods/Sparkle/bin/generate_appcast --account benjamin-sol --maximum-deltas 0 \
  --download-url-prefix "https://github.com/$repo/releases/download/$tag/" \
  -o "$feed" "$archives_dir"
# Signature verification uses only SUPublicEDKey, never exports a private key.
swift scripts/local/verify-update.swift "$archive" "$feed" "$info" "$build" "$download_url"
expected_sha="$(shasum -a 256 "$archive" | awk '{print $1}')"
unzip -tqq "$archive"
mkdir "$release_dir/extracted"
ditto -x -k "$archive" "$release_dir/extracted"
codesign --verify --deep --strict "$release_dir/extracted/Sol.app"
swift scripts/local/verify-update.swift "$archive" "$feed" "$release_dir/extracted/Sol.app/Contents/Info.plist" "$build" "$download_url"
printf 'Signed local build %s. Source: %s\n' "$build" "$revision" > "$release_dir/notes.txt"
if [[ "$mode" == --prepare ]]; then
  printf 'Prepared and verified only. No source or release published.\nArchive: %s\nFeed: %s\n' "$archive" "$feed"
  exit 0
fi
# A long signing prompt must not allow a newer checkout to be published by mistake.
[[ "$(git rev-parse HEAD)" == "$revision" && -z "$(git status --porcelain)" ]] || { echo 'Source changed while preparing the update; review and run again.'; exit 1; }
remote_tag="$(git ls-remote --tags origin "refs/tags/$tag")"
[[ -z "$remote_tag" ]] || { echo "Tag $tag appeared while preparing; stop and inspect it."; exit 1; }
git push origin "$revision:refs/heads/benjamin/local"
gh release create "$tag" "$archive" "$feed" --repo "$repo" --target "$revision" \
  --title "Sol build $build" --notes-file "$release_dir/notes.txt" --latest
# Verify the same anonymous URLs the installed updater uses, including redirects.
public_feed="$release_dir/public-appcast.xml"
public_archive="$release_dir/public-Sol-$build.zip"
verified=false
for attempt in {1..5}; do
  if curl --silent --show-error --fail --location --proto '=https' --max-time 30 "$feed_url" -o "$public_feed" \
    && curl --silent --show-error --fail --location --proto '=https' --max-time 60 "$download_url" -o "$public_archive" \
    && [[ "$(shasum -a 256 "$public_archive" | awk '{print $1}')" == "$expected_sha" ]] \
    && swift scripts/local/verify-update.swift "$public_archive" "$public_feed" "$info" "$build" "$download_url"; then
    verified=true
    break
  fi
  sleep 2
done
[[ "$verified" == true ]] || { echo "Release was published, but public verification failed. Inspect $release_dir before taking further action."; exit 1; }
printf 'Published and publicly verified %s at source %s\n' "$tag" "$revision"
