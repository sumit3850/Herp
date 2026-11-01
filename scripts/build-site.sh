#!/usr/bin/env bash
# Assemble the deployable static site into ./_site :
#   /            website (index.html), field app (app.html), legacy admin, shared JS
#   /dashboard/  React admin dashboard (built from ./dashboard)
set -euo pipefail
cd "$(dirname "$0")/.."
(cd dashboard && npm ci --no-audit --no-fund && npm run build)
rm -rf _site && mkdir -p _site
cp -r index.html app.html admin.html admin-classic.html style.css common.js config.js sw.js manifest.json assets data _site/
cp -r dashboard/dist _site/dashboard
echo "Site assembled in _site/ ($(du -sh _site | cut -f1))"
