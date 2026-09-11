#!/usr/bin/env bash
# Roam Depot invokes this before collecting extension.js / extension.css.
set -euo pipefail

npm ci --no-audit --no-fund
node tools/build.mjs
