# Hosting Recall on Azure VM

Deploy the Phase 2 stack (Postgres + embed + JWT backend v0.7.1) on a Linux VM using Docker Compose.

Account management (v0.7.1): email verification, change password, change email, forgot/reset password.

## Prerequisites

- Ubuntu VM with Docker and Docker Compose v2
- Port **443** (and 80 for ACME) open in the Azure NSG. Keep **7878** closed to the internet.
- SSH key (`recall_key.pem`) for the VM user

## 1. Generate JWT keys (on the VM)

```bash
openssl genrsa -out jwt-private.pem 2048
openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem
```

Keep `jwt-private.pem` secret. For `.env`, paste PEM contents as single lines with `\n` for newlines, or use a secrets manager.

## 2. Create `.env` in the repo root

```env
POSTGRES_PASSWORD=<strong unique password>
DATABASE_URL=postgresql://recall:<same password>@postgres:5432/recall
JWT_PRIVATE_KEY=<paste private PEM>
JWT_PUBLIC_KEY=<paste public PEM>
ENCRYPTION_KEY=<random 32+ byte secret>
AUTH_LEGACY_API_KEY=false
BOOTSTRAP_USER_EMAIL=bootstrap@recall.local
RECALL_BIND=127.0.0.1
RECALL_PORT=7878
RECALL_CORS_ORIGINS=extension
TRUST_PROXY=true
PUBLIC_BASE_URL=https://<your-domain>
EMAIL_DEV_LOG=false
```

Set `EMAIL_DEV_LOG=false` and configure SMTP. Auth links are never returned in API JSON.

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=Recall <noreply@yourdomain.com>
```

## 3. Build and start

```bash
docker compose build
docker compose up -d
docker compose ps
curl -s http://127.0.0.1:7878/health
```

Expect `{"ok":true}`. Authenticated `GET /status` includes version and embed health.

## 4. Account management flows

| Flow | API | Notes |
|------|-----|-------|
| Register | `POST /auth/register` | Sends verification email; user gets tokens but protected routes return `403 email_not_verified` until verified |
| Verify | `GET /auth/verify-email?token=...` or `POST /auth/verify-email` | Link in email points to `PUBLIC_BASE_URL` |
| Resend | `POST /auth/resend-verification` | Requires Bearer token; allowed while unverified |
| Change password | `POST /auth/change-password` | `{ current_password, new_password }` |
| Forgot password | `POST /auth/forgot-password` | `{ email }` — always returns generic message |
| Reset password | `POST /auth/reset-password` | `{ token, new_password }` or HTML form at `/auth/reset-password?token=...` |
| Change email | `POST /auth/change-email` | `{ new_email, current_password }` — confirmation sent to **new** email |
| Confirm email | `GET /auth/confirm-email-change?token=...` | Completes pending email change |

Auth emails are sent over SMTP. `EMAIL_DEV_LOG=true` may log links to the server console for local development only — never on a public host, and never in API responses.

```bash
npm run test:account-mgmt
# Remote: HOST=<vm-ip> npm run test:account-mgmt
```

## 5. Verify auth

```bash
curl -s -X POST http://127.0.0.1:7878/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"password123"}'
```

## 6. Migrate local SQLite library (from your PC)

Postgres is bound to `127.0.0.1:5432` on the VM (not public). Use an SSH tunnel:

```bash
# Terminal 1
ssh -i recall_key.pem -L 5432:127.0.0.1:5432 <vm-user>@<vm-ip>

# Terminal 2 (Windows)
cd backend
set DATABASE_URL=postgresql://recall:<postgres-password>@127.0.0.1:5432/recall
set BOOTSTRAP_USER_EMAIL=bootstrap@recall.local
npm run migrate:sqlite-to-postgres
```

Uses `%USERPROFILE%\.recall\data\recall.db` by default.

## 7. Set bootstrap password

```bash
set DATABASE_URL=postgresql://recall:<postgres-password>@127.0.0.1:5432/recall
npm run set-bootstrap-password -- bootstrap@recall.local your-password-here
```

Sign in via the Chrome extension with that email and password.

## 8. Extension cutover

1. Confirm `recall-extension/shared/defaults.js` → `https://<your-domain>` (or local `http://127.0.0.1:7878`)
2. Reload the extension at `chrome://extensions`
3. Sign in — migrated items appear under the bootstrap account

## Backup before redeploy

```bash
docker compose down
sudo tar -czf recall-backup-$(date +%Y%m%d).tar.gz /var/lib/docker/volumes/
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails on whisper.cpp git clone | Ensure `ca-certificates` is in `backend/Dockerfile` whisper-build stage |
| `JWT_PRIVATE_KEY is not configured` | Set both JWT keys in `.env`; `AUTH_LEGACY_API_KEY=false` requires them |
| Extension gets 401 | Backend must be v0.7.1 with auth routes; reload extension after deploy |
| `email_not_verified` on capture/search | Verify email via link in inbox, or resend from extension Settings |
| No emails arriving | Set SMTP vars. Do not turn on `EMAIL_DEV_LOG` on a public host. |
| Embed unhealthy | First start downloads models — wait 2–3 minutes, check `docker compose logs embed` |

## Optional: HTTPS

Use the Caddy profile once you have a domain:

```bash
RECALL_DOMAIN=recall.example.com CADDY_EMAIL=you@example.com \
  RECALL_BIND=127.0.0.1 TRUST_PROXY=true \
  docker compose --profile tls up -d
```

Set `PUBLIC_BASE_URL=https://recall.example.com`, close port 7878 on the NSG, and restrict `RECALL_CORS_ORIGINS=extension`.

## Remaining operator steps

Code hardening does not replace TLS or secret rotation:

1. Point a domain at the VM and start Caddy (`docker compose --profile tls up -d`).
2. Close inbound **7878** on the Azure NSG so only 80/443 are public.
3. Set SMTP and keep `EMAIL_DEV_LOG=false`.
4. If this Postgres volume was created with password `recall`, keep that password in `.env` until you migrate data — changing `POSTGRES_PASSWORD` does not change an existing volume.
5. After TLS is live, rotate JWTs and re-save Fireworks keys (they were encrypted with the previous key material).
6. RLS `FORCE` does not bind the Docker superuser `recall`. A dedicated `recall_app` role is the next step if you want database-enforced isolation.
