# Recall — Product Requirements Document & Implementation Plan

> Full-stack personal knowledge engine · Chrome extension + mobile app + cloud backend · Secure, private, accessible everywhere

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
9. [Authentication & Security](#9-authentication--security)
10. [Browser Extension Design](#10-browser-extension-design)
11. [Mobile App Design](#11-mobile-app-design)
12. [Tech Stack](#12-tech-stack)
13. [Implementation Plan — Phase by Phase](#13-implementation-plan--phase-by-phase)
14. [Performance Targets](#14-performance-targets)
15. [Future Scope](#15-future-scope)
16. [Identity & Career Module](#16-identity--career-module)
17. [Identity & Career — Data Schema](#17-identity--career--data-schema)
18. [Identity & Career — API Routes](#18-identity--career--api-routes)
19. [Identity & Career — AI / LLM Design (Fireworks AI)](#19-identity--career--ai--llm-design-fireworks-ai)
20. [Identity & Career — Extension UI Design](#20-identity--career--extension-ui-design)
21. [Identity & Career — Chat System Design](#21-identity--career--chat-system-design)
22. [Identity & Career — Implementation Plan (5 Steps)](#22-identity--career--implementation-plan-5-steps)
23. [Identity & Career — Performance Targets](#23-identity--career--performance-targets)

---

## 1. Product Overview

**Recall** is a personal knowledge capture engine that works across all your devices. It is a Chrome extension, a mobile app (iOS + Android), and a hosted backend that lets you save any piece of content you encounter online — a YouTube video, a blog post, a tweet thread, a random link — with a single click, a URL paste, or a share from your phone.

Every saved item is automatically transcribed (if it contains audio), summarised using extractive NLP, embedded as a semantic vector, and stored in a cloud database owned by you. At any point in the future, you can search your entire library by natural language meaning — not just keywords — from your laptop, phone, or any browser.

**Your data, your cloud, your control.** Recall stores everything in your own hosted PostgreSQL database. No third-party reads your saves.

---

## 2. Problem Statement

Knowledge workers, developers, and students consume large amounts of valuable content daily — system design videos, technical blog posts, documentation, social media threads. The current solutions for saving this content are fragmented and inadequate:

| Current approach | Problem |
|---|---|
| Telegram channels | No search, no structure, scroll-only retrieval |
| Browser bookmarks | Desktop-only, no context, keyword search only |
| Note-taking apps | Manual effort, desktop-first, no auto-processing |
| Read-later apps | No transcription, no semantic search, proprietary cloud |
| Local Recall (v1) | Data trapped on one laptop, unusable on phone |

The core problem is a **capture-to-retrieval gap plus a device gap**: saving content takes 1 second, but it is only accessible on the machine where it was saved — and finding it 3 months later is even harder from a phone where the extension doesn't exist.

---

## 3. Goals & Non-Goals

### Goals

- Save any web content with one click from the browser extension
- Save content from the phone via the mobile app or the OS share sheet
- Automatically transcribe video/audio content on the server
- Auto-generate a meaningful title and summary without LLM API calls
- Store everything in a cloud PostgreSQL database — accessible from every device
- Retrieve any saved item by natural language query from any device in under 100ms
- Secure the entire system with authentication so only the owner can access data
- Provide a full-featured mobile app for search, browse, and manual saves

### Non-Goals

- Collaborative/shared libraries (v1 is single-user only)
- Real-time screen monitoring or passive capture
- AI-generated summaries using external LLMs (deliberately kept as optional/opt-in)
- Offline-first mobile app (requires internet to sync; local-only mode is a future scope item)
- Multi-tenant SaaS product (Recall is a self-hosted personal tool)

---

## 4. Core Features

### 4.1 One-Click Capture (Browser)

While browsing any page, the user clicks the Recall extension icon and hits **Quick save**. The content script scrapes the current page's URL, title, and metadata. The service worker fires a job to the cloud backend over HTTPS with the user's auth token. The popup immediately shows a "processing" status and the user continues browsing.

A keyboard shortcut (`Ctrl+Shift+S` / `Cmd+Shift+S`) triggers quick-save without opening the popup.

### 4.2 Mobile Capture

From the iOS or Android app:

- **In-app save:** Paste or type a URL directly in the app
- **Share sheet:** Use the OS share button on any browser, social app, or YouTube → "Share to Recall" → item is queued instantly
- **Quick note:** Record a thought with an optional URL to attach context

### 4.3 Optional Note on Capture

Before saving, the user can type a short description of why they're saving it. The note is stored alongside the auto-generated summary. For manual notes, the note text is used as the embedding input so searching in the user's own words finds the item.

### 4.4 Link Vault

A dedicated tab in the extension and a prominent screen in the mobile app for pasting any URL. Two save modes:

- **Auto-scrape** — the backend fetches the page, runs the full pipeline (extract → transcribe → summarise → embed)
- **Write a note** — the user provides their own description; the backend only fetches og:title and og:image

### 4.5 Server-Side Transcription

Video URLs (YouTube, Twitter/X, Instagram Reels, TikTok) are handled by downloading audio via `yt-dlp` on the backend server, then transcribing with **Whisper.cpp**. This runs on the server — not the user's machine — so saves from the mobile app get the same full transcription as desktop saves.

### 4.6 Extractive Summarisation

TF-IDF (Term Frequency–Inverse Document Frequency) sentence scoring generates summaries and titles — no LLM, no API, no cost. Runs in under 100ms. No content is sent to any third-party service.

### 4.7 Semantic Search (All Devices)

The search bar (extension or mobile app) accepts natural language queries. The same ONNX embedding model embeds the query, then pgvector's HNSW index finds the nearest items. Results are re-ranked by semantic score, recency, and source type. Search is available from any device because the database and embedding service are in the cloud.

### 4.8 Authentication

Every request to the Recall API requires a valid JWT issued by the auth system. The single user registers once with email + password (or OAuth). The JWT is stored securely on the device (Keychain on iOS, Keystore on Android, extension storage on Chrome). All data rows are scoped to `user_id` — no other user can query or modify your data even if they have the API URL.

### 4.9 Background Processing Queue

Capture is always instant — the client sends a job and immediately returns. Processing (fetch → transcribe → summarise → embed) runs in an async queue on the server. Failed jobs are surfaced in both the extension and mobile app with a retry button.

---

## 5. System Architecture

```
┌─────────────────────────┐    ┌─────────────────────────┐
│    CHROME EXTENSION     │    │      MOBILE APP         │
│  (Popup + Search page)  │    │   (iOS / Android)       │
└──────────┬──────────────┘    └────────────┬────────────┘
           │ HTTPS + JWT                    │ HTTPS + JWT
           │                                │
           └──────────────┬─────────────────┘
                          ▼
           ┌──────────────────────────────────┐
           │       CLOUD API BACKEND          │
           │       (Node.js — Railway/Fly.io) │
           │                                  │
           │  Auth → Capture → Queue          │
           │  Pipeline: classify → fetch      │
           │  → yt-dlp → Whisper → TF-IDF     │
           │  → ONNX embed → store            │
           └──────────┬──────────────────────┘
                      │
         ┌────────────┼────────────────┐
         ▼            ▼                ▼
  ┌────────────┐ ┌──────────┐ ┌────────────────┐
  │ PostgreSQL │ │ pgvector │ │ Object storage │
  │ (Neon /   │ │  HNSW    │ │ (R2 / S3)      │
  │ Supabase) │ │ vectors  │ │ transcripts,   │
  │ items +   │ │ in same  │ │ thumbnails     │
  │ users     │ │  table   │ │                │
  └────────────┘ └──────────┘ └────────────────┘
```

### Layer responsibilities

| Layer | Responsibility |
|---|---|
| Chrome extension | Capture from desktop browser; full search UI |
| Mobile app | Capture via share sheet + in-app; full search + browse |
| Auth service | JWT issue/verify; user registration/login; token refresh |
| API backend | Routes, job queue, pipeline orchestration |
| URL classifier | Maps URL to: video / article / social-post / link / pdf |
| yt-dlp | Audio download for video URLs (runs on server) |
| Whisper.cpp | Speech-to-text transcription (runs on server) |
| TF-IDF summariser | Extractive title + summary — no LLM |
| ONNX embedding engine | 384-dim semantic vectors (MiniLM-L6-v2) |
| PostgreSQL + pgvector | All metadata + FTS + semantic vectors in one place |
| Object storage | Large files: transcripts (.txt), thumbnails (.jpg) |

---

## 6. Data Schema

### PostgreSQL — `users` table

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,                        -- null if OAuth only
  oauth_provider TEXT,                       -- 'google' | 'github' | null
  oauth_id      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
```

### PostgreSQL — `items` table

```sql
CREATE TABLE items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Content
  url           TEXT NOT NULL,
  title         TEXT,
  summary       TEXT,
  content       TEXT,                        -- full transcript or article body
  source_type   TEXT NOT NULL,               -- 'video'|'article'|'link'|'social-post'|'pdf'
  save_mode     TEXT NOT NULL,               -- 'auto_scrape' | 'manual_note'
  note          TEXT,                        -- user's own words (optional)
  tags          TEXT[],                      -- array of tags

  -- Metadata
  domain        TEXT,
  thumbnail_url TEXT,                        -- object storage URL
  transcript_url TEXT,                       -- object storage URL

  -- Processing state
  processing    TEXT NOT NULL DEFAULT 'queued',  -- queued|processing|done|failed
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ,
  capture_meta  JSONB,                       -- og_type, has_video, etc.

  -- Semantic vector (pgvector)
  embedding     vector(384)
);

-- Indexes
CREATE INDEX idx_items_user_created ON items(user_id, created_at DESC);
CREATE INDEX idx_items_user_source  ON items(user_id, source_type);
CREATE INDEX idx_items_processing   ON items(processing) WHERE processing != 'done';

-- HNSW index for fast ANN vector search
CREATE INDEX idx_items_embedding ON items
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Full-text search using PostgreSQL tsvector
ALTER TABLE items ADD COLUMN fts_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(note, '') || ' ' ||
      coalesce(content, '')
    )
  ) STORED;

CREATE INDEX idx_items_fts ON items USING GIN(fts_vector);
```

### PostgreSQL — `refresh_tokens` table

```sql
CREATE TABLE refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  device     TEXT,                           -- 'chrome-extension' | 'ios' | 'android'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN NOT NULL DEFAULT false
);
```

### Object storage layout

```
recall-bucket/
  {user_id}/
    transcripts/
      {item_id}.txt
    thumbnails/
      {item_id}.jpg
```

---

## 7. Processing Pipeline

### Pipeline stages

```
Input (URL + optional note + user_id)
        │
        ▼
┌──────────────────────────┐
│  Auth check (JWT valid)  │
└──────────┬───────────────┘
           │
        ┌──▼─────────────────────┐
        │  1. URL Classifier     │ → source_type
        └──────────┬─────────────┘
                   │
       ┌───────────┴────────────┐
       │                        │
       ▼                        ▼
    video                  article / link / pdf
       │                        │
  yt-dlp (audio)          Readability / pdf-parse
       │                        │
  Whisper.cpp                   │
  (transcript)                  │
       │                        │
       └────────────┬───────────┘
                    ▼
        ┌───────────────────────┐
        │  2. TF-IDF Summariser │ → title + summary
        └───────────┬───────────┘
                    ▼
        ┌───────────────────────┐
        │  3. ONNX Embedder     │ → 384-dim vector
        └───────────┬───────────┘
                    ▼
        ┌───────────────────────┐
        │  4. Storage           │
        │  PostgreSQL (metadata │
        │  + embedding)         │
        │  + object storage     │
        │  (transcript, image)  │
        └───────────────────────┘
```

### URL Classifier rules

| Pattern | source_type | Fetch method |
|---|---|---|
| youtube.com, youtu.be, tiktok.com | video | yt-dlp (audio) |
| instagram.com/reels/ | video | yt-dlp (audio) |
| twitter.com / x.com + video | video | yt-dlp (audio) |
| twitter.com / x.com (text) | social-post | og:description |
| Medium, Substack, dev.to, blogs | article | Readability |
| URLs ending in .pdf | pdf | pdf-parse |
| Everything else | link | og:title + og:description |

---

## 8. Semantic Search Design

### How it works

1. User types a query on any device (extension or mobile app)
2. API receives query + user JWT → verifies user
3. ONNX MiniLM embeds the query → 384-dim vector (~15ms)
4. pgvector HNSW index finds top-20 nearest items for this user by cosine similarity (~5ms)
5. PostgreSQL FTS (`tsvector`) runs in parallel if query is keyword-oriented
6. Results are merged, re-ranked by weighted score, and returned

### Hybrid re-ranking formula

```
final_score =
  semantic_score    × 0.70
  + keyword_score   × 0.30    (if hybrid mode)
  + recency_score   × 0.20
  + source_boost    × 0.10
```

### User isolation

All vector and FTS queries are scoped with `WHERE user_id = $1`. One user's library never appears in another's search results.

### Search latency targets

| Operation | Expected latency |
|---|---|
| ONNX embedding | ~15ms |
| pgvector HNSW ANN | ~5ms at 100k items |
| PostgreSQL FTS | ~3ms |
| Total end-to-end | **< 100ms** |

---

## 9. Authentication & Security

### Auth flow

```
User (browser / mobile)
  │
  ├─ Register: POST /auth/register { email, password }
  │    → hashed with bcrypt (cost 12)
  │    → returns access_token (JWT, 15min) + refresh_token (30 days)
  │
  ├─ Login: POST /auth/login { email, password }
  │    → verifies hash → issues same token pair
  │
  ├─ OAuth: GET /auth/google  (or /auth/github)
  │    → OAuth2 redirect flow
  │    → issues same token pair on callback
  │
  ├─ Refresh: POST /auth/refresh { refresh_token }
  │    → issues new access_token + rotates refresh_token
  │
  └─ Logout: POST /auth/logout
       → revokes refresh_token in DB
```

### Token storage

| Platform | Storage |
|---|---|
| Chrome extension | `chrome.storage.local` (isolated per extension) |
| iOS | iOS Keychain (never in NSUserDefaults) |
| Android | Android Keystore / EncryptedSharedPreferences |

### Security requirements

- All API traffic over **HTTPS** (TLS 1.2+)
- JWT signed with **RS256** (asymmetric — private key on server only)
- Access token: 15-minute expiry — short-lived for security
- Refresh token: 30-day expiry — rotated on every use
- `user_id` on every data row — enforced at DB level (foreign key + RLS)
- Row-Level Security (RLS) enabled on PostgreSQL — even if SQL injection occurred, cross-user data leakage is blocked at DB layer
- API key option for headless use (long-lived, scoped to one user)
- Rate limiting: 100 requests/minute per user on all routes

### Row-Level Security (PostgreSQL)

```sql
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

CREATE POLICY items_user_isolation ON items
  USING (user_id = current_setting('app.current_user_id')::uuid);
```

---

## 10. Browser Extension Design

### Manifest V3 structure

```
recall-extension/
  manifest.json
  popup/
    popup.html / popup.js / popup.css   ← Capture, Vault, Recent tabs
  content/
    content.js                          ← DOM scraper
  background/
    service-worker.js                   ← Auth, API client, job queue
  search/
    search.html / search.js             ← Full search page
  settings/
    settings.html / settings.js         ← Server URL, API key, preferences
  shared/
    api.js                              ← Auth-aware HTTP client
    auth.js                             ← JWT storage + refresh logic
```

### Extension auth flow

1. On first load: if no token stored → show **Sign in** screen in popup
2. User enters email + password → POST `/auth/login` → tokens stored in `chrome.storage.local`
3. All subsequent API calls include `Authorization: Bearer <access_token>`
4. On 401 response → try refresh → if refresh fails → show sign-in again

### Popup tabs

**Tab 1 — Capture**
- Current page card, quick save, add note toggle
- Shows connection status and logged-in user email in footer

**Tab 2 — Link Vault**
- URL input, auto-scrape / manual note toggle
- Save button with mode-appropriate label

**Tab 3 — Recent**
- Debounced search (220ms), last 20 saves
- Each item: type icon, title, domain, relative time

**Footer (persistent)**
- Total items saved, cloud status indicator, user avatar/email

### Full search page

- Large search input, autofocused
- Filter bar: type chips, date range
- Results with title, summary, source badge, save date
- Video cards: expand inline → full transcript
- Keyboard navigation (↑↓ Enter)

---

## 11. Mobile App Design

### Platform

**React Native** (shared codebase for iOS and Android).

### Screens

```
Auth stack:
  ─ Login screen (email + password, Google OAuth button)
  ─ Register screen

Main stack (authenticated):
  ─ Home / Feed
      Recent saves, quick-add button, search bar
  ─ Search
      Full search with filters (type, date), infinite scroll
  ─ Item detail
      Full metadata, transcript, tags, note, open original URL
  ─ Save / Add
      URL input or paste, mode toggle (auto/note), note textarea
  ─ Settings
      Account (email, change password, logout), server URL
```

### Share sheet integration

```
iOS:   Share Extension target → validate URL → POST /capture → show confirmation
Android: Intent filter (android.intent.action.SEND for text/plain) → same flow
```

### Auth on mobile

- Tokens stored in Keychain (iOS) / Keystore (Android)
- Auto-refresh on app foreground if access token is within 2 minutes of expiry
- Biometric unlock option (FaceID / fingerprint) to open app

### Offline handling

- Show cached last-fetch results from local SQLite (read-only mirror) when offline
- Queue saves locally and flush when connectivity returns
- Banner: "Offline — changes will sync when connected"

---

## 12. Tech Stack

| Component | Technology | Reason |
|---|---|---|
| Backend runtime | Node.js (Express) | Fast iteration, large ecosystem, async-native |
| Auth library | `jsonwebtoken` + `bcrypt` | Standard, well-audited |
| Job queue | `pg-boss` (PostgreSQL-backed) | Queue stored in same Postgres DB — no Redis needed |
| Media download | yt-dlp | Handles YouTube, Instagram, TikTok, Twitter/X |
| Article extraction | @mozilla/readability | Battle-tested, same as Firefox |
| Transcription | Whisper.cpp | C++ binary on server, no API cost |
| Summarisation | Custom TF-IDF (Python) | Zero cost, <100ms, no LLM |
| Embedding model | all-MiniLM-L6-v2 (ONNX) | 22MB, 15ms, 384-dim |
| Embedding runtime | ONNX Runtime (Python FastAPI) | No PyTorch overhead at runtime |
| Main database | **PostgreSQL + pgvector** | Metadata + FTS + vectors in one place, ACID |
| Managed Postgres | **Neon** or **Supabase** | Serverless Postgres, pgvector support, free tiers |
| Object storage | **Cloudflare R2** or Supabase Storage | Cheap, S3-compatible, global CDN |
| Backend host | **Railway** or **Fly.io** | Docker Compose deploy, persistent disk, simple CI |
| Mobile app | **React Native** (Expo) | One codebase for iOS + Android |
| Chrome extension | Manifest V3, Vanilla JS | No framework overhead |
| OAuth provider | Google OAuth2 | Standard, widely trusted |

### Why PostgreSQL + pgvector over SQLite + ChromaDB (v1 upgrade)

| Concern | SQLite + ChromaDB (v1) | PostgreSQL + pgvector (v2) |
|---|---|---|
| Multi-device access | Not possible (file-based) | Yes — all clients query same DB |
| Vector search | Separate service (ChromaDB) | Same DB, same query, one connection |
| FTS | FTS5 (good) | `tsvector` + GIN (equivalent quality) |
| Auth / multi-user | Not supported | Row-level security, user scoping |
| Backup | Manual ZIP | Neon/Supabase managed backup |
| Scale | Single machine | Cloud-managed, scales automatically |

### Why no LLM API in the mandatory pipeline

- **Cost** — zero cost per save, regardless of volume
- **Latency** — TF-IDF takes <100ms vs 2–5s for an API call
- **Privacy** — content never sent to OpenAI/Anthropic
- **Reliability** — works without external API availability

LLM calls may be added as an opt-in "Ask library" feature powered by a local Ollama instance.

---

## 13. Implementation Plan — Phase by Phase

---

### Phase 1 — Cloud backend foundation
**Duration: Weeks 1–2**

#### Objective

Migrate the existing local backend to a cloud-hosted service backed by PostgreSQL. All core API routes work. Extension still functions.

#### Tasks

**Database migration**
- Provision PostgreSQL on Neon (free tier to start)
- Install `pgvector` extension: `CREATE EXTENSION IF NOT EXISTS vector`
- Write migration SQL for `users`, `items`, `refresh_tokens` tables as specified in §6
- Enable Row-Level Security on `items`
- Port existing `items` data model from SQLite to PostgreSQL (`pg` npm package)
- Remove `better-sqlite3` and ChromaDB — replace with single `pg` connection pool
- Update `search-service.js` to use pgvector ANN query and `tsvector` FTS

**Backend hosting**
- Dockerize backend (already done — `backend/Dockerfile`)
- Deploy to Railway via `docker compose up`
- Set env vars: `DATABASE_URL`, `RECALL_API_KEY`, `CORS_ORIGINS`
- Verify `/health` endpoint returns `ok: true` from the internet

**Object storage**
- Provision Cloudflare R2 bucket (or Supabase Storage)
- Update transcript and thumbnail write paths to upload to R2 and store URL in DB
- Update `fetch-og.js` and `transcribe.js` to use object storage client

**Testing milestone**
- POST `/capture` to the cloud backend URL → item appears in cloud Postgres → pgvector has embedding → object storage has transcript

**Deliverable:** Fully cloud-deployed backend. Extension works with remote URL.

---

### Phase 2 — Authentication
**Duration: Weeks 3–4**

#### Objective

Every API call requires a valid JWT. User can register, log in, and log out. All data is user-scoped.

#### Tasks

**Auth endpoints**
- `POST /auth/register` — validate email, hash password (bcrypt cost 12), insert user row, issue JWT pair
- `POST /auth/login` — verify password hash, issue JWT pair
- `POST /auth/refresh` — validate refresh token hash, rotate and issue new pair
- `POST /auth/logout` — mark refresh token as revoked
- `GET /auth/me` — return current user info

**JWT middleware**
- `middleware/auth.js` — extract Bearer token from `Authorization` header, verify RS256 signature, attach `req.user.id` to request
- Apply to all routes except `/health`, `/auth/*`
- On expiry → 401 → client refreshes automatically

**User scoping**
- Add `WHERE user_id = $1` to every `SELECT`, `INSERT`, `UPDATE`, `DELETE` in `db/items.js`
- Pass `req.user.id` from all route handlers to DB functions
- Enable RLS policy in Postgres as a secondary enforcement layer

**OAuth (optional Phase 2 add-on)**
- `GET /auth/google` — redirect to Google OAuth2 consent
- `GET /auth/google/callback` — exchange code → upsert user row → issue JWT pair

**Testing milestone**
- Register user A and user B. Save items under each. Verify A's items never appear in B's search. Verify expired token triggers 401.

**Deliverable:** All API routes require authentication. Data is fully isolated per user.

---

### Phase 3 — Extension auth integration
**Duration: Week 5**

#### Objective

The Chrome extension handles sign-in, stores tokens securely, auto-refreshes, and passes JWT on every request.

#### Tasks

**Sign-in screen**
- New `auth/login.html` popup page — shown when no valid token is stored
- Email + password form → `POST /auth/login` → store `access_token` + `refresh_token` in `chrome.storage.local`
- Google OAuth button → opens auth URL in new tab → extension listens for redirect with code → exchanges for tokens

**Auth-aware API client** (`shared/api.js`)
- Before every request: check if access token is expired (decode JWT `exp` claim) → if within 60s of expiry → call `/auth/refresh` first
- On 401: attempt one refresh → retry original request → if still 401 → redirect to sign-in
- Store user email + avatar in `chrome.storage.local` for display in popup footer

**Settings page**
- Show logged-in user email
- "Sign out" button → `POST /auth/logout` → clear tokens → redirect to sign-in screen

**Testing milestone**
- Sign in via extension. Save 5 items. Sign out. Verify extension shows sign-in screen. Sign in again. Verify items still visible.

**Deliverable:** Extension fully authenticated. Token lifecycle (expiry, refresh, logout) handled transparently.

---

### Phase 4 — Mobile app (React Native)
**Duration: Weeks 6–9**

#### Objective

A fully functional iOS and Android app that can sign in, browse, search, and save content.

#### Tasks

**Project setup**
- Initialize Expo project with TypeScript
- Install: `react-navigation`, `expo-secure-store`, `expo-sharing`, `@tanstack/react-query`
- Configure API base URL from environment (dev = `localhost:7878`, prod = cloud URL)

**Auth screens**
- Login screen: email + password fields, Google OAuth button
- Register screen: email + password + confirm
- Token storage in `expo-secure-store` (maps to iOS Keychain / Android Keystore)
- Auto-refresh logic: check expiry on app foreground, refresh silently

**Share extension (capture from other apps)**
- iOS: create `ShareExtension` target in Xcode — validate URL → `POST /capture` with JWT
- Android: `intent-filter` in `AndroidManifest.xml` for `text/plain` → same flow
- Show brief "Saved to Recall" toast after queuing

**Main screens**
- **Home:** Last 20 saves, pull-to-refresh, search bar at top
- **Search:** Query input → live results → filters (type, date) → tap item → detail screen
- **Item detail:** Title, summary, source badge, note, tags, full transcript (expandable), "Open original" button
- **Add / Save:** URL input or paste, mode toggle, note textarea, Save button
- **Settings:** User info, change password, server URL override, logout

**Offline mode**
- Cache last `/items` response in local SQLite (read-only mirror) using `expo-sqlite`
- Show cached results when offline with banner
- Queue POST `/capture` calls and flush on connectivity restore

**Testing milestone**
- Install on physical iOS device. Sign in. Save a YouTube Reel via share sheet. Search for it by meaning in the app. Tap to open in Safari. Sign out. Verify app shows login screen.

**Deliverable:** Fully functional mobile app on both platforms. All core features working.

---

### Phase 5 — Polish and production hardening
**Duration: Weeks 10–11**

#### Objective

Everything is stable, secure, and maintainable. One-command deploy. All devices stay in sync.

#### Tasks

**Security hardening**
- Rate limiting: `express-rate-limit` — 100 req/min per user
- Input validation: `zod` on all request bodies
- `helmet.js` security headers on all responses
- Refresh token rotation on every use (already in auth design)
- API key rotation endpoint: `POST /auth/rotate-api-key`

**Performance**
- Connection pooling: PgBouncer or Neon serverless driver connection pooler
- pgvector index: tune `m` and `ef_construction` after 10k item seed test
- Object storage: CDN-cached URLs with 24h expiry for thumbnails

**Observability**
- Structured JSON logging with request ID, user ID, route, latency
- `/health` returns DB ping latency, embed service status, queue depth
- Error tracking: Sentry (free tier) in both backend and mobile app

**Mobile release**
- TestFlight (iOS) + Play Store internal testing (Android) release
- Expo EAS Build for CI-built binaries
- App icon, splash screen, App Store metadata

**Documentation**
- `HOSTING.md` (updated): one-command Railway deploy with Neon Postgres
- `MOBILE.md`: how to build and sideload the app
- `API.md`: full OpenAPI spec for all endpoints
- `README.md`: updated architecture diagram showing cloud + mobile

**Testing milestone**
- Deploy from scratch on a fresh Railway project. Install extension. Install mobile app. Save 100 items from both clients. Run search latency benchmark — verify p99 < 100ms. Verify data is identical on both.

**Deliverable:** Stable, secure, documented, deployable product. All devices in sync. Data protected by auth.

---

## 14. Performance Targets

| Metric | Target |
|---|---|
| Capture to "saved" confirmation (any device) | < 500ms |
| Article pipeline (fetch + summarise + embed) | < 15s |
| Video pipeline (10-min video, server CPU) | < 150s |
| Search query end-to-end latency | < 100ms |
| Search latency at 100k items (pgvector HNSW) | < 50ms |
| ONNX embedding inference | < 20ms |
| JWT verification middleware overhead | < 1ms |
| Mobile app cold start | < 2s |
| API backend memory usage (idle) | < 256MB |
| PostgreSQL DB size per 1,000 items | ~25MB (incl. vectors) |

---

## 15. Future Scope

These features are out of scope for v1–v2 but are designed for in the data model.

| Feature | Notes |
|---|---|
| Collections / folders | Group items by topic. `tags[]` column is the foundation |
| Smart auto-tagging | LLM or classifier assigns tags automatically at save time |
| Offline-first mobile | Full sync protocol with conflict resolution |
| Firefox extension | Same API, different manifest |
| iPad app / macOS Catalyst | Already covered by React Native on mobile |
| LLM-powered Q&A | "Ask a question about your saves" using local Ollama |
| Highlights | Save selected text from any page, not just full URLs |
| RSS / newsletter import | Auto-save from subscribed feeds |
| Public sharing | Share a read-only link to a saved item |
| Multi-user / family plan | Separate libraries per user account (auth already supports this) |
| Encrypted storage | Client-side encryption of content before storing to DB |
| Web app | Full search UI accessible from any browser without the extension |

---

*Document version: 2.0 · Last updated: June 2026 · Status: Active development — migrating from local-only (v1) to full-stack cloud + mobile (v2)*

---

## 16. Identity & Career Module

### Overview

The **Identity & Career** module is a new first-class section in the Recall Chrome extension. It acts as a personal professional hub: it stores your profile, social links, projects, and resume in structured form, and uses Fireworks AI to analyse job descriptions, rewrite project bullets to be ATS-friendly, tailor your full resume to any role, and assist via a persistent chatbot interface.

This module **reuses all existing Recall infrastructure** — the same PostgreSQL database, the same auth system, the same ONNX embedding engine for semantic scoring, and the same extension shell. No new hosting or infrastructure is required beyond a Fireworks AI API key.

**Implementation:** Delivered in **5 steps**. See §22 and [`identity-career-implementation-prompts.md`](./identity-career-implementation-prompts.md) for structured copy-paste agent prompts per step.

### Problem This Solves

| Situation | Current pain | What this module does |
|---|---|---|
| Applying to a job | Manually rewriting resume bullets for each JD | AI analyses JD, scores your projects, rewrites bullets to match JD language |
| Filling application forms | Typing the same bio/links repeatedly | One-click copy of bio, pitch, social links |
| Keeping resume up to date | Scattered notes and multiple doc versions | Single structured master resume, versioned tailored copies per application |
| Updating profile details | No central place | Chat interface: "Update my GitHub to X" |
| ATS screening failure | Generic resume doesn't match JD keywords | Full resume tailored and exported as ATS-clean plain text or PDF |

### Key Capabilities

1. **Profile store** — display name, headline, bio, social links (GitHub, LinkedIn, Twitter/X, website), skills list
2. **Projects database** — structured project entries with tech stack, impact bullets, links, and sort order
3. **Master resume** — structured JSON resume (work experience, education, certifications) with on-demand PDF/plain-text export
4. **JD Analyser** — paste any job description → extract required/preferred skills, keywords, seniority level → score all your projects by relevance → suggest ordering
5. **ATS bullet rewriting** — AI rewrites your project bullets using JD language so they pass ATS keyword filters
6. **Tailored resume builder** — assembles a full resume from your master data + JD-specific selections → outputs plain text (ATS paste) and formatted PDF
7. **Form fill assistant** — one-click copy of short bio, elevator pitch, or cover letter opening
8. **Chatbot editor** — persistent chat drawer to update any profile field, add projects, trigger analysis, or generate text conversationally

---

## 17. Identity & Career — Data Schema

Four new PostgreSQL tables, all scoped to `user_id` with Row-Level Security.

### `user_profile` table

Extends the existing `users` table with professional profile data (one row per user).

```sql
CREATE TABLE user_profile (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  display_name  TEXT,
  headline      TEXT,                        -- e.g. "Full-Stack Engineer"
  github_url    TEXT,
  linkedin_url  TEXT,
  twitter_url   TEXT,
  website_url   TEXT,
  bio_short     TEXT,                        -- 2–3 sentence bio
  skills        TEXT[],                      -- ordered skill list
  fireworks_api_key_enc TEXT,                -- encrypted Fireworks key (optional)
  ai_quality_model TEXT DEFAULT 'accounts/fireworks/models/deepseek-v3p1',
  ai_chat_model    TEXT DEFAULT 'accounts/fireworks/models/kimi-k2-instruct-0905',
  ai_reasoning_model TEXT DEFAULT 'accounts/fireworks/models/glm-5p2',
  ai_deep_analysis_enabled BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_profile_isolation ON user_profile
  USING (user_id = current_setting('app.current_user_id')::uuid);
```

### `projects` table

Structured project entries — the core building block for resume tailoring.

```sql
CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  tagline         TEXT,
  description     TEXT,                      -- paragraph-form description
  tech_stack      TEXT[],                    -- e.g. ['React', 'Node.js', 'PostgreSQL']
  impact_bullets  TEXT[],                    -- master bullet list (rewritten per JD)
  github_url      TEXT,
  live_url        TEXT,
  start_date      DATE,
  end_date        DATE,                      -- null = ongoing
  is_featured     BOOLEAN DEFAULT false,
  sort_order      INTEGER DEFAULT 0,
  embedding       vector(384),               -- ONNX embed of description+bullets for scoring
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- HNSW index for project ↔ JD cosine similarity scoring
CREATE INDEX idx_projects_embedding ON projects
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_projects_user ON projects(user_id, sort_order);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_user_isolation ON projects
  USING (user_id = current_setting('app.current_user_id')::uuid);
```

### `resume_template` table

Structured resume data in JSONB. The master version is `is_master = true`. Tailored versions generated per JD are stored as additional rows.

```sql
CREATE TABLE resume_template (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL DEFAULT 1,
  is_master       BOOLEAN NOT NULL DEFAULT false,
  label           TEXT,                      -- 'master', 'Google SWE v1', etc.
  experience      JSONB,                     -- [{company, role, start, end, bullets[]}]
  education       JSONB,                     -- [{institution, degree, year}]
  certifications  JSONB,                     -- [{name, issuer, year}]
  jd_analysis_id  UUID REFERENCES jd_analyses(id), -- null for master
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_resume_user ON resume_template(user_id, is_master, created_at DESC);

ALTER TABLE resume_template ENABLE ROW LEVEL SECURITY;
CREATE POLICY resume_user_isolation ON resume_template
  USING (user_id = current_setting('app.current_user_id')::uuid);
```

### `jd_analyses` table

Caches the result of each JD analysis run. Keyed by SHA-256 hash of the JD text to avoid re-running expensive LLM calls on the same JD.

```sql
CREATE TABLE jd_analyses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jd_text               TEXT NOT NULL,
  jd_hash               TEXT NOT NULL,           -- sha256(jd_text) for dedup
  extracted_keywords    TEXT[],
  required_skills       TEXT[],
  preferred_skills      TEXT[],
  seniority_level       TEXT,
  company_name          TEXT,
  role_title            TEXT,
  project_scores        JSONB,                   -- { "project_id": 0.92, ... }
  suggested_project_order UUID[],
  tailored_bullets      JSONB,                   -- { "project_id": ["bullet1", ...] }
  reasoning_trace       TEXT,                    -- glm-5p2 reasoning output (if deep mode)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent re-running the same JD for the same user
CREATE UNIQUE INDEX idx_jd_analyses_hash ON jd_analyses(user_id, jd_hash);
CREATE INDEX idx_jd_analyses_user ON jd_analyses(user_id, created_at DESC);

ALTER TABLE jd_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY jd_analyses_user_isolation ON jd_analyses
  USING (user_id = current_setting('app.current_user_id')::uuid);
```

### Migration file

```sql
-- migrations/004_identity_career_tables.sql
CREATE EXTENSION IF NOT EXISTS vector;  -- already enabled from Phase 1

-- Run all four CREATE TABLE statements above in order:
-- 1. user_profile
-- 2. projects
-- 3. jd_analyses  (must exist before resume_template references it)
-- 4. resume_template
```

---

## 18. Identity & Career — API Routes

All routes require a valid JWT (`Authorization: Bearer <token>`). All DB calls pass `req.user.id` and rely on RLS as a secondary enforcement layer.

### Profile CRUD

```
GET    /profile
       → returns { user_profile, projects[], master_resume }

PUT    /profile
       → body: { display_name?, headline?, github_url?, linkedin_url?,
                 twitter_url?, website_url?, bio_short?, skills? }
       → updates user_profile row, bumps updated_at

PUT    /profile/ai-settings
       → body: { fireworks_api_key?, ai_quality_model?, ai_chat_model?,
                 ai_reasoning_model?, ai_deep_analysis_enabled? }
       → stores encrypted API key, model overrides
```

### Projects CRUD

```
GET    /profile/projects
       → returns projects[] ordered by sort_order

POST   /profile/projects
       → body: { name, tagline?, description?, tech_stack?, impact_bullets?,
                 github_url?, live_url?, start_date?, end_date?, is_featured? }
       → inserts project row, triggers async ONNX embedding of description+bullets

PUT    /profile/projects/:id
       → body: any subset of project fields
       → updates row, re-embeds if description or impact_bullets changed

DELETE /profile/projects/:id
       → deletes project row

PUT    /profile/projects/reorder
       → body: { ordered_ids: UUID[] }
       → bulk-updates sort_order values
```

### Resume CRUD

```
GET    /profile/resume
       → returns master resume (is_master = true)

POST   /profile/resume
       → body: { experience, education, certifications, label? }
       → upserts master resume (sets is_master = true)

GET    /profile/resume/history
       → returns all resume versions for this user (master + tailored), newest first

GET    /profile/resume/:id
       → returns a specific resume version
```

### JD Analysis

```
POST   /career/analyze-jd
       → body: { jd_text, deep_mode?: boolean }
       → checks jd_hash for cached result first
       → if cache miss: runs extraction pipeline (see §19)
       → returns full jd_analysis object

GET    /career/analyses
       → returns list of past jd_analyses (id, role_title, company_name, created_at)

GET    /career/analyses/:id
       → returns full analysis including tailored_bullets and project_scores
```

### Resume Builder

```
POST   /career/build-resume
       → body: { jd_analysis_id, selected_project_ids: UUID[], format: 'json'|'text'|'pdf' }
       → assembles tailored resume from master data + JD selections
       → stores as new resume_template row (is_master = false)
       → returns: { resume_id, json?, plain_text?, pdf_url? }
```

### Text Generation (Form Fill)

```
POST   /career/generate/bio
       → body: { tone?: 'professional'|'casual', word_limit?: number }
       → returns { bio: string }

POST   /career/generate/pitch
       → body: { context?: string, word_limit?: number }
       → returns { pitch: string }

POST   /career/generate/cover-letter
       → body: { jd_analysis_id: UUID, tone?: string }
       → returns streamed SSE text (cover letter opening paragraph)
```

### Chat

```
POST   /career/chat
       → body: { messages: [{ role: 'user'|'assistant', content: string }] }
       → calls Fireworks kimi-k2 with tool definitions
       → executes any tool calls against DB
       → returns { reply: string, actions_taken: [{ tool, params, result }] }
```

---

## 19. Identity & Career — AI / LLM Design (Fireworks AI)

### SDK Setup

The backend uses the `openai` npm package pointed at Fireworks' OpenAI-compatible endpoint. No additional SDK or dependency is required.

```javascript
// services/llm-client.js
import OpenAI from 'openai';

const fireworks = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY,           // fallback system key
  baseURL: 'https://api.fireworks.ai/inference/v1',
});

// Per-user key override (if user supplies their own key)
export function getClient(userApiKey) {
  if (userApiKey) {
    return new OpenAI({
      apiKey: userApiKey,
      baseURL: 'https://api.fireworks.ai/inference/v1',
    });
  }
  return fireworks;
}
```

### Model Assignments

| Task | Model | API feature used | Reason |
|---|---|---|---|
| JD keyword & skill extraction | `accounts/fireworks/models/deepseek-v3p1` | `response_format: json_schema` | Guaranteed JSON output; fast |
| ATS bullet rewriting | `accounts/fireworks/models/deepseek-v3p1` | Streaming (`stream: true`) | Tokens stream to UI in real time |
| Full resume tailoring | `accounts/fireworks/models/deepseek-v3p1` | `response_format: json_schema` | Structured resume JSON output |
| Bio / pitch / cover letter | `accounts/fireworks/models/deepseek-v3p1` | Streaming | Real-time text generation |
| Chat with profile mutations | `accounts/fireworks/models/kimi-k2-instruct-0905` | Function calling (`tools`) | Recommended model for tool use in Fireworks docs |
| Deep JD analysis (optional) | `accounts/fireworks/models/glm-5p2` | `reasoning_effort: 'medium'` | Reasoning trace for complex skill-gap analysis |
| Project ↔ JD scoring | Existing ONNX MiniLM-L6-v2 | pgvector cosine similarity | No LLM needed — reuses existing embedding infra |

### `completeStructured` — JSON schema output

Used for JD extraction and resume building. Guarantees a valid, typed JSON object with no output parsing needed.

```javascript
export async function completeStructured({ prompt, schema, schemaName, userApiKey }) {
  const client = getClient(userApiKey);
  const response = await client.chat.completions.create({
    model: 'accounts/fireworks/models/deepseek-v3p1',
    messages: [{ role: 'user', content: prompt }],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: schemaName,
        schema,
      },
    },
    temperature: 0.2,
  });
  return JSON.parse(response.choices[0].message.content);
}
```

### `completeStreaming` — real-time token stream

Used for bullet rewrites, bio, pitch, and cover letter. The backend pipes the Fireworks SSE stream through as an SSE response to the extension.

```javascript
export async function completeStreaming({ messages, res, userApiKey }) {
  const client = getClient(userApiKey);
  const stream = await client.chat.completions.create({
    model: 'accounts/fireworks/models/deepseek-v3p1',
    messages,
    stream: true,
    temperature: 0.4,
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content || '';
    if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
}
```

### `completeWithTools` — function calling for chat

Uses `kimi-k2-instruct-0905`, the model Fireworks recommends for function calling. The backend executes tool calls and appends results before getting the final reply.

```javascript
export async function completeWithTools({ messages, tools, userApiKey }) {
  const client = getClient(userApiKey);
  return client.chat.completions.create({
    model: 'accounts/fireworks/models/kimi-k2-instruct-0905',
    messages,
    tools,
    temperature: 0.2,
  });
}
```

### `completeWithReasoning` — deep JD analysis

Uses `glm-5p2` with `reasoning_effort: 'medium'`. Only triggered when the user enables deep analysis mode in settings. The reasoning trace is stored in `jd_analyses.reasoning_trace` for reference.

```javascript
export async function completeWithReasoning({ prompt, userApiKey }) {
  const client = getClient(userApiKey);
  const response = await client.chat.completions.create({
    model: 'accounts/fireworks/models/glm-5p2',
    messages: [{ role: 'user', content: prompt }],
    reasoning_effort: 'medium',
    temperature: 0.1,
  });
  const msg = response.choices[0].message;
  return {
    answer: msg.content,
    reasoning: msg.reasoning_content || null,
  };
}
```

### JD Analysis Pipeline

The `/career/analyze-jd` route runs this pipeline:

```
Input: jd_text
       │
       ├─ 1. Hash check → sha256(jd_text)
       │       cache hit? → return stored jd_analysis immediately
       │
       ├─ 2. LLM extraction (deepseek-v3p1, json_schema)
       │       → required_skills[], preferred_skills[],
       │         keywords[], seniority_level, role_title, company_name
       │
       ├─ 3. JD embedding (existing ONNX MiniLM-L6-v2)
       │       → 384-dim vector of the JD text
       │
       ├─ 4. Project scoring (pgvector cosine similarity)
       │       SELECT id, name,
       │         1 - (embedding <=> $jd_vector) AS score
       │       FROM projects WHERE user_id = $uid
       │       ORDER BY score DESC
       │       → project_scores{}, suggested_project_order[]
       │
       ├─ 5. (Optional, deep mode) reasoning pass (glm-5p2)
       │       → deeper skill-gap analysis, reasoning_trace stored
       │
       ├─ 6. Bullet rewriting (deepseek-v3p1, streaming to client)
       │       → for top-N suggested projects:
       │         rewrite impact_bullets using JD keyword language
       │         → tailored_bullets{ project_id: [bullet, ...] }
       │
       └─ 7. Store in jd_analyses table, return full result
```

### JSON Schema: JD Extraction

```javascript
const jdExtractionSchema = {
  type: 'object',
  properties: {
    role_title:        { type: 'string' },
    company_name:      { type: 'string' },
    seniority_level:   { type: 'string', enum: ['intern', 'junior', 'mid', 'senior', 'staff', 'principal', 'unknown'] },
    required_skills:   { type: 'array', items: { type: 'string' } },
    preferred_skills:  { type: 'array', items: { type: 'string' } },
    keywords:          { type: 'array', items: { type: 'string' } },
    ats_keywords:      { type: 'array', items: { type: 'string' } },  // exact phrases to use verbatim
  },
  required: ['role_title', 'required_skills', 'keywords', 'ats_keywords'],
};
```

### JSON Schema: Resume Tailoring Output

```javascript
const tailoredResumeSchema = {
  type: 'object',
  properties: {
    summary:        { type: 'string' },           // ATS-optimised professional summary
    experience: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          company:   { type: 'string' },
          role:      { type: 'string' },
          start:     { type: 'string' },
          end:       { type: 'string' },
          bullets:   { type: 'array', items: { type: 'string' } },
        },
        required: ['company', 'role', 'bullets'],
      },
    },
    skills_section: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'experience', 'skills_section'],
};
```

### Client-Side vs. Backend LLM Calls

| Feature | Call path | Reason |
|---|---|---|
| JD extraction | Backend → Fireworks | Needs ONNX embedder + pgvector for project scoring |
| Bullet rewrites | Backend → Fireworks (stream) | Needs project DB data for context |
| Full resume tailoring | Backend → Fireworks | Assembles data from multiple DB tables |
| Chat mutations | Backend → Fireworks (tools) | Tool calls execute DB writes server-side |
| Bio / pitch generation | Extension → Fireworks directly | Pure generation, no DB; lower latency, no backend hop |
| Cover letter | Extension → Fireworks directly (stream) | Same — streams tokens directly to the UI |

For direct extension calls, the Fireworks API key is read from `chrome.storage.local` (set via the settings page). Fireworks supports CORS for browser clients.

---

## 20. Identity & Career — Extension UI Design

### Entry Point

A new **"Profile"** button is added to the existing extension popup footer alongside the existing navigation. Clicking it opens `profile.html` as a full extension page (same pattern as the existing `search.html`).

### Extension file structure additions

```
recall-extension/
  profile/
    profile.html                ← full-page root
    profile.js                  ← page init, tab routing, auth check
    profile.css                 ← page styles
    sections/
      identity.js               ← Identity tab
      projects.js               ← Projects tab
      resume.js                 ← Resume tab
      career.js                 ← Career / JD Analyser tab
      chat.js                   ← Chat drawer (shared across all tabs)
    components/
      project-card.js           ← reusable project card with edit/delete
      bullet-editor.js          ← add/edit/delete bullet points inline
      diff-viewer.js            ← original vs. tailored bullet side-by-side
      copy-button.js            ← clipboard copy with "Copied!" feedback
      stream-target.js          ← renders streaming SSE tokens into a div
      tag-input.js              ← skills / tech stack chip input
```

### Full-page layout

```
┌─────────────────────────────────────────────────────┐
│  ← Back to Recall          PROFILE & CAREER         │
├─────────────────────────────────────────────────────┤
│  [ Identity ]  [ Projects ]  [ Resume ]  [ Career ] │  ← sub-nav
├─────────────────────────────────────────────────────┤
│                                                     │
│                  (active tab content)               │
│                                                     │
│                                                     │
│                                                     │
│                                                     │
│                                                     │
├─────────────────────────────────────────────────────┤
│  💬  Chat with AI to edit anything...          [ ↑ ]│  ← chat drawer (collapsed)
└─────────────────────────────────────────────────────┘
```

---

### Identity Tab

Editable profile fields with inline save. All fields save on blur.

```
┌─ Identity ──────────────────────────────────────────┐
│  Display name   [Shubh Varshney              ]      │
│  Headline       [Full-Stack Engineer         ]      │
│                                                     │
│  GitHub         [github.com/shubh            ]      │
│  LinkedIn       [linkedin.com/in/shubh       ]      │
│  Twitter / X    [x.com/shubh                 ]      │
│  Website        [shubh.dev                   ]      │
│                                                     │
│  Short bio      [________________________________]  │
│                 [________________________________]  │
│                 [________________________________]  │
│                                   [Copy bio  📋]   │
│                                                     │
│  Skills         [React ×][Node.js ×][+ Add skill]  │
│                                                     │
│                                 [Save changes ✓]   │
└─────────────────────────────────────────────────────┘
```

**Interactions:**
- Each field saves individually on blur (no full-form submit)
- "Copy bio" copies `bio_short` to clipboard, shows "Copied!" for 1.5s
- Skills are a tag input — type and press Enter to add, click × to remove
- Social link fields validate URL format before saving

---

### Projects Tab

```
┌─ Projects ──────────────────────────────────────────┐
│  [+ Add project]                    [Sort: Custom ▼]│
│                                                     │
│  ┌─ Recall ★ featured ──────────────────────────┐  │
│  │  Full-stack personal knowledge engine        │  │
│  │  React · Node.js · PostgreSQL · pgvector     │  │
│  │  • Built Chrome extension with MV3 ...       │  │
│  │  • Implemented semantic search using ...     │  │
│  │  [↕ drag] [Edit ✎] [Delete 🗑]               │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌─ Project B ──────────────────────────────────┐  │
│  │  ...                                         │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Add / Edit form (inline expand):**
```
  Name          [__________________________________]
  Tagline       [__________________________________]
  Description   [________________________________ ]
                [________________________________ ]
  Tech stack    [React ×][Node.js ×][+ add]
  Bullets       [• ________________________________] [×]
                [• ________________________________] [×]
                [+ Add bullet]
  GitHub URL    [__________________________________]
  Live URL      [__________________________________]
  Dates         [MM/YYYY] to [MM/YYYY] [ ] Ongoing
  [ ] Featured
                               [Cancel] [Save project]
```

---

### Resume Tab

```
┌─ Resume ────────────────────────────────────────────┐
│  Master resume  v3  (last saved Jun 27)             │
│  [ Structured view ]  [ Plain text ]  [ PDF ↓ ]    │
│                                                     │
│  ─ Work Experience ──────────────────────────────  │
│  + Add experience                                   │
│  ┌──────────────────────────────────────────────┐  │
│  │  Company  [__________]  Role  [____________] │  │
│  │  From [MM/YYYY] to [MM/YYYY] [ ] Current     │  │
│  │  • [___________________________________] [×] │  │
│  │  [+ Add bullet]                              │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ─ Education ────────────────────────────────────  │
│  + Add education                                    │
│                                                     │
│  ─ Certifications ───────────────────────────────  │
│  + Add certification                               │
│                                                     │
│  ─ Past tailored versions ───────────────────────  │
│  Google SWE v1 · Jun 25     [View] [Download PDF]  │
│  Stripe Backend v1 · Jun 20 [View] [Download PDF]  │
└─────────────────────────────────────────────────────┘
```

**"Plain text" toggle:** renders the resume as a clean monospaced text block suitable for pasting directly into ATS text fields. "Copy all" button.

**"PDF ↓" button:** calls `POST /career/build-resume` with `format: 'pdf'` → returns a PDF blob → triggers browser download.

---

### Career Tab (JD Analyser)

The primary AI-powered screen.

```
┌─ Career ────────────────────────────────────────────┐
│  ┌─ Paste job description ─────────────────────┐   │
│  │                                             │   │
│  │  [Job description textarea — paste here]   │   │
│  │                                             │   │
│  │  [ ] Deep analysis (reasoning model)        │   │
│  │                         [Analyse JD →]      │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ─ Extracted info ───────────────────────────────  │
│  Role: Senior Software Engineer · Stripe           │
│  Seniority: Senior                                 │
│  Required: React, TypeScript, Node.js, PostgreSQL  │
│  Preferred: Kubernetes, Redis, gRPC                │
│  ATS keywords: "distributed systems", "API design" │
│                                                     │
│  ─ Your projects (ranked by match) ─────────────  │
│  ① Recall          ████████████████░░  92%        │
│  ② Project B       ██████████████░░░░  78%        │
│  ③ Project C       ████████░░░░░░░░░░  51%        │
│                                                     │
│  ─ Tailored bullets · Recall ───────────────────  │
│  Original:  "Built a Chrome extension"             │
│  ATS ver:   "Engineered a Manifest V3 Chrome       │
│              extension handling 1k+ daily saves    │
│              with async job queuing and JWT auth"  │
│  [Copy ✎]  [Apply to resume →]                    │
│                                                     │
│  (Project B tailored bullets...)                   │
│                                                     │
│  ─ Full tailored resume ────────────────────────  │
│  [View tailored resume]                            │
│  [Copy plain text 📋]    [Download PDF ↓]          │
└─────────────────────────────────────────────────────┘
```

**UX flow:**
1. User pastes JD → clicks "Analyse JD"
2. Spinner shows "Extracting skills..." → "Scoring your projects..." → "Rewriting bullets..."
3. Bullet rewrites stream in token-by-token using SSE
4. "Apply to resume" appends the tailored bullets to a new resume version in one click
5. "Download PDF" triggers the full tailored resume PDF download
6. Past analyses are accessible via a "History" link (pulls from `GET /career/analyses`)

---

### Chat Drawer

Persistent across all tabs. Collapsed by default (one-line input visible). Expands to ~45% of page height.

```
┌─ collapsed ─────────────────────────────────────────┐
│  💬 Ask AI to update your profile...     [ ↑ open ] │
└─────────────────────────────────────────────────────┘

┌─ expanded ──────────────────────────────────────────┐
│  ─ AI Chat ──────────────────────── [ ↓ close ]    │
│                                                     │
│  Try:                                               │
│  "Update my GitHub to github.com/shubh"             │
│  "Add a new project: ..."                           │
│  "Write a cover letter for the Stripe JD"           │
│  "Which projects fit a backend role best?"          │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ You: Update my LinkedIn to linkedin.com/...  │  │
│  │                                              │  │
│  │ AI: Done — I've updated your LinkedIn URL.   │  │
│  │     [✓ linkedin_url updated]                 │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  [Type a message...                      ] [Send →] │
└─────────────────────────────────────────────────────┘
```

**Action chips:** When the AI executes a tool call, a small confirmation chip is shown inline (e.g., `[✓ linkedin_url updated]`, `[✓ Project "Recall" added]`). Clicking a chip navigates to the affected section.

**Conversation scope:** Chat history is session-only — stored in `chrome.storage.local` and cleared when the profile page is closed. Profile mutations are persisted to the DB; the conversation transcript is not.

---

## 21. Identity & Career — Chat System Design

### Tool definitions (function calling)

The backend sends these tool definitions to `kimi-k2-instruct-0905` on every `/career/chat` request:

```javascript
const PROFILE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'update_profile_field',
      description: 'Update a single field on the user profile such as bio, headline, or social URLs',
      parameters: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: ['display_name','headline','github_url','linkedin_url',
                   'twitter_url','website_url','bio_short'],
          },
          value: { type: 'string' },
        },
        required: ['field', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_skills',
      description: 'Replace the full skills list',
      parameters: {
        type: 'object',
        properties: {
          skills: { type: 'array', items: { type: 'string' } },
        },
        required: ['skills'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_project',
      description: 'Add a new project to the profile',
      parameters: {
        type: 'object',
        properties: {
          name:           { type: 'string' },
          tagline:        { type: 'string' },
          description:    { type: 'string' },
          tech_stack:     { type: 'array', items: { type: 'string' } },
          impact_bullets: { type: 'array', items: { type: 'string' } },
          github_url:     { type: 'string' },
          live_url:       { type: 'string' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_project',
      description: 'Update fields of an existing project by name or ID',
      parameters: {
        type: 'object',
        properties: {
          project_identifier: { type: 'string', description: 'Project name or UUID' },
          fields: {
            type: 'object',
            description: 'Key-value pairs of fields to update',
          },
        },
        required: ['project_identifier', 'fields'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_project',
      description: 'Delete a project by name or ID',
      parameters: {
        type: 'object',
        properties: {
          project_identifier: { type: 'string' },
        },
        required: ['project_identifier'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_jd',
      description: 'Run JD analysis on a job description text provided by the user',
      parameters: {
        type: 'object',
        properties: {
          jd_text:    { type: 'string' },
          deep_mode:  { type: 'boolean' },
        },
        required: ['jd_text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_text',
      description: 'Generate bio, elevator pitch, or cover letter opening',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['bio', 'pitch', 'cover_letter'],
          },
          context:         { type: 'string' },
          jd_analysis_id:  { type: 'string' },
          word_limit:      { type: 'number' },
        },
        required: ['type'],
      },
    },
  },
];
```

### Chat request lifecycle (`/career/chat`)

```
1. Receive: { messages: [...conversation history] }

2. Inject system prompt:
   "You are a career assistant for [user display_name].
    Their profile: [brief profile summary injected here].
    Their projects: [project names + taglines].
    Help them update their profile, manage projects, analyse JDs,
    and generate professional text. Be concise and action-oriented."

3. Call kimi-k2-instruct-0905 with messages + PROFILE_TOOLS

4. If response has tool_calls:
   a. Execute each tool call against the DB (profile/project mutations)
   b. Append tool result to messages: { role: 'tool', content: JSON.stringify(result) }
   c. Call Fireworks again with updated messages to get final reply

5. Return:
   {
     reply: string,
     actions_taken: [{ tool: string, params: object, result: object }]
   }

6. Client appends reply to chat history in chrome.storage.local
   Client refreshes only affected UI sections (no full page reload)
```

### System prompt context injection

The system prompt is built server-side from the user's live DB data so the LLM always has accurate context without the user needing to explain their profile:

```javascript
function buildSystemPrompt(profile, projects) {
  return `You are a career assistant for ${profile.display_name || 'the user'}.

Profile summary:
- Headline: ${profile.headline || 'not set'}
- Skills: ${profile.skills?.join(', ') || 'none listed'}
- GitHub: ${profile.github_url || 'not set'}
- LinkedIn: ${profile.linkedin_url || 'not set'}

Projects (${projects.length} total):
${projects.map(p => `- ${p.name}: ${p.tagline || p.description?.slice(0, 80)}`).join('\n')}

Help the user update their profile, manage projects, analyse job descriptions,
and generate ATS-friendly professional text. Confirm what you've done after each action.
Be concise and action-oriented.`;
}
```

---

## 22. Identity & Career — Implementation Plan (5 Steps)

The Identity & Career module is implemented in **5 sequential steps**. Each step has a dedicated structured implementation prompt in [`identity-career-implementation-prompts.md`](./identity-career-implementation-prompts.md). Complete steps in order — each step builds on the previous one.

| Step | Name | PRD phases merged | Duration | Deliverable |
|---|---|---|---|---|
| **1** | Backend Foundation | Phase 6 | Week 12 | DB tables, profile/projects/resume CRUD APIs, project embedding |
| **2** | Extension Profile UI | Phase 7 | Weeks 13–14 | Identity, Projects, Resume tabs — fully functional, no AI |
| **3** | JD Analysis Engine | Phase 8 | Week 15 | Fireworks LLM client, JD analyser, Career tab with streaming bullets |
| **4** | Resume Tailoring & Form Fill | Phase 9 | Week 16 | Tailored resume builder, PDF/plain-text export, bio/pitch/cover letter |
| **5** | Chat, Settings & Hardening | Phases 10–11 | Weeks 17–18 | Chat drawer, AI settings, rate limits, error states, documentation |

### Step 1 — Backend Foundation

**Objective:** All database tables created, all CRUD API routes working and authenticated. No UI yet.

**Tasks:** `migrations/004_identity_career_tables.sql`, `db/profile.js`, `db/career.js`, `routes/profile.js`, `routes/career.js` (stubs for AI routes), project embedding job via existing queue, Zod validation, JWT auth on all routes.

**Testing milestone:** Create profile, add 3 projects, save master resume via REST. Verify user isolation.

---

### Step 2 — Extension Profile UI

**Objective:** The three non-AI tabs (Identity, Projects, Resume) are fully functional with live data.

**Tasks:** `profile/profile.html`, sub-nav, Identity/Projects/Resume sections, shared components (`tag-input`, `bullet-editor`, `copy-button`, `project-card`), popup entry point, `manifest.json` updates.

**Testing milestone:** Add profile, 3 projects, and master resume entirely through the extension UI.

---

### Step 3 — JD Analysis Engine

**Objective:** Career tab functional. JD analysis, project scoring, keyword extraction, and streaming bullet rewrites all work.

**Tasks:** `services/llm-client.js` (Fireworks), `services/jd-analyzer.js`, `POST /career/analyze-jd`, Career tab UI with SSE streaming, `diff-viewer.js`, `stream-target.js`.

**Testing milestone:** Paste a real JD → extracted keywords accurate → project ranking sensible → bullets stream progressively.

---

### Step 4 — Resume Tailoring & Form Fill

**Objective:** Users generate a complete ATS-tailored resume from a JD analysis and download PDF or copy plain text. Bio/pitch/cover letter generation works.

**Tasks:** `services/resume-builder.js`, `POST /career/build-resume`, `POST /career/generate/*`, Puppeteer PDF, tailored resume history in Resume tab, diff view.

**Testing milestone:** Generate tailored resume for a real JD → PDF renders correctly → plain text is ATS-safe.

---

### Step 5 — Chat, Settings & Hardening

**Objective:** Chat drawer functional, AI settings configurable, rate limits in place, feature production-ready.

**Tasks:** `services/chat-handler.js`, `POST /career/chat`, chat drawer UI, Fireworks API key in settings, per-route rate limits, error states, `CAREER.md` documentation.

**Testing milestone:** Full end-to-end flow — set API key → analyse JD → tailor resume → download PDF → update profile via chat.

---

### Original phase detail (reference)

The detailed task lists from the original 6-phase breakdown (Phases 6–11) remain valid within each step above. See [`identity-career-implementation-prompts.md`](./identity-career-implementation-prompts.md) for copy-paste agent prompts with acceptance criteria per step.

### Phase 6 — Profile Data Layer
**Duration: Week 12**

#### Objective
All database tables created, all CRUD API routes working and authenticated. No UI yet.

#### Tasks

**Database**
- Write `migrations/004_identity_career_tables.sql` with all four tables
- Enable RLS policies on all four tables
- Add HNSW index on `projects.embedding`
- Run migration against Neon/Supabase (same DB as core Recall)

**Backend routes**
- `routes/profile.js` — all profile and projects CRUD routes
- `routes/career.js` — analyze-jd, build-resume, generate/*, chat stubs
- `db/profile.js` — SQL query functions for user_profile and projects
- `db/career.js` — SQL query functions for jd_analyses and resume_template
- Zod validation schemas for all request bodies
- Wire routes into `app.js` under `/profile` and `/career` prefixes
- Apply JWT auth middleware to all new routes

**Project embedding**
- When a project is created or its description/bullets change, enqueue an embedding job (reuse existing `pg-boss` queue from Phase 1)
- Job processor: concatenate `name + description + impact_bullets.join(' ')` → ONNX embed → store in `projects.embedding`

**Testing milestone**
- Create profile, add 3 projects, save master resume via REST client
- Verify RLS: user B cannot read user A's projects

**Deliverable:** Complete data layer. All routes return correct data. RLS enforced.

---

### Phase 7 — Extension Profile UI (Identity, Projects, Resume tabs)
**Duration: Weeks 13–14**

#### Objective
The three non-AI tabs are fully functional with live data.

#### Tasks

**Extension scaffolding**
- Create `profile/profile.html` — full-page layout with sub-nav
- Add "Profile" entry point button to `popup/popup.html`
- Wire popup button to open `chrome.tabs.create({ url: 'profile/profile.html' })`
- Add `profile/profile.html` to `web_accessible_resources` in `manifest.json`

**Identity tab** (`profile/sections/identity.js`)
- Fetch `GET /profile` on load, populate all fields
- Inline save on blur for each field (debounced 300ms)
- `tag-input.js` component for skills
- "Copy bio" clipboard button using `copy-button.js`

**Projects tab** (`profile/sections/projects.js`)
- Fetch and render project cards with `project-card.js`
- Add project: inline form expand with `bullet-editor.js`
- Edit: populate form from existing data
- Delete: confirmation prompt before `DELETE /profile/projects/:id`
- Reorder: drag-handle + `PUT /profile/projects/reorder` on drop

**Resume tab** (`profile/sections/resume.js`)
- Fetch master resume, render structured form
- Work experience entries: add/edit/delete with bullet editor
- Education and certifications: simpler add/edit/delete
- Plain text toggle: render formatted monospaced view + "Copy all"
- PDF download: call `POST /career/build-resume` with `format: 'pdf'` → download blob
- Past versions list: fetch from `GET /profile/resume/history`

**Testing milestone**
- Add profile, 3 projects, master resume entirely through the extension UI
- Download PDF — verify it renders correctly

**Deliverable:** Identity, Projects, Resume tabs fully functional.

---

### Phase 8 — JD Analysis Engine
**Duration: Week 15**

#### Objective
The Career tab is functional. JD analysis, project scoring, and keyword extraction all work. Bullet rewrites stream to the UI.

#### Tasks

**Backend: JD analysis service** (`services/jd-analyzer.js`)
- JD hash check: `sha256(jd_text)` → query `jd_analyses` for existing result
- LLM extraction: call `completeStructured` with `jdExtractionSchema`
- Project scoring: embed JD text via existing ONNX service → pgvector cosine similarity query against `projects.embedding`
- Bullet rewriting: prompt construction per project → `completeStreaming` → SSE to client
- Store results in `jd_analyses` table

**Backend: `services/llm-client.js`**
- Implement all four `complete*` functions as specified in §19
- Per-user API key override (decrypt from `user_profile.fireworks_api_key_enc`)
- Error handling: 401 from Fireworks → return `{ error: 'invalid_api_key' }` to client

**Extension: Career tab** (`profile/sections/career.js`)
- JD textarea + "Analyse JD" button
- Progress states: "Extracting skills…" / "Scoring projects…" / "Rewriting bullets…"
- Render extracted keywords as chips
- Render project ranking with match % bars
- `stream-target.js` component renders streaming bullet rewrites token-by-token
- `diff-viewer.js` shows original vs. tailored bullet side-by-side
- "Copy" and "Apply to resume" per project
- "Download PDF" for full tailored resume

**Testing milestone**
- Paste a real software engineering JD
- Verify extracted keywords are accurate
- Verify project ranking matches expectations
- Verify streamed bullets appear progressively, are ATS-relevant

**Deliverable:** Full JD analysis pipeline end-to-end with streaming UI.

---

### Phase 9 — Full Resume Tailoring & PDF Export
**Duration: Week 16**

#### Objective
Users can generate a complete ATS-tailored resume from a JD analysis and download it as PDF or copy as plain text.

#### Tasks

**Backend: `services/resume-builder.js`**
- Assemble tailored resume: master resume + selected projects (ordered by JD score) + tailored bullets
- Call `completeStructured` with `tailoredResumeSchema` for professional summary and skills section rewrite
- Store as new `resume_template` row (`is_master = false`, `jd_analysis_id` set)
- Render plain text version (monospaced, ATS-safe characters only)
- Render HTML version using a clean resume template
- PDF generation: Puppeteer headless render of HTML → return PDF buffer

**Extension: Resume tab additions**
- "Tailored versions" section populated from `GET /profile/resume/history`
- Each version shows role title, company, date, View / Download PDF buttons
- Diff view between master and tailored: highlight changed/added bullets in green

**Testing milestone**
- Generate tailored resume for a real JD
- Download PDF — verify formatting, no ATS-breaking characters
- Compare plain text output against ATS checkers

**Deliverable:** Complete resume tailoring and PDF export working end-to-end.

---

### Phase 10 — Chat Interface
**Duration: Week 17**

#### Objective
The persistent chat drawer is functional. Users can update any profile field, add projects, and trigger analysis entirely through conversation.

#### Tasks

**Backend: `services/chat-handler.js`**
- Build system prompt from live user profile + projects
- Call `completeWithTools` (kimi-k2) with `PROFILE_TOOLS`
- Tool execution dispatcher: maps tool names to DB mutation functions
- Multi-turn loop: execute tools → append results → re-call LLM for final reply
- Return `{ reply, actions_taken[] }` to client

**Extension: Chat drawer** (`profile/sections/chat.js`)
- Collapsed / expanded state toggle
- Render conversation history from `chrome.storage.local`
- Send message → `POST /career/chat` → display reply
- Render `actions_taken` as inline confirmation chips
- Chip click → navigate to affected tab/section
- Suggested prompt chips on first open

**Testing milestone**
- "Update my LinkedIn to X" → verify DB updated, chip shown, Identity tab reflects change
- "Add a project called Y with tech stack A, B, C" → verify project appears in Projects tab
- "Which of my projects fits a backend engineer role?" → verify sensible answer

**Deliverable:** Chat drawer fully functional. All profile mutations available via conversation.

---

### Phase 11 — Polish, Settings & Rate Limiting
**Duration: Week 18**

#### Objective
AI settings are configurable, rate limits protect the system, and the feature is production-ready.

#### Tasks

**Settings page additions** (`settings/settings.html`)
- Fireworks API key field (masked, stored encrypted in `user_profile`)
- Model override dropdowns (quality, chat, reasoning) — defaults pre-filled
- "Deep analysis" toggle for `glm-5p2` reasoning mode
- "Test API key" button → calls Fireworks with a minimal prompt → shows ✓ / ✗

**Rate limiting**
- `/career/analyze-jd`: 10 analyses/hour per user (separate limiter from core API)
- `/career/chat`: 60 messages/hour per user
- `/career/build-resume`: 20 builds/hour per user
- Use `express-rate-limit` with per-route, per-user keying

**Error states in UI**
- No Fireworks API key configured → Career tab shows setup prompt with link to fireworks.ai
- Invalid API key → inline error with link to settings
- Rate limit hit → "Too many requests — try again in X minutes"
- Fireworks API down → graceful fallback: JD extraction falls back to rule-based regex only (no bullet rewrites)

**Mobile app (read-only)**
- Add a "Profile" screen to the React Native app
- Read-only view of: bio, social links, projects list
- "Edit on desktop" prompt (full editing stays extension-only for v1 of this feature)

**Documentation**
- Update `API.md` with all new `/profile` and `/career` routes
- Add "Identity & Career" section to `README.md`
- Add `CAREER.md`: how to set up a Fireworks API key, what each AI feature does, cost estimates

**Testing milestone**
- Full end-to-end: set Fireworks key in settings → paste JD → analyse → view bullets → apply to resume → download PDF → open profile on mobile (read-only)
- Verify rate limits trigger correctly
- Verify graceful degradation when no API key is set

**Deliverable:** Feature complete, production-hardened, documented.

---

## 23. Identity & Career — Performance Targets

| Operation | Target |
|---|---|
| Profile load (GET /profile) | < 100ms |
| Project ONNX embedding (background job) | < 500ms |
| JD hash check (cache hit) | < 20ms |
| JD LLM extraction (deepseek-v3p1) | < 3s |
| Project scoring via pgvector cosine | < 10ms for up to 50 projects |
| First token of streaming bullet rewrite | < 1.5s |
| Full bullet rewrite per project (streaming) | < 8s |
| Chat response (kimi-k2, no tool calls) | < 2s |
| Chat response (kimi-k2, with 1 tool call) | < 4s |
| Full resume tailoring (LLM pass) | < 10s |
| PDF generation (Puppeteer) | < 5s |
| Settings API key test round-trip | < 2s |

---

*Document version: 3.1 · Last updated: June 2026 · Status: Active development — Identity & Career module (5-step plan)*
