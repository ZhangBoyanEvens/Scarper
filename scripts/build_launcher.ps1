# Build Start-Scarper.exe with PyInstaller (run from repo root or scripts/)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "Installing PyInstaller if needed..."
python -m pip install pyinstaller --quiet

Write-Host "Building Start-Scarper.exe..."
python -m PyInstaller `
  --onefile `
  --console `
  --name Start-Scarper `
  --distpath "$Root" `
  --workpath "$Root\build\launcher" `
  --specpath "$Root\build\launcher" `
  --clean `
  "$PSScriptRoot\start_scarper.py"

if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "Done: $Root\Start-Scarper.exe"
} else {
  Write-Host "Build failed." -ForegroundColor Red
  exit 1
}
