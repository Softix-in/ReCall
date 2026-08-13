#!/usr/bin/env bash
set -euo pipefail
KEY=$(grep '^FIREWORKS_API_KEY=' "$HOME/recall/.env" | cut -d= -f2- | tr -d '\r')
echo "key_len=${#KEY}"
curl -sS -m 45 -w '\nHTTP=%{http_code} TIME=%{time_total}\n' \
  https://api.fireworks.ai/inference/v1/chat/completions \
  -H "Authorization: Bearer ${KEY}" \
  -H 'Content-Type: application/json' \
  -d '{"model":"accounts/fireworks/models/minimax-m3","messages":[{"role":"user","content":"Say OK"}],"max_tokens":32,"temperature":0}'
echo
curl -sS -m 45 -w '\nHTTP=%{http_code} TIME=%{time_total}\n' \
  https://api.fireworks.ai/inference/v1/chat/completions \
  -H "Authorization: Bearer ${KEY}" \
  -H 'Content-Type: application/json' \
  -d '{"model":"accounts/fireworks/models/deepseek-v4-flash-0731","messages":[{"role":"user","content":"Say OK"}],"max_tokens":32,"temperature":0}'
echo
