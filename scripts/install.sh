#!/usr/bin/env bash
# First-run sidecar install (macOS / Linux). Builds an app-local venv and installs
# the Python stack. Streams `[install] …` progress lines on stdout; the Electron
# main process pipes these into the first-run modal. Idempotent-ish: re-running
# reuses the venv. Exits non-zero on failure so the UI can surface it.
#
#   install.sh <venv_dir> <pip_spec>
#
# Heavy: pulls torch etc. CPU-only torch is forced from the PyTorch CPU index so
# we never drag CUDA onto a marker's laptop. (On macOS the PyPI wheel is already
# CPU/MPS; the extra index is harmless.)
set -euo pipefail

VENV_DIR="${1:?usage: install.sh <venv_dir> <pip_spec>}"
PIP_SPEC="${2:?usage: install.sh <venv_dir> <pip_spec>}"

say() { echo "[install] $*"; }

PY="$(command -v python3 || true)"
if [ -z "$PY" ]; then
  echo "[install] ERROR: python3 not found on PATH. Install Python 3.11+ and retry." >&2
  exit 1
fi
say "using $("$PY" --version 2>&1)"

if [ ! -x "$VENV_DIR/bin/python" ]; then
  say "creating virtual environment at $VENV_DIR"
  "$PY" -m venv "$VENV_DIR"
fi
VPY="$VENV_DIR/bin/python"

say "upgrading pip"
"$VPY" -m pip install --upgrade pip --disable-pip-version-check -q

say "installing CPU-only torch (no CUDA)"
"$VPY" -m pip install --disable-pip-version-check \
  --index-url https://download.pytorch.org/whl/cpu torch || \
  say "torch CPU index step skipped (will resolve transitively)"

say "installing $PIP_SPEC — this can take several minutes on first run"
"$VPY" -m pip install --disable-pip-version-check "$PIP_SPEC"

say "OK — sidecar environment ready"
