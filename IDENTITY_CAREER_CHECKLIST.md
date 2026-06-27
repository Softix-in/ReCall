# Identity & Career — Final Implementation Checklist

> Generated after full audit of Steps 1–5.  
> Run all backend tests: `cd backend && npm run test:identity-career`  
> Live tests require: `FIREWORKS_API_KEY=fw_...`

---

## Refactoring applied (this session)

| Change | Path |
|--------|------|
| Shared LLM route error helpers | `backend/src/utils/llm-route-helpers.js` |
| Shared project embed enqueuer | `backend/src/utils/project-embed.js` |
| Deep analysis model wiring (`glm-5p2`) | `llm-client.js`, `jd-analyzer.js`, `chat-handler.js`, `career.js` |
| Removed dead `NOT_IMPLEMENTED_STEP` export | `routes/profile.js` |
| Removed unused `hasTailoredBullets`, `parseJsonObject` import | `jd-analyzer.js`, `db/profile.js` |
| Removed duplicate settings connection form + fixed duplicate `id` | `settings/settings.html`, `settings.js` |
| Removed orphan `stream-target.js` | `profile/components/` |
| Combined test script | `npm run test:identity-career` |

---

## Step 1 — Backend Foundation

| Item | Status |
|------|--------|
| Migration `004_identity_career_tables.sql` | ✅ Complete |
| `user_profile`, `projects`, `jd_analyses`, `resume_template` tables | ✅ Complete |
| `GET/PUT /profile` | ✅ Complete |
| `PUT /profile/ai-settings` (encrypted key) | ✅ Complete |
| `POST /profile/ai-settings/test` | ✅ Complete |
| Projects CRUD + reorder | ✅ Complete |
| Master resume upsert/fetch/history | ✅ Complete |
| Project embedding queue + worker | ✅ Complete |
| API key auth on all routes | ✅ Complete |
| Automated tests | ✅ `test:identity-career-step1` |

---

## Step 2 — Extension Profile UI

| Item | Status |
|------|--------|
| Profile page (`profile/profile.html`) | ✅ Complete |
| Popup entry "Profile ↗" | ✅ Complete |
| Identity tab (fields, skills, auto-save, copy bio) | ✅ Complete |
| Projects tab (CRUD, reorder, bullets, tech tags) | ✅ Complete |
| Resume tab (structured editor, plain text, save) | ✅ Complete |
| Shared components (tag-input, bullet-editor, copy-button, project-card) | ✅ Complete |
| Connection error banner | ✅ Complete |
| Drag-and-drop project reorder | ⚠️ Partial (up/down buttons only) |
| Project date range fields | ❌ Not implemented |
| URL format validation on identity fields | ❌ Not implemented |
| Automated tests | ❌ No step2 script (manual UI) |

---

## Step 3 — JD Analysis Engine

| Item | Status |
|------|--------|
| `POST /career/analyze-jd` (JSON + SSE) | ✅ Complete |
| `GET /career/analyses`, `GET /career/analyses/:id` | ✅ Complete |
| Fireworks structured extraction | ✅ Complete |
| Keyword-only fallback (no key / service down) | ✅ Complete |
| Invalid API key → 401 | ✅ Complete |
| Project scoring (embed + keyword overlap) | ✅ Complete |
| Streaming bullet rewrites | ✅ Complete |
| JD hash caching | ✅ Complete |
| Deep analysis (`glm-5p2` via settings / `deep_mode`) | ✅ Complete |
| Career tab UI (analyze, progress, rankings, diff) | ✅ Complete |
| Automated tests | ✅ `test:identity-career-step3` |

---

## Step 4 — Resume Tailoring & Form Fill

| Item | Status |
|------|--------|
| `POST /career/build-resume` (json/text/pdf) | ✅ Complete |
| `POST /career/generate/bio` | ✅ Complete |
| `POST /career/generate/pitch` | ✅ Complete |
| `POST /career/generate/cover-letter` (SSE) | ✅ Complete |
| Tailored resume history + diff view | ✅ Complete |
| PDF export (Puppeteer) | ✅ Complete (needs Chrome/Puppeteer) |
| Generate bio button (Identity tab) | ✅ Complete |
| Generate pitch UI | ⚠️ Chat tool only |
| Generate cover letter UI | ⚠️ Chat tool only |
| Master resume PDF download | ❌ Not implemented |
| User-selectable projects for tailoring | ⚠️ Hardcoded top 5 |
| Automated tests | ✅ `test:identity-career-step4` |

---

## Step 5 — Chat, Settings & Hardening

| Item | Status |
|------|--------|
| `POST /career/chat` with 7 tools | ✅ Complete |
| Chat drawer UI + action chips | ✅ Complete |
| Session history (`chrome.storage.local`) | ✅ Complete |
| Settings: Fireworks key, test, deep analysis toggle | ✅ Complete |
| Rate limits (10/60/20 per hour) | ✅ Complete |
| Error states (missing/invalid key, rate limit, fallback) | ✅ Complete |
| `CAREER.md` + README link | ✅ Complete |
| Chat connected to Recall saves library | ❌ Out of scope (per PRD) |
| Mobile read-only profile | ❌ Out of scope |
| Automated tests | ✅ `test:identity-career-step5` |

---

## Backend API — Complete Route List (22 endpoints)

### Profile (`routes/profile.js`)

- `GET /profile`
- `PUT /profile`
- `PUT /profile/ai-settings`
- `POST /profile/ai-settings/test`
- `GET /profile/projects`
- `POST /profile/projects`
- `PUT /profile/projects/reorder`
- `PUT /profile/projects/:id`
- `DELETE /profile/projects/:id`
- `GET /profile/resume`
- `POST /profile/resume`
- `GET /profile/resume/history`
- `GET /profile/resume/:id`

### Career (`routes/career.js`)

- `POST /career/analyze-jd`
- `GET /career/analyses`
- `GET /career/analyses/:id`
- `POST /career/build-resume`
- `POST /career/generate/bio`
- `POST /career/generate/pitch`
- `POST /career/generate/cover-letter`
- `POST /career/chat`

---

## Chat Tools (`chat-handler.js`)

| Tool | Status |
|------|--------|
| `update_profile_field` | ✅ Complete |
| `update_skills` | ✅ Complete |
| `add_project` | ✅ Complete |
| `update_project` | ✅ Complete |
| `delete_project` | ✅ Complete |
| `analyze_jd` | ✅ Complete |
| `generate_text` (bio, pitch, cover_letter) | ✅ Complete |

---

## Extension API Client (`shared/api.js`)

| Function | Backend route | UI wired |
|----------|---------------|----------|
| `fetchProfile` | GET /profile | ✅ |
| `updateProfile` | PUT /profile | ✅ |
| `createProject` / `updateProject` / `deleteProject` | projects CRUD | ✅ |
| `reorderProjects` | PUT reorder | ✅ |
| `saveMasterResume` | POST /profile/resume | ✅ |
| `fetchResumeHistory` | GET history | ✅ |
| `updateProfileAiSettings` | PUT ai-settings | ✅ |
| `testAiSettings` | POST test | ✅ |
| `analyzeJd` | POST analyze-jd | ✅ |
| `listJdAnalyses` / `getJdAnalysis` | analyses | ✅ |
| `buildResume` | POST build-resume | ✅ |
| `generateBio` | POST bio | ✅ |
| `generatePitch` | POST pitch | Chat only |
| `generateCoverLetter` | POST cover-letter | Chat only |
| `careerChat` | POST chat | ✅ |
| `fetchProjects` / `fetchMasterResume` / `fetchResumeById` | — | Unused (bundled in fetchProfile) |

---

## Known gaps (not blocking core workflow)

1. Pitch/cover-letter dedicated UI panels (API + chat work)
2. Master resume PDF export
3. Project date fields and drag-sort
4. Per-project checkbox selection before resume build
5. Embed retry on transient failure
6. Rate limits on bio/pitch/cover-letter routes
7. `profile/profile.html` not declared in manifest (works via `chrome.runtime.getURL`)

---

## Verification commands

```bash
cd backend
npm run migrate
npm run test:identity-career

# With Fireworks key for live LLM tests:
FIREWORKS_API_KEY=fw_... npm run test:identity-career
```
