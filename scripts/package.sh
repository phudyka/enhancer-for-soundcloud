#!/usr/bin/env bash
# Empaquette l'extension pour les boutiques : dist/enhancer-for-soundcloud-<version>.zip
# Seuls les fichiers chargés par le navigateur sont inclus (pas de tests, docs ni scripts).
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(node -p "require('./manifest.json').version")
out="dist/enhancer-for-soundcloud-${version}.zip"
mkdir -p dist
rm -f "$out"
zip -qr "$out" manifest.json background content popup options stats guide downloads ui icons rules _locales -x '*.DS_Store'
echo "$out ($(du -h "$out" | cut -f1))"
