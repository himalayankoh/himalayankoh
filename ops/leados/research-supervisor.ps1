param(
    [Parameter(Mandatory = $true)][string]$RuntimeDirectory,
    [Parameter(Mandatory = $true)][string]$NodePath,
    [string]$Distro = 'Ubuntu-24.04'
)
$ErrorActionPreference = 'Stop'
$runtime = (Resolve-Path -LiteralPath $RuntimeDirectory).Path
$bridgePath = Join-Path $PSScriptRoot 'windows-search-bridge.mjs'
$tokenPath = Join-Path $runtime 'research-token.txt'
if (-not (Test-Path -LiteralPath $tokenPath -PathType Leaf)) { throw 'Existing private research token file is required.' }
if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) { throw 'Existing Node executable is required.' }
$logPath = Join-Path $runtime 'research-supervisor.log'
$mutex = [System.Threading.Mutex]::new($false, 'Local\HKLeadOSResearchSupervisor')
if (-not $mutex.WaitOne(0)) { $mutex.Dispose(); exit 0 }
$keepalive = $null
$containersReady = $false
function Write-State([string]$Message) {
    if ((Test-Path -LiteralPath $logPath) -and (Get-Item -LiteralPath $logPath).Length -gt 1MB) {
        Move-Item -LiteralPath $logPath -Destination ($logPath + '.previous') -Force
    }
    Add-Content -LiteralPath $logPath -Value ((Get-Date).ToUniversalTime().ToString('o') + ' ' + $Message)
}
function Start-PrivateContainers {
    $docker = Start-Process -FilePath 'wsl.exe' -ArgumentList @('-d', $Distro, '--', 'docker', 'start', 'hk-leados-research-gateway-1', 'hk-leados-research-search-1') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'supervisor-docker.log') -RedirectStandardError (Join-Path $runtime 'supervisor-docker-error.log')
    # Hold the process handle before exit so Windows PowerShell retains ExitCode.
    $null = $docker.Handle
    if (-not $docker.WaitForExit(60000)) { $docker.Kill(); throw 'Existing research container startup timed out.' }
    $docker.Refresh()
    if ($docker.ExitCode -ne 0) { throw 'Existing research containers could not be started; inspect supervisor-docker-error.log.' }
}
function Ensure-Bridge {
    $listener = @(Get-NetTCPConnection -LocalPort 8891 -State Listen -ErrorAction SilentlyContinue)
    if ($listener.Count -gt 0) {
        foreach ($connection in $listener) {
            $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($connection.OwningProcess)"
            if ($connection.LocalAddress -ne '127.0.0.1' -or -not $owner.CommandLine -or $owner.CommandLine.IndexOf($bridgePath, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
                throw 'Port 8891 belongs to an unexpected process; it was not changed.'
            }
        }
        return
    }
    $bridge = Start-Process -FilePath $NodePath -ArgumentList @(('"' + $bridgePath + '"'), '--token-file', ('"' + $tokenPath + '"'), '--distro', $Distro) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'supervisor-bridge.log') -RedirectStandardError (Join-Path $runtime 'supervisor-bridge-error.log')
    Set-Content -LiteralPath (Join-Path $runtime 'bridge.pid') -Value $bridge.Id
    Write-State 'Started token-protected loopback research bridge.'
}
try {
    Set-Content -LiteralPath (Join-Path $runtime 'research-supervisor.pid') -Value $PID
    Write-State 'Research supervisor started; no n8n, Hermes, outbound email or production configuration changes.'
    while ($true) {
        try {
            if ($null -eq $keepalive -or $keepalive.HasExited) {
                $keepalive = Start-Process -FilePath 'wsl.exe' -ArgumentList @('-d', $Distro, '--', 'sleep', '2147483647') -WindowStyle Hidden -PassThru
                $containersReady = $false
            }
            if (-not $containersReady) {
                Start-PrivateContainers
                $containersReady = $true
                Write-State 'WSL keepalive and existing private research containers running.'
            }
            Ensure-Bridge
        } catch {
            # Messages originate from this script; do not log native output or credentials.
            Write-State ('Research service check failed: ' + $_.Exception.Message)
        }
        Start-Sleep -Seconds 30
    }
} finally {
    if ($null -ne $keepalive -and -not $keepalive.HasExited) { $keepalive.Kill() }
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
