# Hosting Recall on Azure VM

Deploy the Phase 2 stack (Postgres + embed + JWT backend v0.7.1) on a Linux VM using Docker Compose.

Account management (v0.7.1): email verification, change password, change email, forgot/reset password.

## Prerequisites

- Ubuntu VM with Docker and Docker Compose v2
- Port **7878** open in the Azure NSG
- SSH key (`recall_key.pem`) for the VM user

## 1. Generate JWT keys (on the VM)

```bash
openssl genrsa -out jwt-private.pem 2048
openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem
```

Keep `jwt-private.pem` secret. For `.env`, paste PEM contents as single lines with `\n` for newlines, or use a secrets manager.

## 2. Create `.env` in the repo root

```env
DATABASE_URL=postgresql://recall:recall@postgres:5432/recall
JWT_PRIVATE_KEY=<paste private PEM>
JWT_PUBLIC_KEY=<paste public PEM>
AUTH_LEGACY_API_KEY=false
BOOTSTRAP_USER_EMAIL=bootstrap@recall.local
RECALL_PORT=7878
RECALL_CORS_ORIGINS=*
TRUST_PROXY=false
PUBLIC_BASE_URL=http://<vm-ip>:7878
EMAIL_DEV_LOG=true
```

Set `EMAIL_DEV_LOG=false` and configure SMTP for production email delivery:

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

Expect `"version":"0.7.1"` and embed `ok: true`.

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

With `EMAIL_DEV_LOG=true`, verification/reset/confirm URLs are returned in API responses and logged to the backend container (`docker compose logs backend`).

```bash
npm run test:account-mgmt
# Remote: HOST=40.81.245.21 npm run test:account-mgmt
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
ssh -i recall_key.pem -L 5432:127.0.0.1:5432 shubh-memory@40.81.245.21

# Terminal 2 (Windows)
cd backend
set DATABASE_URL=postgresql://recall:recall@127.0.0.1:5432/recall
set BOOTSTRAP_USER_EMAIL=bootstrap@recall.local
npm run migrate:sqlite-to-postgres
```

Uses `%USERPROFILE%\.recall\data\recall.db` by default.

## 7. Set bootstrap password

```bash
set DATABASE_URL=postgresql://recall:recall@127.0.0.1:5432/recall
npm run set-bootstrap-password -- bootstrap@recall.local your-password-here
```

Sign in via the Chrome extension with that email and password.

## 8. Extension cutover

1. Confirm `recall-extension/shared/defaults.js` → `http://<vm-ip>:7878`
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
| No emails arriving | Set SMTP vars or use `EMAIL_DEV_LOG=true` and copy URLs from API/logs |
| Embed unhealthy | First start downloads models — wait 2–3 minutes, check `docker compose logs embed` |

## Optional: HTTPS

Put Caddy or nginx in front of port 7878, set `TRUST_PROXY=true`, and restrict `RECALL_CORS_ORIGINS` to your `chrome-extension://` origin.
