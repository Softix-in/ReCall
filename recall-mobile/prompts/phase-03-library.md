# AGENT PROMPT — Phase 3: Library & item detail

Obey `recall-mobile/prompts/00-SHARED-RULES.md` and `recall-mobile/IMPLEMENTATION.md` Phase 3.

Implement the home feed and item detail **fully**, using the same items as the Chrome extension. Do not implement search API UI or capture forms (Phase 4–5).

---

## Preconditions

- Phase 2 signed off: session, VerifyEmail gate, authenticated `client.ts`.
- Reference: `backend/src/routes/items.js`, `recall-extension/shared/api.js` (`getItems`, `getItem`, `deleteItem`, tags).

---

## Objective

Verified users see recent saves, open detail (summary/tags/transcript on demand), open the original URL, delete with confirm. Loading / empty / error on every data view.

---

## Out of scope

- `/search`, `/ask`, `/capture`, share sheet, offline SQLite

---

## Implementation (complete)

### Files

```
src/api/items.ts
src/hooks/useItems.ts
src/hooks/useItem.ts
src/screens/LibraryScreen.tsx
src/screens/ItemDetailScreen.tsx
src/screens/SettingsScreen.tsx     # email from /auth/me, logout (required shell)
src/components/ItemCard.tsx
src/components/EmptyState.tsx
src/components/TagList.tsx
src/components/StatusBadge.tsx
src/lib/dates.ts                   # relative + absolute, single helper
```

### Navigation

Main tabs after verified session:

- Library stack: Library → ItemDetail  
- Settings stack: Settings (logout)  
- Placeholder tabs for Search/Save may exist as “Coming in later phase” **disabled** or omit them — do **not** fake search.

One shared `ItemDetailScreen` component; do not duplicate detail implementations.

### API

```
GET  /items?limit=20          → { items }
GET  /items/:id
GET  /items/:id?include_transcript=1
DELETE /items/:id
GET  /items/:id/tags
PUT  /items/:id/tags          { tags: string[] }
```

Query keys: `['items', { limit }]`, `['item', id]`, `['item', id, 'transcript']`.

### Behavior

1. `useItems`: `staleTime: 30_000`, pull-to-refresh, `FlatList` keyed by `id`.
2. ItemCard: title, domain, relative time, source type, processing badge. No transcript text.
3. Detail: title, summary, tags, source, dates; **Show transcript** fetches `include_transcript=1` only then.
4. Open original via `Linking.openURL` after `lib/url.ts` allowlist (https/http only).
5. Delete: confirm → DELETE → invalidate `['items']` → go back. Optimistic delete only with rollback.
6. EmptyState when `items.length === 0`.
7. ErrorBanner + retry on list/detail failure (including 404).
8. Tags: view required; edit PUT recommended in this phase.
9. Accessibility: card `accessibilityRole="button"`, label = title.
10. Settings: show user email, logout (reuse Phase 2).

---

## Code quality you must verify

- [ ] No transcript on list fetch
- [ ] No ScrollView+map for the library
- [ ] Dates only via `lib/dates.ts`
- [ ] Theme tokens only
- [ ] Query invalidation after delete/tags
- [ ] Effect cleanup N/A unless you add intervals
- [ ] `tsc` + full `npm test` green

---

## Automated tests (must write and pass)

| ID | Must assert |
|----|-------------|
| T3.1 | `items.ts` builds `/items?limit=20` |
| T3.2 | Detail transcript helper adds `include_transcript=1` only when requested |
| T3.3 | ItemCard shows title and domain (component) |
| T3.4 | EmptyState renders when items `[]` (Library or EmptyState test) |
| T3.5 | ErrorBanner retry on failed useItems (hook or screen with mocked query) |
| T3.6 | Delete mutation calls DELETE `/items/:id` and invalidates items key |
| T3.7 | `dates.ts` relative formatting for a known timestamp (deterministic) |
| T3.8 | `url` reject non-http before open |
| T3.9 | Tags PUT body is `{ tags: string[] }` |

---

## Manual tests

| ID | Steps | Pass |
|----|-------|------|
| 3.1 | Same first ~20 items as extension | |
| 3.2 | Save in extension; pull-to-refresh on phone; new item appears | |
| 3.3 | Transcript hidden until toggle | |
| 3.4 | Open original in system browser | |
| 3.5 | Delete; gone in app and extension | |
| 3.6 | Airplane/fail: retry UI, not white screen | |

---

## Checklist mapping

All Phase 3 boxes in `PHASE-CHECKLIST.md`.

---

## Approval gate

YES only if T3.1–T3.9 pass, Library is default tab, Search/Capture not implemented, no duplicate ItemDetail code.

Output the Phase 3 report.
