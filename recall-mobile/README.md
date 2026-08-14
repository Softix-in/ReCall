# Recall Mobile (Android)

Android client for Recall. Same JWT API as the Chrome extension. Same user data.

This folder is the **source of truth** for how the app is built. Do not start coding until the current phase in [`IMPLEMENTATION.md`](./IMPLEMENTATION.md) is understood, and do not start the next phase until the previous phase checklist is signed off.

| Doc | Purpose |
|-----|---------|
| [`IMPLEMENTATION.md`](./IMPLEMENTATION.md) | Architecture, frozen file tree, 8 phases, tests, gates |
| [`PHASE-CHECKLIST.md`](./PHASE-CHECKLIST.md) | Per-phase confirm & test sign-off |
| [`prompts/`](./prompts/README.md) | Copy-paste agent prompts (shared rules + one file per phase) |

## Stack (locked)

- Expo SDK + React Native + TypeScript (strict)
- React Navigation (native stack + bottom tabs)
- TanStack Query
- expo-secure-store for tokens
- Same dark theme as `recall-extension/popup/popup.css`

## Backend

Default production API:

```
https://recall-app.centralindia.cloudapp.azure.com
```

Auth: `Authorization: Bearer <access_token>`  
Device string on login/register/refresh: `android`

## Rule

Follow [`IMPLEMENTATION.md`](./IMPLEMENTATION.md) exactly: file structure, theme tokens, coding guidelines, and phase gates. No parallel folders, no extra frameworks, no skipping tests.
