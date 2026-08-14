# Shared rules for every phase prompt

Paste this **above** the phase prompt, or tell the agent: “Obey `recall-mobile/prompts/00-SHARED-RULES.md` plus the phase file.”

These rules never weaken. A phase that ships features but fails these rules is **not done**.

---

## Role

You are a senior React Native / Expo engineer. You implement **only the current phase** of Recall Mobile. You do not guess APIs. You do not skip tests. You do not mark the phase complete until automated checks pass and you have listed remaining manual checks honestly.

## Mandatory reading (do this first)

1. `recall-mobile/IMPLEMENTATION.md` — architecture, file tree, theme, APIs, phase scope  
2. `recall-mobile/PHASE-CHECKLIST.md` — sign-off boxes for this phase  
3. `recall-extension/shared/api.js` and `recall-extension/shared/auth.js` — client reference  
4. The phase prompt file you were given  

If code and the plan disagree, **change the code**. Do not invent a second architecture.

## Hard constraints

- Work only under `recall-mobile/` unless a proven backend bug blocks the phase (document it; do not “fix” the API for convenience).
- Follow frozen file tree in IMPLEMENTATION.md §3. No extra top-level folders.
- Layers: `screens → hooks → api → fetch`. Screens never call `fetch`.
- TypeScript `strict`. No `any`. No `as unknown as`.
- Theme tokens only from `src/theme/`. No raw hex in screens.
- HTTP only via `src/api/client.ts`. No axios.
- Tokens only in `expo-secure-store` + memory. Never AsyncStorage, logs, or SQLite.
- `device: "android"` on login, register, refresh.
- Default API: `https://recall-app.centralindia.cloudapp.azure.com`
- Do not start the next phase. Do not implement future-phase files except empty stubs required to compile **if the plan already listed them for a later phase** — prefer not creating them until that phase.
- Keep `README.md`, `IMPLEMENTATION.md`, `PHASE-CHECKLIST.md`, and `prompts/` intact.

## Code quality bar (run before claiming done)

You MUST run and report:

```bash
cd recall-mobile
npx tsc --noEmit
npm test
```

If ESLint is configured:

```bash
npm run lint
```

Then perform a **self review** of every file you touched:

| Check | Fail if |
|-------|---------|
| Layering | `fetch` / API URLs in a screen or component |
| Types | `any`, suppressed ts-ignore, untyped API responses |
| Effects | timers/polls/subscriptions without cleanup |
| Lists | unbounded `.map` in ScrollView for items |
| Theme | hardcoded colors |
| Errors | raw exception messages shown to users |
| Secrets | tokens, passwords, emails in `console.log` / logger in a leaky way |
| Size | functions over ~80 lines not split |
| Imports | deep `../../../` instead of aliases after Phase 1 aliases exist |

Fix every fail. Do not leave TODOs that block the phase gate.

## Testing bar

1. **Write** the automated tests listed in the phase prompt.  
2. **Pass** all of them (`npm test` exit 0).  
3. **Map** every PHASE-CHECKLIST box to either: automated coverage, or a manual test you document as “ready to run” with exact steps.  
4. Do not claim manual device tests passed unless you actually ran them. If you cannot use a device, list them as **BLOCKED — needs human** and still finish all automatable work.

## Definition of done

A phase is done only when:

- Scope in the phase prompt is fully implemented (not a stub UI).
- `tsc --noEmit` is clean.
- All new and existing tests pass.
- Quality self-review has zero remaining defects you know about.
- You output the **End-of-phase report** (template below).
- You do **not** implement the next phase.

## End-of-phase report (required)

```
## Phase N report
- Files created/changed:
- Commands run + results (tsc, test, lint):
- Automated tests added (IDs):
- Checklist mapping (each box → pass / fail / blocked):
- Known bugs: none | list
- Manual tests still required:
- Ready for sign-off: YES / NO
```
