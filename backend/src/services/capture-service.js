const config = require('../config');
const itemsDb = require('../db/items');
const { classifyUrl } = require('../pipeline/classify');

function normalizeCapturePayload(body) {
  const url = body.url?.trim();

  if (!url) {
    const error = new Error('url is required');
    error.status = 400;
    throw error;
  }

  const save_mode = body.save_mode || 'auto_scrape';

  if (!['auto_scrape', 'manual_note'].includes(save_mode)) {
    const error = new Error('save_mode must be auto_scrape or manual_note');
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

  const captureMeta = {
    og_type: body.og_type ?? null,
    has_video: Boolean(body.has_video),
    og_description: body.og_description ?? null,
  };

  const source_type = body.source_type
    || classifyUrl(url, {
      og_type: captureMeta.og_type,
      has_video: captureMeta.has_video,
    });

  return {
    url,
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

function checkDuplicate(url, queue) {
  const sinceMs = Date.now() - config.DEDUP_WINDOW_MS;
  const recent = itemsDb.findRecentByUrl(url, sinceMs);

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

function createCapture(body, queue) {
  const payload = normalizeCapturePayload(body);
  checkDuplicate(payload.url, queue);

  const item = itemsDb.createItem(payload);

  queue.addJob({ itemId: item.id, url: item.url });

  return {
    id: item.id,
    processing: item.processing,
  };
}

module.exports = {
  createCapture,
  normalizeCapturePayload,
};
