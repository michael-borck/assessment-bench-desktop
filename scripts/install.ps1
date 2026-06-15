# First-run sidecar install (Windows). The PowerShell equivalent of install.sh —
# the piece talk-buddy's bash-only setup lacked. Builds an app-local venv and
# installs the Python stack, streaming `[install] …` lines on stdout for the
# first-run modal. Exits non-zero on failure.
#
#   powershell -ExecutionPolicy Bypass -File install.ps1 <venv_dir> <pip_spec>
$ErrorActionPreference = "Stop"

param(
  [Parameter(Mandatory = $true)][string]$VenvDir,
  [Parameter(Mandatory = $true)][string]$PipSpec
)

function Say($msg) { Write-Output "[install] $msg" }

# Prefer the py launcher, fall back to python on PATH.
$py = $null
foreach ($cand in @("py", "python", "python3")) {
  $cmd = Get-Command $cand -ErrorAction SilentlyContinue
  if ($cmd) { $py = $cmd.Source; break }
}
if (-not $py) {
  Write-Error "[install] ERROR: Python not found. Install Python 3.11+ (python.org) and retry."
  exit 1
}
Say "using $(& $py --version 2>&1)"

$vpy = Join-Path $VenvDir "Scripts\python.exe"
if (-not (Test-Path $vpy)) {
  Say "creating virtual environment at $VenvDir"
  & $py -m venv $VenvDir
}

Say "upgrading pip"
& $vpy -m pip install --upgrade pip --disable-pip-version-check -q

Say "installing CPU-only torch (no CUDA)"
try {
  & $vpy -m pip install --disable-pip-version-check `
    --index-url https://download.pytorch.org/whl/cpu torch
} catch {
  Say "torch CPU index step skipped (will resolve transitively)"
}

Say "installing $PipSpec - this can take several minutes on first run"
& $vpy -m pip install --disable-pip-version-check $PipSpec
if ($LASTEXITCODE -ne 0) { Write-Error "[install] pip install failed"; exit 1 }

Say "OK - sidecar environment ready"
