#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
NODE="$(command -v node)"

if [[ "$OSTYPE" == "darwin"* ]]; then
  PLIST="$HOME/Library/LaunchAgents/com.recall.daemon.plist"
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.recall.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$BACKEND/src/server.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$BACKEND</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
EOF
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
  echo "Registered launchd agent: com.recall.daemon"
else
  SERVICE="$HOME/.config/systemd/user/recall.service"
  mkdir -p "$(dirname "$SERVICE")"
  cat > "$SERVICE" <<EOF
[Unit]
Description=Recall local knowledge daemon

[Service]
WorkingDirectory=$BACKEND
ExecStart=$NODE src/server.js
Restart=on-failure

[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now recall.service
  echo "Registered systemd user service: recall"
fi
