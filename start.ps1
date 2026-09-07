# InstaAnalytic — Windows Kurulum & Başlatma
# Çalıştırma: sağ tık → "PowerShell ile çalıştır"
# veya: powershell -ExecutionPolicy Bypass -File start.ps1
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$AgentBin   = "$ScriptDir\scripts\bin\host_agent-windows-amd64.exe"
$LogDir     = "$env:LOCALAPPDATA\InstaAnalytic\Logs"
$EnvFile    = "$ScriptDir\.env"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Banner($msg) { Write-Host $msg -ForegroundColor Cyan }
function Write-OK($msg)     { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn($msg)   { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Fail($msg)   { Write-Host "  ✗ $msg" -ForegroundColor Red }

Write-Banner "╔══════════════════════════════════════╗"
Write-Banner "║       InstaAnalytic — Kuruluyor…           ║"
Write-Banner "╚══════════════════════════════════════╝"
Write-Host ""

# ── 1. Docker kontrolü ───────────────────────────────────────────────────────
Write-Host "► Docker kontrol ediliyor…"
if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    Write-Fail "Docker Desktop kurulu değil!"
    Write-Host ""
    Write-Host "  Kurulum için: https://www.docker.com/products/docker-desktop/"
    Start-Process "https://www.docker.com/products/docker-desktop/"
    Read-Host "Docker'ı kurun, başlatın, sonra Enter'a basın"
}

try {
    docker info 2>&1 | Out-Null
    Write-OK "Docker çalışıyor"
} catch {
    Write-Warn "Docker kapalı, başlatılıyor…"
    Start-Process "Docker Desktop" -ErrorAction SilentlyContinue
    $timeout = 30
    $ready = $false
    for ($i = 0; $i -lt $timeout; $i++) {
        Start-Sleep 1
        try { docker info 2>&1 | Out-Null; $ready = $true; break } catch {}
        Write-Host "." -NoNewline
    }
    Write-Host ""
    if (-not $ready) {
        Write-Fail "Docker başlatılamadı. Docker Desktop'ı elle açıp tekrar deneyin."
        exit 1
    }
    Write-OK "Docker çalışıyor"
}
Write-Host ""

# ── 2. .env ──────────────────────────────────────────────────────────────────
if (-not (Test-Path $EnvFile)) {
    Write-Host "► .env oluşturuluyor…"
    $randKey  = [System.BitConverter]::ToString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).Replace("-","").ToLower()
    $randPass = [System.BitConverter]::ToString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(16)).Replace("-","").ToLower()
    @"
DATABASE_URL=postgresql+asyncpg://instaanalytic:$randPass@postgres:5432/instaanalytic
REDIS_URL=redis://redis:6379/0
POSTGRES_USER=instaanalytic
POSTGRES_PASSWORD=$randPass
POSTGRES_DB=instaanalytic
ENCRYPTION_KEY=$randKey
ENVIRONMENT=production
LOG_LEVEL=INFO
"@ | Set-Content $EnvFile -Encoding UTF8
    Write-OK ".env oluşturuldu"
    Write-Host ""
}

# ── 3. Host Agent binary ──────────────────────────────────────────────────────
Write-Host "► Host Agent kontrol ediliyor…"
New-Item -ItemType Directory -Force -Path "$ScriptDir\scripts\bin" | Out-Null

if (-not (Test-Path $AgentBin)) {
    Write-Host "  Binary bulunamadı, derleniyor…"
    if (Get-Command "pip" -ErrorAction SilentlyContinue) {
        pip install -q pyinstaller browser-cookie3
        $agentName = [System.IO.Path]::GetFileName($AgentBin)
        pyinstaller --onefile --name $agentName "$ScriptDir\scripts\host_agent.py" `
            --distpath "$ScriptDir\scripts\bin\" `
            --workpath "$env:TEMP\instaanalytic_build" `
            --specpath "$env:TEMP" -y --log-level ERROR 2>&1 | Out-Null
    }
    if (-not (Test-Path $AgentBin)) {
        Write-Fail "Host Agent derlenemedi. En son paketi indirin."
        exit 1
    }
}
Write-OK "Host Agent hazır"
Write-Host ""

# ── 4. Görev Zamanlayıcı — otomatik başlatma ─────────────────────────────────
Write-Host "► Otomatik başlatma kuruluyor…"

# Host Agent — Task Scheduler
$taskNameAgent = "InstaAnalytic\HostAgent"
$action  = New-ScheduledTaskAction -Execute $AgentBin
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Unregister-ScheduledTask -TaskName $taskNameAgent -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskNameAgent -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName $taskNameAgent -ErrorAction SilentlyContinue

# Docker Compose — Task Scheduler
$taskNameDocker = "InstaAnalytic\DockerCompose"
$dockerAction   = New-ScheduledTaskAction -Execute "docker" `
    -Argument "compose --project-directory `"$ScriptDir`" up -d --build --wait" `
    -WorkingDirectory $ScriptDir
Unregister-ScheduledTask -TaskName $taskNameDocker -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskNameDocker -Action $dockerAction -Trigger $trigger -Settings $settings -RunLevel Highest -Force | Out-Null

Write-OK "Görev Zamanlayıcı kuruldu (Windows başlarken otomatik çalışır)"
Write-Host ""

# ── 5. Docker başlat ─────────────────────────────────────────────────────────
Write-Host "► Docker servisleri başlatılıyor…"
Push-Location $ScriptDir
docker compose up -d --build --wait 2>&1 | Where-Object { $_ -match "✓|Error|Warning" } | Write-Host
Pop-Location
Write-OK "Servisler hazır"
Write-Host ""

# ── 6. Host Agent erişim kontrolü ────────────────────────────────────────────
Write-Host "► Tarayıcı erişimi kontrol ediliyor…"
Start-Sleep 2
$agentOk = $false
for ($i = 0; $i -lt 3; $i++) {
    try {
        $r = Invoke-WebRequest "http://127.0.0.1:8002/health" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $agentOk = $true; break }
    } catch {}
    Start-Sleep 2
}
if ($agentOk) {
    Write-OK "Host Agent erişilebilir (port 8002)"
} else {
    Write-Warn "Host Agent henüz yanıt vermiyor — log: $LogDir"
}
Write-Host ""

# ── Hazır ─────────────────────────────────────────────────────────────────────
Write-Banner "╔══════════════════════════════════════════════════════════╗"
Write-Banner "║  ✓ InstaAnalytic hazır!                                        ║"
Write-Banner "║                                                          ║"
Write-Banner "║  Adres : http://localhost:3002                           ║"
Write-Banner "║  Session: Ayarlar → Session → Oturumu Tara              ║"
Write-Banner "║                                                          ║"
Write-Banner "║  Windows her açıldığında otomatik başlar.                ║"
Write-Banner "╚══════════════════════════════════════════════════════════╝"
Write-Host ""

Start-Sleep 2
Start-Process "http://localhost:3002"
