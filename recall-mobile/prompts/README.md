# Phase prompts (agent-ready)

Use **one prompt per session**. Do not combine phases.

## How to run

1. Confirm the previous phase is signed off in `PHASE-CHECKLIST.md`.
2. Open Agent mode.
3. Paste, in order:
   - the contents of `00-SHARED-RULES.md`
   - the contents of `phase-0N.md` for the current phase
4. When the agent finishes, run the manual tests it listed, then sign the checklist.

| Order | File | Phase |
|-------|------|--------|
| 0 | [`00-SHARED-RULES.md`](./00-SHARED-RULES.md) | Always prepend |
| 1 | [`phase-01-foundation.md`](./phase-01-foundation.md) | Foundation |
| 2 | [`phase-02-auth.md`](./phase-02-auth.md) | Auth |
| 3 | [`phase-03-library.md`](./phase-03-library.md) | Library & detail |
| 4 | [`phase-04-search.md`](./phase-04-search.md) | Search & ask |
| 5 | [`phase-05-capture.md`](./phase-05-capture.md) | Capture & jobs |
| 6 | [`phase-06-android-native.md`](./phase-06-android-native.md) | Share, biometrics |
| 7 | [`phase-07-offline.md`](./phase-07-offline.md) | Offline & outbox |
| 8 | [`phase-08-production.md`](./phase-08-production.md) | Career, research, EAS |

## Approval rule

The agent’s “Ready for sign-off: YES” is **not** the same as human sign-off. A human must tick `PHASE-CHECKLIST.md` after device testing.
