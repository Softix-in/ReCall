# AGENT PROMPT — Phase 7: Offline cache & resilience

Obey `recall-mobile/prompts/00-SHARED-RULES.md` and `recall-mobile/IMPLEMENTATION.md` Phase 7.

Implement offline library cache, capture outbox, NetInfo, 429 backoff, and leak-free polling. **Tokens stay in SecureStore only — never SQLite.**

---

## Preconditions

- Phase 5 signed off (capture + poll). Phase 6 preferred (share should enqueue through the same outbox).
- Packages allowed now: `expo-sqlite`, `@react-native-community/netinfo`.

---

## Objective

Airplane mode still shows the last library. Captures queued offline flush when online. No silent data loss. No `/auth/refresh` storms.

---

## Out of scope

- Career/research, Play Store, inventing a second cache library **and** persist-client together — pick **SQLite as source of offline items**; do not also add `@tanstack/react-query-persist-client`.

---

## Implementation (complete)

### Files

```
src/storage/db.ts
src/storage/itemsCache.ts
src/storage/outbox.ts
src/hooks/useOffline.ts
src/components/OfflineBanner.tsx
```

Wire `onlineManager` in `queryClient.ts` to NetInfo.

### Behavior

1. SQLite `user_version` migrations from v1.
2. Persist last successful `['items']` payload (user-scoped if multiple accounts possible — key by `user.id`).
3. Offline Library reads cache; `OfflineBanner`: “Offline — showing saved copy”.
4. Online: network is source of truth; then refresh cache.
5. Outbox table for `POST /capture` payloads; key = normalized URL (idempotent).
6. Flush serial (one at a time) on reconnect with jitter; handle 409 as success.
7. Offline search: explicit disabled/error — **not** an empty success list.
8. Offline capture: enqueue + user message, never silent drop.
9. `client.ts` 429: `Retry-After` or 2s/4s/8s; refresh 429 still does not clear session (Phase 2).
10. Confirm status polls still clean up on background/unmount (Phase 5 hook).

---

## Code quality you must verify

- [ ] No refresh/access tokens in SQLite (grep the storage layer)
- [ ] Outbox serial flush
- [ ] Banner on Library when offline
- [ ] Search offline is explicit
- [ ] `tsc` + `npm test` green

---

## Automated tests (must write and pass)

| ID | Must assert |
|----|-------------|
| T7.1 | Normalize URL: trailing slash / hash rules documented and tested (match capture-service as closely as practical) |
| T7.2 | Duplicate outbox insert same URL does not create two flush POSTs |
| T7.3 | Flush 409 existingId treated as success and row deleted |
| T7.4 | Items cache round-trip serialize/deserialize |
| T7.5 | Cache keyed by user id (user A cache not read as user B) |
| T7.6 | 429 backoff schedule unit test |
| T7.7 | `onlineManager` / useOffline reflects NetInfo mocked `false` |
| T7.8 | Search hook does not call `/search` when offline (or surfaces error without fake hits) |
| T7.9 | Poll cleanup still passes Phase 5 unmount test |

---

## Manual tests

| ID | Steps | Pass |
|----|-------|------|
| 7.1 | Airplane: library populated + banner | |
| 7.2 | Offline capture → online → item on server | |
| 7.3 | Queue same URL twice → one item | |
| 7.4 | Search offline: error/disabled | |
| 7.5 | Kill app offline; reopen; cache remains | |
| 7.6 | Background during poll; resume; no runaway timers | |
| 7.7 | Watch refresh: no loop on 429 | |

---

## Checklist mapping

All Phase 7 boxes in `PHASE-CHECKLIST.md`.

---

## Approval gate

YES only if T7.1–T7.9 pass, grep shows no tokens in `src/storage/`, search is not fake-empty offline.

Output the Phase 7 report.
