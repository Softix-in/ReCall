import { API_BASE, capture, getItemStatus, getStatus, health } from '../shared/api.js';

const POLL_INTERVAL_MS = 5000;
const STORAGE_KEY = 'recallJobQueue';

let pollTimer = null;

async function readQueue() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return stored[STORAGE_KEY] || [];
}

async function writeQueue(queue) {
  await chrome.storage.local.set({ [STORAGE_KEY]: queue });
}

function isRestrictedTabUrl(url) {
  if (!url) {
    return true;
  }

  const restrictedPrefixes = [
    'chrome:',
    'chrome-extension:',
    'edge:',
    'about:',
    'devtools:',
    'view-source:',
  ];

  return restrictedPrefixes.some((prefix) => url.startsWith(prefix));
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content/content.js'],
  });
}

async function scrapeActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error('No active browser tab found');
  }

  if (isRestrictedTabUrl(tab.url)) {
    throw new Error(
      'Open a normal website tab first (not Chrome settings, extensions, or a new tab page), then open Recall.'
    );
  }

  let response;

  try {
    response = await sendTabMessage(tab.id, { type: 'SCRAPE_PAGE' });
  } catch {
    await ensureContentScript(tab.id);
    response = await sendTabMessage(tab.id, { type: 'SCRAPE_PAGE' });
  }

  if (!response?.ok || !response.data) {
    throw new Error('Could not read this page. Refresh it, then try again.');
  }

  return response.data;
}

function buildCapturePayload(scraped, { save_mode = 'auto_scrape', note = null } = {}) {
  return {
    url: scraped.url,
    title: scraped.title,
    og_title: scraped.og_title,
    og_description: scraped.og_description,
    og_image: scraped.og_image,
    og_type: scraped.og_type,
    domain: scraped.domain,
    has_video: scraped.has_video,
    save_mode,
    note,
  };
}

async function enqueueCapture(payload) {
  const result = await capture(payload);
  const queue = await readQueue();

  queue.unshift({
    id: result.id,
    url: payload.url,
    title: payload.title || payload.og_title || payload.url,
    processing: result.processing || 'queued',
    createdAt: Date.now(),
    error: null,
  });

  await writeQueue(queue.slice(0, 50));
  await updateBadge();
  ensurePolling();

  return result;
}

async function quickSaveCurrentTab() {
  const scraped = await scrapeActiveTab();
  return enqueueCapture(buildCapturePayload(scraped));
}

async function saveWithNote(note) {
  const scraped = await scrapeActiveTab();

  if (!note?.trim()) {
    throw new Error('Note is required');
  }

  return enqueueCapture(
    buildCapturePayload(scraped, {
      save_mode: 'manual_note',
      note: note.trim(),
    })
  );
}

async function saveVaultLink(payload) {
  return enqueueCapture({
    url: payload.url,
    title: payload.title || null,
    og_title: payload.og_title || null,
    og_description: payload.og_description || null,
    og_image: payload.og_image || null,
    og_type: payload.og_type || null,
    domain: payload.domain || null,
    has_video: Boolean(payload.has_video),
    save_mode: payload.save_mode || 'auto_scrape',
    note: payload.note || null,
  });
}

async function pollQueue() {
  const queue = await readQueue();
  let changed = false;

  for (const job of queue) {
    if (job.processing === 'done' || job.processing === 'failed') {
      continue;
    }

    try {
      const status = await getItemStatus(job.id);
      const nextProcessing = status.processing;

      if (nextProcessing !== job.processing) {
        job.processing = nextProcessing;
        job.title = status.title || job.title;
        job.error = status.error_message || null;
        changed = true;
      }
    } catch {
      // Backend may be offline — keep existing state.
    }
  }

  if (changed) {
    await writeQueue(queue);
    chrome.runtime.sendMessage({ type: 'QUEUE_UPDATED' }).catch(() => {});
  }

  await updateBadge();
}

function ensurePolling() {
  if (pollTimer) {
    return;
  }

  pollTimer = setInterval(() => {
    pollQueue().catch(() => {});
  }, POLL_INTERVAL_MS);

  pollQueue().catch(() => {});
}

async function updateBadge() {
  const queue = await readQueue();
  const active = queue.filter((job) => job.processing === 'queued' || job.processing === 'processing');
  const failed = queue.filter((job) => job.processing === 'failed');

  if (failed.length > 0) {
    await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
    await chrome.action.setBadgeText({ text: '!' });
    return;
  }

  if (active.length > 0) {
    await chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
    await chrome.action.setBadgeText({ text: String(Math.min(active.length, 9)) });
    return;
  }

  await chrome.action.setBadgeText({ text: '' });
}

async function checkDaemonHealth() {
  try {
    const result = await health();
    return { online: true, ...result };
  } catch {
    return { online: false };
  }
}

async function getFooterStatus() {
  try {
    const [healthResult, status] = await Promise.all([checkDaemonHealth(), getStatus()]);
    return {
      online: healthResult.online,
      itemCount: status.itemCount,
      storageBytes: status.storageBytes,
      queueLength: status.queueLength,
      version: healthResult.version,
    };
  } catch {
    return { online: false, itemCount: 0, storageBytes: 0, queueLength: 0 };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensurePolling();
  updateBadge().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  ensurePolling();
  updateBadge().catch(() => {});
});

ensurePolling();

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'quick-save') {
    try {
      await quickSaveCurrentTab();
    } catch (error) {
      console.error('Quick save failed:', error);
    }
    return;
  }

  if (command === 'open-search') {
    chrome.tabs.create({ url: chrome.runtime.getURL('search/search.html') });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'SCRAPE_ACTIVE_TAB': {
          const data = await scrapeActiveTab();
          sendResponse({ ok: true, data });
          break;
        }
        case 'QUICK_SAVE': {
          const result = await quickSaveCurrentTab();
          sendResponse({ ok: true, result });
          break;
        }
        case 'SAVE_WITH_NOTE': {
          const result = await saveWithNote(message.note);
          sendResponse({ ok: true, result });
          break;
        }
        case 'SAVE_VAULT_LINK': {
          const result = await saveVaultLink(message.payload);
          sendResponse({ ok: true, result });
          break;
        }
        case 'GET_QUEUE': {
          const queue = await readQueue();
          sendResponse({ ok: true, queue });
          break;
        }
        case 'GET_FOOTER_STATUS': {
          const status = await getFooterStatus();
          sendResponse({ ok: true, status });
          break;
        }
        case 'CHECK_HEALTH': {
          const healthResult = await checkDaemonHealth();
          sendResponse({ ok: true, health: healthResult });
          break;
        }
        case 'RETRY_ITEM': {
          const response = await fetch(`${API_BASE}/items/${message.id}/retry`, { method: 'POST' });
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || 'Retry failed');
          }
          sendResponse({ ok: true, result: data });
          break;
        }
        default:
          sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (error) {
      sendResponse({
        ok: false,
        error: error.message,
        status: error.status,
        data: error.data,
      });
    }
  })();

  return true;
});
