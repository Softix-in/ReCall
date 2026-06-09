# Contributing to Recall

Thank you for helping improve Recall. This guide focuses on the most common extension point: **adding a new content type handler**.

## Project layout

| Directory | Purpose |
|-----------|---------|
| `backend/` | Node.js daemon — API, queue, pipeline |
| `recall-embed/` | Python FastAPI service — ONNX embeddings + ChromaDB |
| `recall-extension/` | Chrome MV3 extension |
| `recall-tray/` | Windows system tray helper |

## Adding a new content type

### 1. Classify the URL

Edit `backend/src/pipeline/classify.js`:

- Add hostname/path heuristics
- Return a new `source_type` string (e.g. `podcast`)

### 2. Implement a fetcher

Create `backend/src/pipeline/fetch-<type>.js` that returns:

```js
{
  text: '...',           // body used for summarise + embed
  title: '...',
  thumbnail: 'https://...' | null,
  transcript: 'transcripts/<id>.txt' | null,
}
```

Wire it in `backend/src/pipeline/fetch-content.js`.

### 3. Update search boosts (optional)

Add your type to `SOURCE_BOOST` in `backend/src/services/search-service.js`.

### 4. Extension UI

- Add icon mapping in `recall-extension/shared/utils.js` (`sourceTypeIcon`, `sourceTypeLabel`)
- Add filter option in `recall-extension/search/search.html` if users should filter by it

### 5. Tests

- Add a classifier case in `backend/scripts/test-classify.js`
- Add an integration capture in `backend/scripts/test-phase2.js` if the fetcher needs network/tools

## Running tests

```bash
cd backend
npm start          # terminal 1

npm run test:phase1
npm run test:phase2
npm run test:phase3
npm run test:phase4
npm run test:phase5
```

## Code style

- Match existing CommonJS in backend, ES modules in extension
- Keep pipeline steps pure where possible — side effects go in `pipeline-worker.js`
- Log pipeline failures via `logDaemon('error', ...)` in `backend/src/utils/logger.js`

## Pull requests

1. Describe the content type and example URLs
2. Note any new system dependencies (binaries, Python packages)
3. Include test output or manual verification steps
