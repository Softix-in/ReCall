import { getItems, getStatus, health, isAuthError, saveLink } from '../shared/api.js';
import { mountAppShell, refreshAppShellStatus } from '../shared/app-shell.js';
import { getLoginUrl, requireAuth } from '../shared/auth-gate.js';
import {
  formatBytes,
  formatTimeAgo,
  isValidHttpUrl,
  sourceTypeIcon,
  sourceTypeLabel,
} from '../shared/utils.js';

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(message, type = 'success') {
  const toast = $('toast');
  toast.textContent = message;
  toast.className = `toast visible${type === 'error' ? ' error' : ''}`;

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove('visible');
  }, 2800);
}

async function refreshStatus() {
  await refreshAppShellStatus();

  try {
    await health();
  } catch {
    $('item-count').textContent = '—';
    $('storage-used').textContent = '—';
    return false;
  }

  try {
    const status = await getStatus();
    $('item-count').textContent = String(status.itemCount ?? status.item_count ?? 0);
    $('storage-used').textContent = formatBytes(status.storageBytes ?? status.storage_bytes ?? 0);
  } catch {
    $('item-count').textContent = '—';
    $('storage-used').textContent = '—';
  }

  return true;
}

function renderRecentItem(item) {
  const row = document.createElement('article');
  row.className = 'recent-item';
  row.innerHTML = `
    <div class="icon">${sourceTypeIcon(item.source_type)}</div>
    <div>
      <h3>${escapeHtml(item.title || item.url)}</h3>
      <p>${escapeHtml(item.domain || '')} · ${formatTimeAgo(item.created_at)}</p>
    </div>
    <span class="badge">${escapeHtml(sourceTypeLabel(item.source_type))}</span>
  `;

  row.addEventListener('click', () => {
    if (item.url) {
      chrome.tabs.create({ url: item.url });
    }
  });

  return row;
}

async function loadRecent() {
  const list = $('recent-list');
  list.innerHTML = '<div class="empty">Loading…</div>';

  try {
    const data = await getItems(12);
    const items = data.items || data || [];

    if (!Array.isArray(items) || items.length === 0) {
      list.innerHTML = '<div class="empty">No saved items yet. Save a link above or capture a page from the toolbar.</div>';
      return;
    }

    list.innerHTML = '';
    items.forEach((item) => list.appendChild(renderRecentItem(item)));
  } catch (error) {
    if (isAuthError(error)) {
      list.innerHTML = '<div class="empty">Sign in to see your library.</div>';
      return;
    }

    list.innerHTML = `<div class="empty">${escapeHtml(error.message || 'Could not load recent items.')}</div>`;
  }
}

function bindEvents() {
  $('search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const query = $('home-search').value.trim();
    const url = new URL(chrome.runtime.getURL('search/search.html'));
    if (query) {
      url.searchParams.set('q', query);
    }
    window.location.href = url.href;
  });

  $('save-form').addEventListener('submit', async (event) => {
    event.preventDefault();

    const url = $('home-url').value.trim();
    const status = $('save-status');
    const btn = $('save-link-btn');

    status.textContent = '';
    status.className = 'status-line';

    if (!isValidHttpUrl(url)) {
      status.textContent = 'Enter a valid http(s) URL';
      status.classList.add('err');
      return;
    }

    btn.disabled = true;

    try {
      let domain = null;
      try {
        domain = new URL(url).hostname;
      } catch {
        domain = null;
      }

      await saveLink({
        url,
        domain,
        save_mode: 'auto_scrape',
      });
      status.textContent = 'Saved — processing in background';
      status.classList.add('ok');
      $('home-url').value = '';
      showToast('Link saved');
      await refreshStatus();
      await loadRecent();
    } catch (error) {
      if (isAuthError(error)) {
        window.location.replace(getLoginUrl());
        return;
      }

      status.textContent = error.message || 'Save failed';
      status.classList.add('err');
      showToast(error.message || 'Save failed', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  $('open-popup-hint').addEventListener('click', () => {
    showToast('Click the Recall icon in your browser toolbar to capture the current page');
  });
}

async function init() {
  mountAppShell({ active: 'home' });
  bindEvents();

  if (!(await requireAuth())) {
    return;
  }

  const online = await refreshStatus();
  if (online) {
    await loadRecent();
  } else {
    $('recent-list').innerHTML = '<div class="empty">Backend offline — start the server to load your library.</div>';
  }
}

init().catch((error) => {
  if (!isAuthError(error)) {
    showToast(error.message || 'Failed to load home', 'error');
  }
});
