import {
  capture,
  ensureDefaultConnection,
  getItemStatus,
  getResearchJob,
  getStatus,
  health,
  isAuthError,
  researchStartup,
  retryItem,
} from '../shared/api.js';
import { isAuthenticated } from '../shared/auth.js';
import { getLoginUrl } from '../shared/auth-gate.js';

const POLL_INTERVAL_MS = 5000;
const STORAGE_KEY = 'recallJobQueue';
const FAILED_QUEUE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let pollTimer = null;

async function readQueue() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return stored[STORAGE_KEY] || [];
}

async function pruneQueue() {
  const queue = await readQueue();
  const now = Date.now();
  const pruned = queue.filter((job) => {
    if (job.processing === 'done') {
      return false;
    }

    if (job.processing === 'failed') {
      return now - (job.createdAt || 0) <= FAILED_QUEUE_TTL_MS;
    }

    return true;
  });

  if (pruned.length !== queue.length) {
    await writeQueue(pruned);
    await updateBadge();
  }

  return pruned;
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

function notifyAuthRequired() {
  chrome.runtime.sendMessage({ type: 'AUTH_REQUIRED' }).catch(() => {});
}

function openLoginPopup() {
  return chrome.windows.create({
    url: getLoginUrl(),
    type: 'popup',
    width: 420,
    height: 560,
  });
}

async function enqueueCapture(payload) {
  try {
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
  } catch (error) {
    if (isAuthError(error)) {
      notifyAuthRequired();
    }

    throw error;
  }
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

async function scrapeYcActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) {
    throw new Error('No active browser tab found');
  }

  if (isRestrictedTabUrl(tab.url)) {
    throw new Error('Open a YC company page first, then open Recall.');
  }

  let response;

  try {
    response = await sendTabMessage(tab.id, { type: 'SCRAPE_YC_COMPANY' });
  } catch {
    await ensureContentScript(tab.id);
    response = await sendTabMessage(tab.id, { type: 'SCRAPE_YC_COMPANY' });
  }

  if (!response?.ok || !response.data) {
    throw new Error(response?.error || 'Not a YC company page. Open ycombinator.com/companies/…');
  }

  return response.data;
}

async function startYcResearch({ extracted = null, note = null, tags = [] } = {}) {
  const data = extracted || (await scrapeYcActiveTab());

  const result = await researchStartup({
    trigger_url: data.yc_url || data.url,
    trigger_type: 'yc_company_page',
    note,
    tags,
    extracted: data,
  });

  return result;
}

async function pollQueue() {
  const queue = await readQueue();
  let changed = false;
  const now = Date.now();
  const nextQueue = [];

  for (const job of queue) {
    if (job.processing === 'done') {
      changed = true;
      continue;
    }

    if (job.processing === 'failed') {
      const age = now - (job.createdAt || 0);
      if (age > FAILED_QUEUE_TTL_MS) {
        changed = true;
        continue;
      }
      nextQueue.push(job);
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

      if (job.processing === 'done') {
        changed = true;
        continue;
      }

      if (job.processing === 'failed') {
        nextQueue.push(job);
        continue;
      }

      nextQueue.push(job);
    } catch (error) {
      if (isAuthError(error)) {
        notifyAuthRequired();
      }

      nextQueue.push(job);
    }
  }

  if (changed || nextQueue.length !== queue.length) {
    await writeQueue(nextQueue);
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
  ensureDefaultConnection()
    .catch(() => {})
    .finally(() => {
      ensurePolling();
      updateBadge().catch(() => {});
    });
});

chrome.runtime.onStartup.addListener(() => {
  ensureDefaultConnection()
    .catch(() => {})
    .finally(() => {
      ensurePolling();
      updateBadge().catch(() => {});
    });
});

ensureDefaultConnection()
  .catch(() => {})
  .finally(() => {
    ensurePolling();
  });

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'quick-save') {
    if (!(await isAuthenticated())) {
      try {
        await openLoginPopup();
      } catch (error) {
        console.error('Could not open sign-in:', error);
      }
      return;
    }

    try {
      await quickSaveCurrentTab();
    } catch (error) {
      if (isAuthError(error)) {
        notifyAuthRequired();
      }

      console.error('Quick save failed:', error);
    }
    return;
  }

  if (command === 'open-search') {
    chrome.tabs.create({ url: chrome.runtime.getURL('search/search.html') });
    return;
  }

  if (command === 'save-highlight') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || isRestrictedTabUrl(tab.url)) return;

      let response;
      try {
        response = await sendTabMessage(tab.id, { type: 'CAPTURE_HIGHLIGHT' });
      } catch {
        await ensureContentScript(tab.id);
        response = await sendTabMessage(tab.id, { type: 'CAPTURE_HIGHLIGHT' });
      }

      if (!response?.ok || !response.data?.highlight) return;

      const { highlight, url, title, domain } = response.data;
      await enqueueCapture({
        url,
        title,
        domain,
        has_video: false,
        save_mode: 'manual_note',
        note: highlight,
        highlight: highlight,
      });

      await sendTabMessage(tab.id, { type: 'HIGHLIGHT_SAVED' }).catch(() => {});
    } catch (error) {
      console.error('Highlight save failed:', error);
    }
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
        case 'SCRAPE_YC_ACTIVE_TAB': {
          const data = await scrapeYcActiveTab();
          sendResponse({ ok: true, data });
          break;
        }
        case 'RESEARCH_YC_STARTUP': {
          if (!(await isAuthenticated())) {
            notifyAuthRequired();
            sendResponse({ ok: false, error: 'Sign in required', authRequired: true });
            break;
          }

          const result = await startYcResearch({
            extracted: message.extracted || null,
            note: message.note || null,
            tags: message.tags || [],
          });
          sendResponse({ ok: true, result });
          break;
        }
        case 'GET_RESEARCH_JOB': {
          const data = await getResearchJob(message.id);
          sendResponse({ ok: true, result: data });
          break;
        }
        case 'GET_QUEUE': {
          const queue = await pruneQueue();
          sendResponse({ ok: true, queue });
          break;
        }
        case 'PRUNE_QUEUE': {
          const queue = await pruneQueue();
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
          const data = await retryItem(message.id);
          sendResponse({ ok: true, result: data });
          break;
        }
        default:
          sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (error) {
      const authRequired = isAuthError(error);

      if (authRequired) {
        notifyAuthRequired();
      }

      sendResponse({
        ok: false,
        error: error.message,
        status: error.status,
        data: error.data,
        authRequired,
      });
    }
  })();

  return true;
});
