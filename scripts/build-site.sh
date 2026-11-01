#!/usr/bin/env bash
# Assemble the deployable static site into ./_site :
#   /            website (index.html), field app (app.html + app.js), admin redirect, shared JS
#   /dashboard/  React admin dashboard (source ./dashboard-app, built into ./dashboard)
set -euo pipefail
cd "$(dirname "$0")/.."
(cd dashboard-app && npm ci --no-audit --no-fund && npm run build)   # → ./dashboard
rm -rf _site && mkdir -p _site
cp -r index.html app.html app.js feedback.html roadkill.html roadkill-manifest.json admin.html style.css common.js config.js install.js sw.js manifest.json assets data _site/
cp -r dashboard _site/dashboard
echo "Site assembled in _site/ ($(du -sh _site | cut -f1))"
