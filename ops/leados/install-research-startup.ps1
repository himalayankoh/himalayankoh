param([Parameter(Mandatory = $true)][string]$RuntimeDirectory)
$ErrorActionPreference = 'Stop'
$runtime = (Resolve-Path -LiteralPath $RuntimeDirectory).Path
$supervisor = Join-Path $PSScriptRoot 'research-supervisor.ps1'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskName = 'HK LeadOS Research Supervisor'
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    $existingArguments = ($existing.Actions | Select-Object -First 1).Arguments
    if (-not $existingArguments -or $existingArguments.IndexOf($supervisor, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
        throw 'A different task uses this name; it was not overwritten.'
    }
}
$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $supervisor + '" -RuntimeDirectory "' + $runtime + '" -NodePath "' + $node + '"'
$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Keeps the existing private Himalayan Koh research bridge and WSL containers running for the signed-in owner. Does not enable outbound email.' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Get-ScheduledTask -TaskName $taskName | Select-Object TaskName, State
