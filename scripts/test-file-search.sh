#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
result_dir="$(mktemp -d)"
trap 'rm -rf "$result_dir"' EXIT
xcrun swiftc macos/sol-macOS/lib/FileSearchIndex.swift \
  macos/sol-macOS/lib/SpotlightFileSearch.swift tests/file-search/main.swift \
  -o "$result_dir/file-search"
"$result_dir/file-search"
