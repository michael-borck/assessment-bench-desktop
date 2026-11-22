# First-run sidecar install (Windows). The PowerShell equivalent of install.sh —
# the piece talk-buddy's bash-only setup lacked. Builds an app-local venv and
# installs the Python stack, streaming `[install] …` lines on stdout for the
# first-run modal. Exits non-zero on failure.
#
#   powershell -ExecutionPolicy Bypass -File install.ps1 <venv_dir> <pip_spec> [<pip_spec>…]
#
# NOTE: param() must be the first statement in the file (only comments may
# precede it) — everything else comes after.
param(
  [Parameter(Mandatory = $true)][string]$VenvDir,
  [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)][string[]]$PipSpecs
)

$ErrorActionPreference = "Stop"

function Say($msg) { Write-Output "[install] $msg" }

if (-not $PipSpecs -or $PipSpecs.Count -lt 1) {
  Write-Error "usage: install.ps1 <venv_dir> <pip_spec> [<pip_spec>…]"
  exit 1
}

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
if ($LASTEXITCODE -ne 0) { Write-Error "[install] pip upgrade failed"; exit 1 }

Say "installing CPU-only torch (no CUDA)"
try {
  & $vpy -m pip install --disable-pip-version-check `
    --index-url https://download.pytorch.org/whl/cpu torch
} catch {
  Say "torch CPU index step skipped (will resolve transitively)"
}

Say "installing $($PipSpecs -join ', ') - this can take several minutes on first run"
& $vpy -m pip install --disable-pip-version-check @PipSpecs
if ($LASTEXITCODE -ne 0) { Write-Error "[install] pip install failed"; exit 1 }

Say "OK - sidecar environment ready"