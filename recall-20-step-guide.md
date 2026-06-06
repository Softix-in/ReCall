# Recall — 20-Step Manual Learning Guide

> Break the full PRD into small, testable steps. Complete one step, verify it works, then move on.  
> Source: [recall-prd-implementation-plan.md](./recall-prd-implementation-plan.md)

Each step includes **what you'll learn**, **what to build**, **how to test**, and **study topics** so you understand the tech deeply—not just copy-paste.

**Suggested runtime:** Node.js for the backend (simpler to learn subprocess + HTTP). Python for summariser and embeddings.

**Data directory (create once in Step 2):**

```
%USERPROFILE%\.recall\          # Windows
~/.recall/                      # macOS / Linux
  data/
  transcripts/
  thumbnails/
  models/
  whisper/
  logs/
```

---

## Progress tracker

| Step | Title | Test passes? |
|------|-------|:------------:|
| 1 | HTTP server skeleton | ☐ |
| 2 | SQLite schema & migrations | ☐ |
| 3 | Database abstraction layer | ☐ |
| 4 | ChromaDB collection setup | ☐ |
| 5 | `POST /capture` — store a queued item | ☐ |
| 6 | Job queue & status lifecycle | ☐ |
| 7 | Read APIs — `/items`, `/status`, deduplication | ☐ |
| 8 | URL classifier | ☐ |
| 9 | Open Graph metadata fetcher | ☐ |
| 10 | Article extraction (Readability) | ☐ |
| 11 | Video audio download (yt-dlp) | ☐ |
| 12 | Local transcription (Whisper.cpp) | ☐ |
| 13 | TF-IDF summariser (Python) | ☐ |
| 14 | Full pipeline orchestration | ☐ |
| 15 | ONNX embedding microservice | ☐ |
| 16 | Embed on save → ChromaDB | ☐ |
| 17 | Semantic search endpoint | ☐ |
| 18 | Hybrid FTS5 search + filters | ☐ |
| 19 | Extension — content script & service worker | ☐ |
| 20 | Extension — popup UI & end-to-end flow | ☐ |

---

## Step 1 — HTTP server skeleton

**Maps to PRD:** Phase 1 — backend daemon scaffolding

### What you'll learn
- How a local daemon exposes an HTTP API
- Request/response lifecycle in Node.js (Express or Fastify)
- Why Recall uses `localhost:7878` (extension → local backend, no CORS to the public internet)

### What to build
```
recall-backend/
  package.json
  src/
    server.js       # starts HTTP server
    config.js       # PORT=7878, RECALL_HOME path
```

- `GET /health` → `{ "ok": true, "version": "0.1.0" }`
- Log every request (method, path, status code)

### How to test
```bash
cd recall-backend && npm install && node src/server.js
curl http://localhost:7878/health
# Expected: {"ok":true,...}
```

Stop the server with `Ctrl+C`. Confirm only one process can bind to 7878 at a time.

### Study
- [MDN: HTTP overview](https://developer.mozilla.org/en-US/docs/Web/HTTP)
- Express routing vs middleware
- Difference between a **daemon** (long-running) and a **CLI script** (runs and exits)

**Depends on:** nothing  
**Time:** ~2–4 hours

---

## Step 2 — SQLite schema & migrations

**Maps to PRD:** Phase 1 — database setup (`items` table, FTS5, indexes)

### What you'll learn
- Relational schema design for saved web items
- SQLite as an embedded, zero-server database
- FTS5 virtual tables for full-text search (setup now, use in Step 18)
- Migrations: versioned SQL files applied in order

### What to build
```
recall-backend/
  migrations/
    001_init.sql      # items table + indexes
    002_fts.sql         # items_fts virtual table
  src/
    migrate.js        # runs *.sql against ~/.recall/data/recall.db
```

Run migration on server start (or via `npm run migrate`).

### How to test
```bash
npm run migrate
sqlite3 %USERPROFILE%\.recall\data\recall.db ".schema items"
sqlite3 %USERPROFILE%\.recall\data\recall.db ".tables"
# Expected: items, items_fts
```

Insert a row manually in the SQLite CLI, then `SELECT * FROM items`.

### Study
- SQLite `CREATE TABLE`, `PRIMARY KEY`, indexes
- [SQLite FTS5](https://www.sqlite.org/fts5.html) — why search uses a separate virtual table
- PRD §6 schema: every column's purpose (`processing`, `save_mode`, `source_type`)

**Depends on:** Step 1  
**Time:** ~3–5 hours

---

## Step 3 — Database abstraction layer

**Maps to PRD:** Phase 1 — "all reads/writes go through DB module"

### What you'll learn
- Repository pattern: hide SQL behind functions
- Parameterised queries (SQL injection prevention)
- UUID generation for item IDs

### What to build
```
recall-backend/src/db/
  connection.js     # opens recall.db with better-sqlite3 or sqlite3
  items.js          # createItem, getItemById, listItems, updateItem
```

Functions (minimum):
- `createItem({ url, title, source_type, save_mode, ... })` → returns `{ id }`
- `getItemById(id)`
- `updateItem(id, fields)`
- `listItems({ limit, sort })`

### How to test
Write `scripts/test-db.js`:
```javascript
const { createItem, getItemById } = require('../src/db/items');
const id = createItem({ url: 'https://example.com', source_type: 'link', save_mode: 'auto_scrape', processing: 'queued' });
console.log(getItemById(id));
```

Run it twice; confirm second run creates a **new** UUID (no accidental overwrite).

### Study
- `better-sqlite3` vs async `sqlite3` — pick one and understand why
- Prepared statements: `db.prepare('INSERT INTO ...').run(...)`

**Depends on:** Step 2  
**Time:** ~3–4 hours

---

## Step 4 — ChromaDB collection setup

**Maps to PRD:** Phase 1 — ChromaDB embedded mode at `~/.recall/data/chroma/`

### What you'll learn
- Vector databases vs relational databases (what each is good at)
- Embeddings preview: 384 floats per item (real vectors come in Step 15)
- ChromaDB collections, IDs, metadata, persistent client

### What to build
```
recall-backend/src/db/
  chroma.js         # getCollection(), upsertVector(), queryVectors()
```

- Collection name: `recall`
- `upsertVector(id, embedding, metadata, document)` — stub with a fake 384-dim array for now
- `queryVectors(embedding, n=5)` — returns nearest IDs

### How to test
```javascript
// scripts/test-chroma.js
const fake = Array(384).fill(0).map((_, i) => i / 384);
await upsertVector('test-uuid-1', fake, { source_type: 'link' }, 'hello world');
const results = await queryVectors(fake, 1);
console.log(results[0].id === 'test-uuid-1'); // true
```

Inspect `~/.recall/data/chroma/` — files should appear after upsert.

### Study
- Cosine similarity (intuition: direction of vectors, not magnitude)
- HNSW index (approximate nearest neighbour — PRD §8)
- Why item `id` must match between SQLite and ChromaDB

**Depends on:** Step 1  
**Time:** ~3–5 hours

---

## Step 5 — `POST /capture` — store a queued item

**Maps to PRD:** Phase 1 — `POST /capture` route, no processing yet

### What you'll learn
- REST API design: capture as async job submission
- JSON request bodies and validation
- Instant response pattern: return `id` + `queued` before work finishes

### What to build
- `POST /capture` in `server.js` (or `routes/capture.js`)
- Validate required fields: `url`, `save_mode`
- Generate UUID, set `processing: 'queued'`, `created_at: Date.now()`
- Insert into SQLite via `createItem()`
- Upsert placeholder vector in ChromaDB (empty summary document for now)
- Return `{ id, processing: 'queued' }`

### How to test
```bash
curl -X POST http://localhost:7878/capture \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://example.com\",\"title\":\"Test\",\"source_type\":\"link\",\"save_mode\":\"auto_scrape\",\"domain\":\"example.com\"}"
```

Verify in SQLite:
```bash
sqlite3 ~/.recall/data/recall.db "SELECT id, url, processing FROM items ORDER BY created_at DESC LIMIT 1;"
```

### Study
- HTTP status codes: `201` vs `200`, `400` for bad input
- PRD §9 content script payload — what the extension will eventually send

**Depends on:** Steps 3, 4  
**Time:** ~2–3 hours

---

## Step 6 — Job queue & status lifecycle

**Maps to PRD:** Phase 1 — BullMQ / async queue, `queued → processing → done`

### What you'll learn
- Why capture must be non-blocking (user keeps browsing)
- Job queues: producer (HTTP handler) vs consumer (worker)
- Retries with exponential backoff (3 attempts)
- Updating `processing` field as state machine

### What to build
```
recall-backend/src/
  queue.js          # addJob(itemId), worker loop
  workers/
    stub-worker.js  # for now: sleep 2s, set processing='done', title='Stub title'
```

Flow:
1. `/capture` inserts item + enqueues job
2. Worker picks job → `processing = 'processing'`
3. Worker finishes → `processing = 'done'`, `processed_at = now`

Use **BullMQ + Redis** OR a simple in-memory queue first (learn queues without Redis), then upgrade.

### How to test
```bash
# POST /capture, note the id
curl http://localhost:7878/status/YOUR-UUID
# Poll every second — expect: queued → processing → done within ~3s
```

Add a failing job (throw error in worker) → `processing = 'failed'`.

### Study
- BullMQ docs: Queue, Worker, job options `{ attempts: 3, backoff: { type: 'exponential' } }`
- State machines: valid transitions only
- Graceful shutdown: drain queue on `SIGINT`

**Depends on:** Step 5  
**Time:** ~4–6 hours

---

## Step 7 — Read APIs, health, deduplication

**Maps to PRD:** Phase 1 — `GET /items`, `GET /status`, dedupe within 60s

### What you'll learn
- Polling pattern (extension checks job status every 5s)
- Query parameters (`limit`, `sort`)
- Idempotency / deduplication for double-clicks

### What to build
- `GET /items?limit=20&sort=created_at` — list recent items
- `GET /status` — `{ itemCount, queueLength, storageBytes }`
- `GET /status/:id` — single item processing state
- Deduplication in `/capture`: hash `url`, reject if same URL saved in last 60 seconds → `409 Conflict`

### How to test
```bash
curl "http://localhost:7878/items?limit=5"
curl http://localhost:7878/status
curl http://localhost:7878/status/YOUR-UUID

# Dedup test — POST same URL twice within 60s; second returns 409
```

### Study
- REST pagination patterns (offset vs cursor — v1 uses simple `limit`)
- Why deduplication belongs on the server, not only in the extension

**Depends on:** Steps 5, 6  
**Time:** ~3–4 hours

**Phase 1 checkpoint:** Backend accepts jobs, persists to SQLite + Chroma stub, queue updates status. Extension not needed yet.

---

## Step 8 — URL classifier

**Maps to PRD:** Phase 2 — URL classifier rules (§7)

### What you'll learn
- Rule-based classification vs ML classification
- URL parsing (`URL` class, hostname, pathname)
- How `og:type` and `has_video` from extension metadata act as signals

### What to build
```
recall-backend/src/pipeline/
  classify.js       # classifyUrl(url, metadata?) → source_type
```

Rules (from PRD):

| Pattern | `source_type` |
|---------|---------------|
| youtube.com, youtu.be | `video` |
| instagram.com/reels/, tiktok.com | `video` |
| twitter.com / x.com + video | `video` |
| twitter.com / x.com text | `social-post` |
| medium.com, substack.com, dev.to | `article` |
| else | `link` |

### How to test
```
recall-backend/tests/classify.test.js   # 20+ URLs, 5+ per type
npm test
```

Manual check:
```javascript
classifyUrl('https://www.youtube.com/watch?v=abc') // 'video'
classifyUrl('https://dev.to/some/post')              // 'article'
```

### Study
- Regular expressions for hostnames
- Trade-off: brittle rules vs maintainable config file
- Unit testing with a table-driven test array

**Depends on:** Step 1  
**Time:** ~3–4 hours

---

## Step 9 — Open Graph metadata fetcher

**Maps to PRD:** Phase 2 — og:title/description/image for `link` and `social-post`; manual note fast path

### What you'll learn
- HTTP fetching from Node (`fetch` or `axios`)
- HTML parsing without a browser (`cheerio`)
- Open Graph protocol: `<meta property="og:title" content="...">`
- Manual note path: minimal fetch, user text is the content

### What to build
```
recall-backend/src/pipeline/
  fetch-og.js       # fetchOgMetadata(url) → { title, description, image }
```

- Download HTML (timeout 10s, realistic User-Agent)
- Parse `og:title`, `og:description`, `og:image`
- Save thumbnail to `~/.recall/thumbnails/{uuid}.jpg` if image URL exists
- Return plain text body: `title + '\n' + description` for summariser

### How to test
```javascript
// scripts/test-og.js
const meta = await fetchOgMetadata('https://github.com');
console.log(meta.title, meta.description);
```

Test 5 sites: GitHub, a blog, a news article, a bare landing page, invalid URL (expect graceful error).

### Study
- Why Recall doesn't run a headless browser for every link (speed, resource use)
- Paywalls and bot blocking — when `failed` is correct behaviour

**Depends on:** Step 8  
**Time:** ~4–5 hours

---

## Step 10 — Article extraction (Readability)

**Maps to PRD:** Phase 2 — `@mozilla/readability` for articles

### What you'll learn
- How Readability strips nav, ads, sidebars — same algorithm Firefox Reader View uses
- `jsdom` + Readability pipeline in Node
- Difference between `article` (full body) and `link` (OG only)

### What to build
```
recall-backend/src/pipeline/
  fetch-article.js  # fetchArticleText(url) → { title, textContent, excerpt }
```

Use `@mozilla/readability` + `jsdom` on fetched HTML.

### How to test
```bash
node scripts/test-article.js https://dev.to/some-real-article
# Output: 500+ words of main content, no menu junk
```

Compare output to opening the page in Firefox Reader View.

### Study
- Readability `isProbablyReaderable` — when extraction may fail
- PRD: article body becomes input to TF-IDF in Step 13

**Depends on:** Step 9 (reuse HTTP fetch)  
**Time:** ~4–5 hours

---

## Step 11 — Video audio download (yt-dlp)

**Maps to PRD:** Phase 2 — yt-dlp subprocess, `--extract-audio --audio-format mp3`

### What you'll learn
- Subprocess management in Node (`child_process.spawn`)
- yt-dlp as a universal media extractor (no YouTube API key)
- Temp file hygiene: download → process → delete audio after transcription

### What to build
```
recall-backend/src/pipeline/
  fetch-audio.js    # downloadAudio(url) → path to .mp3
```

Install yt-dlp:
```bash
winget install yt-dlp    # Windows
# or: pip install yt-dlp
```

Spawn:
```bash
yt-dlp --extract-audio --audio-format mp3 --no-playlist -o "TEMP_PATH" URL
```

### How to test
```bash
node scripts/test-audio.js "https://www.youtube.com/watch?v=jNQXAC9IVRw"
# Expected: .mp3 file exists, playable, ~1–3 MB for short video
```

Test error case: invalid URL → thrown error with message for `processing='failed'`.

### Study
- stdout/stderr capture from child processes
- Legal/ToS awareness (personal use tool; understand platform limits)

**Depends on:** Step 8  
**Time:** ~4–6 hours

---

## Step 12 — Local transcription (Whisper.cpp)

**Maps to PRD:** Phase 2 — Whisper.cpp binary + `ggml-small.bin`, transcript `.txt` files

### What you'll learn
- Speech-to-text without cloud APIs
- Running compiled ML binaries from Node
- GPU acceleration flags (CUDA / Metal) vs CPU fallback
- Timeouts for long-running subprocesses (5 min max)

### What to build
```
scripts/setup-whisper.ps1    # download binary + ggml-small.bin to ~/.recall/whisper/
recall-backend/src/pipeline/
  transcribe.js              # transcribe(audioPath, itemId) → transcript text, saves .txt
```

Output format: plain text with optional timestamps, saved to `~/.recall/transcripts/{uuid}.txt`.

### How to test
```bash
# Use .mp3 from Step 11
node scripts/test-transcribe.js path/to/audio.mp3
cat ~/.recall/transcripts/test-uuid.txt
```

A 1-minute clip should complete in under ~30s on CPU with `small` model.

### Study
- Whisper model sizes: tiny vs small vs medium (speed vs accuracy)
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) CLI flags
- Why transcript text feeds summariser (Step 13), not raw audio

**Depends on:** Step 11  
**Time:** ~5–8 hours (includes binary setup on Windows)

---

## Step 13 — TF-IDF summariser (Python)

**Maps to PRD:** Phase 2 — `summarise.py`, stdin → JSON `{ title, summary }`

### What you'll learn
- TF-IDF: term frequency × inverse document frequency
- Extractive summarisation (pick existing sentences, don't generate new ones)
- Positional bias: first/last sentences often matter
- Calling Python from Node as subprocess
- Manual note bypass: first sentence = title, full note = summary

### What to build
```
recall-summarise/
  summarise.py      # read stdin, print JSON to stdout
  requirements.txt  # minimal: no heavy ML libs; stdlib + maybe nltk stopwords
```

Algorithm (PRD §4.5):
1. Tokenise into sentences
2. Score each sentence by TF-IDF
3. Positional weighting
4. Top 1 sentence → `title`, top 5 → `summary` (joined)

### How to test
```bash
cat sample-article.txt | python summarise.py
# {"title":"...","summary":"..."}

node scripts/test-summarise.js   # pipes long text, parses JSON
```

Edge cases: empty input, 1 sentence, 2 sentences — no crash.

### Study
- Why TF-IDF beats LLMs for v1 (latency, cost, privacy — PRD §10)
- stdin/stdout contract between languages
- Difference between **extractive** and **abstractive** summarisation

**Depends on:** Step 1  
**Time:** ~5–8 hours (good step to implement TF-IDF from scratch for learning)

---

## Step 14 — Full pipeline orchestration

**Maps to PRD:** Phase 2 — wire classify → fetch → transcribe → summarise → DB

### What you'll learn
- Pipeline pattern: stages with clear inputs/outputs
- Branching by `source_type` and `save_mode`
- Error handling per stage → `failed` + error message in logs
- End-to-end async job: minutes for video, seconds for article

### What to build
```
recall-backend/src/workers/
  process-item.js   # replace stub-worker
```

Pipeline logic:
```
classify(url)
  if save_mode === 'manual_note':
    fetch og only → title from note → skip summariser → embed later (Step 16)
  else if video:
    yt-dlp → whisper → summarise(transcript)
  else if article:
    readability → summarise(text)
  else:
    fetch og → summarise(title + description)

update SQLite: title, summary, content, transcript path, thumbnail, processing='done'
```

Wire into queue worker from Step 6.

### How to test

**Article:**
```bash
curl -X POST .../capture -d '{"url":"https://dev.to/...","save_mode":"auto_scrape",...}'
# Wait ~10s, poll /status/:id → done, title + summary populated
```

**Video (short YouTube, ~2 min):**
```bash
# Same flow; wait up to 90s; transcript file exists
```

**Manual note:**
```bash
curl -X POST .../capture -d '{"url":"...","note":"Kafka EOS delivery notes","save_mode":"manual_note",...}'
# Done in <2s; title = first sentence of note
```

### Study
- Pipeline observability: log stage name + duration per job
- PRD Phase 2 milestone: 10-min video in ~90s

**Depends on:** Steps 6–13  
**Time:** ~6–10 hours

**Phase 2 checkpoint:** curl-only Recall — save URLs, get titles, summaries, transcripts. No search or extension yet.

---

## Step 15 — ONNX embedding microservice

**Maps to PRD:** Phase 3 — FastAPI on `localhost:7879`, MiniLM-L6-v2 ONNX

### What you'll learn
- Sentence embeddings: text → fixed-size float vector capturing meaning
- ONNX: portable model format, no PyTorch at runtime
- `all-MiniLM-L6-v2`: 384 dimensions, ~15ms inference
- Microservice separation: Python for ML, Node for orchestration

### What to build
```
recall-embed/
  embed_service.py
  requirements.txt    # fastapi, uvicorn, onnxruntime, tokenizers
  scripts/export_model.py   # one-time: HuggingFace → ONNX → ~/.recall/models/minilm.onnx
```

Endpoints:
- `GET /health`
- `POST /embed` body `{ "text": "..." }` → `{ "embedding": [384 floats] }`

### How to test
```bash
cd recall-embed && pip install -r requirements.txt
python embed_service.py
curl http://localhost:7879/health
curl -X POST http://localhost:7879/embed -H "Content-Type: application/json" -d "{\"text\":\"kafka exactly once\"}"
# embedding.length === 384
```

Time one request — target < 20ms after warm-up.

### Study
- [sentence-transformers/all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
- Mean pooling over token embeddings
- Why a separate port (7879) vs bundling into Node

**Depends on:** Step 1  
**Time:** ~6–8 hours

---

## Step 16 — Embed on save → ChromaDB

**Maps to PRD:** Phase 3 — embedding integration after pipeline success

### What you'll learn
- What text to embed: summary (auto) vs note (manual)
- Syncing SQLite row with Chroma vector (same UUID)
- HTTP client from Node to embed service
- Backfill script for items saved before embeddings existed

### What to build
- At end of `process-item.js`: `POST http://localhost:7879/embed` with summary or note
- `chroma.upsertVector(id, embedding, metadata, document)`
- `scripts/backfill-embeddings.js` — loop items where vector missing

Metadata in Chroma: `{ source_type, domain, created_at, save_mode }`

### How to test
1. Save article via `/capture`, wait for `done`
2. Query Chroma directly (test script) — vector exists for that `id`
3. Embed two similar items ("Kafka streaming", "Apache Kafka consumers") — cosine similarity > two unrelated items

```bash
node scripts/backfill-embeddings.js
```

### Study
- Embedding document field vs metadata field in Chroma
- Failure mode: embed service down → job should `failed` or retry

**Depends on:** Steps 4, 14, 15  
**Time:** ~4–5 hours

---

## Step 17 — Semantic search endpoint

**Maps to PRD:** Phase 3 — `GET /search?q=...`, re-ranking formula

### What you'll learn
- Query-time embedding: same model as index time
- Approximate nearest neighbour search (HNSW)
- Re-ranking: combine semantic score + recency + source boost
- Joining vector results with SQLite metadata

### What to build
- `GET /search?q=kafka+exactly+once`
  1. Embed query via 7879
  2. Chroma `queryVectors` top 20
  3. Fetch full rows from SQLite by ID
  4. Re-rank: `semantic * 0.7 + recency * 0.2 + source_boost * 0.1`
  5. Return JSON array

### How to test
1. Save 3 items on different topics (Kafka, React, cooking)
2. Search `"message queue delivery guarantees"` → Kafka item ranks first
3. Search latency: `curl -w "%{time_total}"` → < 0.05s locally

Save an item titled "Kafka Deep Dive" but about EOS — search "exactly once delivery" should still find it.

### Study
- PRD §8 semantic search design
- Normalising scores before combining
- Why top-20 ANN then re-rank beats pure vector order

**Depends on:** Steps 16, 7  
**Time:** ~5–6 hours

---

## Step 18 — Hybrid FTS5 search + filters

**Maps to PRD:** Phase 3 — FTS5 parallel search, merge, filters

### What you'll learn
- SQLite FTS5 `MATCH` queries
- Hybrid retrieval: semantic (meaning) + keyword (exact phrase)
- When to trigger hybrid: quoted strings, short specific queries
- Post-filtering: `type`, `since`, `mode` query params

### What to build
- `searchKeyword(q)` using `items_fts WHERE items_fts MATCH ?`
- Parallel run semantic + keyword when query looks keyword-oriented
- Merge by UUID, normalise scores, dedupe, return top 10
- Filters on SQLite join: `?type=video&since=2025-01-01&mode=manual_note`

### How to test
1. Save item containing exact phrase `"p99 latency"` in summary
2. Semantic query may miss it; hybrid query `"p99 latency"` finds it
3. `?type=video` excludes articles

```bash
curl "http://localhost:7878/search?q=%22p99+latency%22"
curl "http://localhost:7878/search?q=kafka&type=video"
```

### Study
- FTS5 syntax: phrases in quotes
- PRD hybrid diagram (§8)
- Trade-off: hybrid adds ~3ms — worth it for exact recall

**Depends on:** Step 17, Step 2 (FTS5)  
**Time:** ~5–6 hours

**Phase 3 checkpoint:** Full backend via curl — capture, process, semantic + keyword search. Ready for extension.

---

## Step 19 — Extension: content script & service worker

**Maps to PRD:** Phase 4 — MV3 scaffolding, scrape, POST /capture, poll status

### What you'll learn
- Chrome Extension Manifest V3 architecture
- Content script (page context) vs service worker (background, no DOM)
- `chrome.runtime.sendMessage` / `onMessage`
- `host_permissions` for `localhost:7878`
- Keyboard commands API

### What to build
```
recall-extension/
  manifest.json
  content/content.js
  background/service-worker.js
  icons/   (placeholder PNGs)
```

**content.js** — on message `SCRAPE_PAGE`:
```javascript
{ url, title, og_title, og_description, og_image, og_type, domain, has_video }
```

**service-worker.js:**
- On `QUICK_SAVE`: scrape via content script → `POST /capture`
- Store pending jobs in `chrome.storage.local`
- Poll `GET /status/:id` every 5s until `done` or `failed`
- Command `quick-save` → same flow

### How to test
1. Load unpacked in `chrome://extensions`
2. Open any site → DevTools → run message manually or use a bare HTML test page
3. Network tab: see POST to `localhost:7878/capture`
4. `Ctrl+Shift+S` triggers save without opening popup
5. Backend logs show captured URL

No popup UI yet — use `console.log` in service worker.

### Study
- [Chrome MV3 migration guide](https://developer.chrome.com/docs/extensions/develop/migrate)
- Why MV3 service workers sleep — persist state in `chrome.storage`
- PRD §9 permissions block

**Depends on:** Steps 5–7 (working backend)  
**Time:** ~6–8 hours

---

## Step 20 — Extension: popup UI & end-to-end flow

**Maps to PRD:** Phase 4 — Capture, Link Vault, Recent tabs, search page, footer

### What you'll learn
- Extension popup as a small single-page UI (vanilla JS)
- Tab switching without a framework
- Debounced search (300ms)
- Full user journey: browse → save → search → open

### What to build
```
recall-extension/
  popup/popup.html, popup.js, popup.css
  search/search.html, search.js
```

**Tab 1 — Capture:** page card, Quick save, Add note, processing badge  
**Tab 2 — Link Vault:** URL input, Auto-scrape / Write a note toggle, save  
**Tab 3 — Recent:** `GET /items`, debounced `GET /search`, click opens URL  
**Footer:** item count, daemon green/red from `GET /health`  
**search.html:** large search, type filters, result cards, video transcript expand

Wire all buttons to service worker messages or direct `fetch` to backend.

### How to test (final acceptance)
1. Fresh Chrome profile, load extension, start backend + embed service
2. Save current Dev.to or blog page → status goes to done
3. Save YouTube short → transcript exists
4. Link Vault paste + manual note → find via your note words in search
5. Semantic search finds item by meaning, not title
6. Footer shows daemon online + item count

### Study
- `activeTab` permission — access current tab only when user invokes extension
- Popup sizing constraints (~800×600 max practical)
- PRD Phase 4 testing milestone

**Depends on:** Steps 17–19  
**Time:** ~10–15 hours

**Final checkpoint:** Recall works end-to-end from the browser. You built every layer by hand.

---

## Suggested weekly pace

| Week | Steps | Theme |
|------|-------|-------|
| 1 | 1–4 | HTTP, SQLite, Chroma foundations |
| 2 | 5–7 | API + queue (curl-only product) |
| 3 | 8–10 | Fetching web content |
| 4 | 11–13 | Audio, Whisper, TF-IDF |
| 5 | 14 | Full pipeline integration |
| 6 | 15–16 | Embeddings |
| 7 | 17–18 | Search |
| 8–9 | 19–20 | Browser extension |

---

## What's intentionally deferred (post–Step 20)

These are in PRD Phase 5 — learn them after the core 20 steps:

- `install.ps1` / one-command installer
- Windows Task Scheduler auto-start
- System tray app
- Nightly database backups
- Settings page (Whisper model size, etc.)
- Firefox extension port

---

## Tips for deep learning

1. **Never skip the test** — if curl or `npm test` fails, fix before the next step.
2. **Read the logs** — append to `~/.recall/logs/daemon.log` from Step 6 onward.
3. **One subprocess at a time** — master yt-dlp alone (Step 11) before chaining Whisper.
4. **Draw data flow** — on paper: URL → classifier → fetch → text → summary → embed → DB.
5. **Break a step on purpose** — kill embed service, save an item, see what happens; then add retry logic.
6. **Keep a lab journal** — note latencies, errors, and "aha" moments per step.

---

## Quick reference: ports & commands

| Service | URL |
|---------|-----|
| Backend | `http://localhost:7878` |
| Embeddings | `http://localhost:7879` |

```bash
# Health checks
curl http://localhost:7878/health
curl http://localhost:7879/health

# Capture
curl -X POST http://localhost:7878/capture -H "Content-Type: application/json" -d @payload.json

# Search
curl "http://localhost:7878/search?q=your+query"

# Inspect DB
sqlite3 ~/.recall/data/recall.db "SELECT id, title, processing FROM items LIMIT 10;"
```

---

*Guide version 1.0 · Derived from recall-prd-implementation-plan.md · June 2026*
