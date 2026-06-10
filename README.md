# Recall

**Personal knowledge capture engine** — browser extension + local backend · 100% on-device

Save anything you find online with one click. Recall transcribes videos locally, generates summaries without LLM APIs, embeds content for semantic search, and stores everything on your machine. No cloud, no API keys, no subscription.

> **Status:** v0.5.0 — Phases 1–5 implemented. Backend daemon, processing pipeline, semantic search, Chrome extension, installers, backups, and system tray are included.

---

## Table of Contents

- [Why Recall](#why-recall)
- [Features](#features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Data Storage](#data-storage)
- [Development](#development)
- [Performance Targets](#performance-targets)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Documentation](#documentation)

---

## Why Recall

Bookmarks and read-later apps make saving easy but finding content later is hard. Recall closes the **capture-to-retrieval gap**:

| Approach | Limitation |
|----------|------------|
| Browser bookmarks | No context, keyword search only |
| Note-taking apps | Manual capture, no auto-processing |
| Read-later apps | No transcription, no semantic search, often cloud-dependent |
| Telegram / chat saves | No structure, scroll-only retrieval |

Recall saves in under a second and lets you find items months later by **meaning**, not just exact keywords — all without sending data off your machine.

---

## Features

- **One-click capture** — Quick-save the current page from the extension popup or `Ctrl+Shift+S` / `Cmd+Shift+S`
- **Optional notes** — Attach your own words at save time; notes drive semantic search for that item
- **Link Vault** — Paste any URL anytime; auto-scrape or save with a manual note
- **Local transcription** — YouTube, X/Twitter, Instagram Reels, TikTok via `yt-dlp` + Whisper.cpp
- **Extractive summarisation** — TF-IDF titles and summaries in under 100ms, no LLM
- **Semantic search** — Natural language queries via ONNX MiniLM embeddings + ChromaDB HNSW
- **Hybrid search** — Semantic results merged with SQLite FTS5 keyword matches
- **Background processing** — Capture is instant; fetch → transcribe → summarise → embed runs async
- **Full search panel** — Dedicated page with filters, transcripts, and keyboard navigation

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   BROWSER (Chrome)                  │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │   Popup UI   │→ │Content script│→ │  Service  │ │
│  │  (3 tabs)    │  │ DOM scraper  │  │  worker   │ │
│  └──────────────┘  └──────────────┘  └─────┬─────┘ │
└────────────────────────────────────────────┼────────┘
                                             │ HTTP POST /capture
                                             ▼
┌─────────────────────────────────────────────────────┐
│           LOCAL BACKEND (localhost:7878)             │
│                                                     │
│  URL classifier → Media fetcher → Whisper.cpp       │
│       → TF-IDF summariser → ONNX embedder           │
└───────────────────────┼─────────────────────────────┘
                        │
          ┌─────────────┼──────────────┐
          ▼             ▼              ▼
   ┌────────────┐ ┌──────────┐ ┌────────────┐
   │   SQLite   │ │ ChromaDB │ │ File store │
   │ (metadata) │ │(vectors) │ │(transcripts│
   │   + FTS5   │ │  HNSW    │ │ thumbnails)│
   └────────────┘ └──────────┘ └────────────┘
```

| Component | Port | Role |
|-----------|------|------|
| Backend daemon | `7878` | HTTP API, job queue, pipeline orchestration |
| Embedding service | `7879` | ONNX MiniLM inference (FastAPI) |
| Chrome extension | — | Capture UI, search, keyboard shortcuts |

### Processing pipeline

1. **Classify** URL → `video` | `article` | `social-post` | `link`
2. **Fetch** — `yt-dlp` (audio), Readability (articles), or Open Graph tags (links)
3. **Transcribe** — Whisper.cpp for video/audio (skipped for articles and manual notes)
4. **Summarise** — TF-IDF extractive title (1 sentence) + summary (5 sentences)
5. **Embed** — 384-dim vector from summary or user note
6. **Store** — SQLite metadata, ChromaDB vector, transcript/thumbnail files

### Why no LLM API

The core pipeline deliberately avoids external LLMs: zero cost, sub-100ms summarisation, full privacy, offline reliability. Optional local LLM features (e.g. via Ollama) may be added later as opt-in enhancements.

---

## Project Structure

```
shubh-database/
├── backend/                 # Local daemon (Node.js)
│   ├── src/                 # server, queue, pipeline, routes, services
│   ├── migrations/          # SQLite schema
│   └── scripts/             # tests, setup, benchmark
│
├── recall-embed/            # Python FastAPI embedding service (port 7879)
│   ├── embed_service.py
│   └── requirements.txt
│
├── recall-extension/        # Chrome Manifest V3 extension
│   ├── popup/ content/ background/ search/ settings/
│   └── shared/              # API client + utilities
│
├── recall-tray/             # System tray (Windows PowerShell + macOS/Linux Python)
├── scripts/                 # Daemon registration (launchd/systemd/Task Scheduler)
├── install.ps1              # Windows one-command installer
├── install.sh               # macOS/Linux one-command installer
├── CONTRIBUTING.md
└── recall-prd-implementation-plan.md
```

User data is stored outside the repository:

```
~/.recall/                   # %USERPROFILE%\.recall\ on Windows
├── data/
│   ├── recall.db            # SQLite + FTS5
│   └── chroma/              # ChromaDB persistent storage
├── transcripts/
│   └── {uuid}.txt
├── thumbnails/
│   └── {uuid}.jpg
├── models/
│   └── minilm.onnx
├── whisper/
│   ├── whisper-cpp binary
│   └── ggml-small.bin
├── backups/
└── logs/
    ├── daemon.log
    └── jobs.log
```

---

## Prerequisites

| Dependency | Purpose |
|------------|---------|
| Node.js 20+ (or Go 1.22+) | Backend daemon and job queue |
| Python 3.10+ | TF-IDF summariser, ONNX embedding service |
| Chrome | Browser extension (Firefox planned) |
| yt-dlp | Audio/video download |
| Whisper.cpp | Local transcription |
| ONNX Runtime | Embedding inference |

---

## Installation

### One-command install

**Windows (PowerShell, from repo root)**

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

**macOS / Linux**

```bash
chmod +x install.sh
./install.sh
```

The installer will:

1. Verify Node.js, Python 3, and yt-dlp
2. Install backend npm dependencies and run migrations
3. Download Whisper.cpp + small model and ONNX MiniLM model
4. Create `~/.recall/` directory structure
5. Register the daemon (Task Scheduler / launchd / systemd)
6. Start the system tray and open `chrome://extensions`

### Manual development setup

```powershell
cd backend
npm install
npm run setup:embed
powershell -ExecutionPolicy Bypass -File scripts/setup-whisper.ps1
npm run migrate
npm start
```

Load the extension: `chrome://extensions` → Developer mode → Load unpacked → `recall-extension/`

### Load the Chrome extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `recall-extension/` directory
5. Pin the Recall icon to the toolbar

---

## Usage

### Quick save (current page)

1. Click the Recall extension icon
2. On the **Capture** tab, click **Quick save**
3. Continue browsing — processing runs in the background

Or press `Ctrl+Shift+S` (Windows/Linux) / `Cmd+Shift+S` (macOS) from any tab.

### Save with a note

1. Open the extension popup on the page you want to save
2. Click **Add note**, type why you're saving it
3. Click **Save with note**

Your note becomes the summary and embedding input, so future searches in your own words find the item.

### Link Vault

1. Open the **Link Vault** tab
2. Paste any URL
3. Choose **Auto-scrape** (full pipeline) or **Write a note** (fast metadata-only save)
4. Click save

### Search

- **Recent tab** — Debounced semantic search over your library; click a result to open the original URL
- **Full search page** — Open from the extension for filters (type, date, save mode), transcript expansion on videos, and keyboard navigation

### Daemon status

The extension footer shows:

- Total items saved
- Local storage used
- Green/red indicator for backend connectivity (`GET /health` on `localhost:7878`)

---

## API Reference

Base URL: `http://localhost:7878`

### `POST /capture`

Save the current page (from extension content script).

```json
{
  "url": "https://example.com/article",
  "title": "Page title",
  "og_title": "Open Graph title",
  "og_description": "Description",
  "og_image": "https://example.com/image.jpg",
  "og_type": "article",
  "domain": "example.com",
  "has_video": false,
  "note": "Optional user note",
  "save_mode": "auto_scrape"
}
```

Returns `{ "id": "<uuid>", "processing": "queued" }`.

### `POST /link`

Save a URL from Link Vault (same body shape as `/capture`).

### `GET /search?q={query}`

Semantic (+ optional hybrid FTS5) search.

| Parameter | Description |
|-----------|-------------|
| `q` | Natural language or keyword query |
| `type` | Filter: `video`, `article`, `link`, `social-post` |
| `since` | ISO date, e.g. `2025-01-01` |
| `mode` | `auto_scrape` or `manual_note` |

Results are re-ranked: `semantic_score × 0.7 + recency × 0.2 + source_boost × 0.1`.

### `GET /items`

List saved items.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `limit` | `20` | Max results |
| `sort` | `created_at` | Sort field |

### `GET /status`

Daemon health and aggregate stats (item count, queue length, storage used, paused, last saved item).

### `GET /status/{id}`

Processing state for a single item: `queued` | `processing` | `done` | `failed`.

### `GET /items/{id}`

Single item detail. Add `?include_transcript=1` for video transcript text.

### `POST /items/{id}/retry`

Re-queue a failed or completed item for reprocessing.

### `GET /jobs/history?days=30`

Job history for the last N days (extension search footer).

### `GET /settings` / `PUT /settings`

Read or update `~/.recall/settings.json` (Whisper model, backups, defaults).

### `POST /queue/pause` / `POST /queue/resume`

Pause or resume background processing (system tray).

### Embedding service (`localhost:7879`)

| Endpoint | Description |
|----------|-------------|
| `POST /embed` | `{ "text": "..." }` → `{ "embedding": [384 floats] }` |
| `GET /health` | Model loaded check |

---

## Data Storage

### SQLite `items` table

| Column | Description |
|--------|-------------|
| `id` | UUID v4 |
| `url` | Original URL |
| `title` | TF-IDF title or first sentence of note |
| `summary` | Top 5 sentences or full note |
| `content` | Full transcript or article body |
| `source_type` | `video` \| `article` \| `link` \| `social-post` |
| `save_mode` | `auto_scrape` \| `manual_note` |
| `processing` | `queued` \| `processing` \| `done` \| `failed` |

Full-text search runs on `title`, `summary`, `content`, and `note` via FTS5.

### ChromaDB

Collection `recall` stores 384-dimensional MiniLM vectors keyed by item UUID.

---

## Development

### Implementation phases

| Phase | Focus | Duration |
|-------|-------|----------|
| 1 | Backend daemon, SQLite, ChromaDB, job queue | Weeks 1–2 |
| 2 | URL classifier, fetch, Whisper, TF-IDF pipeline | Weeks 3–4 |
| 3 | ONNX embeddings, semantic + hybrid search | Weeks 5–6 |
| 4 | Chrome extension (capture, vault, search UI) | Weeks 7–8 |
| 5 | Installers, tray, backups, hardening | Weeks 9–10 ✅ |

See [recall-prd-implementation-plan.md](./recall-prd-implementation-plan.md) for full task breakdowns and acceptance criteria.

### Tech stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js + in-memory job queue (3 retries) |
| Media | yt-dlp, @mozilla/readability |
| Transcription | Whisper.cpp (`ggml-small.bin`) |
| Summarisation | Python TF-IDF (~150 lines) |
| Embeddings | all-MiniLM-L6-v2 (ONNX) via FastAPI |
| Metadata DB | SQLite + FTS5 |
| Vector DB | ChromaDB (embedded, HNSW) |
| Extension | Manifest V3, vanilla JavaScript |

### Verify the backend (Phase 1 milestone)

```bash
curl -X POST http://localhost:7878/capture \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","title":"Test","save_mode":"auto_scrape","source_type":"link","domain":"example.com"}'
```

Confirm the item appears in `~/.recall/data/recall.db` with `processing = 'queued'`.

### Run tests

```bash
cd backend
npm start   # terminal 1

npm run test:phase1
npm run test:phase2
npm run test:phase3
npm run test:phase4
npm run test:phase5
npm run test:classify
```

CI runs `test:classify`, `test:phase1`, and `test:phase5` on every push via `.github/workflows/ci.yml`.

### Search benchmark

```bash
cd backend
npm start   # embed service auto-starts on :7879

# Default: seed to 1000 items, 50 queries
npm run benchmark:search

# Heavier run (10k items target from PRD)
$env:BENCHMARK_ITEMS=10000; npm run benchmark:search
```

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Capture → "saved" confirmation | < 500 ms |
| Article pipeline (fetch + summarise + embed) | < 10 s |
| Video pipeline (10 min, CPU) | < 120 s |
| Search query latency | < 50 ms |
| Search at 100k items | < 50 ms |
| ONNX embedding inference | < 20 ms |
| Daemon memory (idle) | < 150 MB |

Measured on a typical dev machine with 1,000 indexed items: search p50 ~15–40ms, p99 typically under 100ms (run `npm run benchmark:search` on your hardware).

Whisper.cpp uses Metal on macOS and CUDA on Linux/Windows when an NVIDIA GPU is detected (`-ngl 99`).

---

## Troubleshooting

### Extension shows "Daemon offline"

1. Confirm the backend is running: `curl http://localhost:7878/status`
2. Check logs: `~/.recall/logs/daemon.log`
3. Ensure nothing else is bound to port `7878`
4. On Windows, verify the Task Scheduler entry for Recall is enabled

### Video save failed

- Update yt-dlp: `yt-dlp -U`
- Check geo-restrictions or private/unlisted content
- Review `jobs.log` for Whisper timeout (5 min max per job)

### Search returns irrelevant results

- Hybrid mode helps when you remember exact phrases — try quoting terms
- Manual notes embed your words; auto-scrape items embed the TF-IDF summary
- Re-run the backfill embed script if items predate Phase 3

### High disk usage

- Transcripts and thumbnails live in `~/.recall/transcripts/` and `~/.recall/thumbnails/`
- Nightly backups retain 7 days in `~/.recall/backups/` (configurable in Settings)
- Adjust Whisper model size in extension Settings (⚙ icon or `chrome-extension://…/settings/settings.html`)
- Failed jobs show in the popup with a **Retry** button; details in `daemon.log`

---

## Roadmap

**In scope for v1**

- One-click and vault capture
- Local transcription and extractive summaries
- Semantic + keyword hybrid search
- Chrome extension with full search panel

**Planned (post-v1)**

| Feature | Notes |
|---------|-------|
| Collections / folders | Built on `tags` field |
| Export (JSON / Markdown) | Full library export |
| Cross-device sync | Optional self-hosted endpoint |
| Local LLM Q&A | Opt-in via Ollama |
| Firefox extension | Shared codebase |
| PDF capture | Academic papers and documents |
| Highlight capture | Save selected text, not just URLs |
| RSS import | Auto-save from feeds |

---

## Documentation

- **[Product Requirements & Implementation Plan](./recall-prd-implementation-plan.md)** — Full PRD, data schema, API design, and phase-by-phase tasks
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** — Adding new URL classifiers and content handlers

---

## License

License TBD. See repository settings once published.

---

*Recall · Personal knowledge capture · 100% on your machine*
