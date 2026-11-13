#!/usr/bin/env bash
# Builds dist/margin-<version>.zip: exactly the files Chrome needs, ready for the Web Store or "Load unpacked".
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(python3 -c 'import json; print(json.load(open("manifest.json"))["version"])')
mkdir -p dist
out="dist/margin-${version}.zip"
rm -f "$out"
zip -qr "$out" manifest.json src data icons fonts vendor -x '*.DS_Store' 'data/SOURCES.md'
echo "$out ($(du -h "$out" | cut -f1))"
