const itemsDb = require('../db/items');
const chromaDb = require('../db/chroma');
const { classifyUrl } = require('../pipeline/classify');
const { fetchBySourceType } = require('../pipeline/fetch-content');
const { fetchOgMetadata } = require('../pipeline/fetch-og');
const { summariseText, summariseManualNote } = require('../pipeline/summarise');
const { logJob } = require('../utils/logger');

function parseCaptureMeta(item) {
  if (!item.capture_meta) {
    return {};
  }

  try {
    return JSON.parse(item.capture_meta);
  } catch {
    return {};
  }
}

function firstSentence(text) {
  const match = text.trim().match(/^[^.!?\n]+[.!?]?/);
  return match ? match[0].trim() : text.trim().split('\n')[0];
}

async function processManualNote(item) {
  if (!item.note?.trim()) {
    throw new Error('manual_note save requires a note');
  }

  const og = await fetchOgMetadata(item.url, item.id);
  const note = item.note.trim();
  const { title, summary } = summariseManualNote(note);

  return {
    source_type: 'link',
    title: title || og.title || firstSentence(note),
    summary,
    content: note,
    thumbnail: og.thumbnail,
    transcript: null,
  };
}

async function processAutoScrape(item) {
  const metadata = parseCaptureMeta(item);
  const sourceType = classifyUrl(item.url, metadata);

  logJob(`[${item.id}] classified as ${sourceType}`);

  itemsDb.updateItem(item.id, { source_type: sourceType });

  const fetched = await fetchBySourceType(sourceType, item.url, item.id);
  const { title, summary } = await summariseText(fetched.text);

  return {
    source_type: sourceType,
    title: title || fetched.title || item.title,
    summary: summary || fetched.text.slice(0, 500),
    content: fetched.text,
    thumbnail: fetched.thumbnail,
    transcript: fetched.transcript || null,
  };
}

async function processItem(itemId) {
  const item = itemsDb.getItemById(itemId);

  if (!item) {
    throw new Error(`Item not found: ${itemId}`);
  }

  if (item.url.includes('fail-job-test')) {
    throw new Error('Simulated pipeline failure');
  }

  itemsDb.updateItem(itemId, {
    processing: 'processing',
    error_message: null,
  });

  logJob(`[${itemId}] processing started (${item.save_mode})`);

  try {
    const result = item.save_mode === 'manual_note'
      ? await processManualNote(item)
      : await processAutoScrape(item);

    const updated = itemsDb.updateItem(itemId, {
      ...result,
      processing: 'done',
      processed_at: Date.now(),
      error_message: null,
    });

    chromaDb.upsertPlaceholder(
      itemId,
      {
        source_type: updated.source_type,
        domain: updated.domain,
        created_at: updated.created_at,
        save_mode: updated.save_mode,
      },
      updated.summary || updated.note || updated.title || updated.url
    );

    logJob(`[${itemId}] processing done — "${updated.title}"`);
    return updated;
  } catch (error) {
    logJob(`[${itemId}] processing failed — ${error.message}`);
    throw error;
  }
}

module.exports = {
  processItem,
};
