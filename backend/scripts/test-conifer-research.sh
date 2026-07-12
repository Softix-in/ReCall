#!/usr/bin/env bash
set -euo pipefail

BASE=http://127.0.0.1:7878
EMAIL="conifer-test@recall.local"
PASS="TestPass123!"
WORKDIR=/tmp/conifer-research-test
mkdir -p "$WORKDIR"
cd ~/recall

echo "== health =="
curl -s -m 10 "$BASE/health"; echo

echo "== register =="
curl -s -m 20 -X POST "$BASE/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" > "$WORKDIR/reg.json" || true
head -c 400 "$WORKDIR/reg.json"; echo

echo "== verify email in db =="
sudo docker compose exec -T postgres \
  psql -U recall -d recall -c "UPDATE users SET email_verified=true, email_verified_at=(EXTRACT(EPOCH FROM now())*1000)::bigint WHERE email='$EMAIL';" || true

echo "== login =="
curl -s -m 20 -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" > "$WORKDIR/login.json"
head -c 400 "$WORKDIR/login.json"; echo

TOKEN=$(python3 -c 'import json; d=json.load(open("/tmp/conifer-research-test/login.json")); print(d.get("access_token") or (d.get("tokens") or {}).get("access_token") or "")')
if [ -z "$TOKEN" ]; then
  echo "No access token"; cat "$WORKDIR/login.json"; exit 1
fi
echo "token_ok len=${#TOKEN}"

echo "== fetch conifer page =="
curl -sL -m 30 -A 'RecallBot/0.1' https://www.conifer.build/ > "$WORKDIR/page.html" || true
python3 - <<'PY'
import json, re
from pathlib import Path
html = Path('/tmp/conifer-research-test/page.html').read_text(errors='ignore')
text = re.sub(r'<script[\s\S]*?</script>', ' ', html, flags=re.I)
text = re.sub(r'<style[\s\S]*?</style>', ' ', text, flags=re.I)
text = re.sub(r'<[^>]+>', ' ', text)
text = re.sub(r'\s+', ' ', text).strip()[:12000]
payload = {
  "trigger_url": "https://www.conifer.build/",
  "trigger_type": "company_website",
  "note": "Local-first inference marketplace / private superintelligence routing",
  "tags": ["AI infra", "local LLM", "inference routing"],
  "extracted": {
    "company_name": "Conifer",
    "website": "https://www.conifer.build/",
    "short_description": "Local-first inference routing — every model, one bill. Towards private superintelligence.",
    "industry": "AI infrastructure",
    "og_description": "The front door to all inference",
    "visible_text": text,
  },
}
Path('/tmp/conifer-research-test/payload.json').write_text(json.dumps(payload))
print('payload_bytes', Path('/tmp/conifer-research-test/payload.json').stat().st_size)
PY

echo "== research start =="
curl -s -m 60 -X POST "$BASE/research/startups" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d @"$WORKDIR/payload.json" > "$WORKDIR/start.json"
cat "$WORKDIR/start.json"; echo

JOB_ID=$(python3 -c 'import json; print(json.load(open("/tmp/conifer-research-test/start.json")).get("research_job_id",""))')
COMPANY_ID=$(python3 -c 'import json; print(json.load(open("/tmp/conifer-research-test/start.json")).get("company_id",""))')
echo "job=$JOB_ID company=$COMPANY_ID analysis_model=$(python3 -c 'import json; print(json.load(open("/tmp/conifer-research-test/start.json")).get("analysis_model",""))')"

if [ -z "$JOB_ID" ]; then
  echo "research start failed"
  exit 1
fi

for i in $(seq 1 48); do
  sleep 5
  curl -s -m 20 -H "Authorization: Bearer $TOKEN" "$BASE/research/jobs/$JOB_ID" > "$WORKDIR/job.json"
  python3 - <<'PY'
import json
j=json.load(open('/tmp/conifer-research-test/job.json'))
job=j.get('job') or {}
print(job.get('status'), '|', (job.get('progress') or {}).get('step'), '|', (job.get('error_message') or '')[:120])
open('/tmp/conifer-research-test/state.txt','w').write(job.get('status') or '')
PY
  STATE=$(cat "$WORKDIR/state.txt")
  case "$STATE" in
    completed|failed|needs_review) break ;;
  esac
done

echo "== company detail =="
curl -s -m 30 -H "Authorization: Bearer $TOKEN" "$BASE/research/companies/$COMPANY_ID" > "$WORKDIR/detail.json"
python3 - <<'PY'
import json
d=json.load(open('/tmp/conifer-research-test/detail.json'))
c=d.get('company') or {}
a=d.get('analysis') or {}
print('name:', c.get('name'))
print('status:', c.get('status'))
print('website:', c.get('website'))
print('pages:', len(d.get('pages') or []))
print('news:', len(d.get('news') or []))
print('founders:', len(d.get('founders') or []))
print('one_line:', (a.get('one_line_understanding') or '')[:300])
print('problem:', (a.get('problem_statement') or '')[:300])
print('why_now:', (a.get('why_now') or '')[:300])
print('adjacent:', (a.get('adjacent_opportunities') or '')[:300])
print('opportunity_score:', a.get('opportunity_score'))
print('personal_fit_score:', a.get('personal_fit_score'))
print('ai_angle:', (a.get('ai_or_deeptech_angle') or '')[:250])
print('insight:', (a.get('insight_summary') or '')[:300])
print('jobs:', [(j.get('status'), (j.get('progress') or {}).get('step'), j.get('error_message')) for j in (d.get('jobs') or [])[:2]])
PY

echo "== backend logs (research) =="
sudo docker compose logs backend --tail 40 | grep -i research || sudo docker compose logs backend --tail 20
