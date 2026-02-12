$targetFile = "C:\Users\y.hamza\Desktop\ytcd\dist\win-unpacked\resources\app.asar"

# Try using handle.exe approach via openfiles
Write-Output "Checking for processes locking: $targetFile"
Write-Output ""

# Method 1: Check all running processes
$allProcs = Get-Process
foreach ($proc in $allProcs) {
    try {
        $handles = $proc.Modules | Where-Object { $_.FileName -like "*app.asar*" -or $_.FileName -like "*ytcd*" -or $_.FileName -like "*electron*" }
        if ($handles) {
            Write-Output "Found: PID=$($proc.Id) Name=$($proc.ProcessName) Path=$($proc.Path)"
        }
    } catch {}
}

# Method 2: Check common suspects
$suspects = @("electron", "YTCD", "node", "Code")
foreach ($name in $suspects) {
    $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
    if ($procs) {
        foreach ($p in $procs) {
            Write-Output "Suspect process: PID=$($p.Id) Name=$($p.ProcessName) Path=$($p.Path)"
        }
    }
}

Write-Output ""
Write-Output "Done scanning."
