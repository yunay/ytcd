# Finds processes holding a lock on a build output file - run it when
# `npm run build:win` fails because dist/ or app.asar cannot be deleted.
#
#   npm run find-lock
#   powershell -File scripts/find-lock.ps1 -Path "D:\other\file"
#
# Keep this file ASCII-only: Windows PowerShell 5.1 reads a BOM-less script as
# ANSI, and non-ASCII characters break parsing.

param(
    [string]$Path = (Join-Path (Split-Path $PSScriptRoot -Parent) 'dist\win-unpacked\resources\app.asar')
)

Write-Output "Checking for processes locking: $Path"
if (-not (Test-Path $Path)) {
    Write-Output "(file does not exist - showing candidate processes anyway)"
}
Write-Output ""

$leaf = Split-Path $Path -Leaf

# Method 1: any process with a matching module loaded
foreach ($proc in Get-Process) {
    try {
        $handles = $proc.Modules | Where-Object {
            $_.FileName -like "*$leaf*" -or $_.FileName -like "*ytcd*" -or $_.FileName -like "*electron*"
        }
        if ($handles) {
            Write-Output "Found: PID=$($proc.Id) Name=$($proc.ProcessName) Path=$($proc.Path)"
        }
    } catch {}
}

# Method 2: check common suspects
foreach ($name in @("electron", "YTCD", "node", "Code")) {
    foreach ($p in (Get-Process -Name $name -ErrorAction SilentlyContinue)) {
        Write-Output "Suspect process: PID=$($p.Id) Name=$($p.ProcessName) Path=$($p.Path)"
    }
}

Write-Output ""
Write-Output "Done scanning."
