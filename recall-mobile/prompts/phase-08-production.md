# AGENT PROMPT — Phase 8: Career, research, production hardening

Obey `recall-mobile/prompts/00-SHARED-RULES.md` and `recall-mobile/IMPLEMENTATION.md` Phase 8.

Implement profile/career/research **as lazy feature modules**, plus production Android build, CI, and security hardening. Do not regress Phases 1–7.

---

## Preconditions

- Phases 5–7 signed off (MVP capture/search/offline).
- Reference: `recall-extension/shared/api.js` (profile, career, research, knowledge), `CAREER.md`, `backend/src/routes/profile.js`, `career.js`, `research.js`, `knowledge.js`.

---

## Objective

Optional Career and Research tabs that match the extension’s API. Store-ready Android config: HTTPS-only production, EAS profiles, CI typecheck+tests, no secrets in repo or logs. Extension and app stay in sync on one account.

---

## Implementation (complete)

### 8A — Profile & career (lazy screens)

Files:

```
src/api/profile.ts
src/api/career.ts
src/screens/career/   # identity, projects, resume, jd, chat — split files
```

- `GET/PUT /profile`
- Projects CRUD + reorder
- Master resume GET/POST + history
- `POST /career/analyze-jd`, `build-resume`, `generate/bio|pitch|cover-letter`, `POST /career/chat`
- Rate-limit: disable actions + cooldown copy (career limiter)
- Streaming: match extension `api.js` (stream if the client already does; otherwise JSON)
- Feature flag or Settings entry so Library/Search do **not** import career modules at top level (`React.lazy` / deferred navigation imports)

### 8B — Research & knowledge (lazy)

```
src/api/research.ts
src/api/knowledge.ts
src/screens/research/
```

- `POST /research/startups`, poll `/research/jobs/:id`
- Companies list/detail/patch/reanalyze, stats
- `POST /knowledge/crawl` + job list/status

### 8C — Production

1. `eas.json`: `development`, `preview` (APK), `production` (AAB).
2. Release builds: refuse non-HTTPS API base unless explicit debug flag compiled out.
3. Remove/hide Health debug as default; no debug screens in production.
4. CI workflow: `tsc --noEmit` and `npm test` on PRs touching `recall-mobile/`.
5. `logger.ts` debug no-op in release; redact tokens/Authorization/passwords/emails.
6. Settings: `GET /export` share file.
7. Version `app.json` + `recall-mobile/CHANGELOG.md`.
8. Update root `CONTRIBUTING.md` layout table to include `recall-mobile/`.
9. `GET/PUT /settings` if not already in Settings.
10. Security: no private keys, no `.env` committed, no tokens in logs.

---

## Code quality you must verify

- [ ] Career/research not imported from LibraryScreen/SearchScreen
- [ ] Rate-limit UX for career
- [ ] Production HTTPS enforcement unit-tested
- [ ] CI file exists and runs tsc + test
- [ ] CONTRIBUTING.md updated
- [ ] Full `tsc` + `npm test` (all phases) green
- [ ] Grep: no `console.log` of tokens; no secrets in repo

---

## Automated tests (must write and pass)

| ID | Must assert |
|----|-------------|
| T8.1 | Profile GET/PUT paths |
| T8.2 | Project create/update/delete paths |
| T8.3 | Analyze-jd POST; 429 mapped to cooldown message |
| T8.4 | Research start + job poll paths |
| T8.5 | Knowledge crawl path |
| T8.6 | Production config rejects `http://` API URL |
| T8.7 | Logger redacts `Authorization` / `Bearer` |
| T8.8 | Export URL/path helper |
| T8.9 | Lazy import: career module not required from Library (static analysis or unit) |
| T8.10 | Existing Phase 1–7 tests still pass |

---

## Manual tests

| ID | Steps | Pass |
|----|-------|------|
| 8.1 | Profile fields match extension after edit | |
| 8.2 | Project create/edit/delete | |
| 8.3 | JD analyze; 429 shown if hit | |
| 8.4 | Research job completes; company listed | |
| 8.5 | Preview APK clean install: login → save → search | |
| 8.6 | Mixed saves: extension + app same library | |
| 8.7 | Production logging: no tokens in logcat | |

---

## Checklist mapping

All Phase 8 boxes in `PHASE-CHECKLIST.md`.

---

## Approval gate

YES only if T8.1–T8.10 pass, CI config added, HTTPS locked for release, no secrets committed, MVP paths (auth/library/search/capture) still green.

If EAS build cannot run in this environment, commit complete `eas.json` + docs and mark build IDs **BLOCKED — needs human**, but code must still be production-ready.

Output the Phase 8 report.
