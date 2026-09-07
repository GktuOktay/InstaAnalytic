#!/bin/bash
# Instapp — Kurulum & Başlatma
# Çalıştırma: bash start.sh  (veya çift tıkla: Instapp Kur.command)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_LABEL="com.instapp.host-agent"
DOCKER_LABEL="com.instapp.docker"
LAUNCHAGENTS="$HOME/Library/LaunchAgents"
AGENT_BIN="$SCRIPT_DIR/scripts/bin/host_agent"
LOG_DIR="$HOME/Library/Logs/Instapp"

mkdir -p "$LOG_DIR"

echo "╔══════════════════════════════════════╗"
echo "║       Instapp — Kuruluyor…           ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Sistem kontrolü ───────────────────────────────────────────────────────
echo "► Sistem kontrol ediliyor…"

# Docker kontrolü
if ! command -v docker &>/dev/null; then
  echo ""
  echo "  ✗ Docker Desktop kurulu değil!"
  echo ""
  echo "  Kurulum için:"
  echo "  https://www.docker.com/products/docker-desktop/"
  echo ""
  echo "  Docker'ı kurun, başlatın, sonra bu scripti tekrar çalıştırın."
  open "https://www.docker.com/products/docker-desktop/" 2>/dev/null || true
  exit 1
fi

if ! docker info &>/dev/null; then
  echo "  Docker kurulu ama çalışmıyor. Docker Desktop başlatılıyor…"
  open -a "Docker" 2>/dev/null || true
  echo "  Docker Desktop açılıyor, 30 saniye bekleniyor…"
  for i in $(seq 1 30); do
    sleep 1
    if docker info &>/dev/null; then
      break
    fi
    printf "."
  done
  echo ""
  if ! docker info &>/dev/null; then
    echo "  ✗ Docker başlatılamadı. Docker Desktop'ı elle açıp tekrar deneyin."
    exit 1
  fi
fi
echo "  ✓ Docker çalışıyor"
echo ""

# ── 2. .env dosyası ──────────────────────────────────────────────────────────
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  echo "► .env oluşturuluyor…"
  RAND_KEY="$(python3 -c 'import secrets; print(secrets.token_hex(32))' 2>/dev/null || openssl rand -hex 32)"
  RAND_PASS="$(openssl rand -hex 16)"
  cat > "$SCRIPT_DIR/.env" <<ENV
DATABASE_URL=postgresql+asyncpg://instapp:${RAND_PASS}@postgres:5432/instapp
REDIS_URL=redis://redis:6379/0
POSTGRES_USER=instapp
POSTGRES_PASSWORD=${RAND_PASS}
POSTGRES_DB=instapp
ENCRYPTION_KEY=${RAND_KEY}
ENVIRONMENT=production
LOG_LEVEL=INFO
ENV
  echo "  ✓ .env oluşturuldu"
  echo ""
fi

# ── 3. Host Agent binary kontrolü ────────────────────────────────────────────
echo "► Host Agent kontrol ediliyor…"
mkdir -p "$SCRIPT_DIR/scripts/bin"
if [ ! -f "$AGENT_BIN" ]; then
  echo "  Binary bulunamadı, derleniyor…"
  # Python + pip varsa pyinstaller ile derle
  if command -v python3 &>/dev/null && python3 -c "import browser_cookie3" 2>/dev/null; then
    if command -v pyinstaller &>/dev/null; then
      pyinstaller --onefile --name host_agent "$SCRIPT_DIR/scripts/host_agent.py" \
        --distpath "$SCRIPT_DIR/scripts/bin/" \
        --workpath /tmp/instapp_build \
        --specpath /tmp/ -y --log-level ERROR 2>&1 || true
    fi
  fi
  # Hala yoksa pip ile kur ve dene
  if [ ! -f "$AGENT_BIN" ] && command -v pip3 &>/dev/null; then
    echo "  Gerekli araçlar yükleniyor…"
    pip3 install -q pyinstaller browser-cookie3 --break-system-packages 2>/dev/null || \
    pip3 install -q pyinstaller browser-cookie3 2>/dev/null || true
    if command -v pyinstaller &>/dev/null; then
      pyinstaller --onefile --name host_agent "$SCRIPT_DIR/scripts/host_agent.py" \
        --distpath "$SCRIPT_DIR/scripts/bin/" \
        --workpath /tmp/instapp_build \
        --specpath /tmp/ -y --log-level ERROR 2>&1 || true
    fi
  fi
  if [ ! -f "$AGENT_BIN" ]; then
    echo "  ✗ Host Agent derlenemedi."
    echo "  Lütfen 'scripts/bin/host_agent' dosyasının mevcut olduğundan emin olun."
    echo "  veya geliştiriciyle iletişime geçin."
    exit 1
  fi
fi
chmod +x "$AGENT_BIN"
echo "  ✓ Host Agent hazır"
echo ""

# ── 4. Host Agent LaunchAgent ────────────────────────────────────────────────
echo "► Host Agent otomatik başlatma kuruluyor…"
mkdir -p "$LAUNCHAGENTS"
cat > "$LAUNCHAGENTS/$AGENT_LABEL.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$AGENT_LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$AGENT_BIN</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>$LOG_DIR/host-agent.log</string>
    <key>StandardErrorPath</key><string>$LOG_DIR/host-agent.log</string>
</dict>
</plist>
PLIST
launchctl unload "$LAUNCHAGENTS/$AGENT_LABEL.plist" 2>/dev/null || true
launchctl load "$LAUNCHAGENTS/$AGENT_LABEL.plist"
echo "  ✓ Host Agent kuruldu (her açılışta otomatik başlar)"
echo ""

# ── 5. Docker Compose LaunchAgent ───────────────────────────────────────────
echo "► Docker otomatik başlatma kuruluyor…"
DOCKER_BIN="$(which docker)"
cat > "$LAUNCHAGENTS/$DOCKER_LABEL.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$DOCKER_LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$DOCKER_BIN</string>
        <string>compose</string>
        <string>--project-directory</string>
        <string>$SCRIPT_DIR</string>
        <string>up</string>
        <string>-d</string>
        <string>--build</string>
        <string>--wait</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><false/>
    <key>StandardOutPath</key><string>$LOG_DIR/docker.log</string>
    <key>StandardErrorPath</key><string>$LOG_DIR/docker.log</string>
</dict>
</plist>
PLIST
launchctl unload "$LAUNCHAGENTS/$DOCKER_LABEL.plist" 2>/dev/null || true
launchctl load "$LAUNCHAGENTS/$DOCKER_LABEL.plist"
echo "  ✓ Docker otomatik başlatma kuruldu"
echo ""

# ── 6. Docker servisleri şimdi başlat ───────────────────────────────────────
echo "► Docker servisleri başlatılıyor…"
cd "$SCRIPT_DIR"
docker compose up -d --build --wait 2>&1 | grep -E "(✓|✗|error|Error|Warning|warn)" || true
echo "  ✓ Tüm servisler hazır"
echo ""

# ── 7. Host Agent erişim kontrolü ───────────────────────────────────────────
echo "► Tarayıcı erişimi kontrol ediliyor…"
sleep 1
if curl -sf http://127.0.0.1:8002/health >/dev/null 2>&1; then
  echo "  ✓ Host Agent erişilebilir (port 8002)"
else
  echo "  ⚠ Host Agent henüz başlamadı, birkaç saniye bekleniyor…"
  sleep 3
  if curl -sf http://127.0.0.1:8002/health >/dev/null 2>&1; then
    echo "  ✓ Host Agent erişilebilir"
  else
    echo "  ⚠ Host Agent yanıt vermiyor — log: $LOG_DIR/host-agent.log"
  fi
fi
echo ""

# ── 8. Hazır ────────────────────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✓ Instapp hazır!                                        ║"
echo "║                                                          ║"
echo "║  Adres: http://localhost:3002                            ║"
echo "║                                                          ║"
echo "║  Bundan sonra Mac her açıldığında otomatik başlar.       ║"
echo "║  Session eklemek için: Ayarlar → Session → Oturumu Tara ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Loglar: $LOG_DIR/"
echo ""

sleep 2
open "http://localhost:3002" 2>/dev/null || true
