#!/bin/sh
# Builds the zip to upload to the Chrome Web Store: dist/margin-<version>.zip
# Only files the extension uses at runtime; no website, tests, tools or store artwork.
set -e
cd "$(dirname "$0")/.."
version=$(python3 -c 'import json; print(json.load(open("manifest.json"))["version"])')
out="dist/margin-$version.zip"
mkdir -p dist
rm -f "$out"
zip -qr -X "$out" manifest.json LICENSE icons fonts src data vendor -x '*.DS_Store'
echo "$out ($(du -h "$out" | cut -f1))"
