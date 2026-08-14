# AGENT PROMPT — Phase 6: Android native surfaces

Obey `recall-mobile/prompts/00-SHARED-RULES.md` and `recall-mobile/IMPLEMENTATION.md` Phase 6.

Implement share-to-Recall, optional biometrics, clipboard assist, optional local notification, and deep links. **Reuse Phase 5 `useCapture` — no second POST implementation.**

---

## Preconditions

- Phase 5 signed off (`useCapture` stable, 409 handled).
- Expo Go **cannot** fully test share targets. Configure EAS **development** build. Document exact `eas.json` / `app.json` plugin steps even if the human runs `eas build`.

---

## Objective

Sharing a URL from Chrome or YouTube saves it to the same library. Logged-out shares wait until login. Biometrics lock the UI, not the JWT.

---

## Out of scope

- iOS Share Extension
- SQLite offline outbox (Phase 7) except pending URL in SecureStore
- Career/research

---

## Implementation (complete)

### Files

```
src/native/shareIntent.ts
src/native/biometrics.ts
src/native/clipboardWatch.ts
src/navigation/linking.ts
app.json / app.config.js plugins
eas.json (development profile at minimum)
```

### Behavior

1. Android intent-filter: `SEND` / `SEND_MULTIPLE` for `text/plain` and `text/uri-list`.
2. Extract first `http(s)` URL; otherwise friendly error, no crash.
3. Logged in → `useCapture` → toast “Saved to Recall”.
4. Logged out → SecureStore `recall.pendingShareUrl` → after login consume **once**.
5. Duplicate share / back navigation must not double POST (guard in-flight URL).
6. Biometrics: Settings toggle **default off**. After session restore, if enabled, require Face/fingerprint. Failure ≠ delete tokens; allow retry or password.
7. Clipboard: opt-in; on AppState active, if new URL, prompt once; persist last-seen URL hash.
8. Notification: request permission only after first successful capture **or** Settings toggle; fire when poll reaches `done`.
9. Deep link `recall://item/<id>` opens ItemDetail if logged in and verified; else Login then navigate.
10. Settings: toggles for biometric, clipboard watch, notifications.

---

## Code quality you must verify

- [ ] Single capture mutation path
- [ ] Pending share URL not logged
- [ ] Biometric is UX lock only
- [ ] Notification permission not requested at first launch
- [ ] `tsc` + `npm test` green
- [ ] No tokens in SQLite (none should exist yet)

---

## Automated tests (must write and pass)

| ID | Must assert |
|----|-------------|
| T6.1 | Extract URL from `"Check this https://example.com/a"` |
| T6.2 | `"hello"` → no URL, error result |
| T6.3 | Pending share saved and cleared after consume |
| T6.4 | Double submit same URL while pending is ignored |
| T6.5 | Deep link parser `recall://item/<uuid>` |
| T6.6 | Biometric disabled → skip gate |
| T6.7 | Clipboard last-seen hash prevents second prompt for same URL |
| T6.8 | Share while logged out does not call `/capture` until login |

---

## Manual tests (dev/EAS APK, not Expo Go for 6.1–6.4)

| ID | Steps | Pass |
|----|-------|------|
| 6.1 | Chrome share → Recall → saved | |
| 6.2 | YouTube share → saved | |
| 6.3 | Share non-URL text → error | |
| 6.4 | Share logged out → login → save pending | |
| 6.5 | Biometric on/off | |
| 6.6 | Clipboard prompt once per URL | |
| 6.7 | Back from share does not duplicate | |
| 6.8 | Notification on capture done if permitted | |

---

## Checklist mapping

All Phase 6 boxes in `PHASE-CHECKLIST.md`.

---

## Approval gate

YES only if T6.1–T6.8 pass, capture not duplicated, EAS/dev-client config exists, Phase 7 offline not started unless required stubs.

Output the Phase 6 report. If share cannot be verified without a human APK, mark 6.1–6.4 **BLOCKED — needs human** but still ship complete code + unit tests.
