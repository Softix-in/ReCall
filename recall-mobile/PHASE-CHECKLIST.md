# Phase sign-off checklist

Use this after each phase. A phase is **done** only when every box is checked on a physical Android device (or emulator + one real-device pass for network/auth).

Agent prompts for implementation + automated tests: [`prompts/README.md`](./prompts/README.md). The agent’s “Ready for sign-off: YES” is not this checklist — a human still ticks the boxes.

Do not start Phase N+1 until Phase N is signed off.

---

## Phase 1 — Foundation

- [ ] `npx expo start` launches without TypeScript errors
- [ ] `GET /health` succeeds against production URL
- [ ] Theme tokens match extension (black bg, white text, 10px radius)
- [ ] File tree matches IMPLEMENTATION.md §3 exactly
- [ ] No tokens in AsyncStorage
- [ ] `.env.example` exists; `.env` is gitignored
- [ ] `npm test` (or `npx tsc --noEmit`) passes

**Signed off by:** _____________ **Date:** _____________

---

## Phase 2 — Auth

- [ ] Register with valid email/password → tokens in SecureStore, `device=android`
- [ ] Login with existing account used by the Chrome extension
- [ ] `GET /auth/me` shows the same email as the extension
- [ ] Unverified email → blocked from library with resend action (`403 email_not_verified`)
- [ ] Kill app and reopen → still logged in
- [ ] Wait for access-token expiry (or mock) → silent refresh, no login screen
- [ ] Invalid refresh → login screen, SecureStore cleared
- [ ] Logout → `POST /auth/logout`, tokens gone, login shown
- [ ] Wrong password → inline error, no crash
- [ ] Forgot-password request does not leak whether email exists

**Signed off by:** _____________ **Date:** _____________

---

## Phase 3 — Library & item detail

- [ ] Home shows the same recent items as the extension
- [ ] Pull-to-refresh updates the list
- [ ] Empty library shows empty state, not a blank screen
- [ ] Tap item → detail: title, summary, tags, source, date
- [ ] Transcript loads only when requested (`include_transcript=1`)
- [ ] Open original URL in system browser
- [ ] Delete item → gone from app and extension
- [ ] 404 / network error → retry UI, no white screen

**Signed off by:** _____________ **Date:** _____________

---

## Phase 4 — Search & ask

- [ ] Natural-language search returns the same family of results as the extension
- [ ] Empty query does not hit the API
- [ ] Filters: type, mode, since
- [ ] Recommendations render and tap-fills the query
- [ ] Debounce: typing does not spam `/search`
- [ ] Cancel in-flight search on new keystroke
- [ ] Ask library works when `/ask/status` is available; graceful empty when not
- [ ] Embed 503 → user-readable message, not a crash

**Signed off by:** _____________ **Date:** _____________

---

## Phase 5 — Capture, status, jobs

- [ ] Paste YouTube/article URL → `POST /capture` → item appears
- [ ] `manual_note` requires a note; blocked otherwise
- [ ] Duplicate URL → 409 handled; navigate to `existingId`
- [ ] Invalid URL → 400 message
- [ ] Status polling stops on `done` / `failed` / unmount
- [ ] Failed job visible; retry works
- [ ] Saved item searchable from the extension

**Signed off by:** _____________ **Date:** _____________

---

## Phase 6 — Android native

- [ ] Share a URL from Chrome/YouTube → Recall → saved
- [ ] Share non-URL text → validation error, no crash
- [ ] Fingerprint/face unlock after cold start (if hardware present)
- [ ] Clipboard URL prompt appears once per unique URL
- [ ] Local notification when a polled capture finishes (optional if permission denied)
- [ ] Share path works on a **dev/EAS build**, not only Expo Go

**Signed off by:** _____________ **Date:** _____________

---

## Phase 7 — Offline & resilience

- [ ] Airplane mode: last library visible with offline banner
- [ ] Search/capture while offline: queued or explicit failure, never silent drop
- [ ] Online again: outbox flushes; library refreshes
- [ ] Query cache survives app restart
- [ ] Rate-limit 429 → backoff, no refresh storm
- [ ] App backgrounded during poll → no leaked intervals

**Signed off by:** _____________ **Date:** _____________

---

## Phase 8 — Career, research, production

- [ ] Profile read/edit matches extension
- [ ] Projects CRUD
- [ ] JD analyze + resume build (rate-limit errors shown)
- [ ] Research company list + start job + poll
- [ ] EAS Android APK/AAB builds
- [ ] Production uses HTTPS only
- [ ] No secrets in the repo or APK logs
- [ ] CI: typecheck + unit tests on PR
- [ ] Extension and app stay in sync on one account

**Signed off by:** _____________ **Date:** _____________
