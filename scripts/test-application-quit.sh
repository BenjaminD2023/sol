#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
result_dir="$(mktemp -d)"
trap 'rm -rf "$result_dir"' EXIT
xcrun swiftc macos/sol-macOS/lib/RunningApplicationActions.swift \
  tests/application-quit/main.swift -o "$result_dir/application-quit"
"$result_dir/application-quit"
