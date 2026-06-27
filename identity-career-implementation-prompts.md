# Identity & Career Module — Step-by-Step Implementation Prompts

> Structured agent prompts for implementing the Identity & Career feature in Recall.  
> **Source of truth:** `recall-prd-implementation-plan.md` §16–§23  
> **Execute steps in order.** Do not start Step N+1 until Step N acceptance criteria pass.

---

## How to use these prompts

1. Open a new agent session (or continue in the same repo).
2. Copy the **Agent prompt** block for the step you are implementing.
3. Paste it as your message. The agent should read the PRD sections referenced in the prompt.
4. When done, verify every item in **Acceptance criteria** and **Testing checklist**.
5. Move to the next step only after the current step is complete.

---

## 5-step overview

| Step | Name | Depends on | Primary deliverable |
|---|---|---|---|
| **1** | Backend Foundation | Core Recall backend running | SQLite tables + `/profile` CRUD APIs + project embedding |
| **2** | Extension Profile UI | Step 1 | `profile.html` with Identity, Projects, Resume tabs |
| **3** | JD Analysis Engine | Steps 1–2 | Fireworks LLM + Career tab + streaming bullet rewrites |
| **4** | Resume Tailoring & Form Fill | Step 3 | Tailored resume builder + PDF + bio/pitch/cover letter |
| **5** | Chat, Settings & Hardening | Steps 1–4 | Chat drawer + AI settings + rate limits + docs |

---

# Step 1 — Backend Foundation

## Metadata

| Field | Value |
|---|---|
| **Step** | 1 of 5 |
| **Name** | Backend Foundation |
| **Prerequisites** | Recall backend runs (`backend/src/server.js`), migrations work (`backend/src/migrate.js`), extension can call API via `recall-extension/shared/api.js` |
| **PRD reference** | §17 (Data Schema), §18 (API Routes — Profile/Projects/Resume only), §22 Step 1 |
| **Estimated effort** | ~1 week |

## Objective

Create the database layer and all non-AI REST APIs for the Identity & Career module. No Fireworks calls, no extension UI in this step.

## In scope

- SQLite migration `backend/migrations/004_identity_career_tables.sql`
- DB access: `backend/src/db/profile.js`, `backend/src/db/career.js`
- Routes: `backend/src/routes/profile.js` (full CRUD), `backend/src/routes/career.js` (stub routes returning `501 Not implemented` for AI endpoints)
- Wire routers in `backend/src/server.js`
- Async project embedding via existing `JobQueue` + `embedClient.embedText()`
- Request validation (use existing project patterns — add `zod` only if already used elsewhere)

## Out of scope

- Fireworks / LLM integration
- Chrome extension UI
- JD analysis, resume tailoring, chat, PDF generation
- PostgreSQL / pgvector migration (adapt PRD schema to **SQLite** for now)

## Technical constraints

- **Backend style:** CommonJS (`require` / `module.exports`) — match `backend/src/routes/items.js`
- **Database:** SQLite via `better-sqlite3` — match `backend/migrations/001_init.sql` conventions
- **Auth:** Existing API key middleware in `backend/src/middleware/security.js` — all new routes inherit it
- **IDs:** Use `TEXT` UUIDs (e.g. `crypto.randomUUID()`) like existing `items` table
- **Timestamps:** `INTEGER` Unix ms like `items.created_at`
- **Arrays / JSON:** Store as `TEXT` JSON strings (`JSON.stringify` / `JSON.parse`)
- **Embeddings:** Store as `TEXT` JSON array in `projects.embedding`; score with cosine similarity in JS (no pgvector yet)
- **Single-user:** No `user_id` column required until multi-user auth lands — scope all data to the single Recall instance

## Schema (SQLite adaptation of PRD §17)

Create these tables in `004_identity_career_tables.sql`:

1. **`user_profile`** — one row per Recall instance (use fixed id or upsert on first GET)
2. **`projects`** — includes `embedding TEXT` (JSON array of floats)
3. **`jd_analyses`** — create now for Step 3; no writes in Step 1
4. **`resume_template`** — `experience`, `education`, `certifications` as TEXT JSON

## API routes to implement (Step 1)

```
GET    /profile                    → { user_profile, projects[], master_resume }
PUT    /profile                    → update profile fields
PUT    /profile/ai-settings          → stub: save fireworks key + model prefs (encrypt key at rest)

GET    /profile/projects
POST   /profile/projects           → enqueue embedding job after insert
PUT    /profile/projects/:id       → re-embed if description/bullets changed
DELETE /profile/projects/:id
PUT    /profile/projects/reorder   → body: { ordered_ids: string[] }

GET    /profile/resume             → master resume (is_master = 1)
POST   /profile/resume             → upsert master resume
GET    /profile/resume/history
GET    /profile/resume/:id

POST   /career/analyze-jd          → 501 { error: 'Not implemented — Step 3' }
POST   /career/build-resume        → 501
POST   /career/generate/bio        → 501
POST   /career/generate/pitch      → 501
POST   /career/generate/cover-letter → 501
POST   /career/chat                → 501
GET    /career/analyses            → 501
GET    /career/analyses/:id        → 501
```

## Files to create / modify

| Action | Path |
|---|---|
| Create | `backend/migrations/004_identity_career_tables.sql` |
| Create | `backend/src/db/profile.js` |
| Create | `backend/src/db/career.js` |
| Create | `backend/src/routes/profile.js` |
| Create | `backend/src/routes/career.js` (stubs) |
| Create | `backend/src/workers/project-embed-worker.js` (or extend existing queue worker) |
| Modify | `backend/src/server.js` — mount `/profile` and `/career` routers |
| Modify | `.env.example` — add `FIREWORKS_API_KEY=` (optional, used in Step 3) |

## Acceptance criteria

- [ ] Migration `004_identity_career_tables.sql` applies cleanly on fresh and existing DBs
- [ ] `GET /profile` returns empty defaults when no data exists yet
- [ ] `PUT /profile` creates or updates the profile row
- [ ] Full projects CRUD works including reorder
- [ ] Creating/updating a project enqueues embedding; `projects.embedding` is populated within ~5s
- [ ] Master resume upsert and fetch work
- [ ] All `/career/*` routes return `501` with a clear message
- [ ] All routes require API key (401 without auth)
- [ ] No regressions to existing `/items`, `/search`, `/capture` routes

## Testing checklist

```bash
# After migration + server start
curl -H "Authorization: Bearer $RECALL_API_KEY" http://127.0.0.1:7878/profile
curl -X PUT -H "Authorization: Bearer $RECALL_API_KEY" -H "Content-Type: application/json" \
  -d '{"display_name":"Test User","skills":["React","Node.js"]}' http://127.0.0.1:7878/profile
curl -X POST -H "Authorization: Bearer $RECALL_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"Recall","tagline":"Knowledge engine","impact_bullets":["Built Chrome extension"]}' \
  http://127.0.0.1:7878/profile/projects
```

---

## Agent prompt — Step 1

```
Implement Step 1 (Backend Foundation) of the Identity & Career module for the Recall project.

READ FIRST:
- recall-prd-implementation-plan.md §17, §18, §22 Step 1
- identity-career-implementation-prompts.md Step 1
- Existing patterns: backend/src/routes/items.js, backend/src/db/items.js, backend/src/migrate.js, backend/src/services/embed-client.js, backend/src/queue/job-queue.js

GOAL:
Add SQLite tables and full REST APIs for profile, projects, and master resume. Stub all /career AI routes with 501. No extension UI. No Fireworks calls.

REQUIREMENTS:
1. Create backend/migrations/004_identity_career_tables.sql adapting PRD §17 schema to SQLite (TEXT JSON for arrays/objects, INTEGER timestamps, embedding as JSON TEXT).
2. Create backend/src/db/profile.js and backend/src/db/career.js with prepared statements via better-sqlite3.
3. Create backend/src/routes/profile.js implementing all /profile routes listed in identity-career-implementation-prompts.md Step 1.
4. Create backend/src/routes/career.js with stub handlers returning 501 for all AI endpoints.
5. On project create/update when description or impact_bullets change, enqueue a background job that calls embedClient.embedText() and saves the result to projects.embedding.
6. Wire both routers in backend/src/server.js.
7. Use CommonJS throughout. Match error response style of existing routes.
8. Update .env.example with FIREWORKS_API_KEY (comment: used in Step 3).

DO NOT:
- Build extension UI
- Call Fireworks or any LLM
- Migrate to PostgreSQL
- Break existing capture/search/items functionality

WHEN DONE:
- List all files created/modified
- Confirm acceptance criteria from identity-career-implementation-prompts.md Step 1
- Provide curl examples that prove CRUD works
```

---

# Step 2 — Extension Profile UI

## Metadata

| Field | Value |
|---|---|
| **Step** | 2 of 5 |
| **Name** | Extension Profile UI |
| **Prerequisites** | Step 1 complete — all `/profile` routes working |
| **PRD reference** | §20 (Extension UI — Identity, Projects, Resume tabs), §22 Step 2 |
| **Estimated effort** | ~2 weeks |

## Objective

Build the Chrome extension Profile page with three fully functional non-AI tabs: **Identity**, **Projects**, and **Resume**.

## In scope

- Full-page `recall-extension/profile/profile.html`
- Sub-navigation: Identity | Projects | Resume | Career (Career tab shows "Complete Step 3" placeholder)
- Shared components: `tag-input`, `bullet-editor`, `copy-button`, `project-card`
- Popup entry point in `popup/popup.html`
- API integration via `recall-extension/shared/api.js` (add profile API helpers)
- Styling consistent with existing `search/search.css` and `popup/popup.css`

## Out of scope

- Career tab AI functionality (Step 3)
- Chat drawer (Step 5)
- PDF download (Step 4 — show disabled button with tooltip "Available after Step 4")
- Fireworks settings (Step 5)

## Technical constraints

- **Extension style:** ES modules (`import`/`export`) — match `recall-extension/shared/api.js`
- **No framework:** Vanilla JS + HTML + CSS (match existing extension)
- **Auth:** Use existing `getExtensionConfig()` + Bearer API key headers
- **Save UX:** Debounced save on blur (300ms) for Identity fields
- **Open page:** `chrome.tabs.create({ url: chrome.runtime.getURL('profile/profile.html') })`

## UI requirements (from PRD §20)

### Identity tab
- Fields: display_name, headline, github_url, linkedin_url, twitter_url, website_url, bio_short, skills (tag input)
- "Copy bio" button → clipboard
- Inline save on blur with subtle "Saved" indicator

### Projects tab
- List project cards sorted by `sort_order`
- Add / Edit / Delete with confirmation on delete
- Inline form with bullet editor and tech stack tags
- Drag-to-reorder (or up/down buttons if drag is too complex for v1)

### Resume tab
- Structured editor: work experience (with bullets), education, certifications
- Toggle: Structured view ↔ Plain text preview
- "Copy all" for plain text
- Master resume saves via `POST /profile/resume`

## Files to create / modify

| Action | Path |
|---|---|
| Create | `recall-extension/profile/profile.html` |
| Create | `recall-extension/profile/profile.js` |
| Create | `recall-extension/profile/profile.css` |
| Create | `recall-extension/profile/sections/identity.js` |
| Create | `recall-extension/profile/sections/projects.js` |
| Create | `recall-extension/profile/sections/resume.js` |
| Create | `recall-extension/profile/sections/career.js` (placeholder only) |
| Create | `recall-extension/profile/components/tag-input.js` |
| Create | `recall-extension/profile/components/bullet-editor.js` |
| Create | `recall-extension/profile/components/copy-button.js` |
| Create | `recall-extension/profile/components/project-card.js` |
| Modify | `recall-extension/shared/api.js` — add `fetchProfile`, `updateProfile`, project CRUD, resume CRUD |
| Modify | `recall-extension/popup/popup.html` + `popup.js` — "Profile" button |
| Modify | `recall-extension/manifest.json` — if needed for extension page access |

## Acceptance criteria

- [ ] Profile page opens from extension popup
- [ ] Identity tab loads and saves all fields to backend
- [ ] Skills tag input add/remove works
- [ ] "Copy bio" copies text to clipboard
- [ ] Projects tab: full CRUD + reorder persists after reload
- [ ] Resume tab: save master resume, plain text preview renders correctly
- [ ] Career tab shows placeholder: "JD analysis available in Step 3"
- [ ] All API errors show user-friendly inline messages
- [ ] Page works when backend is unreachable (shows connection error banner)

## Testing checklist

- [ ] Fill identity, add 3 projects, save resume — reload page, data persists
- [ ] Reorder projects — order persists
- [ ] Edit and delete a project
- [ ] Plain text resume preview is readable and copyable

---

## Agent prompt — Step 2

```
Implement Step 2 (Extension Profile UI) of the Identity & Career module for Recall.

READ FIRST:
- recall-prd-implementation-plan.md §20 (Identity, Projects, Resume tabs)
- identity-career-implementation-prompts.md Step 2
- recall-extension/search/search.html (full-page pattern)
- recall-extension/shared/api.js (API client pattern)
- recall-extension/popup/popup.html (entry point)

PREREQUISITE: Step 1 backend APIs must exist (/profile, /profile/projects, /profile/resume).

GOAL:
Build recall-extension/profile/ as a full extension page with three working tabs: Identity, Projects, Resume. Career tab is a placeholder. No AI features.

REQUIREMENTS:
1. Create profile.html with sub-nav: Identity | Projects | Resume | Career.
2. Identity tab: all profile fields, debounced save on blur, skills tag input, copy bio button.
3. Projects tab: list/add/edit/delete/reorder projects using /profile/projects APIs.
4. Resume tab: structured editor for experience/education/certifications, plain text preview, copy all.
5. Add shared components: tag-input.js, bullet-editor.js, copy-button.js, project-card.js.
6. Extend shared/api.js with profile API helper functions.
7. Add "Profile" button to popup that opens profile.html in a new tab.
8. Match existing extension visual style (dark/light as per search page).
9. Career tab: static placeholder explaining Step 3 is needed for JD analysis.
10. PDF download button: disabled with tooltip "Available after Step 4".

DO NOT:
- Implement Fireworks / JD analysis / chat
- Implement PDF generation
- Add React or any UI framework

WHEN DONE:
- List all files created/modified
- Confirm acceptance criteria from identity-career-implementation-prompts.md Step 2
- Describe manual test steps performed
```

---

# Step 3 — JD Analysis Engine

## Metadata

| Field | Value |
|---|---|
| **Step** | 3 of 5 |
| **Name** | JD Analysis Engine |
| **Prerequisites** | Steps 1–2 complete; `FIREWORKS_API_KEY` in env or user settings |
| **PRD reference** | §19 (Fireworks AI), §18 (JD routes), §20 (Career tab), §22 Step 3 |
| **Estimated effort** | ~1 week |

## Objective

Implement Fireworks AI integration, the full JD analysis pipeline, and the Career tab UI with streaming ATS bullet rewrites.

## In scope

- `backend/src/services/llm-client.js` — Fireworks via OpenAI SDK (`baseURL: https://api.fireworks.ai/inference/v1`)
- `backend/src/services/jd-analyzer.js` — full pipeline from PRD §19
- Implement `POST /career/analyze-jd`, `GET /career/analyses`, `GET /career/analyses/:id`
- Career tab UI with JD paste, analysis results, project ranking, streaming bullets
- Components: `stream-target.js`, `diff-viewer.js`

## Out of scope

- Full resume PDF build (Step 4)
- Chat (Step 5)
- `glm-5p2` deep reasoning mode (optional — implement if time permits, otherwise skip with TODO)

## Fireworks model assignments (from PRD §19)

| Task | Model |
|---|---|
| JD extraction (JSON schema) | `accounts/fireworks/models/deepseek-v3p1` |
| Bullet rewriting (streaming) | `accounts/fireworks/models/deepseek-v3p1` |
| Chat tool calling | `accounts/fireworks/models/kimi-k2-instruct-0905` (Step 5) |

## LLM client functions to implement

```javascript
// backend/src/services/llm-client.js (CommonJS)
getClient(userApiKey)           // per-user key from user_profile or env FIREWORKS_API_KEY
completeStructured({...})       // response_format: json_schema
completeStreaming({ messages, res, userApiKey })  // SSE proxy to extension
completeWithTools({...})        // stub for Step 5
```

## JD analysis pipeline

```
1. sha256(jd_text) → check jd_analyses cache
2. completeStructured → extract role_title, company, skills, keywords, ats_keywords
3. embedClient.embedText(jd_text) → JD vector
4. Cosine similarity vs each projects.embedding → project_scores, suggested order
5. For top projects: completeStreaming bullet rewrites (SSE)
6. Save to jd_analyses, return result
```

## JSON schema for JD extraction (PRD §19)

```javascript
{
  role_title, company_name, seniority_level,
  required_skills[], preferred_skills[], keywords[], ats_keywords[]
}
```

## API: analyze-jd

```
POST /career/analyze-jd
Body: { jd_text: string, deep_mode?: boolean, stream_bullets?: boolean }
Response: full jd_analysis object
         OR SSE stream for bullet rewrites (if stream_bullets=true)
```

## Career tab UI requirements

- Large JD textarea + "Analyse JD" button
- Progress states: Extracting → Scoring → Rewriting
- Keyword chips (required, preferred, ATS)
- Project ranking list with match % bars
- Per project: original vs tailored bullets (diff-viewer), Copy button
- Analysis history list (past JD analyses)
- Error: no API key → link to settings (settings UI fully built in Step 5; for now show inline key input or env hint)

## Files to create / modify

| Action | Path |
|---|---|
| Create | `backend/src/services/llm-client.js` |
| Create | `backend/src/services/jd-analyzer.js` |
| Modify | `backend/src/routes/career.js` — implement analyze + list routes |
| Modify | `backend/src/db/career.js` — jd_analyses CRUD |
| Modify | `backend/package.json` — add `openai` dependency if missing |
| Create | `recall-extension/profile/components/stream-target.js` |
| Create | `recall-extension/profile/components/diff-viewer.js` |
| Modify | `recall-extension/profile/sections/career.js` — full implementation |
| Modify | `recall-extension/shared/api.js` — analyzeJd, listAnalyses |

## Acceptance criteria

- [ ] `llm-client.js` calls Fireworks successfully with env `FIREWORKS_API_KEY`
- [ ] JD extraction returns valid structured JSON
- [ ] Project scoring ranks projects sensibly for a real SWE JD
- [ ] Same JD twice returns cached result (no duplicate LLM call)
- [ ] Bullet rewrites stream token-by-token in Career tab
- [ ] Diff viewer shows original vs ATS bullet side-by-side
- [ ] Invalid API key returns `{ error: 'invalid_api_key' }` with 401
- [ ] Career tab handles empty projects gracefully

## Testing checklist

- [ ] Paste a real backend engineer JD — keywords extracted correctly
- [ ] Top-ranked project matches expectations
- [ ] Streamed bullets contain JD keywords
- [ ] Reload analysis history — past analyses listed

---

## Agent prompt — Step 3

```
Implement Step 3 (JD Analysis Engine) of the Identity & Career module for Recall.

READ FIRST:
- recall-prd-implementation-plan.md §19 (Fireworks AI — full section)
- identity-career-implementation-prompts.md Step 3
- Fireworks docs: use OpenAI SDK with baseURL https://api.fireworks.ai/inference/v1
- backend/src/services/embed-client.js (for JD + project embedding)

PREREQUISITES: Steps 1–2 complete. Projects must have embeddings populated.

GOAL:
Integrate Fireworks AI and build the JD analysis pipeline + Career tab UI with streaming bullet rewrites.

REQUIREMENTS — BACKEND:
1. Add openai npm package. Create backend/src/services/llm-client.js (CommonJS):
   - getClient(userApiKey) — falls back to process.env.FIREWORKS_API_KEY
   - completeStructured() using deepseek-v3p1 + response_format json_schema
   - completeStreaming() piping Fireworks stream as SSE to Express res
2. Create backend/src/services/jd-analyzer.js implementing the pipeline in identity-career-implementation-prompts.md Step 3.
3. Implement POST /career/analyze-jd, GET /career/analyses, GET /career/analyses/:id in routes/career.js.
4. Cache analyses by sha256(jd_text) in jd_analyses table.
5. Score projects using cosine similarity between JD embedding and projects.embedding (JS implementation).
6. Return 401 { error: 'invalid_api_key' } on Fireworks auth failure.

REQUIREMENTS — EXTENSION:
7. Implement career.js tab: JD textarea, analyse button, progress states, keyword chips, project ranking bars.
8. Create stream-target.js (renders SSE tokens) and diff-viewer.js (original vs tailored).
9. Add analyzeJd() and listAnalyses() to shared/api.js.
10. Show analysis history and allow re-opening past results.

OPTIONAL: deep_mode with glm-5p2 reasoning — skip if complex, leave TODO.

DO NOT:
- Implement resume PDF builder (Step 4)
- Implement chat (Step 5)

WHEN DONE:
- List files created/modified
- Confirm acceptance criteria
- Note FIREWORKS_API_KEY setup instructions
```

---

# Step 4 — Resume Tailoring & Form Fill

## Metadata

| Field | Value |
|---|---|
| **Step** | 4 of 5 |
| **Name** | Resume Tailoring & Form Fill |
| **Prerequisites** | Step 3 complete — JD analyses with tailored_bullets exist |
| **PRD reference** | §18 (build-resume, generate/*), §19 (tailoredResumeSchema), §20 (Resume tab additions), §22 Step 4 |
| **Estimated effort** | ~1 week |

## Objective

Build the tailored resume assembler, PDF/plain-text export, and form-fill text generation (bio, pitch, cover letter).

## In scope

- `backend/src/services/resume-builder.js`
- `POST /career/build-resume` — formats: `json`, `text`, `pdf`
- `POST /career/generate/bio`, `/pitch`, `/cover-letter` (cover letter streams SSE)
- Resume tab: tailored versions history, diff view master vs tailored, PDF download enabled
- Career tab: "Apply to resume", "Copy plain text", "Download PDF" buttons wired up

## Out of scope

- Chat interface (Step 5)
- Settings page AI key UI (Step 5 — use env var for now)
- Mobile app read-only profile

## Resume builder logic

```
Input: jd_analysis_id, selected_project_ids[], format

1. Load master resume + jd_analysis + selected projects (with tailored_bullets)
2. completeStructured(tailoredResumeSchema) → ATS summary + skills_section rewrite
3. Merge experience from master + project section ordered by JD score
4. Store new resume_template row (is_master = 0, jd_analysis_id set)
5. Render:
   - json: structured object
   - text: ATS-safe plain text (no special chars, monospaced sections)
   - pdf: HTML template → Puppeteer → buffer
```

## Tailored resume JSON schema (PRD §19)

```javascript
{ summary, experience[{ company, role, start, end, bullets[] }], skills_section[] }
```

## PDF generation

- Use `puppeteer` (add to backend dependencies)
- Clean single-column HTML resume template
- Return `Content-Type: application/pdf` with `Content-Disposition: attachment`
- If Puppeteer is too heavy for Docker, document fallback: return HTML + client-side print

## Form fill endpoints

| Route | Model | Output |
|---|---|---|
| `POST /career/generate/bio` | deepseek-v3p1 | `{ bio: string }` |
| `POST /career/generate/pitch` | deepseek-v3p1 | `{ pitch: string }` |
| `POST /career/generate/cover-letter` | deepseek-v3p1 | SSE stream |

Prompts must inject: user profile, relevant projects, JD analysis if `jd_analysis_id` provided.

## Extension updates

### Resume tab
- "Tailored versions" section from `GET /profile/resume/history`
- View / Download PDF per version
- Diff view: highlight changed bullets in green

### Career tab
- "Apply to resume" saves tailored version
- "Copy plain text" and "Download PDF" after analysis

### Identity tab
- Add "Generate bio" button (calls `/career/generate/bio`, populates bio field)

## Files to create / modify

| Action | Path |
|---|---|
| Create | `backend/src/services/resume-builder.js` |
| Create | `backend/src/templates/resume.html` (PDF HTML template) |
| Modify | `backend/src/routes/career.js` — build-resume + generate routes |
| Modify | `backend/package.json` — add `puppeteer` |
| Modify | `recall-extension/profile/sections/resume.js` — tailored history + diff |
| Modify | `recall-extension/profile/sections/career.js` — apply/download buttons |
| Modify | `recall-extension/profile/sections/identity.js` — generate bio button |

## Acceptance criteria

- [ ] `POST /career/build-resume` with `format: json` returns valid tailored resume
- [ ] `format: text` returns ATS-safe plain text (no bullets as special Unicode chars)
- [ ] `format: pdf` returns downloadable PDF
- [ ] Tailored resume stored in `resume_template` with `jd_analysis_id` link
- [ ] Resume history shows tailored versions with role/company label from JD
- [ ] Diff view highlights changed content vs master
- [ ] Bio/pitch generation returns sensible output
- [ ] Cover letter streams via SSE

## Testing checklist

- [ ] Run full flow: analyse JD → apply to resume → download PDF
- [ ] Open PDF — formatting clean, readable
- [ ] Plain text paste into a text field — no garbled characters
- [ ] Generate bio from Identity tab

---

## Agent prompt — Step 4

```
Implement Step 4 (Resume Tailoring & Form Fill) of the Identity & Career module for Recall.

READ FIRST:
- recall-prd-implementation-plan.md §18 (build-resume, generate routes), §19 (tailoredResumeSchema)
- identity-career-implementation-prompts.md Step 4
- backend/src/services/llm-client.js (from Step 3)
- backend/src/services/jd-analyzer.js (from Step 3)

PREREQUISITE: Step 3 complete. JD analyses with tailored_bullets must exist.

GOAL:
Build tailored resume assembly, PDF/plain-text export, and bio/pitch/cover-letter generation.

REQUIREMENTS — BACKEND:
1. Create backend/src/services/resume-builder.js:
   - Assemble resume from master + jd_analysis + selected projects
   - Call completeStructured() with tailoredResumeSchema for summary/skills rewrite
   - Save to resume_template (is_master = 0)
   - Render plain text (ATS-safe) and HTML
2. Implement POST /career/build-resume with format: json | text | pdf
3. PDF via puppeteer rendering backend/src/templates/resume.html
4. Implement POST /career/generate/bio, /pitch (JSON response)
5. Implement POST /career/generate/cover-letter (SSE stream via completeStreaming)

REQUIREMENTS — EXTENSION:
6. Resume tab: tailored versions list, view, download PDF, diff vs master
7. Career tab: wire "Apply to resume", "Copy plain text", "Download PDF"
8. Identity tab: "Generate bio" button

DO NOT:
- Implement chat drawer (Step 5)
- Build settings page AI section (Step 5)

WHEN DONE:
- List files created/modified
- Confirm acceptance criteria
- Note puppeteer/Docker considerations if any
```

---

# Step 5 — Chat, Settings & Hardening

## Metadata

| Field | Value |
|---|---|
| **Step** | 5 of 5 |
| **Name** | Chat, Settings & Hardening |
| **Prerequisites** | Steps 1–4 complete |
| **PRD reference** | §21 (Chat System), §19 (completeWithTools), §20 (Chat drawer), §22 Step 5, §23 (Performance) |
| **Estimated effort** | ~2 weeks |

## Objective

Add the AI chat drawer for conversational profile editing, Fireworks settings in the extension settings page, rate limiting, error handling, and documentation. Feature is production-ready after this step.

## In scope

- `backend/src/services/chat-handler.js` — tool-calling loop with `kimi-k2-instruct-0905`
- `POST /career/chat` — full implementation
- Chat drawer UI (`profile/sections/chat.js`)
- Settings: Fireworks API key (encrypted at rest), model overrides, deep analysis toggle, test key button
- Rate limits on `/career/*` routes
- Graceful error states across Career tab and chat
- `CAREER.md` documentation

## Out of scope

- Mobile app read-only profile (future)
- Connecting chat to Recall saves library (non-goal per PRD §16)

## Chat tools (PRD §21)

Implement all 7 tools:

1. `update_profile_field`
2. `update_skills`
3. `add_project`
4. `update_project`
5. `delete_project`
6. `analyze_jd`
7. `generate_text`

## Chat lifecycle

```
1. Receive messages[]
2. Build system prompt from live profile + projects (buildSystemPrompt from PRD §21)
3. Call completeWithTools (kimi-k2-instruct-0905)
4. If tool_calls: execute → append tool results → re-call LLM
5. Return { reply, actions_taken[] }
```

## Chat drawer UI

- Collapsed by default (one-line input at bottom of profile page)
- Expands to ~45% height
- Session history in `chrome.storage.local` (key: `careerChatHistory`)
- Suggested prompt chips on first open
- Action chips for `actions_taken` — click navigates to affected tab
- After tool mutation: refresh only affected section (no full reload)

## Settings page (`recall-extension/settings/`)

```
Fireworks API Key:     [masked input]
Quality model:         accounts/fireworks/models/deepseek-v3p1 (readonly default)
Chat model:            accounts/fireworks/models/kimi-k2-instruct-0905 (readonly default)
[ ] Deep analysis (glm-5p2)
[Test API key]  → POST /profile/ai-settings/test or inline Fireworks ping
```

Store key via `PUT /profile/ai-settings` — backend encrypts before saving to `user_profile.fireworks_api_key_enc`.

## Rate limits

| Route | Limit |
|---|---|
| `POST /career/analyze-jd` | 10 / hour |
| `POST /career/chat` | 60 / hour |
| `POST /career/build-resume` | 20 / hour |

Use per-IP or global limiter if single-user; structure for per-user when auth lands.

## Error states

| Condition | UI behaviour |
|---|---|
| No API key | Career tab + chat show setup CTA with link to settings |
| Invalid API key | Inline error + "Update in Settings" link |
| Rate limit | "Too many requests — try again in X min" |
| Fireworks down | JD analysis: keyword-only fallback (regex), no bullet rewrites; show warning banner |

## Documentation

Create `CAREER.md` covering:
- Feature overview
- How to get a Fireworks API key
- Model usage and approximate cost per operation
- API route summary
- Troubleshooting (invalid key, rate limits, embed service down)

## Files to create / modify

| Action | Path |
|---|---|
| Create | `backend/src/services/chat-handler.js` |
| Create | `CAREER.md` |
| Modify | `backend/src/services/llm-client.js` — completeWithTools |
| Modify | `backend/src/routes/career.js` — chat route |
| Modify | `backend/src/routes/profile.js` — ai-settings + test endpoint |
| Modify | `recall-extension/profile/sections/chat.js` |
| Modify | `recall-extension/profile/profile.html` — chat drawer mount point |
| Modify | `recall-extension/profile/profile.js` — init chat, cross-tab refresh |
| Modify | `recall-extension/settings/settings.html` + `settings.js` |
| Modify | `backend/src/server.js` — rate limit middleware for /career |

## Acceptance criteria

- [ ] Chat updates LinkedIn URL via natural language — DB + UI reflect change
- [ ] Chat adds a project — appears in Projects tab without page reload
- [ ] Chat triggers JD analysis via `analyze_jd` tool
- [ ] `actions_taken` chips render and navigate correctly
- [ ] Fireworks API key save/load works (encrypted at rest)
- [ ] "Test API key" shows success/failure
- [ ] Rate limits return 429 with clear message
- [ ] Career tab shows setup prompt when no key configured
- [ ] `CAREER.md` is complete and accurate
- [ ] Full end-to-end flow works: settings → analyse JD → tailor → PDF → chat edit

## Testing checklist

- [ ] "Update my GitHub to github.com/test" → saved + chip shown
- [ ] "Add project Recall with React and Node" → project created
- [ ] "Which project fits this backend role?" → sensible answer
- [ ] Rate limit: trigger 11th analyse in 1 hour → 429
- [ ] Remove API key → Career tab shows setup CTA
- [ ] Full E2E documented in CAREER.md works

---

## Agent prompt — Step 5

```
Implement Step 5 (Chat, Settings & Hardening) of the Identity & Career module for Recall.

READ FIRST:
- recall-prd-implementation-plan.md §21 (Chat System — full section), §19 (completeWithTools), §23
- identity-career-implementation-prompts.md Step 5

PREREQUISITE: Steps 1–4 complete. All career features except chat/settings/polish exist.

GOAL:
Add conversational profile editing via Fireworks function calling, AI settings UI, rate limits, error handling, and CAREER.md docs. Make the feature production-ready.

REQUIREMENTS — BACKEND:
1. Implement completeWithTools() in llm-client.js using kimi-k2-instruct-0905.
2. Create backend/src/services/chat-handler.js:
   - buildSystemPrompt() from live profile + projects
   - PROFILE_TOOLS (all 7 tools from PRD §21)
   - Tool dispatcher mapping to db/profile.js and db/career.js functions
   - Multi-turn loop: tool call → execute → re-call LLM → final reply
3. Implement POST /career/chat returning { reply, actions_taken[] }.
4. Implement PUT /profile/ai-settings with encrypted fireworks_api_key_enc storage.
5. Add POST /profile/ai-settings/test — minimal Fireworks ping.
6. Add rate limits on /career routes (10 analyse, 60 chat, 20 build-resume per hour).
7. Graceful fallback in jd-analyzer when no API key: regex keyword extraction only.

REQUIREMENTS — EXTENSION:
8. Create profile/sections/chat.js — collapsed/expanded drawer, session history in chrome.storage.local.
9. Suggested prompts on first open; action chips for actions_taken; navigate on chip click.
10. Refresh affected tab section after tool mutations (no full page reload).
11. Settings page: Fireworks API key field, deep analysis toggle, test key button.
12. Career tab + chat: error states for missing/invalid key and rate limits.

DOCUMENTATION:
13. Create CAREER.md with setup, usage, costs, troubleshooting.

DO NOT:
- Connect chat to Recall items/saves library
- Build mobile app profile screen

WHEN DONE:
- List all files created/modified
- Confirm all acceptance criteria from identity-career-implementation-prompts.md Step 5
- Provide full E2E test walkthrough
```

---

## Post-implementation checklist (all 5 steps)

- [ ] All 5 steps' acceptance criteria pass
- [ ] `recall-prd-implementation-plan.md` §22 matches completed implementation
- [ ] No secrets committed (Fireworks key only in env or encrypted DB field)
- [ ] Extension loads Profile page without console errors
- [ ] Backend starts cleanly with migration 004 applied
- [ ] `CAREER.md` linked from README

---

*Prompt pack version: 1.0 · June 2026 · Paired with recall-prd-implementation-plan.md v3.1*
