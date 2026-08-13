$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $Root "backend"
$NodePath = (Get-Command node).Source
$TaskName = "RecallDaemon"

$action = New-ScheduledTaskAction -Execute $NodePath -Argument "src\server.js" -WorkingDirectory $BackendDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Recall local knowledge daemon" | Out-Null

Start-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Write-Host "Registered scheduled task: $TaskName"
