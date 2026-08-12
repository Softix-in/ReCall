#!/usr/bin/env bash
set -euo pipefail
KEY=$(grep '^FIREWORKS_API_KEY=' "$HOME/recall/.env" | cut -d= -f2- | tr -d '\r')
echo "key_len=${#KEY} prefix=${KEY:0:6}"

echo "=== models list ==="
curl -sS -m 20 -w "\nhttp=%{http_code} time=%{time_total}\n" \
  https://api.fireworks.ai/inference/v1/models \
  -H "Authorization: Bearer ${KEY}" | head -c 400
echo

echo "=== chat completion ==="
curl -sS -m 30 -w "\nhttp=%{http_code} time=%{time_total}\n" \
  https://api.fireworks.ai/inference/v1/chat/completions \
  -H "Authorization: Bearer ${KEY}" \
  -H "Content-Type: application/json" \
  -d '{"model":"accounts/fireworks/models/minimax-m3","messages":[{"role":"user","content":"Say OK"}],"max_tokens":16,"temperature":0}' | head -c 600
echo

echo "=== egress ==="
curl -sS -m 10 -o /dev/null -w "google=%{http_code} time=%{time_total}\n" https://www.google.com || echo "google_fail"
