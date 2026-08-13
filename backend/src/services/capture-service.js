const config = require('../config');
const itemsDb = require('../db/items');
const { classifyUrl } = require('../pipeline/classify');
const { assertPublicHttpUrl } = require('../utils/safe-url');

function normalizeUrlWithHash(url, hash) {
  if (!hash || hash === '#') {
    return url;
  }

  try {
    const parsed = new URL(url);
    parsed.hash = hash.startsWith('#') ? hash : `#${hash}`;
    return parsed.toString();
  } catch {
    return url;
  }
}

function parseCaptureMetaInput(body) {
  const base = {
    og_type: body.og_type ?? null,
    has_video: Boolean(body.has_video),
    og_description: body.og_description ?? null,
  };

  if (body.capture_meta && typeof body.capture_meta === 'object') {
    return { ...base, ...body.capture_meta };
  }

  if (typeof body.capture_meta === 'string') {
    try {
      return { ...base, ...JSON.parse(body.capture_meta) };
    } catch {
      return base;
    }
  }

  return base;
}

async function normalizeCapturePayload(body) {
  const url = body.url?.trim();

  if (!url) {
    const error = new Error('url is required');
    error.status = 400;
    throw error;
  }

  await assertPublicHttpUrl(url);

  const save_mode = body.save_mode || 'auto_scrape';

  if (!['auto_scrape', 'manual_note', 'doc_extract'].includes(save_mode)) {
    const error = new Error('save_mode must be auto_scrape, manual_note, or doc_extract');
    error.status = 400;
    throw error;
  }

  if (save_mode === 'manual_note' && !body.note?.trim()) {
    const error = new Error('note is required for manual_note save mode');
    error.status = 400;
    throw error;
  }

  let domain = body.domain ?? null;

  if (!domain) {
    try {
      domain = new URL(url).hostname;
    } catch {
      domain = null;
    }
  }

  const captureMeta = parseCaptureMetaInput(body);

  const normalizedUrl = save_mode === 'doc_extract'
    ? normalizeUrlWithHash(url, captureMeta.hash || body.hash)
    : url;

  const source_type = save_mode === 'doc_extract'
    ? 'documentation'
    : (body.source_type || classifyUrl(normalizedUrl, {
      og_type: captureMeta.og_type,
      has_video: captureMeta.has_video,
    }));

  return {
    url: normalizedUrl,
    title: body.title ?? body.og_title ?? null,
    summary: body.summary ?? null,
    content: body.content ?? null,
    source_type,
    save_mode,
    note: body.note ?? null,
    tags: body.tags ?? null,
    domain,
    thumbnail: body.thumbnail ?? body.og_image ?? null,
    transcript: body.transcript ?? null,
    processing: 'queued',
    capture_meta: JSON.stringify(captureMeta),
  };
}

async function checkDuplicate(userId, url, queue) {
  const sinceMs = Date.now() - config.DEDUP_WINDOW_MS;
  const recent = await itemsDb.findRecentByUrl(userId, url, sinceMs);

  if (recent) {
    const error = new Error('Duplicate URL captured within the last 60 seconds');
    error.status = 409;
    error.existingId = recent.id;
    throw error;
  }

  if (queue.isUrlInFlight(url)) {
    const error = new Error('URL is already being processed');
    error.status = 409;
    throw error;
  }
}

async function createCapture(userId, body, queue) {
  const payload = await normalizeCapturePayload(body);
  await checkDuplicate(userId, payload.url, queue);

  const item = await itemsDb.createItem(userId, payload);

  queue.addJob({ itemId: item.id, userId, url: item.url });

  return {
    id: item.id,
    processing: item.processing,
  };
}

module.exports = {
  createCapture,
  normalizeCapturePayload,
};
