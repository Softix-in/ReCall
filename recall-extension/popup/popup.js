import {
  clearTestData,
  deleteItem,
  getFailedJobs,
  getSearchRecommendations,
  isAuthError,
  retryItem,
  search,
} from '../shared/api.js';
import { getLoginUrl, requireAuth } from '../shared/auth-gate.js';
import { getSession } from '../shared/auth.js';
import { createLiveSearchRunner } from '../shared/live-search.js';
import { bindSuggestionChips, renderSuggestionChips } from '../shared/search-render.js';
import {
  formatBytes,
  formatTimeAgo,
  friendlyCaptureError,
  isAutomatedTestJob,
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
  recentRequestId: 0,
  ycExtracted: null,
  researchJobId: null,
  researchPollTimer: null,
};

const recentLiveSearch = createLiveSearchRunner({ debounceMs: 220, minLength: 2 });

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
    scheduleRecentSearch();
  }

  if (tabName === 'research') {
    loadYcResearchPanel();
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

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    const pathname = parsed.pathname.replace(/\/$/, '') || '/';
    return `${parsed.origin}${pathname}${parsed.search}`;
  } catch {
    return url || '';
  }
}

function findRelevantQueueJob(queue) {
  if (!queue?.length) {
    return null;
  }

  const currentUrl = state.scraped?.url ? normalizeUrl(state.scraped.url) : null;

  if (state.lastCaptureId) {
    const byId = queue.find((entry) => entry.id === state.lastCaptureId);
    if (byId) {
      return byId;
    }
  }

  if (currentUrl) {
    return queue.find((entry) => normalizeUrl(entry.url) === currentUrl) || null;
  }

  return null;
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
    $('#capture-title').textContent = friendlyCaptureError(response?.error);
    $('#capture-domain').textContent = 'Use Link Vault to save by URL, or switch to a regular webpage tab.';
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

  updateCaptureStatus(findRelevantQueueJob(response.queue));
}

function renderFailedJobRow(job, list) {
  const row = document.createElement('div');
  row.className = 'failed-item';
  row.innerHTML = `
    <p><strong>${escapeHtml(job.title || job.url)}</strong><br>${escapeHtml(job.error_message || 'Unknown error')}</p>
  `;

  const actions = document.createElement('div');
  actions.className = 'failed-actions';

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

  const dismissBtn = document.createElement('button');
  dismissBtn.type = 'button';
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.addEventListener('click', async () => {
    dismissBtn.disabled = true;
    try {
      await deleteItem(job.id);
      showToast('Removed');
      await loadFailedJobs();
      await refreshFooter();
    } catch (error) {
      showToast(error.message, 'error');
      dismissBtn.disabled = false;
    }
  });

  actions.appendChild(retryBtn);
  actions.appendChild(dismissBtn);
  row.appendChild(actions);
  list.appendChild(row);
}

async function loadFailedJobs() {
  const section = $('#failed-jobs');
  const list = $('#failed-list');

  try {
    const { jobs } = await getFailedJobs(20);
    const userJobs = (jobs || []).filter((job) => !isAutomatedTestJob(job));
    const testJobs = (jobs || []).filter((job) => isAutomatedTestJob(job));

    if (userJobs.length === 0 && testJobs.length === 0) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    list.innerHTML = '';

    if (testJobs.length > 0) {
      const note = document.createElement('p');
      note.className = 'failed-hint';
      note.textContent = `${testJobs.length} failed test run(s) from npm test scripts (example.com URLs). Safe to clear.`;
      list.appendChild(note);

      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'btn btn-secondary clear-test-btn';
      clearBtn.textContent = 'Clear test failures';
      clearBtn.addEventListener('click', async () => {
        clearBtn.disabled = true;
        try {
          const result = await clearTestData();
          showToast(`Cleared ${result.count} example item(s)`);
          await loadFailedJobs();
          await refreshFooter();
        } catch (error) {
          showToast(error.message, 'error');
          clearBtn.disabled = false;
        }
      });
      list.appendChild(clearBtn);
    }

    for (const job of userJobs.slice(0, 5)) {
      renderFailedJobRow(job, list);
    }
  } catch {
    section.hidden = true;
  }
}

async function refreshUserEmail() {
  const session = await getSession();
  const emailEl = $('#user-email');

  if (session.user?.email) {
    emailEl.textContent = session.user.email;
    emailEl.hidden = false;
  } else {
    emailEl.hidden = true;
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

function renderRecentItemRow(item, { searching = false } = {}) {
  const row = document.createElement('article');
  row.className = 'recent-item';

  const matchLine = searching && item.score != null
    ? `<p class="match-line">${Math.round(item.score * 100)}% match</p>`
    : '';

  const summaryLine = searching && item.summary
    ? `<p class="summary-line">${escapeHtml(truncate(item.summary, 80))}</p>`
    : '';

  row.innerHTML = `
    <div class="icon">${sourceTypeIcon(item.source_type)}</div>
    <div class="recent-item-body">
      <h3>${escapeHtml(item.title || item.url)}</h3>
      <p>${escapeHtml(item.domain || '')} · ${formatTimeAgo(item.created_at)}</p>
      ${summaryLine}
      ${matchLine}
    </div>
    <div class="recent-item-actions">
      <span class="badge">${sourceTypeLabel(item.source_type)}</span>
      <button type="button" class="recent-delete-btn" title="Delete">×</button>
    </div>
  `;

  row.querySelector('.recent-item-body').addEventListener('click', () => {
    chrome.tabs.create({ url: item.url });
  });

  row.querySelector('.recent-delete-btn').addEventListener('click', async (event) => {
    event.stopPropagation();

    if (!window.confirm('Delete this item from Recall?')) {
      return;
    }

    try {
      await deleteItem(item.id);
      showToast('Item deleted');
      scheduleRecentSearch();
      await refreshFooter();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  return row;
}

async function loadRecentRecommendations() {
  const list = $('#recent-list');
  const suggestions = $('#recent-suggestions');
  const status = $('#recent-search-status');

  list.innerHTML = '<div class="empty">Loading…</div>';
  status.textContent = 'Recommended for you';

  try {
    const footer = await sendMessage({ type: 'GET_FOOTER_STATUS' });
    if (!footer?.ok || !footer.status.online) {
      list.innerHTML = '<div class="empty">Daemon offline — start the backend first.</div>';
      suggestions.innerHTML = '';
      return;
    }

    const data = await getSearchRecommendations();
    const recent = data.recent || [];
    const queries = data.suggested_queries || [];

    suggestions.innerHTML = renderSuggestionChips(queries.slice(0, 4));
    bindSuggestionChips(suggestions, (query) => {
      $('#recent-search').value = query;
      $('#recent-search').dispatchEvent(new Event('input', { bubbles: true }));
    });

    if (recent.length === 0) {
      list.innerHTML = '<div class="empty">No saved items yet.</div>';
      return;
    }

    list.innerHTML = '';
    for (const item of recent) {
      list.appendChild(renderRecentItemRow(item));
    }
  } catch (error) {
    list.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

async function runRecentLiveSearch(query, { signal, requestId, empty }) {
  const list = $('#recent-list');
  const suggestions = $('#recent-suggestions');
  const status = $('#recent-search-status');

  if (empty) {
    suggestions.innerHTML = '';
    return loadRecentRecommendations();
  }

  suggestions.innerHTML = '';
  status.textContent = 'Searching…';
  list.innerHTML = '<div class="empty">Finding matches…</div>';

  const result = await search(query, {}, { signal });

  if (requestId !== state.recentRequestId) {
    return;
  }

  const items = result.results || [];
  const related = result.related || [];

  if (items.length === 0) {
    status.textContent = 'No matches';
    list.innerHTML = '<div class="empty">Try different words or check spelling.</div>';
    return;
  }

  status.textContent = `${items.length} result${items.length === 1 ? '' : 's'}${related.length ? ` · ${related.length} related` : ''}`;
  list.innerHTML = '';

  for (const item of items) {
    list.appendChild(renderRecentItemRow(item, { searching: true }));
  }

  if (related.length > 0) {
    const relatedHeader = document.createElement('div');
    relatedHeader.className = 'empty';
    relatedHeader.style.textAlign = 'left';
    relatedHeader.style.padding = '8px 4px 4px';
    relatedHeader.textContent = 'Related picks';
    list.appendChild(relatedHeader);

    for (const item of related.slice(0, 3)) {
      list.appendChild(renderRecentItemRow(item, { searching: true }));
    }
  }
}

function scheduleRecentSearch() {
  const query = $('#recent-search').value;

  recentLiveSearch.schedule(query, async ({ query: q, empty, signal, requestId }) => {
    state.recentRequestId = requestId;

    try {
      await runRecentLiveSearch(q, { signal, requestId, empty });
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }

      $('#recent-search-status').textContent = '';
      $('#recent-list').innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    }
  });
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

  const showNote = mode === 'manual_note';
  noteArea.hidden = !showNote;
  noteArea.classList.toggle('visible', showNote);

  if (showNote) {
    hint.textContent = 'Only metadata is fetched. Your note becomes the summary and search text.';
    saveBtn.textContent = 'Save with note';
    $('#vault-note').focus();
  } else {
    hint.textContent = 'Recall will fetch the page, extract content, summarise it, and make it searchable.';
    saveBtn.textContent = 'Save link';
  }
}

function parseTagsInput(value) {
  return String(value || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 15);
}

function renderYcResearchCard(data) {
  const card = $('#research-card');
  const hint = $('#research-hint');
  const btn = $('#research-btn');

  if (!data) {
    card.hidden = true;
    hint.hidden = false;
    hint.textContent = 'Open a YC company page (ycombinator.com/companies/…) to research it.';
    btn.disabled = true;
    state.ycExtracted = null;
    return;
  }

  hint.hidden = true;
  card.hidden = false;
  state.ycExtracted = data;

  $('#research-name').textContent = data.company_name || 'Unknown company';
  $('#research-batch').textContent = [data.batch, data.industry, data.location].filter(Boolean).join(' · ');
  $('#research-desc').textContent = data.short_description || data.og_description || '';

  const founders = Array.isArray(data.founders) ? data.founders : [];
  $('#research-founders').textContent = founders.length
    ? `Founders: ${founders.map((f) => f.full_name).join(', ')}`
    : 'Founders: not detected on page';

  btn.disabled = false;
}

async function loadYcResearchPanel() {
  const response = await sendMessage({ type: 'SCRAPE_YC_ACTIVE_TAB' });

  if (!response?.ok) {
    renderYcResearchCard(null);
    if (response?.error && !/Not a YC/i.test(response.error)) {
      $('#research-hint').textContent = response.error;
    }
    return;
  }

  renderYcResearchCard(response.data);
}

function stopResearchPolling() {
  if (state.researchPollTimer) {
    clearInterval(state.researchPollTimer);
    state.researchPollTimer = null;
  }
}

function formatResearchProgress(job) {
  const step = job?.progress?.step || job?.status || 'queued';
  const labels = {
    starting: 'Starting…',
    website_crawl: 'Crawling company website…',
    founder_enrichment: 'Enriching founders…',
    ai_analysis: 'Running AI analysis…',
    news_signals: 'Extracting news signals…',
    embedding: 'Embedding for search…',
    done: 'Done',
    queued: 'Queued…',
    running: 'Running…',
    completed: 'Completed',
    failed: 'Failed',
    needs_review: 'Needs review',
  };

  let text = labels[step] || labels[job?.status] || String(step);

  if (job?.progress?.pages_crawled != null) {
    text += ` · ${job.progress.pages_crawled} page(s)`;
  }
  if (job?.progress?.founder_sources != null) {
    text += ` · ${job.progress.founder_sources} founder source(s)`;
  }
  if (job?.progress?.ai_skipped) {
    text += ' · AI skipped (add Fireworks API key)';
  }
  if (job?.error_message) {
    text += ` — ${job.error_message}`;
  }

  return text;
}

async function pollResearchJob() {
  if (!state.researchJobId) return;

  const response = await sendMessage({ type: 'GET_RESEARCH_JOB', id: state.researchJobId });
  if (!response?.ok || !response.result?.job) return;

  const { job } = response.result;
  const statusEl = $('#research-status');
  statusEl.hidden = false;
  statusEl.className = `research-status ${job.status}`;
  statusEl.textContent = formatResearchProgress(job);

  if (['completed', 'failed', 'needs_review'].includes(job.status)) {
    stopResearchPolling();
  }
}

function startResearchPolling(jobId) {
  stopResearchPolling();
  state.researchJobId = jobId;
  pollResearchJob();
  state.researchPollTimer = setInterval(() => {
    pollResearchJob().catch(() => {});
  }, 3000);
}

function bindEvents() {
  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  });

  $('#open-search').addEventListener('click', (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('search/search.html') });
  });

  $('#open-research').addEventListener('click', (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('research/board.html') });
  });

  $('#open-profile').addEventListener('click', (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('profile/profile.html') });
  });

  $('#settings-link').addEventListener('click', (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  $('#note-toggle').addEventListener('change', (event) => {
    const noteArea = $('#note-area');
    const show = event.target.checked;
    noteArea.classList.toggle('visible', show);
    noteArea.hidden = !show;
    if (show) {
      $('#capture-note').focus();
    }
  });

  $('#quick-save-btn').addEventListener('click', async () => {
    $('#quick-save-btn').disabled = true;

    const response = await sendMessage({ type: 'QUICK_SAVE' });
    $('#quick-save-btn').disabled = false;

    if (response?.authRequired) {
      window.location.replace(getLoginUrl());
      return;
    }

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

    if (response?.authRequired) {
      window.location.replace(getLoginUrl());
      return;
    }

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

  $('#recent-search').addEventListener('input', scheduleRecentSearch);

  $('#research-board-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('research/board.html') });
  });

  $('#research-btn').addEventListener('click', async () => {
    const btn = $('#research-btn');
    btn.disabled = true;

    const note = $('#research-note').value.trim();
    const tags = parseTagsInput($('#research-tags').value);

    const response = await sendMessage({
      type: 'RESEARCH_YC_STARTUP',
      extracted: state.ycExtracted,
      note: note || null,
      tags,
    });

    if (response?.authRequired) {
      window.location.replace(getLoginUrl());
      return;
    }

    if (!response?.ok) {
      showToast(response?.error || 'Research failed', 'error');
      btn.disabled = false;
      return;
    }

    const result = response.result;
    showToast(`Research queued · ${result.founders_count || 0} founder(s)`);
    startResearchPolling(result.research_job_id);
    btn.disabled = false;
    await refreshFooter();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'QUEUE_UPDATED') {
      refreshQueueStatus();
      refreshFooter();
    }

    if (message.type === 'AUTH_REQUIRED') {
      showToast('Session expired — sign in again', 'error');
      window.location.replace(getLoginUrl());
    }
  });
}

bindEvents();

async function start() {
  if (!(await requireAuth())) {
    return;
  }

  await refreshUserEmail();
  loadActiveTabScrape();
  await sendMessage({ type: 'PRUNE_QUEUE' });
  await refreshQueueStatus();
  await refreshFooter();
  await loadFailedJobs();

  setInterval(() => {
    refreshQueueStatus();
    refreshFooter();
    loadFailedJobs();
  }, 5000);
}

start().catch((error) => {
  if (isAuthError(error)) {
    return;
  }

  console.error('Popup failed to start:', error);
});
