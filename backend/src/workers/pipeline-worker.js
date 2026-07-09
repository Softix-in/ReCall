const itemsDb = require('../db/items');
const embeddingService = require('../services/embedding-service');
const { classifyUrl } = require('../pipeline/classify');
const { fetchBySourceType } = require('../pipeline/fetch-content');
const { fetchOgMetadata } = require('../pipeline/fetch-og');
const { summariseText, summariseManualNote } = require('../pipeline/summarise');
const { logJob, logDaemon } = require('../utils/logger');
const { getSettings } = require('../services/settings-service');
const { uploadTranscript, uploadThumbnail } = require('../services/object-storage');
const fs = require('fs');
const path = require('path');
const config = require('../config');

function parseCaptureMeta(item) {
  if (!item.capture_meta) {
    return {};
  }

  try {
    return typeof item.capture_meta === 'string'
      ? JSON.parse(item.capture_meta)
      : item.capture_meta;
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

  await itemsDb.updateItem(item.user_id, item.id, { source_type: sourceType });

  const fetched = await fetchBySourceType(sourceType, item.url, item.id, item.user_id);
  const { title, summary } = await summariseText(fetched.text);

  return {
    source_type: sourceType,
    title: title || fetched.title || item.title,
    summary: fetched.fallback && fetched.fallbackReason
      ? fetched.fallbackReason
      : (summary || fetched.text.slice(0, 500)),
    content: fetched.text,
    thumbnail: fetched.thumbnail,
    transcript: fetched.transcript || null,
    error_message: fetched.fallback ? fetched.fallbackReason : null,
  };
}

async function persistLargeFiles(userId, itemId, result) {
  const next = { ...result };

  if (next.content?.trim()) {
    const uploaded = await uploadTranscript(userId, itemId, next.content);
    if (uploaded.url) {
      next.transcript_url = uploaded.url;
    }
    if (uploaded.relativePath) {
      next.transcript = uploaded.relativePath;
    }
  }

  if (next.thumbnail && !next.thumbnail.startsWith('http')) {
    const absolutePath = path.isAbsolute(next.thumbnail)
      ? next.thumbnail
      : path.join(config.RECALL_HOME, next.thumbnail);

    if (fs.existsSync(absolutePath)) {
      const buffer = fs.readFileSync(absolutePath);
      const ext = path.extname(absolutePath) || '.jpg';
      const uploaded = await uploadThumbnail(userId, itemId, buffer, ext);
      if (uploaded.url) {
        next.thumbnail_url = uploaded.url;
      }
      if (uploaded.relativePath) {
        next.thumbnail = uploaded.relativePath;
      }
    }
  }

  return next;
}

async function processItem(itemId) {
  const item = await itemsDb.getItemByIdInternal(itemId);

  if (!item) {
    throw new Error(`Item not found: ${itemId}`);
  }

  const userId = item.user_id;

  if (item.url.includes('fail-job-test')) {
    throw new Error('Simulated pipeline failure');
  }

  await itemsDb.updateItem(userId, itemId, {
    processing: 'processing',
    error_message: null,
  });

  logJob(`[${itemId}] processing started (${item.save_mode})`);

  try {
    const result = item.save_mode === 'manual_note'
      ? await processManualNote(item)
      : await processAutoScrape(item);

    const settings = await getSettings(userId);

    let processedResult = result;

    if (processedResult.content && processedResult.content.length > settings.maxTranscriptLength) {
      processedResult = {
        ...processedResult,
        content: `${processedResult.content.slice(0, settings.maxTranscriptLength)}…`,
      };
    }

    processedResult = await persistLargeFiles(userId, itemId, processedResult);

    const mergedItem = { ...item, ...processedResult };
    await embeddingService.embedAndStoreItem(userId, mergedItem);

    const updated = await itemsDb.updateItem(userId, itemId, {
      ...processedResult,
      processing: 'done',
      processed_at: Date.now(),
      error_message: processedResult.error_message ?? null,
    });

    if (processedResult.error_message) {
      logJob(`[${itemId}] processing done with warning — ${processedResult.error_message}`);
    } else {
      logJob(`[${itemId}] processing done — "${updated.title}"`);
    }

    return updated;
  } catch (error) {
    logJob(`[${itemId}] processing failed — ${error.message}`);
    logDaemon('error', `Pipeline failed for item ${itemId}`, error);
    throw error;
  }
}

module.exports = {
  processItem,
};
