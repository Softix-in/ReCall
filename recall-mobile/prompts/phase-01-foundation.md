# AGENT PROMPT — Phase 1: Foundation & platform shell

Obey `recall-mobile/prompts/00-SHARED-RULES.md` and `recall-mobile/IMPLEMENTATION.md` Phase 1.

You will implement Phase 1 **fully**. No login. No capture. No next-phase features. Zero TypeScript errors. All Phase 1 automated tests passing.

---

## Preconditions

- `recall-mobile/` already contains `README.md`, `IMPLEMENTATION.md`, `PHASE-CHECKLIST.md`, and `prompts/`. **Do not delete them.**
- No Expo app may exist yet. Create it **inside** `recall-mobile/` (this folder is the app root).
- Previous phase: none.

---

## Objective

A bootable Expo + TypeScript (strict) Android app that:

- Matches the frozen file tree for Phase 1 files
- Uses locked theme tokens
- Calls `GET /health` through `src/api/client.ts`
- Shows success or a themed error (never a white crash)

---

## Out of scope (do not build)

- Login, register, SecureStore tokens
- Library, search, save
- Navigation tabs for product screens
- axios, Redux, NativeWind, Firebase
- Changing `backend/`

---

## Implementation (complete, not a stub)

### 1. Scaffold

- Initialize Expo (blank TypeScript) in `recall-mobile/` without wiping plan markdown or `prompts/`.
- `package` / `bundleIdentifier`: `com.recall.app`
- TypeScript `strict: true`
- Path aliases: `@api/*`, `@auth/*`, `@screens/*`, `@components/*`, `@hooks/*`, `@theme/*`, `@types/*`, `@lib/*`
- Jest + testing-library for React Native
- ESLint: no-explicit-any, unused imports
- `.env.example`:
  ```
  EXPO_PUBLIC_API_URL=https://recall-app.centralindia.cloudapp.azure.com
  ```
- `.gitignore` includes `.env`, `node_modules`, Expo caches. Do not gitignore the plan docs.

### 2. Files that must exist

```
App.tsx
src/config.ts
src/api/client.ts
src/api/errors.ts
src/theme/colors.ts
src/theme/spacing.ts
src/theme/typography.ts
src/theme/radius.ts
src/lib/logger.ts
src/lib/queryClient.ts
src/lib/url.ts
src/navigation/RootNavigator.tsx
src/navigation/types.ts
src/components/ErrorBanner.tsx
src/components/Loading.tsx
src/screens/HealthScreen.tsx   # debug only; Phase 2 will replace as root
```

Theme values **exactly**:

```
bg #000000, surface #0d0d0d, surface2 #161616, surface3 #1f1f1f
border #2a2a2a, borderFocus #444444
text #ffffff, text2 #c8c8c8, muted #6b6b6b
accent #ffffff, accentBg rgba(255,255,255,0.06)
success #4ade80, danger #f87171, warning #fbbf24
radius sm 8, md 10, lg 12
spacing 4pt grid: 4, 8, 12, 16, 24, 32
```

### 3. Behavior

- `config.ts`: read `EXPO_PUBLIC_API_URL`, trim trailing slash, throw/return typed error if empty.
- `client.ts`: `fetch` only here; 20s timeout; AbortController; JSON parse guard (empty/non-JSON must not throw as syntax crash); `skipAuth` for public paths including `/health`.
- `HealthScreen`: on mount call `/health`; show `ok` and version if present; `ErrorBanner` + retry on failure.
- `url.ts`: helpers to trim, detect http(s), reject empty/`javascript:`.
- `logger.ts`: no-op or safe in production; never log secrets (none yet, but write it correctly now).
- Android: cleartext HTTP allowed **debug only**; release must prefer HTTPS.

---

## Code quality you must verify

- [ ] File tree matches IMPLEMENTATION.md §3 for Phase 1 files
- [ ] No `any`
- [ ] No hex colors outside `theme/`
- [ ] No `fetch` outside `client.ts`
- [ ] Health screen has loading + error + success
- [ ] Hit targets ≥ 44px on retry button
- [ ] Plan docs still present
- [ ] `npx tsc --noEmit` exit 0
- [ ] `npm test` exit 0

If any box fails, fix it before the report.

---

## Automated tests (must write and pass)

| ID | File (suggested) | Must assert |
|----|------------------|-------------|
| T1.1 | `src/config.test.ts` | Trailing slash stripped from API URL |
| T1.2 | `src/config.test.ts` | Empty URL is rejected |
| T1.3 | `src/lib/url.test.ts` | Accepts `https://example.com`; rejects `javascript:alert(1)`, `""`, `ftp://x` |
| T1.4 | `src/api/client.test.ts` | `GET /health` with skipAuth; mocked fetch; parses `{ ok: true }` |
| T1.5 | `src/api/client.test.ts` | Non-JSON body does not crash; returns mapped error |
| T1.6 | `src/api/client.test.ts` | Abort/timeout path maps to user-safe error |
| T1.7 | `src/theme/colors.test.ts` | Locked hex values match IMPLEMENTATION.md |
| T1.8 | `src/components/ErrorBanner.test.tsx` | Renders message and retry callback |

---

## Manual tests (document steps; mark BLOCKED if no device)

| ID | Steps | Pass |
|----|-------|------|
| 1.1 | `npx expo start`, open Expo Go, Health screen shows API `ok: true` against production HTTPS | |
| 1.2 | Set a garbage `EXPO_PUBLIC_API_URL`, reload, ErrorBanner, retry, **no crash** | |
| 1.3 | Confirm background is black, text white, radius ~10 on cards | |
| 1.4 | Confirm `.env` is gitignored | |

---

## Checklist mapping (PHASE-CHECKLIST Phase 1)

You must address every box: `expo start` clean, `/health` works, theme match, file tree, no AsyncStorage tokens (none stored yet — confirm no AsyncStorage usage), `.env.example` + gitignore, `tsc`/tests pass.

---

## Approval gate

**Ready for sign-off: YES** only if automated tests all pass, `tsc` is clean, Health client is real (not hardcoded `ok`), and you did not start Phase 2.

Then output the Phase 1 report from SHARED-RULES.
