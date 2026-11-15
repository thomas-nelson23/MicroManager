# Runs Nextion Editor's hidden automation mode on one job folder, in the logged-in
# desktop session (it hangs in SSH's non-interactive session). Writes out\result.json.
# Keep this file pure ASCII (PowerShell 5.1 reads BOM-less scripts as ANSI).
param(
  [Parameter(Mandatory)] [string]$JobDir,
  [Parameter(Mandatory)] [string]$Editor,
  [int]$Timeout = 150,
  [string]$User = $env:USERNAME
)
$ErrorActionPreference = 'Stop'
$out = Join-Path $JobDir 'out'
New-Item -ItemType Directory -Force $out | Out-Null
Get-ChildItem $out -File | Remove-Item -Force
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$result = [ordered]@{ ok = $false; seconds = 0; tft = $null; hmi = $null; tft_bytes = 0; error = $null; dialog_text = $null }

$before = @(Get-Process 'Nextion Editor' -EA SilentlyContinue | % Id)
$principal = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive
$task = 'nxauto_run_' + [guid]::NewGuid().ToString('N').Substring(0, 8)
Register-ScheduledTask -TaskName $task -Principal $principal -Force `
  -Action (New-ScheduledTaskAction -Execute $Editor -Argument ('"' + $JobDir + '"')) | Out-Null
$t0 = Get-Date
try {
  Start-ScheduledTask $task
  $proc = $null
  for ($i = 0; $i -lt 40 -and -not $proc; $i++) {
    Start-Sleep -Milliseconds 250
    $proc = Get-Process 'Nextion Editor' -EA SilentlyContinue | ? { $before -notcontains $_.Id } | Select -First 1
  }
  if (-not $proc) { throw 'editor process did not start (is a user logged in to the VM desktop?)' }
  if (-not $proc.WaitForExit($Timeout * 1000)) {
    # Still running = stuck on a modal dialog. Read its text, then kill it.
    $diag = Join-Path $out 'dialog.txt'
    $dtask = $task + '_diag'
    Register-ScheduledTask -TaskName $dtask -Principal $principal -Force -Action (New-ScheduledTaskAction -Execute 'powershell.exe' `
      -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $here 'nxdiag.ps1') + '" -ProcId ' + $proc.Id + ' -Out "' + $diag + '"')) | Out-Null
    Start-ScheduledTask $dtask
    for ($i = 0; $i -lt 60 -and -not (Test-Path $diag); $i++) { Start-Sleep -Milliseconds 250 }
    Start-Sleep 1
    Unregister-ScheduledTask $dtask -Confirm:$false
    if (Test-Path $diag) { $result.dialog_text = [IO.File]::ReadAllText($diag) }
    $proc | Stop-Process -Force
    throw "editor did not finish within $Timeout s (killed); see dialog_text"
  }
  $tft = Get-ChildItem $out -Filter *.tft | Select -First 1
  $hmi = Get-ChildItem $out -Filter *.HMI | Select -First 1
  if ($hmi) { $result.hmi = $hmi.FullName }
  if (-not $tft) {
    if ($hmi) { throw 'compile failed: the project was saved (.HMI) but no .tft was produced. The editor does not expose the compiler message; open the .HMI in Nextion Editor and press Compile to see it.' }
    throw 'editor exited without saving a project (settings rejected? check ser/model)'
  }
  $result.tft = $tft.FullName; $result.tft_bytes = $tft.Length; $result.ok = $true
} catch {
  $result.error = $_.Exception.Message
} finally {
  $result.seconds = [int]((Get-Date) - $t0).TotalSeconds
  Unregister-ScheduledTask $task -Confirm:$false -EA SilentlyContinue
  $result | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $out 'result.json')
  $result | ConvertTo-Json
}
