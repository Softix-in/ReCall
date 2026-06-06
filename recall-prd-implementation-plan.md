# Recall — Product Requirements Document & Implementation Plan

> Personal knowledge capture engine · Browser extension + local backend · 100% on-device

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Non-Goals](#3-goals--non-goals)
4. [Core Features](#4-core-features)
5. [System Architecture](#5-system-architecture)
6. [Data Schema](#6-data-schema)
7. [Processing Pipeline](#7-processing-pipeline)
8. [Semantic Search Design](#8-semantic-search-design)
9. [Browser Extension Design](#9-browser-extension-design)
10. [Tech Stack](#10-tech-stack)
11. [Implementation Plan — Phase by Phase](#11-implementation-plan--phase-by-phase)
12. [Performance Targets](#12-performance-targets)
13. [Future Scope](#13-future-scope)

---

## 1. Product Overview

**Recall** is a personal knowledge capture engine that runs entirely on your local machine. It is a browser extension paired with a local backend daemon that lets you save any piece of content you encounter online — a YouTube video, a blog post, a tweet thread, a random link — with a single click or a URL paste.

Every saved item is automatically transcribed (if it contains audio), summarised using extractive NLP, embedded as a semantic vector, and stored in a local database. At any point in the future, you can search your entire library by natural language meaning — not just keywords — and find what you need in under 50ms.

Nothing leaves your machine. No cloud, no API keys, no subscription.

---

## 2. Problem Statement

Knowledge workers, developers, and students consume large amounts of valuable content daily — system design videos, technical blog posts, documentation, social media threads. The current solutions for saving this content are fragmented and inadequate:

| Current approach | Problem |
|---|---|
| Telegram channels | No search, no structure, scroll-only retrieval |
| Browser bookmarks | No context, no summary, keyword search only |
| Note-taking apps | Manual effort to capture, no auto-processing |
| Read-later apps | No transcription, no semantic search, cloud-dependent |

The core problem is a **capture-to-retrieval gap**: saving content takes 1 second, finding it 3 months later takes 20 minutes — or it never gets found at all.

---

## 3. Goals & Non-Goals

### Goals

- Save any web content with one click or one URL paste
- Automatically transcribe video/audio content locally
- Auto-generate a meaningful title and summary without LLM API calls
- Store everything in a local, fast, semantically searchable database
- Retrieve any saved item by natural language query in under 50ms
- Require zero cloud dependency — everything runs on the user's machine
- Provide a clean, minimal browser extension UI

### Non-Goals

- Cloud sync (out of scope for v1 — listed as optional future scope)
- Mobile app
- Collaborative/shared libraries
- Real-time screen monitoring or passive capture
- AI-generated summaries using external LLMs (deliberately avoided to keep cost and latency zero)

---

## 4. Core Features

### 4.1 One-Click Capture

While browsing any page, the user clicks the Recall extension icon and hits **Quick save**. The content script scrapes the current page's URL, title, and metadata. The service worker fires a job to the local backend. The popup immediately shows a "processing" status and the user continues browsing. Transcription and summarisation happen asynchronously in the background.

A keyboard shortcut (`Ctrl+Shift+S` / `Cmd+Shift+S`) triggers quick-save without opening the popup.

### 4.2 Optional Note on Capture

Before saving the current page, the user can click **Add note** and type a short description of why they're saving it or what they want to remember. This note is stored alongside the auto-generated summary. For manual notes, the note text is used as the embedding input (instead of the auto-summary), so searching in the user's own words finds the item.

### 4.3 Link Vault

A dedicated tab in the extension popup where the user can paste any URL at any time — not just while on that page. Two save modes:

- **Auto-scrape mode** — the backend fetches the page, runs the full pipeline (extract → transcribe → summarise → embed), and stores the result
- **Write a note mode** — the user provides their own description. The backend only fetches og:title and og:image for metadata; the note becomes the summary and the embedding input

### 4.4 Local Transcription

Video URLs (YouTube, Twitter/X, Instagram Reels, TikTok) are handled by downloading audio-only via `yt-dlp`, then transcribing with **Whisper.cpp** — a compiled C++ binary that runs on-device with no API calls. The small Whisper model (75MB) transcribes a 10-minute video in approximately 45 seconds on CPU, and significantly faster on GPU.

Output is a timestamped transcript stored as a `.txt` file. The transcript is also the input for the summariser.

### 4.5 Extractive Summarisation

A pure TF-IDF (Term Frequency–Inverse Document Frequency) sentence scoring algorithm generates summaries and titles — no LLM, no API, no cost. The algorithm:

1. Tokenises the transcript or article body into sentences
2. Scores each sentence by TF-IDF weight of its terms
3. Applies positional bias (first and last sentences score higher)
4. Removes stopwords
5. Returns the top-scoring sentence as the **title** and the top 5 as the **summary**

For manual notes, the first sentence of the note becomes the title. The full note is the summary.

### 4.6 Semantic Search

The search bar in the extension accepts natural language queries. The same ONNX embedding model used at save time embeds the query, then Chroma's HNSW index finds the top-20 nearest items by cosine similarity. A SQLite join fetches full metadata for those items and returns ranked results.

Search also supports hybrid mode: semantic results are merged with SQLite FTS5 keyword results and deduplicated. This handles cases where the user remembers an exact phrase.

### 4.7 Full-Page Search Panel

A dedicated full-screen search page (accessible via the extension or a keyboard shortcut) shows results with full context: title, summary excerpt, source type badge, save date, and a link back to the original URL. Video results can be expanded inline to read the full transcript.

Filters: source type (video / article / link), date range, save mode (auto / manual note).

### 4.8 Job Queue and Background Processing

Capture is always instant — the extension sends a job to the local backend and immediately returns a "saved" state. Processing (fetch → transcribe → summarise → embed) happens in a background async queue. Failed jobs are surfaced in the extension UI with a retry button. The queue persists across daemon restarts.

---

## 5. System Architecture

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
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │   URL    │→│  Media   │→│Transcribe│→│Summarise│ │
│  │classifier│ │ fetcher  │ │(Whisper) │ │(TF-IDF)│ │
│  └──────────┘ └──────────┘ └──────────┘ └───┬────┘ │
│                                              │      │
│                        ┌─────────────────────┘      │
│                        ▼                            │
│              ┌─────────────────┐                    │
│              │Embedding engine │                    │
│              │ (ONNX MiniLM)   │                    │
│              └────────┬────────┘                    │
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

### Layer responsibilities

| Layer | Responsibility |
|---|---|
| Extension popup | User-facing capture and search UI |
| Content script | Scrapes current page DOM and metadata |
| Service worker | Queues jobs, communicates with local backend |
| Local backend | Orchestrates pipeline, hosts HTTP API |
| URL classifier | Determines content type: video / article / post / link |
| Media fetcher | Downloads audio (yt-dlp) or extracts article text (Readability) |
| Whisper.cpp | Local audio transcription — no API |
| TF-IDF summariser | Extractive title and summary generation — no LLM |
| ONNX embedding engine | Converts text to 384-dim semantic vectors |
| SQLite + FTS5 | Stores metadata, enables keyword search |
| ChromaDB + HNSW | Stores vectors, enables semantic search |
| File store | Raw transcript `.txt` files and thumbnails |

---

## 6. Data Schema

### SQLite — `items` table

```sql
CREATE TABLE items (
  id            TEXT PRIMARY KEY,          -- UUID v4
  url           TEXT NOT NULL,             -- original URL
  title         TEXT,                      -- auto-generated OR first sentence of note
  summary       TEXT,                      -- TF-IDF top-5 sentences OR full note text
  content       TEXT,                      -- full transcript or article body (nullable)
  source_type   TEXT NOT NULL,             -- 'video' | 'article' | 'link' | 'social-post'
  save_mode     TEXT NOT NULL,             -- 'auto_scrape' | 'manual_note'
  note          TEXT,                      -- user's own words (nullable)
  tags          TEXT,                      -- comma-separated, auto + user-editable
  domain        TEXT,                      -- e.g. 'youtube.com'
  thumbnail     TEXT,                      -- relative path to thumbnail file
  transcript    TEXT,                      -- relative path to transcript .txt file
  processing    TEXT NOT NULL DEFAULT 'queued', -- 'queued' | 'processing' | 'done' | 'failed'
  created_at    INTEGER NOT NULL,          -- Unix timestamp
  processed_at  INTEGER                    -- Unix timestamp, set when pipeline completes
);

-- Full-text search virtual table
CREATE VIRTUAL TABLE items_fts USING fts5(
  title, summary, content, note,
  content=items, content_rowid=rowid
);

-- Indexes
CREATE INDEX idx_items_created ON items(created_at DESC);
CREATE INDEX idx_items_source  ON items(source_type);
CREATE INDEX idx_items_domain  ON items(domain);
CREATE INDEX idx_items_processing ON items(processing);
```

### ChromaDB — `recall` collection

```
Collection: recall
  id:        item UUID (matches SQLite id)
  embedding: 384-dim float32 vector (MiniLM-L6-v2)
  metadata:  { source_type, domain, created_at, save_mode }
  document:  summary text used to generate the embedding
```

### File store — directory layout

```
~/.recall/
  data/
    recall.db          ← SQLite database
    chroma/            ← ChromaDB persistent storage
  transcripts/
    {uuid}.txt         ← raw Whisper output, one per video
  thumbnails/
    {uuid}.jpg         ← og:image or video thumbnail
  logs/
    daemon.log
    jobs.log
```

---

## 7. Processing Pipeline

### Pipeline stages

```
Input (URL + optional note)
        │
        ▼
┌─────────────────────────┐
│  1. URL Classifier      │  → source_type: video | article | link | social-post
└──────────┬──────────────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
 video          article / link
    │             │
    ▼             ▼
yt-dlp        Readability
(audio only)  (body text)
    │             │
    ▼             │
Whisper.cpp       │
(transcript)      │
    │             │
    └──────┬──────┘
           ▼
┌─────────────────────────┐
│  2. TF-IDF Summariser   │  → title (1 sentence), summary (5 sentences)
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│  3. ONNX Embedder       │  → 384-dim vector
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│  4. Storage             │  → SQLite (metadata) + ChromaDB (vector) + File store
└─────────────────────────┘
```

### URL Classifier rules

| Pattern | source_type | Fetch method |
|---|---|---|
| youtube.com, youtu.be | video | yt-dlp (audio) |
| twitter.com, x.com + has video | video | yt-dlp (audio) |
| instagram.com/reels/ | video | yt-dlp (audio) |
| tiktok.com | video | yt-dlp (audio) |
| twitter.com, x.com (text only) | social-post | og:description |
| Medium, Substack, dev.to, personal blogs | article | Readability |
| Everything else | link | og:title + og:description |

### Manual note path (fast — no fetch)

```
Input (URL + user note)
        │
        ▼
  Fetch og:title + og:image only
        │
        ▼
  title = first sentence of note
  summary = full note text
        │
        ▼
  ONNX Embedder (embed the note text)
        │
        ▼
  SQLite + ChromaDB + File store
```

Total time for manual note save: under 500ms.

---

## 8. Semantic Search Design

### How it works

1. User types a query in the search bar
2. The same ONNX MiniLM model embeds the query to a 384-dim vector (~15ms)
3. ChromaDB's HNSW index finds top-20 nearest items by cosine similarity (~2ms)
4. A SQLite join fetches full metadata for those 20 item IDs
5. Results are re-ranked by a weighted score: `semantic_score * 0.7 + recency_score * 0.2 + source_type_boost * 0.1`
6. Returned to the extension UI

### Hybrid search (semantic + keyword)

When the user's query contains exact phrases (quoted or detected as specific terms), both search modes run in parallel:

```
query → [ONNX embed]  → ChromaDB ANN  → top-20 semantic results ─┐
      → [FTS5 match]  → SQLite FTS5   → top-20 keyword results  ─┴→ merge + dedupe → top-10
```

Deduplication is by item UUID. Scores are normalised and combined before ranking.

### Time complexity

| Operation | Complexity | Expected latency |
|---|---|---|
| ONNX embedding | O(1) | ~15ms |
| HNSW ANN search | O(log n) | ~2ms for 100k items |
| SQLite metadata join | O(k) where k=20 | ~1ms |
| FTS5 keyword search | O(log n) | ~3ms |
| Total end-to-end | O(log n) | **< 50ms** |

### Why HNSW over brute-force

Brute-force cosine similarity over 100k items (each 384 floats) = 38.4M multiply-add operations per query. At ~500 GFLOPS on a typical laptop CPU, that's ~0.08ms — actually viable, but HNSW is still preferred because:

- Scales to 10M+ items without degradation
- ChromaDB manages the index automatically
- Approximate (not exact) — acceptable since top-20 semantic matches are rarely order-sensitive at this granularity

---

## 9. Browser Extension Design

### Manifest V3 structure

```
recall-extension/
  manifest.json          ← Manifest V3
  popup/
    popup.html
    popup.js
    popup.css
  content/
    content.js           ← DOM scraper, injected into every page
  background/
    service-worker.js    ← job queue, HTTP client, keyboard shortcut handler
  search/
    search.html          ← full-page search panel
    search.js
  icons/
    icon-16.png
    icon-48.png
    icon-128.png
```

### Permissions required

```json
{
  "permissions": ["activeTab", "storage", "scripting", "commands"],
  "host_permissions": ["http://localhost:7878/*"],
  "background": { "service_worker": "background/service-worker.js" },
  "commands": {
    "quick-save": {
      "suggested_key": { "default": "Ctrl+Shift+S", "mac": "Command+Shift+S" },
      "description": "Quick-save current page to Recall"
    }
  }
}
```

### Extension UI tabs

**Tab 1 — Capture**
- Current page card: thumbnail, title, URL
- Quick save button (instant, background processing)
- Add note toggle → textarea → Save with note button
- Processing status badge (queued / processing / done / failed)

**Tab 2 — Link Vault**
- URL text input with clipboard paste button
- Mode toggle: Auto-scrape | Write a note
- Auto-scrape hint (explains what will happen)
- Note textarea (shown in note mode)
- Save button with label that changes by mode

**Tab 3 — Recent**
- Semantic search bar
- Last 20 saves as a scrollable list
- Each item: type icon, title, domain, time ago, source badge
- Click opens original URL

**Footer (persistent)**
- Total items saved
- Local storage used
- Daemon connection status

### Content script — what it scrapes

```javascript
{
  url: window.location.href,
  title: document.title,
  og_title: og('og:title'),
  og_description: og('og:description'),
  og_image: og('og:image'),
  og_type: og('og:type'),       // 'video', 'article', etc.
  domain: window.location.hostname,
  has_video: !!document.querySelector('video')
}
```

---

## 10. Tech Stack

| Component | Technology | Reason |
|---|---|---|
| Backend runtime | Node.js (or Go) | Node for faster start; Go for better concurrency and single binary |
| Job queue | BullMQ (Node) / goroutine channels (Go) | Persistent, retry-aware async queue |
| Media download | yt-dlp | Handles YouTube, Instagram, TikTok, Twitter/X — no API needed |
| Article extraction | @mozilla/readability (Node port) | Same parser Firefox uses, battle-tested |
| Transcription | Whisper.cpp | Compiled C++ binary, runs locally, small model = 75MB |
| Summarisation | Custom TF-IDF (Python ~150 lines) | Zero dependencies, sub-100ms, no LLM needed |
| Embedding model | all-MiniLM-L6-v2 (ONNX format) | 22MB, 15ms inference, 384-dim output |
| Embedding runtime | ONNX Runtime (Python) | Runs ONNX model without PyTorch overhead |
| Embedding service | FastAPI (Python) | Lightweight HTTP wrapper around ONNX runner |
| Metadata database | SQLite + FTS5 | Zero setup, built-in full-text search, single file |
| Vector database | ChromaDB (embedded mode) | No separate server, SQLite-backed, HNSW index |
| Extension framework | Manifest V3, Vanilla JS | No framework overhead, fast popup load |
| System tray (optional) | Electron tray / menubar | Cross-platform daemon status indicator |

### Why no LLM API

The decision to avoid LLM API calls is intentional and permanent for the core pipeline:

- **Cost** — zero cost per save, regardless of volume
- **Latency** — TF-IDF summarisation takes <100ms vs 2–5s for an API call
- **Privacy** — content never leaves the machine
- **Reliability** — works offline, no rate limits, no API downtime

LLM calls may be added as an optional, opt-in enhancement in future scope (e.g. "explain this saved item") but will never be part of the mandatory pipeline.

---

## 11. Implementation Plan — Phase by Phase

---

### Phase 1 — Foundation: local backend and database setup
**Duration: Weeks 1–2**

#### Objective
Get a working local backend that accepts jobs, stores metadata in SQLite, and vectors in ChromaDB. Nothing needs to be processed yet — just the plumbing.

#### Tasks

**Backend daemon**
- Set up Node.js or Go project scaffolding with package manager and folder structure
- Create HTTP server on `localhost:7878` with routes: `POST /capture`, `POST /link`, `GET /search`, `GET /status`, `GET /items`
- Implement async job queue using BullMQ (Node) or goroutine + channel (Go) with retry logic (3 attempts, exponential backoff)
- Add request deduplication — hash incoming URLs and reject duplicates already in-flight or processed within the last 60 seconds
- Add graceful shutdown — drain queue before process exit
- Configure auto-start on system login via `launchd` (macOS) or `systemd` (Linux)

**Database setup**
- Create SQLite database at `~/.recall/data/recall.db`
- Run initial migration: create `items` table, `items_fts` virtual table, and all indexes
- Set up ChromaDB in embedded mode — persistent storage at `~/.recall/data/chroma/`
- Set up flat file store at `~/.recall/transcripts/` and `~/.recall/thumbnails/`
- Write a DB abstraction module — all reads/writes go through this, not direct SQL

**Testing milestone**
- Write a test script that POSTs a dummy item directly to `/capture` and verifies it appears in SQLite and ChromaDB with `processing = 'queued'`

**Deliverable:** Backend starts on boot, accepts HTTP jobs, stores records. End-to-end verified with curl.

---

### Phase 2 — Processing pipeline: fetch, transcribe, summarise
**Duration: Weeks 3–4**

#### Objective
A URL enters the queue and comes out the other side with a title, summary, and full transcript stored.

#### Tasks

**URL classifier**
- Build a regex + domain-rules classifier that maps any URL to one of: `video`, `article`, `social-post`, `link`
- Parse `og:type` from the scraped metadata as a fallback signal
- Unit-test against 20+ real-world URLs of each type

**Media fetcher**
- Integrate `yt-dlp` — install as a subprocess dependency. Call with `--extract-audio --audio-format mp3 --no-playlist` flags
- Integrate `@mozilla/readability` (Node) or `go-readability` (Go) for article text extraction
- For `social-post` and `link` types: extract `og:title`, `og:description`, `og:image` only — no full fetch
- Handle errors gracefully: inaccessible URLs, geo-restricted videos, paywalled articles → mark job as `failed` with a descriptive error message

**Transcription (Whisper.cpp)**
- Write an install script that downloads the Whisper.cpp binary and the `ggml-small.bin` model to `~/.recall/whisper/`
- Build a transcription wrapper: input = audio file path, output = timestamped transcript JSON, saved as `~/.recall/transcripts/{uuid}.txt`
- Detect CUDA (Linux) or Metal (macOS) GPU availability — pass appropriate flags to Whisper.cpp if available
- Add a timeout (5 minutes max per transcription job) to prevent hung processes

**Extractive summariser**
- Write a Python script (`summarise.py`) called as a subprocess with the transcript text as stdin
- Implement TF-IDF: tokenise → score sentences → apply positional weighting → filter stopwords → return top-1 (title) and top-5 (summary) as JSON
- Handle edge cases: empty transcript, very short content (< 3 sentences), non-English content
- Manual note path: skip summariser entirely — first sentence of note = title, full note = summary

**Pipeline orchestration**
- Wire all four stages into the job queue worker: classify → fetch → transcribe (if video) → summarise → write to DB
- Update `processing` field in SQLite at each stage: `queued → processing → done` (or `failed` with error)

**Testing milestone**
- Paste a 10-minute YouTube URL into the queue via curl. Within 90 seconds, verify: transcript file exists, SQLite row has a meaningful title and summary, `processing = 'done'`

**Deliverable:** Full pipeline working end-to-end on real URLs. All content types handled.

---

### Phase 3 — Embedding engine and semantic search
**Duration: Weeks 5–6**

#### Objective
Every saved item gets a semantic vector. A natural language query returns ranked results by meaning.

#### Tasks

**Embedding service**
- Export `sentence-transformers/all-MiniLM-L6-v2` to ONNX format using `optimum` — save as `~/.recall/models/minilm.onnx`
- Write a Python FastAPI microservice (`embed_service.py`) on `localhost:7879` with two endpoints:
  - `POST /embed` — takes a text string, returns a 384-dim float array
  - `GET /health` — returns 200 if the model is loaded
- Integrate ONNX Runtime for inference — no PyTorch, no full transformers library at runtime
- Add the embedding service to the auto-start sequence alongside the main backend

**Embedding integration**
- After every successful pipeline run, call the embedding service with the summary text (auto-scrape) or note text (manual note)
- Store the returned vector in ChromaDB with the item UUID as the collection ID
- Add a backfill script to embed any existing items that predate this phase

**Semantic search endpoint**
- Build `GET /search?q=...` on the main backend
- Call embedding service to embed the query string
- Query ChromaDB for top-20 nearest items by cosine similarity using the HNSW index
- Fetch full metadata from SQLite for those 20 UUIDs
- Compute re-rank score: `semantic_score * 0.7 + recency_score * 0.2 + source_boost * 0.1`
- Return ranked array of item objects

**Hybrid search**
- Detect when the query looks keyword-oriented (short, specific terms, quoted phrases)
- Run FTS5 keyword search in parallel with semantic search
- Merge results by UUID, normalise scores, deduplicate, return top-10

**Filters**
- Add query parameters to `/search`: `?type=video`, `?since=2025-01-01`, `?mode=auto_scrape`
- These filter the SQLite join step — applied after ANN search, before re-ranking

**Benchmarking milestone**
- Seed the database with 1,000 items. Run 20 diverse queries. Verify: all queries return in under 50ms, semantic relevance is correct on at least 80% of test queries.

**Deliverable:** Type "how Kafka achieves exactly-once delivery" and get the article you saved 3 months ago — even though the title was "Kafka Deep Dive: Internals."

---

### Phase 4 — Browser extension: capture, link vault, search UI
**Duration: Weeks 7–8**

#### Objective
A fully working Chrome extension that any user can install and use without touching the terminal.

#### Tasks

**Extension scaffolding**
- Set up Manifest V3 project structure — `manifest.json`, popup, content script, service worker, search page
- Configure permissions: `activeTab`, `storage`, `scripting`, `commands`, host permission for `localhost:7878`
- Register keyboard shortcut `Ctrl+Shift+S` / `Cmd+Shift+S` for quick save

**Content script**
- Inject into every page. On message from popup or shortcut: scrape URL, title, all `og:*` meta tags, detect video element presence
- Post scraped data back to service worker via `chrome.runtime.sendMessage`

**Service worker**
- On receive from content script: add item to an in-memory queue (persisted to `chrome.storage.local`)
- `POST /capture` to local backend with scraped data + optional note
- Poll `/status/{id}` every 5 seconds until `processing = 'done'` or `'failed'`
- Update extension badge (green checkmark / red exclamation) based on queue state

**Popup — Capture tab**
- Show current page card: thumbnail (og:image), title (og:title), domain
- Quick save button → sends message to service worker → immediate "queued" feedback
- Add note toggle → expands textarea → Save with note button
- Processing status: shows a spinner while in-progress, check or error when done

**Popup — Link Vault tab**
- URL text input with clipboard paste button (`navigator.clipboard.readText()`)
- Mode toggle buttons: Auto-scrape / Write a note — mutually exclusive
- Mode-specific hint text below toggle
- Note textarea (visible in note mode only)
- Save button — label changes: "Scrape and save" or "Save with note"
- Success / failure toast on completion

**Popup — Recent tab**
- On open: fetch `/items?limit=20&sort=created_at` from local backend
- Render as a scrollable list: type icon, title, domain, relative time, source badge
- Inline search bar → debounced (300ms) → calls `/search?q=...` on keystroke
- Clicking an item opens the original URL in a new tab

**Footer**
- Total item count from `/status`
- Daemon connection state — ping `/health` on popup open, show green/red indicator
- "All local" label

**Full search page (`search.html`)**
- Large search input, autofocused
- Filter bar: type chips (All / Video / Article / Link), date range picker
- Results grid: cards with title, summary excerpt, source badge, save date, original link
- Expand button on video cards → inline transcript viewer
- Keyboard navigation (arrow keys, Enter to open)
- Empty state with example queries

**Testing milestone**
- Install extension on a fresh Chrome profile. Save 10 items across different types. Search for one by meaning. Verify result appears, opens correct URL.

**Deliverable:** Fully functional extension with all three tabs, keyboard shortcut, and full search page — all wired to live local backend.

---

### Phase 5 — Polish, packaging, and production hardening
**Duration: Weeks 9–10**

#### Objective
Turn the working product into something that installs in one command and runs reliably every day without maintenance.

#### Tasks

**Installer script**
- Write a `install.sh` (macOS/Linux) and `install.ps1` (Windows) that:
  1. Checks for Node.js / Go and Python 3 — installs via Homebrew/apt/winget if missing
  2. Downloads and installs `yt-dlp` binary
  3. Downloads and installs Whisper.cpp binary + small model
  4. Downloads and caches the ONNX model
  5. Creates `~/.recall/` directory structure
  6. Registers daemon with `launchd` / `systemd` / Windows Task Scheduler
  7. Opens Chrome extensions page with a prompt to load the extension

**System tray daemon**
- Add a menubar/tray icon (Electron or native) showing:
  - Queue length (jobs in progress)
  - Last saved item title
  - "Open Recall" shortcut → opens full search page
  - "Pause processing" toggle
  - "Open logs" option

**Error surfacing**
- Failed jobs appear in the extension popup with an error message and retry button
- `daemon.log` captures all pipeline errors with stack traces
- Job history retained for 30 days — accessible from the search page footer

**Database backup**
- Nightly cron job (via `node-cron` or `time.AfterFunc` loop) creates a ZIP of `recall.db` + Chroma data
- Keeps last 7 daily backups in `~/.recall/backups/`
- Backup location is configurable via a settings file

**Settings page**
- Accessible from extension popup footer gear icon
- Options: Whisper model size (tiny / small / medium), backup folder path, max transcript length, default save mode, keyboard shortcut override

**Performance testing**
- Seed 10,000 items, run search latency benchmark — verify p99 < 100ms
- Measure end-to-end pipeline time for each content type — document in README

**Documentation**
- `README.md` with install guide, architecture overview, and troubleshooting
- `CONTRIBUTING.md` for anyone who wants to add new content type handlers

**Deliverable:** One-command install on a fresh machine. Daemon auto-starts. Extension loads. All features work out of the box. Zero manual configuration required.

---

## 12. Performance Targets

| Metric | Target |
|---|---|
| Capture to "saved" confirmation | < 500ms |
| Article pipeline (fetch + summarise + embed) | < 10s |
| Video pipeline (download + transcribe + summarise + embed, 10min video) | < 120s on CPU |
| Search query end-to-end latency | < 50ms |
| Search latency at 100k items | < 50ms |
| Search latency at 1M items | < 200ms |
| ONNX embedding inference | < 20ms |
| Daemon memory usage (idle) | < 150MB |
| SQLite DB size per 1,000 items | ~20MB |
| ChromaDB size per 1,000 items | ~5MB (384 floats × 4 bytes × 1000) |

---

## 13. Future Scope

These features are explicitly out of scope for v1 but designed for in the data model and architecture.

| Feature | Notes |
|---|---|
| Collections / folders | Group items by topic. DB schema ready (`tags` field is the foundation) |
| Tag editor | Manual tag management from search page |
| Export | Download all items as JSON or Markdown |
| Cross-device sync | Optional self-hosted sync endpoint — no cloud required |
| LLM-powered Q&A | "Ask a question about your saved items" — opt-in, uses local Ollama |
| Firefox extension | Same codebase, different manifest |
| PDF capture | Save and index academic papers and documents |
| Highlight capture | Save a highlighted text selection from any page, not just the full URL |
| Public sharing | Generate a shareable read-only link to a saved item |
| RSS / newsletter import | Auto-save articles from subscribed RSS feeds |

---

*Document version: 1.0 · Last updated: June 2026 · Status: Ready for development*
