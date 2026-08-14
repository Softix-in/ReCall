# AGENT PROMPT — Phase 2: Authentication & session

Obey `recall-mobile/prompts/00-SHARED-RULES.md` and `recall-mobile/IMPLEMENTATION.md` Phase 2.

Implement Phase 2 **fully**: real login/register against the live API contract, SecureStore, refresh single-flight, email verification gate. Do not start Phase 3 library lists (prefetch hook is allowed; UI list is not).

---

## Preconditions

- Phase 1 signed off (or equivalent: Expo app boots, `client.ts` + theme exist, `tsc` clean).
- Reference: `recall-extension/shared/auth.js`, `backend/src/routes/auth.js`, `backend/src/db/users.js`.

Password rule (client must match server): **at least 10 characters, at least one letter and one number.** Copy: `Password must be at least 10 characters and include a letter and a number`.

---

## Objective

Same Recall account as the Chrome extension can sign in on Android. Session survives kill/relaunch. Access token refresh is silent. Unverified users cannot enter the main app.

---

## Out of scope

- Library item list UI, search, capture
- Biometrics (Phase 6)
- Google OAuth
- Changing backend auth

---

## Implementation (complete)

### Files

```
src/auth/tokenStorage.ts
src/auth/jwt.ts
src/auth/session.ts
src/auth/AuthContext.tsx
src/api/auth.ts
src/hooks/useAuth.ts
src/screens/auth/LoginScreen.tsx
src/screens/auth/RegisterScreen.tsx
src/screens/auth/ForgotPasswordScreen.tsx
src/screens/auth/VerifyEmailScreen.tsx
src/navigation/RootNavigator.tsx   # replace Health as root
```

Keep `HealthScreen` reachable only as a hidden debug route or Settings later; **root is auth/session**.

### Auth API

```
POST /auth/register  { email, password, device: "android" } → 201
POST /auth/login     { email, password, device: "android" }
POST /auth/refresh   { refresh_token, device: "android" }
POST /auth/logout    { refresh_token }
GET  /auth/me
POST /auth/resend-verification
POST /auth/forgot-password
```

Public paths: no Bearer (IMPLEMENTATION.md §7.1).

### Required behavior

1. SecureStore keys: `recall.accessToken`, `recall.refreshToken`, `recall.user`.
2. `jwt.ts`: base64url decode `exp` only. Do not verify RS256 on device.
3. Refresh if `exp - now < 120s`. **Single-flight**: two parallel callers → one `POST /auth/refresh`.
4. `client.ts`: authenticated requests attach Bearer; on 401 one refresh + one retry; refresh 429 does **not** clear session; refresh fail → `clearSession` + AuthError.
5. Persist tokens only after both `access_token` and `refresh_token` parse.
6. Restore on launch: read store → refresh if needed → `GET /auth/me`.
7. `email_verified === false` or `403 email_not_verified` → `VerifyEmailScreen` with resend; re-check `/auth/me` on AppState `active`.
8. Logout: attempt `POST /auth/logout`, **always** clear SecureStore, show Login.
9. Forgot password: generic success (do not reveal if email exists).
10. Forms: KeyboardAvoidingView, `secureTextEntry`, disable submit while pending, client-side email + password validation **before** POST.
11. Prefetch `['items']` only if verified — do not build Library UI.
12. AppState `active` → `ensureValidAccessToken`.

Remove Phase 1 Health as the default landing screen.

---

## Code quality you must verify

- [ ] No tokens in AsyncStorage, logs, or ErrorBanner
- [ ] `device: "android"` on login, register, refresh
- [ ] Screens call `useAuth` / api modules, not `fetch`
- [ ] Refresh lock unit-tested
- [ ] 403 `email_not_verified` mapped in `errors.ts`
- [ ] Password never in logger
- [ ] `tsc --noEmit` + `npm test` pass including Phase 1 tests

---

## Automated tests (must write and pass)

| ID | Must assert |
|----|-------------|
| T2.1 | `jwt` decodes `exp` from a synthetic JWT payload |
| T2.2 | Invalid token → no throw, returns null exp |
| T2.3 | Two concurrent `ensureValidAccessToken` when expired → **one** refresh fetch |
| T2.4 | Login success writes both tokens via mocked SecureStore |
| T2.5 | Login 401 → mapped “Invalid email or password”, no session write |
| T2.6 | Register rejects password shorter than 10 or without letter/number **client-side** |
| T2.7 | Client: 401 → refresh 200 → original request retried **once** |
| T2.8 | Client: refresh 401 → session cleared, no infinite loop |
| T2.9 | Client: refresh 429 → session **kept**, error thrown |
| T2.10 | Logout clears storage even if logout POST fails |
| T2.11 | Login form: empty email disables or errors (component test) |
| T2.12 | `device` body field equals `"android"` on mocked login fetch |

---

## Manual tests

| ID | Steps | Pass |
|----|-------|------|
| 2.1 | Login with extension account; email matches extension Settings | |
| 2.2 | Kill app; reopen; still logged in | |
| 2.3 | Logout; cannot access a protected screen; login shown | |
| 2.4 | Wrong password; inline error; no crash | |
| 2.5 | Unverified account cannot see Library (VerifyEmail only) | |
| 2.6 | Forgot password; generic success copy | |
| 2.7 | Wait/mock access expiry; stay logged in via refresh | |

---

## Checklist mapping

All Phase 2 boxes in `PHASE-CHECKLIST.md`.

---

## Approval gate

YES only if T2.1–T2.12 pass, no token logging, Health is not the root screen, Phase 3 list UI not started.

Output the Phase 2 report.
