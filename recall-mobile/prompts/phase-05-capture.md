# AGENT PROMPT — Phase 5: Capture, pipeline status, jobs

Obey `recall-mobile/prompts/00-SHARED-RULES.md` and `recall-mobile/IMPLEMENTATION.md` Phase 5.

Implement in-app save **fully**: URL capture, status polling with cleanup, duplicate 409 handling, failed-job retry. Do **not** implement Android share intents (Phase 6 must reuse `useCapture`).

---

## Preconditions

- Phase 3 signed off (ItemDetail, items invalidation). Phase 4 optional but Search invalidation should still be coded.
- Reference: `backend/src/services/capture-service.js`, `backend/src/routes/status.js`, `backend/src/routes/jobs.js`.

---

## Objective

Paste a public http(s) URL, queue processing on the server, watch status, handle duplicates and failures. A save from the phone appears in the extension.

---

## Out of scope

- Share sheet, biometrics, SQLite outbox (Phase 6–7)
- Second capture HTTP path

---

## Implementation (complete)

### Files

```
src/api/capture.ts
src/api/status.ts
src/api/jobs.ts
src/hooks/useCapture.ts
src/hooks/useItemStatus.ts
src/screens/SaveScreen.tsx
src/screens/JobsScreen.tsx
```

Save tab = SaveScreen. Jobs accessible from Save or Settings.

### API

```
POST /capture   { url, save_mode, note? } → 201
POST /link      same handler (use /capture as primary)
GET  /status/:id
GET  /jobs/failed
GET  /jobs/history
POST /items/:id/retry
```

`save_mode`: `auto_scrape` | `manual_note` | `doc_extract`  
`manual_note` requires non-empty `note` **client-side** before POST.  
Duplicate → **409** `{ existingId }` → navigate to that item, copy “Already saved”.

### Behavior

1. URL field + paste + mode toggle + note box.
2. Validate with `lib/url.ts` before POST.
3. Disable double-submit while pending.
4. 201 → ItemDetail + start poll.
5. Poll `GET /status/:id`: interval 2s → 4s → 8s, cap 15s; stop on terminal status (`done` / `failed` / `error` — **read actual API fields** in `status.js` / items row and match them; do not guess wrong enums).
6. Cleanup timeouts on unmount. Cap ~3 minutes then “still processing — pull to refresh”.
7. Invalidate `['items']` and `['search']` on success/retry.
8. JobsScreen: list failed, retry button.
9. Invalid URL / 400: mapped message, no crash.

---

## Code quality you must verify

- [ ] Poll `useEffect` always clears timeout
- [ ] One poll per item id
- [ ] No share-intent code
- [ ] Capture only through `useCapture` → `api/capture.ts`
- [ ] `tsc` + `npm test` green

Inspect `GET /status/:id` response in backend before coding the badge.

---

## Automated tests (must write and pass)

| ID | Must assert |
|----|-------------|
| T5.1 | `url` rejects `javascript:`, empty, missing host |
| T5.2 | `manual_note` without note does not call fetch |
| T5.3 | Capture POST body includes `url`, `save_mode` |
| T5.4 | 409 with `existingId` is parsed; mutation exposes it (no throw as generic) |
| T5.5 | Poll backoff sequence 2,4,8,15 (unit) |
| T5.6 | Terminal status stops scheduling next poll |
| T5.7 | Unmount during poll does not schedule further (fake timers) |
| T5.8 | Retry calls `POST /items/:id/retry` |
| T5.9 | Successful capture invalidates items query key |
| T5.10 | Save button disabled while isPending (component) |

---

## Manual tests

| ID | Steps | Pass |
|----|-------|------|
| 5.1 | Article URL → appears in library + extension | |
| 5.2 | YouTube URL → processing then transcript on detail | |
| 5.3 | manual_note without note blocked | |
| 5.4 | Duplicate URL → existing item | |
| 5.5 | Invalid URL message | |
| 5.6 | Retry failed job | |
| 5.7 | Leave detail while processing; no freeze/crash on return | |

---

## Checklist mapping

All Phase 5 boxes in `PHASE-CHECKLIST.md`.

---

## Approval gate

YES only if T5.1–T5.10 pass, poll cleanup proven by T5.7, share sheet not implemented.

Output the Phase 5 report.
