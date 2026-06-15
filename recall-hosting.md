# Hosting Recall Backend Remotely

Use this guide when you want Recall to work **even when your PC is off** — the backend runs on a server (VPS, home server, etc.) and your Chrome extension talks to it over the internet.

---

## What changes when you host remotely?

| Before (local) | After (hosted) |
|----------------|----------------|
| Backend on `127.0.0.1:7878` | Backend on `https://your-server.com` |
| Data in `~/.recall/` on your PC | Data on the server disk |
| No login needed | **API key required** (you set it) |
| Whisper + yt-dlp on your PC | Whisper + yt-dlp on the server |

Your **Chrome extension stays on your browser** — only the backend moves to the server.

---

## Recommended setup

**Best option:** A small **VPS** (2+ GB RAM, 2 vCPU) — e.g. Hetzner, DigitalOcean, Linode.

Why not free serverless (Vercel, Netlify)? Recall needs:
- Long-running video downloads (yt-dlp)
- Whisper transcription (CPU-heavy, minutes per video)
- Persistent disk (SQLite + ChromaDB + transcript files)

That does not fit serverless platforms.

---

## Quick start with Docker

### 1. Get a server

- Ubuntu 22.04+ or Debian 12+
- Install Docker + Docker Compose

```bash
curl -fsSL https://get.docker.com | sh
```

### 2. Clone the repo on the server

```bash
git clone <your-repo-url> recall
cd recall
```

### 3. Configure secrets

```bash
cp .env.example .env
nano .env
```

Set a strong API key:

```env
RECALL_API_KEY=your-long-random-secret-here
RECALL_PORT=7878
CORS_ORIGIN=*
```

Generate a key:

```bash
openssl rand -hex 32
```

### 4. Start services

```bash
docker compose up -d --build
```

This starts two containers:

| Service | Role |
|---------|------|
| **backend** | Node.js API on port 7878 — capture, pipeline, search |
| **embed** | Python embed service (internal only) — vectors for semantic search |

Data is stored in Docker volume `recall-data` (SQLite, ChromaDB, transcripts, thumbnails, Whisper models).

### 5. Verify

```bash
curl http://YOUR_SERVER_IP:7878/health
```

Expected: `{"ok":true,"service":"recall-backend",...}`

With API key:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" http://YOUR_SERVER_IP:7878/status
```

### 6. Put HTTPS in front (recommended)

Do **not** expose plain HTTP to the public internet long-term. Use one of:

- **Caddy** or **Nginx** reverse proxy + Let's Encrypt
- **Cloudflare Tunnel** (no open ports)
- **Tailscale** (private VPN — only your devices can reach the server)

Example Caddy (`/etc/caddy/Caddyfile`):

```
recall.yourdomain.com {
  reverse_proxy localhost:7878
}
```

Then your backend URL becomes `https://recall.yourdomain.com`.

---

## Connect the Chrome extension

1. Open Recall extension **Settings** (right-click extension → Options)
2. Under **Backend connection**:
   - **Backend URL:** `https://recall.yourdomain.com` (no trailing slash)
   - **API key:** same value as `RECALL_API_KEY` on the server
3. Click **Save settings** — it checks `/health` and confirms connection

Local backend still works: leave URL as `http://127.0.0.1:7878` and API key empty.

---

## Environment variables (backend)

| Variable | Default | Purpose |
|----------|---------|---------|
| `HOST` | `127.0.0.1` | Bind address (`0.0.0.0` in Docker) |
| `PORT` | `7878` | HTTP port |
| `RECALL_HOME` | `~/.recall` | All data files |
| `RECALL_API_KEY` | (empty) | If set, all routes except `/health` require this key |
| `CORS_ORIGIN` | `*` | Allowed browser origins |
| `EMBED_HOST` | `127.0.0.1` | Embed service hostname (`embed` in Docker) |
| `EMBED_PORT` | `7879` | Embed service port |
| `EMBED_AUTO_START` | `true` | Set `false` when embed runs in separate container |

Auth header (either works):

```
Authorization: Bearer YOUR_API_KEY
X-Recall-Api-Key: YOUR_API_KEY
```

---

## What runs on the server (full pipeline)

Same as local — nothing is stripped down:

1. Extension sends `POST /capture`
2. Backend queues job
3. **yt-dlp** downloads audio (Reels, YouTube, etc.)
4. **Whisper.cpp** transcribes
5. **Readability** / OG scraping for articles
6. **TF-IDF** summary (Python)
7. **ONNX MiniLM** embedding → ChromaDB
8. SQLite stores metadata

First video on a fresh server may be slow while Whisper model downloads (~500 MB for `small`).

---

## Updating / backups

```bash
cd recall
git pull
docker compose up -d --build
```

Backup the Docker volume:

```bash
docker run --rm -v recall_recall-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/recall-backup-$(date +%F).tar.gz -C /data .
```

---

## Alternative: tunnel local backend (no VPS)

If you only need access when away from home but usually run locally:

1. Keep backend on your PC
2. Use **Cloudflare Tunnel** or **Tailscale** to reach `localhost:7878` remotely
3. No Docker migration — extension points to tunnel URL

Good when your PC is on; hosted VPS is better when the PC is off.

---

## Security checklist

- [ ] Set `RECALL_API_KEY` to a long random value
- [ ] Use HTTPS in production
- [ ] Do not expose embed port 7879 publicly (Docker compose keeps it internal)
- [ ] Firewall: only 443 (or 7878 if no reverse proxy)
- [ ] Rotate API key if leaked
- [ ] Your library is personal data — treat the server like a private database

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `401 Unauthorized` | Wrong API key in extension settings |
| `Failed to fetch` | HTTPS mixed content, CORS, or server down |
| Extension can't connect | Check URL has no trailing slash; reload extension |
| Transcription fails | Server needs ffmpeg; check `docker compose logs backend` |
| Semantic search empty | Embed container unhealthy — `docker compose logs embed` |
| Slow first save | Whisper model downloading on first run |

View logs:

```bash
docker compose logs -f backend
docker compose logs -f embed
```

---

## Files added for hosting

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Orchestrates backend + embed |
| `docker/Dockerfile.backend` | Node + Python + yt-dlp + Whisper |
| `docker/Dockerfile.embed` | Python embed + ChromaDB |
| `docker/entrypoint-backend.sh` | Migrations + start server |
| `.env.example` | Template for secrets |
| `backend/src/middleware/security.js` | CORS + API key auth |
| Extension settings | Backend URL + API key in Chrome storage |

---

*Local-first by design — hosting is optional. You can always switch back to `http://127.0.0.1:7878` in extension settings.*
