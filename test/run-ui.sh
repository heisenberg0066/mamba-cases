#!/usr/bin/env bash
# Linux: renderer UI test with real DOM interaction; screenshots into docs/ (or $SHOTS)
set -e
cd "$(dirname "$0")/.."
export MAMBA_CASES_DATA=${MAMBA_CASES_DATA:-/tmp/mc-uitest}; rm -rf "$MAMBA_CASES_DATA"
export MAMBA_CASES_EXPORT_DIR="$PWD/tmp-export"; rm -rf "$MAMBA_CASES_EXPORT_DIR"; mkdir -p "$MAMBA_CASES_EXPORT_DIR"
export LANG=en_GB.UTF-8 LANGUAGE=en_GB
export MAMBA_CASES_UITEST=test/ui.js MAMBA_CASES_SHOTS=${SHOTS:-docs} MAMBA_CASES_FAKE_TODAY=2026-10-19
xvfb-run -a -s "-screen 0 1600x1000x24" node_modules/.bin/electron --no-sandbox . 2>&1 | grep -E "^(PASS|FAIL)|UI:|UI TEST ERROR|Error" || true
ls "$MAMBA_CASES_EXPORT_DIR"
