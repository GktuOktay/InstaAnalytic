#!/bin/bash
# Instapp — Tek seferlik kurulum ve başlatma
# Çalıştır: bash start.sh
# Sonraki login'lerde her şey otomatik başlar.

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENT_LABEL="com.instapp.host-agent"
DOCKER_LABEL="com.instapp.docker"
LAUNCHAGENTS="$HOME/Library/LaunchAgents"
LOG_DIR="/tmp"

echo "╔══════════════════════════════════════╗"
echo "║       Instapp — Başlatılıyor         ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Python bağımlılıkları ────────────────────────────────────────────────
echo "► Python bağımlılıkları kontrol ediliyor…"
if ! python3 -c "import browser_cookie3" 2>/dev/null; then
  echo "  Yükleniyor…"
  pip3 install -q -r "$SCRIPT_DIR/scripts/requirements.txt"
fi
echo "  ✓ Hazır"
echo ""

# ── 2. Host Agent LaunchAgent ────────────────────────────────────────────────
echo "► Host Agent LaunchAgent kuruluyor…"
PYTHON_BIN="$(which python3)"
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
        <string>$PYTHON_BIN</string>
        <string>$SCRIPT_DIR/scripts/host_agent.py</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>$LOG_DIR/instapp-host-agent.log</string>
    <key>StandardErrorPath</key><string>$LOG_DIR/instapp-host-agent.log</string>
</dict>
</plist>
PLIST
launchctl unload "$LAUNCHAGENTS/$AGENT_LABEL.plist" 2>/dev/null || true
launchctl load "$LAUNCHAGENTS/$AGENT_LABEL.plist"
echo "  ✓ Host Agent kuruldu (port 8002) — login'de otomatik başlar"
echo ""

# ── 3. Docker Compose LaunchAgent ───────────────────────────────────────────
echo "► Docker Compose LaunchAgent kuruluyor…"
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
        <string>--wait</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><false/>
    <key>StandardOutPath</key><string>$LOG_DIR/instapp-docker.log</string>
    <key>StandardErrorPath</key><string>$LOG_DIR/instapp-docker.log</string>
</dict>
</plist>
PLIST
launchctl unload "$LAUNCHAGENTS/$DOCKER_LABEL.plist" 2>/dev/null || true
launchctl load "$LAUNCHAGENTS/$DOCKER_LABEL.plist"
echo "  ✓ Docker Compose kuruldu — login'de otomatik başlar"
echo ""

# ── 4. Docker Compose şimdi başlat ──────────────────────────────────────────
echo "► Docker servisleri başlatılıyor…"
cd "$SCRIPT_DIR"
docker compose up -d --build 2>&1 | tail -5
echo ""

# ── 5. Hazır ────────────────────────────────────────────────────────────────
echo "╔══════════════════════════════════════╗"
echo "║  ✓ Instapp hazır!                    ║"
echo "║  http://localhost:3002               ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "Bundan sonra her login'de otomatik başlar."
echo "Tarayıcı session'ı için: Session sayfasında 'Oturumu Tara'ya tıkla."

# Tarayıcıda aç
sleep 2
open "http://localhost:3002" 2>/dev/null || true
