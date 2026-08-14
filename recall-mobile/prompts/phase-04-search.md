# AGENT PROMPT — Phase 4: Semantic search & ask

Obey `recall-mobile/prompts/00-SHARED-RULES.md` and `recall-mobile/IMPLEMENTATION.md` Phase 4.

Implement search and Ask-library **fully**. Do not implement capture/save (Phase 5).

---

## Preconditions

- Phase 3 signed off (Library + ItemDetail exist).
- Reference: `backend/src/routes/search.js`, `backend/src/routes/ask.js`, extension `search()`.

---

## Objective

Natural-language search with the same query params as the extension. Debounced, abortable, filtered. Recommendations when the query is empty. Ask library when `/ask/status` allows it; otherwise a non-crashing disabled state.

---

## Out of scope

- POST `/capture`, share sheet, offline cache

---

## Implementation (complete)

### Files

```
src/api/search.ts
src/api/ask.ts
src/hooks/useSearch.ts
src/lib/debounce.ts
src/screens/SearchScreen.tsx
src/screens/AskScreen.tsx
src/components/SearchBar.tsx
```

Wire Search tab. Ask: stack screen from Search or a control on Search — not a fourth half-built tab unless navigation stays clean.

### API

```
GET /search?q=&type=&mode=&since=     q required, never call without trimmed q
GET /search/recommendations
GET /ask/status
POST /ask                             { question, limit? }
```

Query keys: `['search', { q, type, mode, since }]`, `['search', 'recommendations']`.

### Behavior

1. Debounce **300ms**. `q.trim().length >= 1` before `/search`.
2. Empty query: **do not** hit `/search`; load recommendations instead.
3. Filters: `type`, `mode`, `since` — same names as extension.
4. New keystroke aborts in-flight search (`signal`).
5. 503 embed → “Search is temporarily unavailable” via `errors.ts`.
6. Results reuse `ItemCard` → existing `ItemDetailScreen`.
7. Recommendation chip tap fills query and searches.
8. Ask: if status unavailable, disable with explanation; if available, POST, show answer + sources, loading state.
9. Library: jump-to-search control (icon or bar) that focuses Search tab.
10. Network failure: ErrorBanner + retry, not a fake empty success.

---

## Code quality you must verify

- [ ] Zero `/search` calls with empty `q` (test + code inspection)
- [ ] Search query not stored in AuthContext
- [ ] Abort does not apply stale results
- [ ] No `fetch` in screens
- [ ] `tsc` + `npm test` green

---

## Automated tests (must write and pass)

| ID | Must assert |
|----|-------------|
| T4.1 | `debounce.ts` 300ms: rapid calls → one trailing invocation (fake timers) |
| T4.2 | `search.ts` throws/refuses to build request when `q` empty |
| T4.3 | `search.ts` sets `type` `mode` `since` query params when provided |
| T4.4 | Aborted fetch does not update results (hook test with mocked abort) |
| T4.5 | 503 maps to dedicated search-unavailable message |
| T4.6 | Recommendations endpoint path is `/search/recommendations` |
| T4.7 | SearchBar calls onChange; submit/clear works (component) |
| T4.8 | Ask skipped/disabled when status says unavailable (no POST) |
| T4.9 | Ask POST sends question body when status ok |

---

## Manual tests

| ID | Steps | Pass |
|----|-------|------|
| 4.1 | Same query as extension → related hits | |
| 4.2 | Rapid typing; network inspector: not one request per key | |
| 4.3 | Filter type narrows results | |
| 4.4 | Tap recommendation fills query | |
| 4.5 | Ask down ≠ crash | |
| 4.6 | Airplane: error/retry, not empty fake list | |

---

## Checklist mapping

All Phase 4 boxes in `PHASE-CHECKLIST.md`.

---

## Approval gate

YES only if T4.1–T4.9 pass, empty `q` never hits `/search`, capture not started.

Output the Phase 4 report.
