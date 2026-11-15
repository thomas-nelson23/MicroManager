# Dumps the visible text of every window owned by a process. Used by nxrun.ps1 when the
# editor is stuck (usually on a modal dialog) so the dialog's message can be reported.
# Must run in the interactive desktop session. Keep this file pure ASCII (PowerShell 5.1).
param([Parameter(Mandatory)] [int]$ProcId, [Parameter(Mandatory)] [string]$Out)
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]
$cond = New-Object System.Windows.Automation.PropertyCondition($A::ProcessIdProperty, $ProcId)

function Get-Text($e) {
  try { return $e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value } catch {}
  return $null
}

$lines = New-Object System.Collections.Generic.List[string]
foreach ($w in $A::RootElement.FindAll($TS::Children, $cond)) {
  $r = $w.Current.BoundingRectangle
  $lines.Add("=== window: '" + $w.Current.Name + "' at " + [int]$r.X + "," + [int]$r.Y + " size " + [int]$r.Width + "x" + [int]$r.Height)
  foreach ($e in $w.FindAll($TS::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
    $n = $e.Current.Name; $v = Get-Text $e
    if ($n -or $v) { $lines.Add('  [' + $e.Current.ControlType.ProgrammaticName.Replace('ControlType.', '') + '] ' + $n + $(if ($v -and $v -ne $n) { ' = ' + $v } else { '' })) }
  }
}
if ($lines.Count -eq 0) { $lines.Add('(no windows found for process ' + $ProcId + ')') }
$lines | Set-Content -Encoding UTF8 $Out
