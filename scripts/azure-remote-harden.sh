#!/bin/bash
set -euo pipefail

ENV_FILE="${HOME}/recall/.env"
BACKUP="${HOME}/recall/.env.bak.$(date +%Y%m%d-%H%M%S)"
DOMAIN="${RECALL_DOMAIN:?RECALL_DOMAIN is required}"
CADDY_EMAIL="${CADDY_EMAIL:?CADDY_EMAIL is required}"

cp -a "$ENV_FILE" "$BACKUP"

python3 - "$ENV_FILE" "$DOMAIN" "$CADDY_EMAIL" <<'PY'
import hashlib, os, sys
from urllib.parse import urlparse

path, domain, caddy_email = sys.argv[1], sys.argv[2], sys.argv[3]
raw = open(path, encoding='utf-8', errors='replace').read()
keys = {}
for line in raw.splitlines():
    if not line.strip() or line.strip().startswith('#') or '=' not in line:
        continue
    name, value = line.split('=', 1)
    keys[name] = value

db_url = keys.get('DATABASE_URL', '')
parsed = urlparse(db_url)
if parsed.password and not keys.get('POSTGRES_PASSWORD'):
    keys['POSTGRES_PASSWORD'] = parsed.password

jwt = keys.get('JWT_PRIVATE_KEY', '').replace('\\n', '\n')
if jwt and not keys.get('ENCRYPTION_KEY'):
    keys['ENCRYPTION_KEY'] = hashlib.sha256(jwt.encode()).hexdigest()

keys['EMAIL_DEV_LOG'] = 'false'
keys['RECALL_CORS_ORIGINS'] = 'extension'
keys['RECALL_BIND'] = '127.0.0.1'
keys['RECALL_PORT'] = keys.get('RECALL_PORT') or '7878'
keys['TRUST_PROXY'] = 'true'
keys['PUBLIC_BASE_URL'] = f'https://{domain}'
keys['RECALL_DOMAIN'] = domain
keys['CADDY_EMAIL'] = caddy_email
keys['FIREWORKS_ALLOW_SHARED_KEY'] = keys.get('FIREWORKS_ALLOW_SHARED_KEY') or 'false'
keys['AUTH_LEGACY_API_KEY'] = 'false'

preferred = [
    'POSTGRES_PASSWORD', 'DATABASE_URL', 'JWT_PRIVATE_KEY', 'JWT_PUBLIC_KEY',
    'ENCRYPTION_KEY', 'AUTH_LEGACY_API_KEY', 'AUTH_ALLOW_REGISTRATION',
    'BOOTSTRAP_USER_EMAIL', 'RECALL_BIND', 'RECALL_PORT', 'RECALL_CORS_ORIGINS',
    'TRUST_PROXY', 'PUBLIC_BASE_URL', 'RECALL_DOMAIN', 'CADDY_EMAIL',
    'EMAIL_DEV_LOG', 'FIREWORKS_ALLOW_SHARED_KEY', 'FIREWORKS_API_KEY',
    'FIRECRAWL_API_KEY', 'FIRECRAWL_MAX_CRAWL_PAGES', 'SMTP_HOST', 'SMTP_PORT',
    'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM',
]
seen = set()
lines = []
for name in preferred:
    if name in keys:
        lines.append(f'{name}={keys[name]}')
        seen.add(name)
for name, value in keys.items():
    if name not in seen:
        lines.append(f'{name}={value}')

tmp = path + '.tmp'
with open(tmp, 'w', encoding='utf-8', newline='\n') as handle:
    handle.write('\n'.join(lines) + '\n')
os.replace(tmp, path)
print('env patched')
print(f'PUBLIC_BASE_URL=https://{domain}')
print(f'RECALL_BIND=127.0.0.1')
print(f'EMAIL_DEV_LOG=false')
PY

# Wipe deploy logs and container JSON logs that may contain old auth links.
rm -f "${HOME}/recall-deploy.log"
sudo sh -c 'truncate -s 0 /var/lib/docker/containers/*/*-json.log' 2>/dev/null || true
sudo journalctl --rotate >/dev/null 2>&1 || true
sudo journalctl --vacuum-time=1s >/dev/null 2>&1 || true

cd "${HOME}/recall"
find docker -name '*.sh' -exec sed -i 's/\r$//' {} + 2>/dev/null || true

echo "Rebuilding stack with TLS..."
sudo docker compose --profile tls build
sudo docker compose --profile tls up -d

sleep 20
sudo docker compose --profile tls ps
curl -sf http://127.0.0.1:7878/health && echo " local health ok" || echo " local health pending"
echo "harden script finished"
