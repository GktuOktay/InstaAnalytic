#!/bin/bash
# InstaAnalytic — Kurulum & Başlatma (macOS + Linux)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR=""
OS="$(uname -s)"    # Darwin | Linux

# ── Platform setup ───────────────────────────────────────────────────────────
case "$OS" in
  Darwin)
    ARCH="$(uname -m)"   # arm64 | x86_64
    ARCH="${ARCH/x86_64/amd64}"
    AGENT_BIN="$SCRIPT_DIR/scripts/bin/host_agent-darwin-$ARCH"
    LOG_DIR="$HOME/Library/Logs/InstaAnalytic"
    ;;
  Linux)
    AGENT_BIN="$SCRIPT_DIR/scripts/bin/host_agent-linux-amd64"
    LOG_DIR="$HOME/.local/share/instaanalytic/logs"
    ;;
  *)
    echo "Bu platform desteklenmiyor: $OS"
    echo "Windows için start.ps1 kullanın."
    exit 1
    ;;
esac

mkdir -p "$LOG_DIR"

echo "╔══════════════════════════════════════╗"
echo "║       InstaAnalytic — Kuruluyor…           ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Docker kontrolü ───────────────────────────────────────────────────────
echo "► Docker kontrol ediliyor…"
if ! command -v docker &>/dev/null; then
  echo ""
  echo "  ✗ Docker Desktop kurulu değil!"
  echo ""
  if [ "$OS" = "Darwin" ]; then
    echo "  https://www.docker.com/products/docker-desktop/"
    open "https://www.docker.com/products/docker-desktop/" 2>/dev/null || true
  else
    echo "  Kurulum: https://docs.docker.com/engine/install/"
    echo "  (Ubuntu için: sudo apt-get install docker.io docker-compose-plugin)"
  fi
  exit 1
fi

if ! docker info &>/dev/null; then
  echo "  Docker kapalı, başlatılıyor…"
  if [ "$OS" = "Darwin" ]; then
    open -a "Docker" 2>/dev/null || true
    for i in $(seq 1 30); do
      sleep 1; docker info &>/dev/null && break; printf "."
    done; echo ""
  else
    sudo systemctl start docker 2>/dev/null || true
    sleep 3
  fi
  docker info &>/dev/null || { echo "  ✗ Docker başlatılamadı."; exit 1; }
fi
echo "  ✓ Docker çalışıyor"
echo ""

# ── 2. .env ──────────────────────────────────────────────────────────────────
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  echo "► .env oluşturuluyor…"
  RAND_KEY="$(openssl rand -hex 32)"
  RAND_PASS="$(openssl rand -hex 16)"
  cat > "$SCRIPT_DIR/.env" <<ENV
DATABASE_URL=postgresql+asyncpg://instaanalytic:${RAND_PASS}@postgres:5432/instaanalytic
REDIS_URL=redis://redis:6379/0
POSTGRES_USER=instaanalytic
POSTGRES_PASSWORD=${RAND_PASS}
POSTGRES_DB=instaanalytic
ENCRYPTION_KEY=${RAND_KEY}
ENVIRONMENT=production
LOG_LEVEL=INFO
ENV
  echo "  ✓ .env oluşturuldu"
  echo ""
fi

# ── 3. Host Agent binary ──────────────────────────────────────────────────────
echo "► Host Agent kontrol ediliyor…"
mkdir -p "$SCRIPT_DIR/scripts/bin"

if [ ! -f "$AGENT_BIN" ]; then
  echo "  Binary bulunamadı ($AGENT_BIN), derleniyor…"
  _build_agent() {
    pip3 install -q pyinstaller browser-cookie3 --break-system-packages 2>/dev/null || \
    pip3 install -q pyinstaller browser-cookie3 2>/dev/null || return 1
    pyinstaller --onefile \
      --name "$(basename "$AGENT_BIN")" \
      "$SCRIPT_DIR/scripts/host_agent.py" \
      --distpath "$SCRIPT_DIR/scripts/bin/" \
      --workpath /tmp/instaanalytic_build \
      --specpath /tmp/ -y --log-level ERROR 2>/dev/null
  }
  if command -v python3 &>/dev/null; then
    _build_agent || true
  fi
  if [ ! -f "$AGENT_BIN" ]; then
    echo "  ✗ Host Agent derlenemedi."
    echo "  Lütfen en son paketi indirin veya geliştiriciyle iletişime geçin."
    exit 1
  fi
fi
chmod +x "$AGENT_BIN"
echo "  ✓ Host Agent hazır"
echo ""

# ── 4. Otomatik başlatma ──────────────────────────────────────────────────────
echo "► Otomatik başlatma kuruluyor…"

if [ "$OS" = "Darwin" ]; then
  # macOS — LaunchAgent
  LAUNCHAGENTS="$HOME/Library/LaunchAgents"
  mkdir -p "$LAUNCHAGENTS"

  # Host Agent
  cat > "$LAUNCHAGENTS/com.instaanalytic.host-agent.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.instaanalytic.host-agent</string>
  <key>ProgramArguments</key>
  <array><string>$AGENT_BIN</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/host-agent.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/host-agent.log</string>
</dict></plist>
PLIST
  launchctl unload "$LAUNCHAGENTS/com.instaanalytic.host-agent.plist" 2>/dev/null || true
  launchctl load   "$LAUNCHAGENTS/com.instaanalytic.host-agent.plist"

  # Docker Compose
  DOCKER_BIN="$(which docker)"
  cat > "$LAUNCHAGENTS/com.instaanalytic.docker.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.instaanalytic.docker</string>
  <key>ProgramArguments</key>
  <array>
    <string>$DOCKER_BIN</string><string>compose</string>
    <string>--project-directory</string><string>$SCRIPT_DIR</string>
    <string>up</string><string>-d</string><string>--build</string><string>--wait</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><false/>
  <key>StandardOutPath</key><string>$LOG_DIR/docker.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/docker.log</string>
</dict></plist>
PLIST
  launchctl unload "$LAUNCHAGENTS/com.instaanalytic.docker.plist" 2>/dev/null || true
  launchctl load   "$LAUNCHAGENTS/com.instaanalytic.docker.plist"
  echo "  ✓ macOS LaunchAgent kuruldu (login'de otomatik başlar)"

elif [ "$OS" = "Linux" ]; then
  # Linux — systemd user service
  SYSTEMD_DIR="$HOME/.config/systemd/user"
  mkdir -p "$SYSTEMD_DIR"

  # Host Agent service
  cat > "$SYSTEMD_DIR/instaanalytic-host-agent.service" <<UNIT
[Unit]
Description=InstaAnalytic Host Agent
After=network.target

[Service]
ExecStart=$AGENT_BIN
Restart=always
RestartSec=5
StandardOutput=append:$LOG_DIR/host-agent.log
StandardError=append:$LOG_DIR/host-agent.log

[Install]
WantedBy=default.target
UNIT

  # Docker Compose service
  DOCKER_BIN="$(which docker)"
  cat > "$SYSTEMD_DIR/instaanalytic-docker.service" <<UNIT
[Unit]
Description=InstaAnalytic Docker Compose
After=docker.service network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$SCRIPT_DIR
ExecStart=$DOCKER_BIN compose up -d --build --wait
ExecStop=$DOCKER_BIN compose down
StandardOutput=append:$LOG_DIR/docker.log
StandardError=append:$LOG_DIR/docker.log

[Install]
WantedBy=default.target
UNIT

  systemctl --user daemon-reload
  systemctl --user enable instaanalytic-host-agent.service instaanalytic-docker.service
  systemctl --user start  instaanalytic-host-agent.service
  echo "  ✓ systemd user service kuruldu (login'de otomatik başlar)"
fi
echo ""

# ── 5. Docker başlat ─────────────────────────────────────────────────────────
echo "► Docker servisleri başlatılıyor…"
cd "$SCRIPT_DIR"
docker compose up -d --build --wait 2>&1 | grep -E "(✓|✗|Error|error|Warning)" || true
echo "  ✓ Servisler hazır"
echo ""

# ── 6. Host Agent erişim kontrolü ────────────────────────────────────────────
echo "► Tarayıcı erişimi kontrol ediliyor…"
sleep 1
for i in 1 2 3; do
  curl -sf http://127.0.0.1:8002/health >/dev/null 2>&1 && break
  sleep 2
done
if curl -sf http://127.0.0.1:8002/health >/dev/null 2>&1; then
  echo "  ✓ Host Agent erişilebilir (port 8002)"
else
  echo "  ⚠ Host Agent henüz yanıt vermiyor — log: $LOG_DIR/host-agent.log"
fi
echo ""

# ── Hazır ─────────────────────────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✓ InstaAnalytic hazır!                                        ║"
echo "║                                                          ║"
echo "║  Adres : http://localhost:3002                           ║"
echo "║  Session: Ayarlar → Session → Oturumu Tara              ║"
echo "║                                                          ║"
echo "║  Her açılışta otomatik başlar.                           ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

sleep 2
if [ "$OS" = "Darwin" ]; then
  open "http://localhost:3002" 2>/dev/null || true
elif command -v xdg-open &>/dev/null; then
  xdg-open "http://localhost:3002" 2>/dev/null || true
fi
