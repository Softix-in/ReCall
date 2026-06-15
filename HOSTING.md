# Hosting Recall Backend Remotely

Recall was built as a **local-first** app (data stays on your machine). This guide explains how to run the backend on a **VPS or cloud server** so your Chrome extension can reach it when your PC is off.

---

## Important things to know first

| Topic | What it means |
|-------|----------------|
| **Privacy** | Hosted data (URLs, transcripts, notes) lives on **your server**, not your laptop |
| **Processing** | Video transcription (yt-dlp + Whisper) runs **on the server** — needs CPU/RAM/disk |
| **First boot** | Docker downloads ~500MB+ (Whisper + embedding models) — can take several minutes |
| **Security** | Always set `RECALL_API_KEY` on any server reachable from the internet |
| **HTTPS** | Use a reverse proxy (Caddy/nginx) with TLS in production — not plain HTTP |

---

## Architecture when hosted

```
Chrome extension  ──HTTPS──►  Your VPS :443
                                  │
                           Caddy / nginx (TLS)
                                  │
                           Recall backend :7878
                                  │
                           Embed service :7879 (internal)
                                  │
                           Docker volume (SQLite + Chroma + transcripts)
```

Your laptop does **not** need the backend running. The extension talks to your server URL instead of `127.0.0.1:7878`.

---

## Option A — Docker Compose (recommended)

### Requirements

- Linux VPS (2+ GB RAM, 20+ GB disk recommended)
- Docker + Docker Compose
- Domain name (optional but recommended for HTTPS)

### 1. Clone and configure

```bash
git clone <your-repo-url> recall
cd recall
cp .env.example .env
```

Edit `.env`:

```env
RECALL_API_KEY=your-long-random-secret-here
RECALL_PORT=7878
RECALL_CORS_ORIGINS=*
TRUST_PROXY=false
```

Generate a strong API key:

```bash
openssl rand -hex 32
```

### 2. Start services

```bash
docker compose up -d --build
```

First start downloads Whisper + embedding models into the `recall-data` volume. Watch logs:

```bash
docker compose logs -f backend
```

Health check:

```bash
curl http://YOUR_SERVER_IP:7878/health
```

With API key:

```bash
curl -H "X-Recall-API-Key: YOUR_KEY" http://YOUR_SERVER_IP:7878/status
```

### 3. Put HTTPS in front (Caddy example)

`Caddyfile`:

```
recall.example.com {
  reverse_proxy localhost:7878
}
```

Then set in `.env`:

```env
TRUST_PROXY=true
```

Restart compose after changing env.

### 4. Point the Chrome extension at your server

1. Open Recall extension → **Settings**
2. **Server connection** section:
   - **Backend URL:** `https://recall.example.com`
   - **API key:** same as `RECALL_API_KEY`
3. Click **Test connection** → should show `Connected (v0.6.0)`
4. Save connection

Reload the extension at `chrome://extensions` if needed.

---

## Option B — Run on a VPS without Docker

### Backend environment variables

| Variable | Example | Purpose |
|----------|---------|---------|
| `HOST` | `0.0.0.0` | Listen on all interfaces (not just localhost) |
| `PORT` | `7878` | API port |
| `RECALL_HOME` | `/var/recall` | Data directory |
| `RECALL_API_KEY` | `(secret)` | Protects API when exposed |
| `RECALL_CORS_ORIGINS` | `*` | CORS for web clients |
| `EMBED_HOST` | `127.0.0.1` | Embed service host |
| `EMBED_PORT` | `7879` | Embed service port |
| `EMBED_AUTO_START` | `true` | Backend spawns embed service (local install) |

Start embed service (terminal 1):

```bash
cd recall-embed
RECALL_HOME=/var/recall EMBED_HOST=127.0.0.1 python3 embed_service.py
```

Start backend (terminal 2):

```bash
cd backend
npm install
RECALL_HOME=/var/recall HOST=0.0.0.0 RECALL_API_KEY=your-secret node src/server.js
```

Install system deps: `node 20+`, `python 3.10+`, `ffmpeg`, `yt-dlp`, Whisper.cpp (see `install.ps1` / setup scripts).

---

## Option C — Keep using local backend (default)

If you only need Recall when your PC is on:

- Leave extension settings at `http://127.0.0.1:7878`
- Run `npm start` in `backend/` or use the Task Scheduler daemon from `install.ps1`

No API key required locally.

---

## Extension configuration reference

Connection settings are stored in **Chrome extension storage** (on your browser), not on the server:

| Setting | Storage key | Default |
|---------|-------------|---------|
| Backend URL | `recall_api_base` | `http://127.0.0.1:7878` |
| API key | `recall_api_key` | empty |

All API requests send `X-Recall-API-Key` when a key is configured.

---

## API authentication

When `RECALL_API_KEY` is set on the server, every route except `/health` requires:

```
X-Recall-API-Key: your-secret
```

or

```
Authorization: Bearer your-secret
```

---

## Updating / backups

### Docker data volume

All data is in the Docker volume `recall-data`:

```bash
docker compose down
docker run --rm -v recall_recall-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/recall-backup.tar.gz -C /data recall
```

### Server backups

The built-in nightly backup scheduler still runs inside the backend container and writes to `RECALL_HOME/backups/`.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Extension can't connect | Check URL, API key, firewall (open 443 or 7878), HTTPS cert |
| `401 Unauthorized` | API key mismatch between `.env` and extension settings |
| Video saves fail | Server needs `yt-dlp`, `ffmpeg`, Whisper model in volume |
| Slow first Reel | Whisper transcription is CPU-heavy on small VPS |
| Embed service down | `docker compose logs embed` — model download may still be running |
| CORS errors from a web UI | Set `RECALL_CORS_ORIGINS` to your site origin |

---

## Cost & sizing guide

| Usage | Suggested VPS |
|-------|----------------|
| Links + articles only | 1 GB RAM, 1 vCPU |
| Regular Reels / YouTube | 4 GB RAM, 2 vCPU |
| Large library + search | 4+ GB RAM, 20+ GB SSD |

---

## What hosting does **not** change

- You still use the **Chrome extension** to capture pages
- Search UI is still the extension search page
- No multi-user accounts yet — one API key = one shared library
- Data is on **your** server, not Recall's cloud (there is no Recall cloud)

---

## Quick checklist

- [ ] Generate `RECALL_API_KEY`
- [ ] `docker compose up -d --build`
- [ ] HTTPS reverse proxy in production
- [ ] Open firewall for 443 (not raw 7878 publicly if avoidable)
- [ ] Extension → Settings → server URL + API key
- [ ] Test save from extension
- [ ] Rotate API key if it was ever shared
