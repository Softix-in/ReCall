# Identity & Career Module

The Identity & Career module turns Recall into a personal professional hub: profile, projects, resume, JD analysis, tailored resumes, and an AI chat assistant — all backed by your local Recall backend.

## Features

| Tab | What it does |
|-----|----------------|
| **Identity** | Name, headline, social links, bio, skills |
| **Projects** | Portfolio projects with tech stack and impact bullets |
| **Resume** | Master resume + tailored versions per job |
| **Career** | Paste a JD → extract keywords → rank projects → rewrite bullets |
| **Chat** | Natural-language profile editing via Fireworks function calling |

## Setup

### 1. Run the backend

```bash
cd backend
npm install
npm run migrate
npm start
```

### 2. Get a Fireworks API key

1. Sign up at [fireworks.ai](https://fireworks.ai)
2. Create an API key in the dashboard
3. Add it via **one** of:
   - Extension **Settings → Identity & Career AI → Fireworks API key**
   - Career tab inline key input
   - Backend env: `FIREWORKS_API_KEY=fw_...` in `.env`

Keys saved through the extension are encrypted at rest in `user_profile.fireworks_api_key_enc`.

### 3. Open Profile & Career

In the Recall extension popup, click **Profile ↗** to open the full profile page.

## End-to-end workflow

1. **Settings** — Save and test your Fireworks API key
2. **Identity** — Fill display name, headline, links, skills; use **Generate bio**
3. **Projects** — Add projects (embeddings populate automatically)
4. **Resume** — Enter master work experience, education, certifications
5. **Career** — Paste a job description → **Analyse JD**
6. Review ranked projects and streamed tailored bullets
7. **Apply to resume** → **Download PDF** or **Copy plain text**
8. **Chat** — e.g. “Update my GitHub to github.com/me” or “Add a project called X”

## Models used

| Task | Default model |
|------|----------------|
| JD extraction, bullet rewrite, resume tailoring, bio/pitch | `accounts/fireworks/models/deepseek-v3p1` |
| Chat (tool calling) | `accounts/fireworks/models/kimi-k2-instruct-0905` |
| Deep analysis (optional) | `accounts/fireworks/models/glm-5p2` |

Approximate cost per operation (Fireworks pricing varies):

- JD analysis (with bullet rewrites): ~$0.01–0.05 per run
- Tailored resume build: ~$0.02–0.08
- Chat message: ~$0.001–0.01 depending on tools used

## API routes

### Profile

```
GET/PUT  /profile
PUT      /profile/ai-settings
POST     /profile/ai-settings/test
GET/POST /profile/projects
GET/POST /profile/resume
GET      /profile/resume/history
```

### Career

```
POST     /career/analyze-jd
GET      /career/analyses
GET      /career/analyses/:id
POST     /career/build-resume
POST     /career/generate/bio
POST     /career/generate/pitch
POST     /career/generate/cover-letter   (SSE stream)
POST     /career/chat
```

## Rate limits

| Route | Limit |
|-------|-------|
| `POST /career/analyze-jd` | 10 / hour |
| `POST /career/chat` | 60 / hour |
| `POST /career/build-resume` | 20 / hour |

When limited, the API returns `429` with `error: "rate_limit_exceeded"` and `retry_after_seconds`.

## Troubleshooting

### No Fireworks API key

- Career tab and chat show a setup prompt
- JD analysis falls back to **keyword-only mode** (regex extraction, no bullet rewrites)
- Add a key in Settings or set `FIREWORKS_API_KEY` in the backend env

### Invalid API key

- **Test API key** in Settings shows failure
- API returns `401` with `error: "invalid_api_key"`
- Update the key in Settings

### Rate limit exceeded

- Wait for `retry_after_seconds` from the error response
- Limits reset hourly

### Embed service down

- Project ranking uses keyword overlap fallback when embeddings are unavailable
- Start the embed service: backend starts it automatically unless `EMBED_AUTO_START=false`

### PDF export fails

- Install Puppeteer: `npm install` in `backend/`
- If Chrome download fails: `PUPPETEER_SKIP_DOWNLOAD=true` and set `PUPPETEER_EXECUTABLE_PATH` to your Chrome binary

## Tests

```bash
cd backend
npm run test:identity-career-step1
npm run test:identity-career-step3
npm run test:identity-career-step4
npm run test:identity-career-step5

# Live Fireworks integration (requires key):
FIREWORKS_API_KEY=fw_... npm run test:identity-career-step5
```

## Chat tools

The chat assistant can call these tools server-side:

1. `update_profile_field` — bio, headline, social URLs, etc.
2. `update_skills` — replace skills list
3. `add_project` / `update_project` / `delete_project`
4. `analyze_jd` — run JD analysis
5. `generate_text` — bio or pitch

Mutations refresh only the affected profile tab section — no full page reload.
