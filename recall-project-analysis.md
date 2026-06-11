# Recall — Complete Project Analysis (Simple Language)

This document explains **everything** about how Recall works: how content is captured, processed, transcribed, scraped, searched, and saved. Written for someone who wants the full picture without reading every source file.

---

## 1. What Is Recall?

Recall is a **personal knowledge capture app** that runs entirely on your computer.

You find something online — a YouTube video, Instagram Reel, article, tweet, PDF, or random link — and save it with one click. Recall then:

1. **Downloads or reads** the content in the background
2. **Transcribes videos** locally (no cloud AI bill)
3. **Summarises** the text with simple math (TF-IDF), not ChatGPT
4. **Stores** everything in a local database
5. **Lets you search** by meaning later (“that video about compound interest”) not just exact keywords

**Nothing leaves your machine.** No subscription, no API keys for the core pipeline.

---

## 2. The Big Picture (Three Main Parts)

```
┌─────────────────────────────────────────────────────────────┐
│  CHROME EXTENSION (recall-extension/)                     │
│  • Popup to save pages                                      │
│  • Reads page title, description, video hints from DOM      │
│  • Sends URLs to your local backend                         │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP (localhost:7878)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  NODE.JS BACKEND (backend/)                                 │
│  • Receives saves instantly                                 │
│  • Queues background jobs                                   │
│  • Classifies URL → fetches content → transcribes → summary │
│  • Saves to SQLite + asks embed service for vectors         │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP (localhost:7879)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  PYTHON EMBED SERVICE (recall-embed/)                       │
│  • Turns text into 384-number “meaning vectors”             │
│  • Stores vectors in ChromaDB for semantic search           │
└─────────────────────────────────────────────────────────────┘
```

**Where your data lives:** `~/.recall/` (Windows: `C:\Users\You\.recall\`)

| Folder / file | What it holds |
|---------------|---------------|
| `data/recall.db` | Main SQLite database (titles, summaries, URLs, status) |
| `data/chroma/` | Vector database for “search by meaning” |
| `transcripts/{id}.txt` | Full Whisper transcription text files |
| `thumbnails/{id}.jpg` | Downloaded preview images |
| `models/` | ONNX embedding model files |
| `whisper/` | Whisper.cpp binary + model weights |
| `backups/` | Nightly ZIP backups |
| `settings.json` | Your preferences (Whisper model size, etc.) |

---

## 3. Project Folder Structure

```
shubh-database/
├── backend/                 ← The brain (API + pipeline)
│   ├── src/
│   │   ├── server.js        ← Starts HTTP server on port 7878
│   │   ├── config.js        ← Paths, ports, timeouts
│   │   ├── migrate.js       ← Runs SQL migrations on startup
│   │   ├── routes/          ← API endpoints (/capture, /search, …)
│   │   ├── services/        ← Business logic (capture, search, embed)
│   │   ├── pipeline/        ← Classify, fetch, transcribe, summarise
│   │   ├── workers/         ← pipeline-worker.js runs each job
│   │   ├── queue/           ← In-memory job queue
│   │   └── db/              ← SQLite + Chroma helpers
│   ├── migrations/          ← SQL schema files
│   └── summarise/           ← Python TF-IDF summariser
│
├── recall-embed/            ← Python FastAPI service (port 7879)
│   └── embed_service.py     ← ONNX MiniLM + ChromaDB
│
├── recall-extension/        ← Chrome extension (Manifest V3)
│   ├── popup/               ← Save UI (Capture, Link Vault, Recent)
│   ├── content/             ← Scrapes the open web page
│   ├── background/          ← Talks to backend, polls job status
│   ├── search/              ← Full search page in browser
│   └── settings/            ← Whisper model, backups, etc.
│
├── recall-tray/             ← System tray icon (optional)
├── scripts/                 ← Auto-start daemon on boot
├── install.ps1 / install.sh ← One-command setup
├── recall-prd-implementation-plan.md   ← Product spec
└── recall-20-step-guide.md             ← Build guide (maps to code)
```

There is **no separate React/Next.js website** in this repo. The “frontend” is the Chrome extension pages only.

---

## 4. The Full Pipeline (Capture → Done)

Think of it as **two speeds**:

- **Fast path (under 1 second):** Save the URL and metadata immediately. User gets “Saved!”
- **Slow path (background):** Download, transcribe, summarise, embed — can take seconds to minutes.

### Step 0 — You trigger a save

Ways to save:

| Action | What happens |
|--------|--------------|
| Extension popup → Save | Saves current tab |
| `Ctrl+Shift+S` | Quick save shortcut |
| Link Vault tab | Paste any URL and save |
| `Ctrl+Shift+H` | Save selected text as a highlight note |
| Context menu | Save highlight |

Two **save modes**:

- **`auto_scrape`** — Recall tries to fetch/transcribe/summarise automatically (default)
- **`manual_note`** — You write a note; Recall only grabs basic page info (title/image), no full scrape

---

### Step 1 — Content script scrapes the page

**File:** `recall-extension/content/content.js`

While you’re on a page, the extension reads:

- Page **URL**
- **Title** (`document.title`)
- **Open Graph tags** (`og:title`, `og:description`, `og:image`, `og:type`)
- **Domain** (e.g. `youtube.com`)
- **`has_video`** — checks if the page DOM contains a `<video>` element

This is **light scraping** — it does not download the video yet. It only collects hints so the backend knows what kind of page this is.

---

### Step 2 — Service worker sends to backend

**File:** `recall-extension/background/service-worker.js`  
**API client:** `recall-extension/shared/api.js`

The extension sends `POST http://127.0.0.1:7878/capture` (or `/link` for Link Vault) with JSON like:

```json
{
  "url": "https://instagram.com/reels/abc123/",
  "title": "Page title from browser",
  "note": "optional user note",
  "save_mode": "auto_scrape",
  "domain": "instagram.com",
  "capture_meta": {
    "og_type": "video.other",
    "has_video": true
  }
}
```

If the backend is down, the extension **queues the save locally** in `chrome.storage.local` and retries when the daemon comes back.

---

### Step 3 — Capture service saves instantly

**File:** `backend/src/services/capture-service.js`

The backend:

1. **Validates** the URL
2. **Classifies** the URL type (if not already known) — see Section 5
3. **Dedup check** — rejects the same URL if saved in the last 60 seconds or already processing
4. **Creates a database row** with `processing = 'queued'`
5. **Adds a job** to the in-memory queue
6. **Returns immediately** `{ id: "uuid", processing: "queued" }`

The extension then **polls** `GET /status/{id}` every 5 seconds until status is `done` or `failed`.

---

### Step 4 — Job queue picks up work

**File:** `backend/src/queue/job-queue.js`

- Runs jobs **one at a time** (or limited concurrency)
- **3 retries** with exponential backoff on failure
- On permanent failure: sets `processing = 'failed'` and stores `error_message`
- If the daemon restarts, **stuck items** get re-queued

> Note: The original PRD mentioned BullMQ + Redis. The actual code uses a **simple in-memory queue** — jobs are not persisted in Redis.

---

### Step 5 — Pipeline worker processes the item

**File:** `backend/src/workers/pipeline-worker.js`

Status changes: `queued` → `processing` → `done` (or `failed`)

#### Branch A: Manual note (`save_mode = manual_note`)

1. Fetch **Open Graph metadata** only (title, description, thumbnail)
2. Use your **note text** as the main content
3. Generate title = first sentence of note; summary = full note
4. Skip transcription and article extraction
5. Embed the **note text** for search

#### Branch B: Auto scrape (`save_mode = auto_scrape`)

1. **Classify** URL → `video`, `article`, `link`, `social-post`, or `pdf`
2. **Fetch content** based on type (Section 6 & 7)
3. **Summarise** fetched text with TF-IDF (Section 8)
4. **Truncate** if longer than `maxTranscriptLength` (from settings)
5. **Embed** text for semantic search (Section 9)
6. **Update SQLite** with all fields + `processing = 'done'`

---

## 5. How URLs Are Classified

**File:** `backend/src/pipeline/classify.js`

Before fetching, Recall decides **what kind of content** this URL is:

| Result | How it’s detected |
|--------|-------------------|
| **`pdf`** | URL path ends with `.pdf` |
| **`video`** | YouTube, youtu.be, TikTok, Instagram `/reels/`, Twitter/X video URLs, or `og:type` is `video` / `video.other`, or Twitter/X post with `has_video` |
| **`article`** | Medium, Substack, dev.to, `og:type = article`, or hostname contains `blog.` / ends with `github.io` |
| **`social-post`** | Twitter/X text posts (no video) |
| **`link`** | Everything else (generic web page) |

**Instagram Reels** are detected by this rule:

```javascript
/instagram\.com\/reels\//i.test(url)  →  source_type = 'video'
```

So Reels always go through the **video pipeline** (yt-dlp + Whisper), not the article reader.

---

## 6. How Reels & Videos Are Transcribed

**Router:** `backend/src/pipeline/fetch-content.js` → `fetchVideoContent`  
**Audio download:** `backend/src/pipeline/fetch-audio.js`  
**Transcription:** `backend/src/pipeline/transcribe.js`

### The video pipeline (step by step)

```
Reel / YouTube / TikTok URL
        │
        ▼
┌───────────────────┐
│  1. yt-dlp        │  Download audio only (MP3) to temp folder
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  2. Whisper.cpp   │  Convert speech → text (runs locally on CPU/GPU)
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  3. Save .txt     │  ~/.recall/transcripts/{item-id}.txt
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  4. OG metadata   │  Title + thumbnail from page tags (parallel/fallback)
└─────────┬─────────┘
          ▼
   Full transcript text → summariser → database
```

### Tool details

**yt-dlp** (external program, not npm):

```bash
yt-dlp --extract-audio --audio-format mp3 -o /tmp/{itemId}.%(ext)s {url}
```

- Works on YouTube, TikTok, Instagram Reels, and many other sites
- Timeout: **5 minutes**
- Only downloads **audio** — not the full video file (saves disk space)

**Whisper.cpp** (external program):

```bash
whisper-cpp -m ggml-small.bin -f audio.mp3 -of ~/.recall/transcripts/{id} -otxt
```

- Runs **100% offline** on your machine
- Model size from settings: `tiny`, `small` (default), or `medium`
- Uses **GPU acceleration** when available (`-ngl 99` on Mac/NVIDIA)
- Timeout: **5 minutes**
- Output: plain text file; database stores **relative path** in `transcript` column

### What gets stored for a Reel

| Field | Example content |
|-------|-----------------|
| `source_type` | `video` |
| `content` | Full transcript text (what was said in the Reel) |
| `transcript` | `transcripts/abc-123.txt` (path to file) |
| `title` | From OG tags or TF-IDF extractive title |
| `summary` | Top 5 sentences from transcript (TF-IDF) |
| `thumbnail` | Downloaded OG image |

### If transcription fails

Recall does **not** give up completely:

1. Falls back to **Open Graph text** (title + description from the page)
2. Sets `error_message` explaining what went wrong (e.g. missing VC++ runtime on Windows)
3. Still saves the item as `done` with `fallback: true` so you at least have the link and metadata

---

## 7. How Web Pages Are Scraped (Non-Video)

**Router:** `backend/src/pipeline/fetch-content.js`

| Type | Fetcher file | Method |
|------|--------------|--------|
| **Article** | `fetch-article.js` | Download HTML → **Mozilla Readability** extracts main article text. If that fails → OG fallback |
| **Link** | `fetch-og.js` | Fetch HTML → **Cheerio** parses Open Graph tags only |
| **Social post** | `fetch-og.js` | Same — title + description from OG (no thread scraping) |
| **PDF** | `fetch-pdf.js` | Download PDF → **pdf-parse** extracts all text |

### Open Graph fetcher (used everywhere)

**File:** `backend/src/pipeline/fetch-og.js`

1. HTTP GET the URL with a `RecallBot` user-agent
2. Parse HTML with Cheerio
3. Extract: `og:title`, `og:description`, `og:image`, `og:type`
4. Optionally download thumbnail → `~/.recall/thumbnails/{id}.jpg`

### Article fetcher

**File:** `backend/src/pipeline/fetch-article.js`

1. Download full HTML
2. Load into **JSDOM** (fake browser DOM)
3. Run **@mozilla/readability** — strips ads, nav, sidebars; keeps main article body
4. If Readability fails but OG description exists → use OG text instead

### PDF fetcher

**File:** `backend/src/pipeline/fetch-pdf.js`

1. Download PDF to temp file
2. Extract text with `pdf-parse`
3. First substantial line becomes title

### What is NOT scraped

- Full Twitter/X **threads** (only OG preview)
- Comments sections
- Paywalled content beyond what the public HTML shows
- Private/login-required pages

---

## 8. How Summaries Are Created

**Node wrapper:** `backend/src/pipeline/summarise.js`  
**Python script:** `backend/summarise/summarise.py`

Recall does **not** use ChatGPT or any LLM for summaries.

It uses **TF-IDF** (Term Frequency–Inverse Document Frequency):

- Finds the most **important sentences** in the text statistically
- **Title** = best single sentence (or first sentence for manual notes)
- **Summary** = top 5 sentences joined together
- Runs in **under 100ms** for typical content

For **manual notes**, the note itself becomes the summary; title = first sentence.

---

## 9. How Data Is Embedded (For Semantic Search)

**Node:** `backend/src/services/embedding-service.js`  
**Python:** `recall-embed/embed_service.py`

After text is ready, the backend sends it to the embed service:

```
POST http://127.0.0.1:7879/embed
{ "text": "summary or note text here" }
→ returns [384 floating-point numbers]
```

Then:

```
POST http://127.0.0.1:7879/vectors/upsert
{ "id": "item-uuid", "vector": [...], "metadata": {...} }
```

### What text gets embedded?

| Save mode | Text embedded |
|-----------|---------------|
| Manual note | User’s **note** |
| Auto scrape | **Summary** (if available), else content, else title, else URL |

### Model

- **all-MiniLM-L6-v2** converted to **ONNX**
- **384 dimensions** per vector
- Stored in **ChromaDB** collection named `recall`
- Uses **cosine similarity** + HNSW index for fast nearest-neighbor search

The embed service **starts automatically** when the backend boots (`embed-launcher.js`).

---

## 10. How Search Works

**File:** `backend/src/services/search-service.js`  
**Extension UI:** `recall-extension/search/search.html`

When you search `GET /search?q=compound interest investing`:

### Step 1 — Semantic search (always)

1. Convert your query to a 384-dim vector (same model)
2. Query ChromaDB: “find 20 most similar saved items”
3. Each result gets a **semantic score** (0–1)

### Step 2 — Keyword search (sometimes)

If the query looks **keyword-like** (short phrase, quoted text, not a question like “how does…”):

- Also run **SQLite FTS5** full-text search on `title`, `summary`, `content`, `note`
- Uses **BM25 ranking** (standard keyword relevance)
- Each result gets a **keyword score**

### Step 3 — Merge and re-rank

Final score formula:

```
retrieval = semantic × 0.7 + keyword × 0.3   (hybrid mode)
           OR semantic × 0.7                  (question-like queries)

final = retrieval + recency × 0.2 + source_boost × 0.1
```

**Recency:** newer items score slightly higher (exponential decay over ~30 days)

**Source boost:** videos > articles > social posts > plain links

### Step 4 — Filter and return

- Only items with `processing = 'done'`
- Optional filters: `type`, `mode`, `since` (date)
- Return **top 10** results + up to **5 related** items

### Search filters (query params)

| Param | Example | Effect |
|-------|---------|--------|
| `q` | `machine learning` | Search query |
| `type` | `video` | Only videos/Reels |
| `mode` | `manual_note` | Only manual saves |
| `since` | `2025-01-01` | Only items after date |

### Bonus: “Ask your library” (optional)

**File:** `backend/src/routes/ask.js`

If you have **Ollama** running locally:

- Takes your question
- Finds top semantic matches
- Sends context + question to a local LLM
- Returns an answer grounded in your saved content

This is **optional** — core search works without Ollama.

---

## 11. How Data Is Saved (Database & Files)

### SQLite table: `items`

**Schema:** `backend/migrations/001_init.sql` (+ `003_capture_meta.sql`)

| Column | What it stores |
|--------|----------------|
| `id` | Unique UUID for this save |
| `url` | Original link |
| `title` | Display title |
| `summary` | Short summary (TF-IDF or note) |
| `content` | Full text (transcript, article body, OG text) |
| `source_type` | `video`, `article`, `link`, `social-post`, `pdf` |
| `save_mode` | `auto_scrape` or `manual_note` |
| `note` | User-written note at save time |
| `tags` | Comma-separated tags (editable later) |
| `domain` | Hostname (e.g. `youtube.com`) |
| `thumbnail` | Path to JPG under `.recall/` |
| `transcript` | Path to `.txt` transcript file |
| `processing` | `queued` → `processing` → `done` / `failed` |
| `created_at` | When you saved (Unix ms) |
| `processed_at` | When pipeline finished |
| `capture_meta` | JSON: OG hints from browser (`has_video`, etc.) |
| `error_message` | Warning or error text if something partial/failed |

### Full-text search table: `items_fts`

**Schema:** `backend/migrations/002_fts.sql`

- Virtual FTS5 table indexing: `title`, `summary`, `content`, `note`
- **Automatic triggers** keep it in sync when items are inserted/updated/deleted
- Powers keyword/hybrid search

### ChromaDB (vectors)

- One vector per item ID (same UUID as SQLite)
- Deleted when item is deleted (`item-deletion-service.js`)

### File storage

| Content | Location |
|---------|----------|
| Transcripts | `~/.recall/transcripts/{id}.txt` |
| Thumbnails | `~/.recall/thumbnails/{id}.jpg` |
| Database | `~/.recall/data/recall.db` |
| Vectors | `~/.recall/data/chroma/` |

### Deleting an item

**File:** `backend/src/services/item-deletion-service.js`

1. Delete vector from ChromaDB
2. Delete transcript file (if exists)
3. Delete thumbnail file (if exists)
4. Delete row from SQLite (FTS trigger cleans up search index)

---

## 12. Chrome Extension (User-Facing Flow)

### Popup (3 tabs)

| Tab | Purpose |
|-----|---------|
| **Capture** | Save current page + optional note |
| **Link Vault** | Paste any URL to save later |
| **Recent** | See last saved items and their status |

### Search page

- Open with `Ctrl+Shift+F` or from popup
- Live search (220ms debounce)
- Filters by type, mode, date
- View full transcripts
- Edit tags, export JSON/Markdown
- “Ask library” panel (if Ollama available)

### Settings page

- Whisper model size (`tiny` / `small` / `medium`)
- Default save mode
- Backup folder and retention
- Max transcript length

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+S` | Quick save current page |
| `Ctrl+Shift+F` | Open search page |
| `Ctrl+Shift+H` | Save selected text as highlight note |

---

## 13. Backend API (Quick Reference)

Base URL: `http://127.0.0.1:7878`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Is daemon + embed service alive? |
| POST | `/capture` | Save current page |
| POST | `/link` | Save from Link Vault |
| GET | `/status/:id` | Check processing progress |
| GET | `/items` | List saved items |
| GET | `/items/:id` | Item detail (+ optional transcript) |
| PUT | `/items/:id/tags` | Update tags |
| DELETE | `/items/:id` | Delete item + files + vector |
| GET | `/search?q=` | Search library |
| GET | `/export` | Export as JSON or Markdown |
| POST | `/items/:id/retry` | Re-run failed pipeline |
| POST | `/queue/pause` | Pause background processing |
| GET/PUT | `/settings` | Read/update preferences |
| POST | `/ask` | Ollama Q&A over your library |

Embed service: `http://127.0.0.1:7879` (`/embed`, `/vectors/upsert`, `/vectors/query`)

---

## 14. External Tools Used

| Tool | Role | Runs where |
|------|------|------------|
| **yt-dlp** | Download audio from video URLs | Your PC (subprocess) |
| **Whisper.cpp** | Speech-to-text transcription | Your PC (subprocess) |
| **Python 3** | TF-IDF summarise + embed service | Your PC |
| **ONNX Runtime** | Run MiniLM embedding model | Embed service |
| **ChromaDB** | Vector storage + ANN search | Embed service |
| **SQLite + FTS5** | Structured data + keyword search | Backend |
| **Readability + JSDOM** | Extract article text from HTML | Backend |
| **Cheerio** | Parse OG meta tags | Backend |
| **pdf-parse** | Extract PDF text | Backend |
| **Express** | HTTP API server | Backend |
| **Ollama** (optional) | Q&A over library | Your PC |

**Not used for core pipeline:** OpenAI, Anthropic, cloud transcription, cloud embeddings, Redis/BullMQ (planned in PRD but not implemented).

---

## 15. Processing States (Lifecycle of One Save)

```
User clicks Save
       │
       ▼
  ┌─────────┐
  │ queued  │  ← Row created in SQLite, job added to queue
  └────┬────┘
       │ pipeline-worker picks up job
       ▼
  ┌────────────┐
  │ processing │  ← classify → fetch → transcribe → summarise → embed
  └─────┬──────┘
        │
   ┌────┴────┐
   ▼         ▼
┌──────┐  ┌────────┐
│ done │  │ failed │  ← after 3 retries
└──────┘  └────────┘
```

Extension polls until `done` or `failed`.

---

## 16. End-to-End Example: Saving an Instagram Reel

1. You open an Instagram Reel in Chrome.
2. You press `Ctrl+Shift+S`.
3. **Content script** reads URL, title, `has_video: true`, `og:type`.
4. **Service worker** POSTs to `/capture` with `save_mode: auto_scrape`.
5. **Capture service** classifies URL → `video`, inserts row, returns ID in ~200ms.
6. Popup shows “Saved! Processing…”
7. **Queue** starts job for that ID.
8. **yt-dlp** downloads Reel audio to temp MP3 (~10–30s).
9. **Whisper.cpp** transcribes speech to text (~30s–2min depending on length/model).
10. Transcript saved to `~/.recall/transcripts/{id}.txt`.
11. **TF-IDF** picks title sentence + 5-sentence summary from transcript.
12. **OG fetch** downloads thumbnail image.
13. **Embed service** converts summary → vector → stored in ChromaDB.
14. SQLite updated: `processing = done`, all fields filled.
15. Extension poll sees `done` — shows title + summary in Recent tab.
16. Later you search “investing tips reel” → semantic search finds it by meaning.

---

## 17. End-to-End Example: Saving a Medium Article

1. You save a Medium article URL.
2. Classifier → `article` (medium.com hostname).
3. **fetch-article.js** downloads HTML, Readability extracts body text.
4. TF-IDF summarises → title + summary.
5. OG thumbnail downloaded.
6. Summary embedded in ChromaDB.
7. FTS5 index updated via trigger.
8. Search works by keyword (“specific phrase in article”) and by meaning (“article about productivity”).

---

## 18. What’s Built vs What’s Planned

### ✅ Built and working

- Chrome extension (capture, vault, search, settings, highlights)
- Local backend daemon + embed service
- Video transcription (YouTube, Reels, TikTok, X video)
- Article extraction (Readability)
- OG scraping for links/social
- PDF text extraction
- TF-IDF summaries
- Semantic search (ChromaDB + MiniLM)
- Hybrid FTS5 + semantic search
- Tags, export, backups, system tray
- Ollama “Ask library” (optional)
- Installers for Windows/Mac/Linux

### 📋 Planned / not in repo yet

- Firefox extension
- RSS feed import
- Cross-device sync
- Public sharing links
- Formal collections/folders table (tags UI exists instead)
- BullMQ + Redis persistent queue (in-memory queue used today)
- Go backend alternative (PRD mention only)

---

## 19. Key Files Cheat Sheet

| If you want to understand… | Read this file |
|-----------------------------|----------------|
| Server startup | `backend/src/server.js` |
| Save request handling | `backend/src/services/capture-service.js` |
| Full processing logic | `backend/src/workers/pipeline-worker.js` |
| URL type detection | `backend/src/pipeline/classify.js` |
| Video/Reel transcription | `backend/src/pipeline/fetch-audio.js`, `transcribe.js` |
| Web scraping | `backend/src/pipeline/fetch-article.js`, `fetch-og.js` |
| Summaries | `backend/summarise/summarise.py` |
| Search ranking | `backend/src/services/search-service.js` |
| Database operations | `backend/src/db/items.js` |
| DB schema | `backend/migrations/001_init.sql`, `002_fts.sql` |
| Embeddings | `recall-embed/embed_service.py` |
| Extension → backend | `recall-extension/shared/api.js` |
| Page scraping in browser | `recall-extension/content/content.js` |

---

## 20. One-Sentence Summary

**Recall saves a URL instantly, classifies it in the background, downloads and transcribes videos with yt-dlp + Whisper, scrapes articles with Readability, summarises everything with TF-IDF, stores metadata in SQLite + vectors in ChromaDB, and lets you find it later with hybrid semantic + keyword search — all on your own computer.**

---

*Generated from codebase analysis — Recall v0.5–0.6. See also `recall-prd-implementation-plan.md` and `recall-20-step-guide.md` for product spec and build steps.*
