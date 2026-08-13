#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:7878}"
EMAIL="doctest-$(date +%s)@example.com"
PASS="DocTest12345!"

echo "=== Register test user: $EMAIL ==="
REG=$(curl -s -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
echo "$REG" | head -c 300; echo

TOKEN=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")
if [ -z "$TOKEN" ]; then
  echo "No token from register; trying login with bootstrap"
  REG=$(curl -s -X POST "$BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"bootstrap@recall.local","password":"RecallTest123!"}')
  TOKEN=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" || true)
fi

if [ -z "$TOKEN" ]; then
  echo "FAIL: could not obtain access token"
  exit 1
fi
echo "Token acquired (${#TOKEN} chars)"

echo "=== Verify test user email (test helper) ==="
cd ~/recall && sudo docker compose exec -T postgres psql -U recall -d recall -c "UPDATE users SET email_verified = true, email_verified_at = extract(epoch from now())::bigint * 1000 WHERE email = '$EMAIL';" >/dev/null

echo "=== Doc extract capture ==="
CAP=$(curl -s -X POST "$BASE/capture" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"url":"https://docs.firecrawl.dev/features/scrape","title":"Firecrawl scrape docs","save_mode":"doc_extract","source_type":"documentation"}')
echo "$CAP"
ITEM_ID=$(echo "$CAP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")
if [ -z "$ITEM_ID" ]; then
  echo "FAIL: capture did not return item id"
  exit 1
fi

echo "=== Wait for item $ITEM_ID ==="
PROC=""
for i in $(seq 1 60); do
  ST=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/status/$ITEM_ID")
  PROC=$(echo "$ST" | python3 -c "import sys,json; print(json.load(sys.stdin).get('processing',''))")
  echo "attempt $i: $PROC"
  if [ "$PROC" = "done" ] || [ "$PROC" = "failed" ]; then
    break
  fi
  sleep 4
done

ITEM=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/items/$ITEM_ID")
echo "$ITEM" | python3 -c "
import json, sys
item = json.load(sys.stdin)['item']
print('source_type:', item.get('source_type'))
print('save_mode:', item.get('save_mode'))
print('processing:', item.get('processing'))
print('summary:', (item.get('summary') or '')[:160])
content = item.get('content') or ''
print('content_has_sections:', 'sections:' in content)
print('content_len:', len(content))
print('error:', item.get('error_message'))
if item.get('processing') != 'done' or 'sections:' not in content:
    raise SystemExit(1)
"

echo "PASS doc extract single page"

echo "=== Knowledge crawl (max 2 pages) ==="
CRAWL=$(curl -s -X POST "$BASE/knowledge/crawl" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"seed_url":"https://docs.firecrawl.dev/features/scrape","path_filter":"/features","max_pages":2}')
echo "$CRAWL"
JOB_ID=$(echo "$CRAWL" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")
if [ -z "$JOB_ID" ]; then
  echo "FAIL: crawl job not started"
  exit 1
fi

for i in $(seq 1 60); do
  JOB=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/knowledge/jobs/$JOB_ID")
  echo "$JOB" | python3 -c "
import json, sys
j = json.loads(sys.stdin.read())['job']
print(f\"crawl status={j.get('status')} saved={j.get('pages_saved')} found={j.get('pages_found')} err={j.get('error_message')}\")
sys.exit(0 if j.get('status') in ('done', 'failed') else 1)
" && break
  sleep 5
done

JOB=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/knowledge/jobs/$JOB_ID")
echo "$JOB" | python3 -c "
import json, sys
j = json.loads(sys.stdin.read())['job']
print('final:', j.get('status'), j.get('pages_saved'), j.get('error_message'))
if j.get('status') != 'done' or (j.get('pages_saved') or 0) < 1:
    raise SystemExit(1)
"

echo "PASS knowledge crawl"
echo "ALL TESTS PASSED"
