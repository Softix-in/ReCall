# Recall Mobile — Implementation Plan

**Client:** Android-first Expo / React Native app  
**Backend:** existing Recall API (no new server required for MVP)  
**Parity target:** Chrome extension (`recall-extension/`) as the reference client  
**Status:** plan frozen — implement phase by phase, gate by gate

This document is the contract for `recall-mobile/`. If code disagrees with this file, change the code.

---

## Table of contents

1. [Product & system context](#1-product--system-context)
2. [Architecture](#2-architecture)
3. [Frozen file structure](#3-frozen-file-structure)
4. [Tech stack (locked)](#4-tech-stack-locked)
5. [Theme (locked)](#5-theme-locked)
6. [Global coding guidelines](#6-global-coding-guidelines)
7. [API & auth contracts](#7-api--auth-contracts)
8. [Eight phases](#8-eight-phases)
9. [Cross-cutting quality bar](#9-cross-cutting-quality-bar)
10. [Risks, non-goals, rollout](#10-risks-non-goals-rollout)

---

## 1. Product & system context

Recall is a personal knowledge engine. The phone is a **second client**, not a second backend.

```
┌─────────────────────┐     ┌─────────────────────┐
│ Chrome extension    │     │ Android app         │
│ recall-extension/   │     │ recall-mobile/      │
└──────────┬──────────┘     └──────────┬──────────┘
           │ HTTPS + JWT               │ HTTPS + JWT
           └────────────┬──────────────┘
                        ▼
              ┌─────────────────────┐
              │ Express API :7878   │
              │ PostgreSQL+pgvector │
              │ Whisper / embed     │
              └─────────────────────┘
```

**What the phone must do well**

- Sign in as the same user as the extension
- Browse, search, and open saved items
- Save URLs (in-app paste + Android share sheet)
- Survive token expiry, airplane mode, and duplicate saves

**What the phone must not do**

- Run Whisper, embeddings, or the pipeline on-device
- Talk to Postgres directly
- Store JWTs in AsyncStorage, logs, or crash reports
- Invent new API shapes — wrap existing routes only

**Default API base**

```
https://recall-app.centralindia.cloudapp.azure.com
```

LAN debug only: `http://<PC-LAN-IP>:7878` — never `localhost` on a physical phone.

---

## 2. Architecture

### 2.1 Layers (strict, one-way)

```
screens/  →  hooks/  →  api/  →  fetch
    ↓          ↓
components/  auth/tokenStorage
    ↓
theme/ + types/
```

- **screens** render UI and call hooks. No raw `fetch`.
- **hooks** wrap TanStack Query / mutations. No JSX.
- **api** is the only module that knows URLs, headers, and status codes.
- **auth** owns session restore, refresh lock, logout.
- **components** are presentational; they receive data and callbacks.

Violating layer direction is a bug, even if the feature works.

### 2.2 Runtime flow

```
App launch
  → QueryClientProvider + AuthProvider
  → restore session from SecureStore
  → if access token expiring within 120s → POST /auth/refresh
  → GET /auth/me
  → email_verified? main tabs : VerifyEmail screen
  → AppState 'active' → refresh-if-needed again
```

### 2.3 Request pipeline

```
api/client.request(path)
  1. skip auth on public paths
  2. ensureValidAccessToken()
  3. Authorization: Bearer <access>
  4. fetch with 20s timeout + AbortController
  5. parse JSON safely (never assume body)
  6. 401 + authenticated → one refresh + one retry
  7. refresh 429 → throw, do not loop
  8. refresh fail → clearSession → AuthError
  9. map 403 email_not_verified, 409 existingId, 503 embed
```

Refresh **must** be a single-flight promise (same lock pattern as `recall-extension/shared/auth.js`). Two parallel 401s must produce one `/auth/refresh`.

### 2.4 State ownership

| Kind | Store |
|------|--------|
| Access + refresh tokens, user | expo-secure-store via `tokenStorage.ts` |
| Session in memory | `AuthContext` |
| Server lists/search/detail | TanStack Query (keyed, staleTime documented per hook) |
| Offline mirror (Phase 7) | expo-sqlite |
| Capture outbox (Phase 7) | expo-sqlite table `outbox` |
| Theme | `theme/` constants only |

No Redux, no Zustand, no Context for server cache.

### 2.5 Navigation

```
RootNavigator
  AuthStack          if !session
    Login
    Register
    ForgotPassword
  VerifyEmail        if session && !email_verified
  MainTabs           if session && email_verified
    LibraryStack
      Library
      ItemDetail
    SearchStack
      Search
      ItemDetail
      AskLibrary          (Phase 4)
    Save
    SettingsStack
      Settings
      ChangePassword
      Career              (Phase 8)
      Research            (Phase 8)
```

Android back button: stack pop, then tab, then OS default. Never trap the user on a modal without a close action.

### 2.6 Scalability rules

- Pagination: `GET /items?limit=` — start at 20, add cursor/offset only if the API grows; do not load the whole library into memory.
- Search: debounce 300ms; abort previous request via `signal`.
- Status polling: exponential interval 2s → 4s → 8s, cap 15s, stop on terminal status or unmount.
- Images: `expo-image` with disk cache; never decode full transcripts into the list row.
- Transcripts: fetch only on detail with `include_transcript=1`.
- Feature modules (career, research) live under `screens/` + `api/` files added in Phase 8 — do not leak into Library.

---

## 3. Frozen file structure

Create this tree in Phase 1. **Do not add top-level folders.** New screens go under `src/screens/`. New endpoints go under `src/api/`.

```
recall-mobile/
  README.md
  IMPLEMENTATION.md
  PHASE-CHECKLIST.md
  app.json
  eas.json                          # Phase 8
  package.json
  tsconfig.json
  babel.config.js
  .env.example
  .gitignore
  App.tsx
  src/
    config.ts
    api/
      client.ts
      errors.ts
      auth.ts
      items.ts
      search.ts
      capture.ts
      status.ts
      jobs.ts
      ask.ts                        # Phase 4
      settings.ts
      profile.ts                    # Phase 8
      career.ts                     # Phase 8
      research.ts                   # Phase 8
      knowledge.ts                  # Phase 8
    auth/
      AuthContext.tsx
      tokenStorage.ts
      jwt.ts
      session.ts
    navigation/
      RootNavigator.tsx
      types.ts
      linking.ts                    # Phase 6
    screens/
      auth/
        LoginScreen.tsx
        RegisterScreen.tsx
        ForgotPasswordScreen.tsx
        VerifyEmailScreen.tsx
      LibraryScreen.tsx
      SearchScreen.tsx
      ItemDetailScreen.tsx
      SaveScreen.tsx
      SettingsScreen.tsx
      AskScreen.tsx                 # Phase 4
      JobsScreen.tsx                # Phase 5
      career/                       # Phase 8
      research/                     # Phase 8
    components/
      ItemCard.tsx
      SearchBar.tsx
      EmptyState.tsx
      ErrorBanner.tsx
      Loading.tsx
      TagList.tsx
      StatusBadge.tsx
      OfflineBanner.tsx             # Phase 7
    hooks/
      useAuth.ts
      useItems.ts
      useItem.ts
      useSearch.ts
      useCapture.ts
      useItemStatus.ts
      useOffline.ts                 # Phase 7
    theme/
      colors.ts
      spacing.ts
      typography.ts
      radius.ts
    types/
      api.ts
      auth.ts
      navigation.ts
    lib/
      url.ts
      queryClient.ts
      logger.ts
    storage/                        # Phase 7
      db.ts
      itemsCache.ts
      outbox.ts
    native/                         # Phase 6
      shareIntent.ts
      biometrics.ts
      clipboardWatch.ts
  assets/
    icon.png
    adaptive-icon.png
    splash.png
```

**Import aliases (tsconfig):** `@api/*`, `@auth/*`, `@screens/*`, `@components/*`, `@hooks/*`, `@theme/*`, `@types/*`, `@lib/*`

Relative imports that skip more than two parents are forbidden once aliases exist.

---

## 4. Tech stack (locked)

| Layer | Package | Why |
|-------|---------|-----|
| Runtime | Expo + React Native + TypeScript `strict` | Android now, iOS later without a rewrite |
| Nav | `@react-navigation/native` + native-stack + bottom-tabs | Auth stack vs tabs |
| HTTP | `fetch` inside `api/client.ts` only | Matches extension; no axios |
| Cache | `@tanstack/react-query` | Lists, search, retry, focus refetch |
| Secrets | `expo-secure-store` | Android Keystore |
| Images | `expo-image` | Caching, no list jank |
| Linking | `expo-linking` | Open original URLs |
| Env | `EXPO_PUBLIC_API_URL` | Dev LAN vs prod HTTPS |
| Test | Jest + `@testing-library/react-native` | Unit + component |
| Build | EAS Build (dev client + production AAB) | Share sheet needs a real build |

**Forbidden in v1:** Redux, NativeWind/Tailwind, Firebase Auth, a second HTTP client, `AsyncStorage` for tokens, `console.log` of tokens/PII.

**Phase-gated adds**

| Phase | Package |
|-------|---------|
| 6 | `expo-local-authentication`, share-intent config plugin, `expo-notifications` |
| 7 | `expo-sqlite`, `@react-native-community/netinfo` |
| 8 | `eas-cli` pipeline only |

---

## 5. Theme (locked)

Copy the extension tokens. Do not invent a second palette.

```ts
// src/theme/colors.ts
export const colors = {
  bg: '#000000',
  surface: '#0d0d0d',
  surface2: '#161616',
  surface3: '#1f1f1f',
  border: '#2a2a2a',
  borderFocus: '#444444',
  text: '#ffffff',
  text2: '#c8c8c8',
  muted: '#6b6b6b',
  accent: '#ffffff',
  accentBg: 'rgba(255,255,255,0.06)',
  success: '#4ade80',
  danger: '#f87171',
  warning: '#fbbf24',
} as const;
```

```ts
// src/theme/radius.ts
export const radius = { sm: 8, md: 10, lg: 12 } as const;

// src/theme/spacing.ts  — 4pt grid
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

// src/theme/typography.ts
export const fontFamily = 'Inter'; // fallback: system-ui
```

Rules:

- All colors come from `theme/colors.ts`. Hex in a screen file is a defect.
- Hit targets ≥ 44×44.
- Contrast: text on `bg` / `surface` must stay WCAG AA.
- Dark-only for v1 (matches extension). No light theme until Phase 8 polish if requested.
- Loading, empty, and error states are mandatory on every data screen.

---

## 6. Global coding guidelines

These apply to **every phase**. Phase sections add extras; they never weaken these.

### 6.1 TypeScript

- `strict: true`. No `any`. No `as unknown as`.
- API responses typed in `src/types/api.ts`. Parse at the boundary; screens use domain types.
- Functions under ~80 lines. Split helpers into `lib/` or the owning `api/` file.
- Named exports. Default export only for screens if the navigator requires it.

### 6.2 React Native

- Function components only.
- Hooks at top level. No hooks in conditionals.
- Every `useEffect` that starts a timer, poll, or subscription returns a cleanup.
- Lists: `FlatList` / `FlashList`, not `ScrollView` + `.map` for unbounded data.
- Keys: item `id`, never array index.
- Controlled inputs; disable submit while pending.

### 6.3 Errors

- User-facing strings are mapped in `api/errors.ts`. Never show raw stack traces.
- Network fail → `ErrorBanner` + retry.
- 401 after refresh fail → login.
- 403 `email_not_verified` → VerifyEmail screen.
- 409 capture → open existing item.
- 429 → honor `Retry-After` if present; otherwise 2s/4s/8s backoff.
- 503 embed → “Search is temporarily unavailable”.

### 6.4 Security

- Tokens only in SecureStore + memory.
- `logger.ts` redacts `Authorization`, tokens, passwords, emails in production.
- `device: 'android'` on login, register, refresh.
- Validate URLs with `lib/url.ts` before `POST /capture` (http/https only).
- No WebView for untrusted HTML. Transcript is text.
- Production builds refuse non-HTTPS bases except explicit LAN debug flag.

### 6.5 Testing (every phase)

| Layer | What |
|-------|------|
| Unit | `jwt.ts`, `url.ts`, `errors.ts`, refresh single-flight, debounce |
| Component | ItemCard, ErrorBanner, Login form validation |
| Integration | api client 401→refresh→retry with mocked fetch |
| Manual | Physical device checklist in `PHASE-CHECKLIST.md` |

Do not merge a phase without: `npx tsc --noEmit` clean + new tests green + checklist signed.

### 6.6 Git / PR hygiene

- One phase per PR series. Commit messages: `mobile(phase-N): …`
- Do not commit `.env`, `node_modules`, keystores, or `google-services.json` if added later.
- Do not change `backend/` to “make the app easier” unless a real API bug is proven.

---

## 7. API & auth contracts

Mirror `recall-extension/shared/api.js` and `auth.js`. Do not freelance.

### 7.1 Public paths (no Bearer)

```
/health
/auth/login
/auth/register
/auth/refresh
/auth/forgot-password
/auth/verify-email
/auth/reset-password
/auth/confirm-email-change
```

### 7.2 Auth payloads

```
POST /auth/register  { email, password, device: "android" }  → 201 { access_token, refresh_token, user }
POST /auth/login     { email, password, device: "android" }  → 200 same
POST /auth/refresh   { refresh_token, device: "android" }    → 200 new pair (rotation)
POST /auth/logout    { refresh_token }
GET  /auth/me        Bearer required
POST /auth/resend-verification
POST /auth/change-password
POST /auth/forgot-password
```

Access JWT TTL ≈ **15 minutes**. Refresh ≈ **30 days**, hashed server-side, rotated on use. Decode `exp` locally; refresh if `exp - now < 120s`.

### 7.3 Core resource routes

| Method | Path | Notes |
|--------|------|--------|
| GET | `/items?limit=` | `{ items }` |
| GET | `/items/:id?include_transcript=1` | `{ item }` |
| DELETE | `/items/:id` | |
| GET/PUT | `/items/:id/tags` | PUT `{ tags: string[] }` |
| GET | `/search?q=&type=&mode=&since=` | `q` required |
| GET | `/search/recommendations` | |
| POST | `/capture` or `/link` | `{ url, save_mode, note? }` → 201 |
| GET | `/status` | queue health |
| GET | `/status/:id` | per-item pipeline |
| GET | `/jobs/history` `/jobs/failed` | |
| POST | `/items/:id/retry` | |
| GET/PUT | `/settings` | |
| GET | `/ask/status` POST `/ask` | optional LLM |
| GET | `/export` | Phase 8 |

**Capture `save_mode`:** `auto_scrape` \| `manual_note` \| `doc_extract`  
**manual_note** requires `note`. Duplicate URL → **409** `{ existingId }`.

### 7.4 Phase 8 routes

Profile `/profile`, `/profile/projects`, `/profile/resume`  
Career `/career/analyze-jd`, `/career/build-resume`, `/career/generate/*`, `/career/chat`  
Research `/research/startups`, `/research/jobs/:id`, `/research/companies`  
Knowledge `/knowledge/crawl`, `/knowledge/jobs`

### 7.5 Query keys

```
['health']
['me']
['items', { limit }]
['item', id]
['item', id, 'transcript']
['search', { q, type, mode, since }]
['search', 'recommendations']
['status', id]
['jobs', 'failed']
['profile']
['projects']
['research', 'companies', filters]
```

Invalidate `['items']` and `['item', id]` after capture, delete, tag update, retry.

---

## 8. Eight phases

Each phase: **objective → files → tasks → guidelines → tests → gate**.  
No phase starts until the previous gate is signed in `PHASE-CHECKLIST.md`.

---

### Phase 1 — Foundation & platform shell

**Objective.** A bootable Expo TypeScript app with frozen structure, theme, config, HTTP client (health only), and CI typecheck. No product features yet.

**Why first.** Every later phase depends on path aliases, the client pipeline, and visual tokens. Getting this wrong multiplies bugs.

**Files to create**

- Expo app at `recall-mobile/` (this folder becomes the app root; keep the three plan markdown files)
- `App.tsx`, `src/config.ts`, `src/api/client.ts`, `src/api/errors.ts`
- `src/theme/*`, `src/lib/logger.ts`, `src/lib/queryClient.ts`, `src/lib/url.ts`
- Placeholder `RootNavigator` with a single “Health” debug screen (remove at end of Phase 2)
- `.env.example`: `EXPO_PUBLIC_API_URL=https://recall-app.centralindia.cloudapp.azure.com`

**Tasks**

1. `npx create-expo-app` **into this directory** or generate equivalent `package.json` / `app.json` without deleting the plan docs.
2. Enable TypeScript strict, path aliases, ESLint (`no-explicit-any`, unused imports).
3. `config.ts` reads `EXPO_PUBLIC_API_URL`, trims trailing slash, rejects empty.
4. `client.ts`: timeout, JSON parse guard, `skipAuth` for `/health`.
5. Theme applied on a throwaway Health screen: ping `/health`, show `ok` / version.
6. Jest bootstrap: one test that `config` trims URL; one test that client calls `/health`.

**Phase 1 guidelines**

- No login UI yet.
- No SecureStore yet (added Phase 2) — client must still compile with `skipAuth`.
- `app.json` `package` / `bundleIdentifier`: `com.recall.app`.
- Android cleartext: allowed **only** for debug (`usesCleartextTraffic` in debug, HTTPS in release).
- Keep `IMPLEMENTATION.md` at repo path `recall-mobile/IMPLEMENTATION.md`.

**Tests**

| ID | Type | Pass condition |
|----|------|----------------|
| 1.1 | Manual | Expo Go opens, Health screen shows API `ok: true` |
| 1.2 | Manual | Wrong `EXPO_PUBLIC_API_URL` shows ErrorBanner, no crash |
| 1.3 | Unit | URL trim / invalid URL helper |
| 1.4 | `tsc` | zero errors |

**Gate.** Checklist Phase 1 complete. Health works on a **physical phone** against production HTTPS (not only emulator localhost).

---

### Phase 2 — Authentication & session

**Objective.** Register, login, restore session, rotate refresh tokens, logout, email-verification gate. Same account as the extension.

**Files**

- `src/auth/tokenStorage.ts`, `jwt.ts`, `session.ts`, `AuthContext.tsx`
- `src/api/auth.ts`
- `src/screens/auth/*`
- `src/hooks/useAuth.ts`
- `src/navigation/RootNavigator.tsx`

**Tasks**

1. SecureStore keys (namespaced): `recall.accessToken`, `recall.refreshToken`, `recall.user`.
2. `jwt.ts`: base64url decode payload, read `exp`, never verify signature on-device (server already did).
3. `ensureValidAccessToken`: if missing → null; if `exp` within 120s → refresh; single-flight lock.
4. Login / Register forms: email format, password min length matching backend, confirm on register, pending disable.
5. Persist tokens only after successful JSON parse of `access_token` + `refresh_token`.
6. `GET /auth/me` on restore; if 401 try refresh once.
7. Unverified: stay in `VerifyEmailScreen`; resend verification; poll `/auth/me` on foreground.
8. Logout: `POST /auth/logout` with refresh token (ignore network fail) then always `clearSession`.
9. Forgot password: `POST /auth/forgot-password`; generic success copy.

**Phase 2 guidelines**

- Copy the extension refresh behaviour: one lock, no retry loop, 429 does not clear session.
- Password fields `secureTextEntry`; no autofill into logs.
- KeyboardAvoidingView + scroll on small screens.
- After login, prefetch `['items']` only if `email_verified`.
- Biometrics are **not** in this phase (Phase 6).

**Tests**

| ID | Type | Pass condition |
|----|------|----------------|
| 2.1 | Manual | Login with extension account; email matches Settings in extension |
| 2.2 | Manual | Kill app; reopen; still authenticated |
| 2.3 | Manual | Logout; SecureStore empty; Login shown |
| 2.4 | Manual | Bad password; error text; stay on Login |
| 2.5 | Manual | Unverified user cannot open Library |
| 2.6 | Unit | `jwt` exp parsing; refresh single-flight (two callers, one fetch) |
| 2.7 | Integration | mocked 401 → refresh 200 → original request retried once |
| 2.8 | Integration | refresh 401 → session cleared |

**Gate.** Phase 2 checklist. Token never printed. Device field `android` verified in backend `refresh_tokens.device` (or login request body in a proxy log).

---

### Phase 3 — Library & item detail

**Objective.** Home feed of recent saves and a detail screen that matches extension data.

**Files**

- `src/api/items.ts`
- `src/hooks/useItems.ts`, `useItem.ts`
- `src/screens/LibraryScreen.tsx`, `ItemDetailScreen.tsx`
- `src/components/ItemCard.tsx`, `EmptyState.tsx`, `TagList.tsx`, `StatusBadge.tsx`

**Tasks**

1. `GET /items?limit=20` with pull-to-refresh and `staleTime: 30_000`.
2. ItemCard: title, domain, relative time, source type, processing badge.
3. Detail: metadata first; transcript via separate query `include_transcript=1` behind “Show transcript”.
4. Open original: `expo-linking` / `Linking.openURL` after `lib/url.ts` allowlist.
5. Delete: confirm sheet → `DELETE` → invalidate list → go back.
6. Empty and error states.
7. Optional: tags edit using GET/PUT `/items/:id/tags`.

**Phase 3 guidelines**

- Do not request transcripts in the list endpoint.
- Format dates in a single `lib/` helper (relative + absolute on detail).
- Optimistic delete allowed only if rollback on error is implemented; otherwise wait for server.
- Accessibility: `accessibilityRole="button"` on cards; title as label.

**Tests**

| ID | Type | Pass condition |
|----|------|----------------|
| 3.1 | Manual | Same first 20 items as extension |
| 3.2 | Manual | Pull-to-refresh after extension save shows the new item |
| 3.3 | Manual | Detail transcript toggle |
| 3.4 | Manual | Open URL in Chrome/system browser |
| 3.5 | Manual | Delete; gone in both clients |
| 3.6 | Component | ItemCard renders title + domain |
| 3.7 | Manual | Airplane mode later covered in P7; here: failed fetch shows retry |

**Gate.** Library is the default tab. No duplicate navigators for detail — one `ItemDetail` screen registered in both stacks via shared component.

---

### Phase 4 — Semantic search & ask

**Objective.** Natural-language search with filters and optional Ask-library.

**Files**

- `src/api/search.ts`, `src/api/ask.ts`
- `src/hooks/useSearch.ts`
- `src/screens/SearchScreen.tsx`, `AskScreen.tsx`
- `src/components/SearchBar.tsx`

**Tasks**

1. SearchBar in Search tab (and a jump-to-search control on Library).
2. Debounce 300ms; `q.trim()` length ≥ 1 before request.
3. Filters: `type`, `mode`, `since` as query params — same names as extension.
4. Recommendations on empty query (not on `/search`).
5. Cancel prior in-flight via `AbortController` / query `signal`.
6. Ask: `GET /ask/status`; if unavailable, hide or disable with explanation; `POST /ask` with loading and source list.

**Phase 4 guidelines**

- Never call `/search` without `q` (API returns 400).
- 503 from embed client → dedicated copy.
- Results reuse `ItemCard`; tap → same ItemDetail.
- Keep search query in screen state or URL params; do not put it in AuthContext.

**Tests**

| ID | Type | Pass condition |
|----|------|----------------|
| 4.1 | Manual | Query used in extension returns related hits |
| 4.2 | Manual | Rapid typing = one inflight request (watch network tab) |
| 4.3 | Manual | Filter type=video (or known type) narrows results |
| 4.4 | Manual | Empty recommendations tap fills query |
| 4.5 | Manual | Ask unavailable ≠ crash |
| 4.6 | Unit | debounce helper |
| 4.7 | Integration | aborted request does not set results |

**Gate.** Search is usable offline-later; for now it must fail loudly with retry when the network is down.

---

### Phase 5 — Capture, pipeline status, jobs

**Objective.** In-app save loop: paste URL, queue capture, watch status, retry failures.

**Files**

- `src/api/capture.ts`, `status.ts`, `jobs.ts`
- `src/hooks/useCapture.ts`, `useItemStatus.ts`
- `src/screens/SaveScreen.tsx`, `JobsScreen.tsx`

**Tasks**

1. SaveScreen: URL field, paste button, mode toggle (`auto_scrape` / `manual_note`), note box.
2. Client-side URL parse before POST.
3. 201 → navigate to ItemDetail; start status poll.
4. 409 → navigate to `existingId` with “Already saved”.
5. Poll `GET /status/:id` until `done`/`failed`/`error` (match actual status strings from API).
6. JobsScreen: failed jobs + retry (`POST /items/:id/retry`).
7. After success, invalidate `['items']` and `['search']`.

**Phase 5 guidelines**

- Polling: `useEffect` cleanup **must** clear timeout. No poll if screen unmounted.
- Cap poll at ~3 minutes then stop with “still processing — pull to refresh”.
- Disable double-submit.
- Do not implement share-sheet yet (Phase 6 uses the same `useCapture`).

**Tests**

| ID | Type | Pass condition |
|----|------|----------------|
| 5.1 | Manual | Article URL → item in library + extension |
| 5.2 | Manual | YouTube URL → processing badge then transcript on detail |
| 5.3 | Manual | `manual_note` without note blocked client-side |
| 5.4 | Manual | Duplicate URL → existing item |
| 5.5 | Manual | Invalid URL 400 copy |
| 5.6 | Manual | Retry failed job |
| 5.7 | Unit | poll backoff schedule |
| 5.8 | Unit | URL allowlist rejects `javascript:` and empty |

**Gate.** Capture from the phone is indistinguishable from extension save in the database (`user_id` same).

---

### Phase 6 — Android native surfaces

**Objective.** Share-to-Recall, biometric unlock, clipboard assist, optional local notification.

**Files**

- `src/native/shareIntent.ts`, `biometrics.ts`, `clipboardWatch.ts`
- `src/navigation/linking.ts`
- `app.json` / config plugins for SEND intent
- EAS **development build** (Expo Go cannot host a real share target)

**Tasks**

1. Android intent-filter: `SEND` / `SEND_MULTIPLE` for `text/plain` and `text/uri-list`.
2. On cold start via share: extract first `http(s)` URL → `useCapture` → toast “Saved to Recall”.
3. Biometric gate **after** session restore, optional in Settings (default off until user enables). Failed biometric ≠ delete tokens; retry or password.
4. Clipboard: on AppState active, if new URL and user opted in, prompt once; store last-seen URL hash to avoid spam.
5. When a capture poll reaches `done`, local notification if permission granted.
6. Deep link `recall://item/<id>` opens ItemDetail when logged in.

**Phase 6 guidelines**

- Share handler must reuse Phase 5 capture mutation — no second POST path.
- If not logged in, stash shared URL in SecureStore (`recall.pendingShareUrl`) and consume after login.
- Biometric is UX lock, not a replacement for JWT.
- Do not request notification permission until the first successful capture or Settings toggle.
- Test on a **dev client APK**, not Expo Go.

**Tests**

| ID | Type | Pass condition |
|----|------|----------------|
| 6.1 | Manual | Chrome share → Recall → item saved |
| 6.2 | Manual | YouTube app share → saved |
| 6.3 | Manual | Share “hello” with no URL → friendly error |
| 6.4 | Manual | Share while logged out → login → then save pending URL |
| 6.5 | Manual | Biometric enable/disable |
| 6.6 | Manual | Clipboard prompt once per URL |
| 6.7 | Manual | Back from share does not duplicate capture |

**Gate.** Share sheet is the mobile equivalent of the extension keyboard shortcut.

---

### Phase 7 — Offline, cache, resilience

**Objective.** App remains useful with bad networks; no lost captures; no refresh storms.

**Files**

- `src/storage/db.ts`, `itemsCache.ts`, `outbox.ts`
- `src/hooks/useOffline.ts`
- `src/components/OfflineBanner.tsx`

**Tasks**

1. NetInfo → global `isOnline` in a tiny context or query.
2. Persist last successful `['items']` payload in SQLite.
3. Offline Library reads cache; banner “Offline — showing saved copy”.
4. Outbox: failed/queued `POST /capture` rows; flush on reconnect with jitter.
5. Idempotency: outbox key = normalized URL so duplicates do not double-post.
6. TanStack `onlineManager` wired to NetInfo.
7. 429 handling in client with backoff; refresh lock already from Phase 2.
8. Query persistence (optional): `@tanstack/react-query-persist-client` **or** SQLite only — pick **one**, not both.

**Phase 7 guidelines**

- Cache is read-only mirror, not a second source of truth. Online always prefers network.
- Outbox flush serial (one capture at a time) to match server rate limits.
- Never cache refresh tokens in SQLite — tokens stay in SecureStore.
- Schema migrations for SQLite from day one (`user_version`).

**Tests**

| ID | Type | Pass condition |
|----|------|----------------|
| 7.1 | Manual | Airplane: library still populated |
| 7.2 | Manual | Offline capture → queued → online flush → appears on server |
| 7.3 | Manual | Duplicate queued URL flushed once |
| 7.4 | Manual | Search offline: explicit disabled/error, not empty fake success |
| 7.5 | Unit | outbox normalize URL |
| 7.6 | Manual | Background app during poll; resume without leaked timers (Flipper / log count) |

**Gate.** No data loss on flaky Wi-Fi. No infinite refresh loop (watch `/auth/refresh` count).

---

### Phase 8 — Career, research, production hardening

**Objective.** Optional product modules + store-ready Android build, CI, observability.

**8A — Career / profile (feature-flag behind Settings)**

- `api/profile.ts`, `api/career.ts`
- Screens: identity, projects CRUD, master resume, JD paste → analyze, build resume, bio/pitch/cover letter, career chat
- Honor career rate-limit errors with cooldown UI
- Streaming endpoints: consume as text incrementally if the API streams; otherwise wait for JSON — match `recall-extension/shared/api.js`

**8B — Research / knowledge**

- Start research job, poll `/research/jobs/:id`, company list/detail/reanalyze
- Doc crawl start + job list
- Do not block MVP release on 8A/8B; ship behind a tab only if Phase 5–7 are signed off

**8C — Production**

1. `eas.json`: `development`, `preview` (internal APK), `production` (AAB).
2. Production `EXPO_PUBLIC_API_URL` HTTPS only.
3. Sentry or equivalent: **no** tokens in breadcrumbs (beforeEnable).
4. CI: `tsc`, unit tests, `expo doctor` on PR.
5. Versioning: `app.json` version = git tag `mobile-x.y.z`.
6. Play internal testing track.
7. Export library (`GET /export`) as a Settings action (share sheet file).
8. Performance pass: list FPS, cold start, image cache.
9. Security pass: no cleartext in release, no debug Health screen, no hardcoded secrets.
10. Update `CONTRIBUTING.md` project layout to include `recall-mobile/`.

**Phase 8 guidelines**

- Career/research code must not be imported from Library/Search (keep bundles honest; lazy `React.lazy` / screen imports).
- Rate-limited career routes: disable button + remaining time.
- Production logging: `logger.ts` no-ops debug in release.
- Changelog in `recall-mobile/CHANGELOG.md` from this phase onward.

**Tests**

| ID | Type | Pass condition |
|----|------|----------------|
| 8.1 | Manual | Profile fields round-trip vs extension |
| 8.2 | Manual | Project create/edit/delete |
| 8.3 | Manual | JD analyze returns gaps; 429 shown cleanly |
| 8.4 | Manual | Research job completes and company appears |
| 8.5 | Manual | Preview APK on a second Android phone, clean install, full login→save→search |
| 8.6 | CI | PR cannot merge if `tsc` fails |
| 8.7 | Security | APK strings scan: no private keys, no refresh tokens |
| 8.8 | Manual | Extension + app show identical library after mixed saves |

**Gate.** Internal Play (or sideloaded prod-signed APK) used for 48 hours without session bugs. Then Phase 8 checklist.

---

## 9. Cross-cutting quality bar

### 9.1 Definition of done (any feature)

- Types at API boundary
- Loading, empty, error, success
- Cleanup of effects
- Query invalidation listed
- Unit or component test if logic is non-trivial
- Manual line on `PHASE-CHECKLIST.md`
- No new `any`, no stray `console.log`

### 9.2 Performance budgets

| Metric | Budget |
|--------|--------|
| JS cold start to Login or Library | < 3s on mid-range Android |
| Library first paint from cache (P7) | < 500ms |
| Search debounce | 300ms |
| Concurrent `/auth/refresh` | 1 |
| Status poll concurrency | 1 per item id |

### 9.3 Accessibility

- Font scaling: no truncated primary buttons at 1.3×
- Contrast AA
- TalkBack labels on tabs and cards
- Captions on status badges (not color-only)

### 9.4 Observability

- `logger.ts` levels: debug / info / warn / error
- Correlate failed API with `status` + `code` (not body secrets)
- Phase 8: crash-free session rate tracked

---

## 10. Risks, non-goals, rollout

### 10.1 Risks

| Risk | Mitigation |
|------|------------|
| Phone cannot reach `localhost` | Document LAN IP; default to Azure HTTPS |
| Expo Go cannot share-target | Dev/EAS build in Phase 6 |
| Email verification blocks testers | Use already-verified extension account |
| Access token 15m surprises testers | Auto-refresh + foreground hook |
| Duplicate capture 409 | Treat as success + navigate |
| Embed 503 | Search error copy |
| Career rate limits | Dedicated error mapping |
| SQLite vs SecureStore mixup | Tokens never in SQLite |

### 10.2 Non-goals (this plan)

- iOS Share Extension (architecture allows it later; do not block Android)
- On-device Whisper / embeddings
- Light theme
- Multi-account switcher
- Changing backend schema for the app
- Google OAuth (not required; backend email/password is live)

### 10.3 Suggested calendar

| Phase | Duration | Depends on |
|-------|----------|------------|
| 1 Foundation | 2–3 days | — |
| 2 Auth | 4–5 days | 1 |
| 3 Library | 3–4 days | 2 |
| 4 Search | 3–4 days | 3 |
| 5 Capture | 3–4 days | 3 |
| 6 Android native | 5–7 days | 5 + EAS |
| 7 Offline | 4–5 days | 5 |
| 8 Modules + prod | 7–10 days | 6–7 |

Phases 4 and 5 may overlap after Phase 3 is signed off. Phase 6 must not start before capture mutation is stable.

### 10.4 Rollout

1. Internal testers: verified Recall accounts only  
2. Sideload preview APK  
3. Play internal testing  
4. Production AAB when Phase 7 gate is green; Phase 8A/8B can follow as app updates

---

## Execution rule

Implement **Phase 1 only** until its checklist is signed. Then Phase 2, and so on.

When coding, follow §3 file names, §5 theme, §6 guidelines, and the current phase’s tests. That is how this stays clean, scalable, and testable.

**Agent prompts:** use `recall-mobile/prompts/00-SHARED-RULES.md` plus the matching `prompts/phase-0N-*.md`. Do not combine phases in one session. Human sign-off remains `PHASE-CHECKLIST.md`.
