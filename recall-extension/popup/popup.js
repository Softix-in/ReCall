import { getFailedJobs, retryItem, search } from '../shared/api.js';
import {
  formatBytes,
  formatTimeAgo,
  isValidHttpUrl,
  processingLabel,
  sourceTypeIcon,
  sourceTypeLabel,
  truncate,
} from '../shared/utils.js';

const $ = (selector) => document.querySelector(selector);

const state = {
  scraped: null,
  vaultMode: 'auto_scrape',
  lastCaptureId: null,
};

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, resolve);
  });
}

function showToast(message, type = 'success') {
  const toast = $('#toast');
  toast.textContent = message;
  toast.className = `toast visible ${type}`;

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove('visible');
  }, 2800);
}

function setActiveTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });

  document.querySelectorAll('.panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `panel-${tabName}`);
  });

  if (tabName === 'recent') {
    loadRecentItems();
  }
}

function renderCaptureCard(data) {
  const title = data.og_title || data.title || data.url;
  $('#capture-title').textContent = title;
  $('#capture-domain').textContent = data.domain || data.url;

  const card = $('#capture-card');
  const existingThumb = $('#capture-thumb');
  const nextThumb = document.createElement(data.og_image ? 'img' : 'div');
  nextThumb.id = 'capture-thumb';
  nextThumb.className = data.og_image ? 'thumb' : 'thumb placeholder';

  if (data.og_image) {
    nextThumb.src = data.og_image;
    nextThumb.alt = '';
    nextThumb.onerror = () => {
      nextThumb.replaceWith(createPlaceholderThumb(data));
    };
  } else {
    nextThumb.textContent = data.has_video ? '▶' : '📄';
  }

  card.replaceChild(nextThumb, existingThumb);
}

function createPlaceholderThumb(data) {
  const div = document.createElement('div');
  div.className = 'thumb placeholder';
  div.id = 'capture-thumb';
  div.textContent = data.has_video ? '▶' : '📄';
  return div;
}

function updateCaptureStatus(job) {
  const pill = $('#capture-status');

  if (!job) {
    pill.hidden = true;
    return;
  }

  pill.hidden = false;
  pill.className = `status-pill ${job.processing}`;
  pill.textContent = processingLabel(job.processing);

  if (job.processing === 'failed' && job.error) {
    pill.textContent = `Failed — ${job.error}`;
  }
}

async function loadActiveTabScrape() {
  const response = await sendMessage({ type: 'SCRAPE_ACTIVE_TAB' });

  if (!response?.ok) {
    $('#capture-title').textContent = response?.error || 'Cannot capture this page';
    $('#capture-domain').textContent = '';
    $('#quick-save-btn').disabled = true;
    return;
  }

  state.scraped = response.data;
  renderCaptureCard(response.data);
  $('#quick-save-btn').disabled = false;
}

async function refreshQueueStatus() {
  const response = await sendMessage({ type: 'GET_QUEUE' });

  if (!response?.ok) {
    return;
  }

  const job = response.queue.find((entry) => entry.id === state.lastCaptureId) || response.queue[0];
  updateCaptureStatus(job);
}

async function loadFailedJobs() {
  const section = $('#failed-jobs');
  const list = $('#failed-list');

  try {
    const { jobs } = await getFailedJobs(5);

    if (!jobs?.length) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    list.innerHTML = '';

    for (const job of jobs) {
      const row = document.createElement('div');
      row.className = 'failed-item';
      row.innerHTML = `
        <p><strong>${escapeHtml(job.title || job.url)}</strong><br>${escapeHtml(job.error_message || 'Unknown error')}</p>
      `;

      const retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.textContent = 'Retry';
      retryBtn.addEventListener('click', async () => {
        retryBtn.disabled = true;
        try {
          await retryItem(job.id);
          showToast('Retry queued');
          await loadFailedJobs();
          await refreshQueueStatus();
        } catch (error) {
          showToast(error.message, 'error');
          retryBtn.disabled = false;
        }
      });

      row.appendChild(retryBtn);
      list.appendChild(row);
    }
  } catch {
    section.hidden = true;
  }
}

async function refreshFooter() {
  const response = await sendMessage({ type: 'GET_FOOTER_STATUS' });

  if (!response?.ok) {
    $('#daemon-dot').classList.remove('online');
    $('#daemon-label').textContent = 'Daemon offline';
    return;
  }

  const { online, itemCount, storageBytes } = response.status;
  $('#daemon-dot').classList.toggle('online', online);
  $('#daemon-label').textContent = online ? 'Daemon online' : 'Daemon offline';
  $('#item-count').textContent = String(itemCount ?? 0);
  $('#storage-used').textContent = formatBytes(storageBytes);
}

async function loadRecentItems(query = '') {
  const list = $('#recent-list');
  list.innerHTML = '<div class="empty">Loading…</div>';

  try {
    let items = [];

    if (query.trim()) {
      const result = await search(query.trim());
      items = result.results || [];
    } else {
      const result = await sendMessage({ type: 'GET_FOOTER_STATUS' });

      if (!result?.ok || !result.status.online) {
        list.innerHTML = '<div class="empty">Daemon offline — start the backend first.</div>';
        return;
      }

      const { getItems } = await import('../shared/api.js');
      const data = await getItems(20);
      items = data.items || [];
    }

    if (items.length === 0) {
      list.innerHTML = '<div class="empty">No saved items yet.</div>';
      return;
    }

    list.innerHTML = '';

    for (const item of items) {
      const row = document.createElement('article');
      row.className = 'recent-item';
      row.innerHTML = `
        <div class="icon">${sourceTypeIcon(item.source_type)}</div>
        <div>
          <h3>${escapeHtml(item.title || item.url)}</h3>
          <p>${escapeHtml(item.domain || '')} · ${formatTimeAgo(item.created_at)}</p>
        </div>
        <span class="badge">${sourceTypeLabel(item.source_type)}</span>
      `;

      row.addEventListener('click', () => {
        chrome.tabs.create({ url: item.url });
      });

      list.appendChild(row);
    }
  } catch (error) {
    list.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function updateVaultMode(mode) {
  state.vaultMode = mode;

  document.querySelectorAll('.mode-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.mode === mode);
  });

  const noteArea = $('#vault-note-area');
  const hint = $('#vault-hint');
  const saveBtn = $('#vault-save-btn');

  if (mode === 'manual_note') {
    noteArea.hidden = false;
    hint.textContent = 'Only metadata is fetched. Your note becomes the summary and search text.';
    saveBtn.textContent = 'Save with note';
  } else {
    noteArea.hidden = true;
    hint.textContent = 'Recall will fetch the page, extract content, summarise it, and make it searchable.';
    saveBtn.textContent = 'Save link';
  }
}

function bindEvents() {
  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  });

  $('#open-search').addEventListener('click', (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('search/search.html') });
  });

  $('#settings-link').addEventListener('click', (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  $('#note-toggle').addEventListener('change', (event) => {
    $('#note-area').classList.toggle('visible', event.target.checked);
  });

  $('#quick-save-btn').addEventListener('click', async () => {
    $('#quick-save-btn').disabled = true;

    const response = await sendMessage({ type: 'QUICK_SAVE' });
    $('#quick-save-btn').disabled = false;

    if (!response?.ok) {
      showToast(response?.error || 'Quick save failed', 'error');
      return;
    }

    state.lastCaptureId = response.result.id;
    showToast('Saved — processing in background');
    await refreshQueueStatus();
    await refreshFooter();
  });

  $('#save-note-btn').addEventListener('click', async () => {
    const note = $('#capture-note').value;

    const response = await sendMessage({ type: 'SAVE_WITH_NOTE', note });
    if (!response?.ok) {
      showToast(response?.error || 'Save failed', 'error');
      return;
    }

    state.lastCaptureId = response.result.id;
    showToast('Saved with note');
    await refreshQueueStatus();
    await refreshFooter();
  });

  $('#paste-url-btn').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        $('#vault-url').value = text.trim();
      }
    } catch {
      showToast('Clipboard access denied', 'error');
    }
  });

  document.querySelectorAll('.mode-btn').forEach((button) => {
    button.addEventListener('click', () => updateVaultMode(button.dataset.mode));
  });

  $('#vault-save-btn').addEventListener('click', async () => {
    const url = $('#vault-url').value.trim();

    if (!isValidHttpUrl(url)) {
      showToast('Enter a valid http(s) URL', 'error');
      return;
    }

    let domain = null;

    try {
      domain = new URL(url).hostname;
    } catch {
      domain = null;
    }

    const payload = {
      url,
      domain,
      save_mode: state.vaultMode,
      note: state.vaultMode === 'manual_note' ? $('#vault-note').value.trim() : null,
    };

    if (state.vaultMode === 'manual_note' && !payload.note) {
      showToast('Note is required in note mode', 'error');
      return;
    }

    const response = await sendMessage({ type: 'SAVE_VAULT_LINK', payload });

    if (!response?.ok) {
      const message =
        response?.status === 409
          ? 'Already saved recently'
          : response?.error || 'Save failed';
      showToast(message, 'error');
      return;
    }

    $('#vault-url').value = '';
    $('#vault-note').value = '';
    showToast('Link saved');
    await refreshFooter();
  });

  let searchTimer = null;

  $('#recent-search').addEventListener('input', (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      loadRecentItems(event.target.value);
    }, 300);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'QUEUE_UPDATED') {
      refreshQueueStatus();
      refreshFooter();
    }
  });
}

bindEvents();
loadActiveTabScrape();
refreshQueueStatus();
refreshFooter();
loadFailedJobs();

setInterval(() => {
  refreshQueueStatus();
  refreshFooter();
  loadFailedJobs();
}, 5000);
