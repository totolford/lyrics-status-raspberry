# Installateur de l'agent Lyrics Status pour Windows (servi par le Raspberry Pi).
# Usage : irm "http://IP_DU_PI:8765/install.ps1?token=MOT_DE_PASSE" | iex
# Réexécutable à volonté : met à jour sans toucher à ta configuration existante.
$ErrorActionPreference = 'Stop'
$PiUrl = '__PI_URL__'
$Token = '__TOKEN__'
$Dir   = Join-Path $env:USERPROFILE 'steam-agent'
New-Item -ItemType Directory -Force $Dir | Out-Null

# 1. Python
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host 'Python introuvable : installation via winget...'
    winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine')
    if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
        throw 'Python vient d''être installé : ferme et rouvre PowerShell, puis relance la commande.'
    }
}
$pyExe = ((& python -c 'import sys; print(sys.executable)' 2>$null) | Out-String).Trim()
if (-not $pyExe -or -not (Test-Path $pyExe)) {
    throw 'Le « python » trouvé est un raccourci du Microsoft Store, pas un vrai Python. Installe-le : winget install Python.Python.3.12 (puis rouvre PowerShell).'
}
$pyw   = Join-Path (Split-Path $pyExe) 'pythonw.exe'
if (-not (Test-Path $pyw)) { throw "pythonw.exe introuvable à côté de $pyExe" }

# 2. Agent (dernière version servie par le Pi)
$agent = Join-Path $Dir 'steam_agent.py'
Invoke-WebRequest "$PiUrl/agent.py" -Headers @{ 'X-Token' = $Token } -OutFile $agent -UseBasicParsing
Write-Host "Agent installé : $agent ($((Get-Item $agent).Length) octets)"

# 3. Configuration (fusionnée : ta clé Apex etc. sont conservées)
$cfgPath = Join-Path $Dir 'agent_config.json'
$cfg = if (Test-Path $cfgPath) { Get-Content $cfgPath -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
$cfg | Add-Member -NotePropertyName pi_url -NotePropertyValue $PiUrl -Force
$cfg | Add-Member -NotePropertyName token  -NotePropertyValue $Token -Force
[IO.File]::WriteAllText($cfgPath, ($cfg | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding $false))

# 4. Musique jouée sur le PC (optionnel : YouTube, Deezer, VLC...). Désactiver : $env:LS_NO_MEDIA = 1
#    Versions épinglées (3.2.1) pour rester compatibles avec les autres paquets winrt déjà installés.
if (-not $env:LS_NO_MEDIA) {
    & python -m pip install --quiet --disable-pip-version-check winrt-runtime==3.2.1 winrt-Windows.Media.Control==3.2.1 winrt-Windows.Foundation==3.2.1 winrt-Windows.Foundation.Collections==3.2.1 winrt-Windows.Storage.Streams==3.2.1
    if ($LASTEXITCODE -ne 0) { Write-Host 'Musique du PC : paquets non installés (fonction optionnelle, le reste marche).' }
}

# 5. Démarrage automatique à l'ouverture de session
Get-CimInstance Win32_Process -Filter "Name='pythonw.exe' OR Name='python.exe'" |
    Where-Object { $_.CommandLine -like '*steam_agent.py*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Unregister-ScheduledTask -TaskName SteamAgent -Confirm:$false -ErrorAction SilentlyContinue
$action   = New-ScheduledTaskAction -Execute $pyw -Argument "`"$agent`"" -WorkingDirectory $Dir
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0 -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask SteamAgent -Action $action -Trigger $trigger -Settings $settings | Out-Null
Start-ScheduledTask SteamAgent
Write-Host 'OK : agent lancé et programmé au démarrage de Windows. Il se met à jour tout seul depuis le Pi.'
