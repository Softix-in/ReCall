import {
  clearTestData,
  deleteItem,
  getItem,
  getJobHistory,
  getSearchRecommendations,
  getStatus,
  getTestDataCount,
  health,
  search,
} from '../shared/api.js';
import { createLiveSearchRunner } from '../shared/live-search.js';
import {
  bindSearchCards,
  bindSuggestionChips,
  escapeHtml,
  renderSearchItemCard,
  renderSuggestionChips,
} from '../shared/search-render.js';
import {
  formatTimeAgo,
  sourceTypeLabel,
  truncate,
} from '../shared/utils.js';

const $ = (selector) => document.querySelector(selector);

const state = {
  results: [],
  related: [],
  focusedIndex: -1,
  transcripts: new Map(),
  activeRequestId: 0,
};

const liveSearch = createLiveSearchRunner({ debounceMs: 220, minLength: 2 });

function sinceToIso(value) {
  const now = Date.now();
  let ms = null;

  switch (value) {
    case '7d':
      ms = now - 7 * 24 * 60 * 60 * 1000;
      break;
    case '30d':
      ms = now - 30 * 24 * 60 * 60 * 1000;
      break;
    case '90d':
      ms = now - 90 * 24 * 60 * 60 * 1000;
      break;
    default:
      return null;
  }

  return new Date(ms).toISOString();
}

function getFilters() {
  const sinceValue = $('#filter-since').value;
  const since = sinceValue ? sinceToIso(sinceValue) : null;

  return {
    type: $('#filter-type').value || undefined,
    mode: $('#filter-save-mode').value || undefined,
    since: since || undefined,
  };
}

function setPanelVisibility({ showRecommendations, showResults, showRelated }) {
  $('#recommendations-panel').hidden = !showRecommendations;
  $('#results-panel').hidden = !showResults;
  $('#related-panel').hidden = !showRelated;
}

async function handleDeleteItem(id) {
  await deleteItem(id);

  state.results = state.results.filter((item) => item.id !== id);
  state.related = state.related.filter((item) => item.id !== id);
  state.transcripts.delete(id);

  renderMainResults();
  renderRelatedResults();

  if ($('#search-input').value.trim().length < 2) {
    await loadRecommendations();
  }

  await refreshFooter();
  await updateTestDataButton();
}

async function updateTestDataButton() {
  const button = $('#clear-test-data-btn');

  try {
    const { count } = await getTestDataCount();
    button.hidden = count === 0;
    button.textContent = count > 0 ? `Clear example data (${count})` : 'Clear example data';
  } catch {
    button.hidden = true;
  }
}

async function loadRecommendations() {
  const itemsEl = $('#recommended-items');
  const queriesEl = $('#suggested-queries');
  const hint = $('#recommendations-hint');

  itemsEl.innerHTML = '<div class="empty">Loading recommendations…</div>';
  await updateTestDataButton();

  try {
    const data = await getSearchRecommendations();
    const recent = data.recent || [];
    const queries = data.suggested_queries || [];

    queriesEl.innerHTML = renderSuggestionChips(queries);
    bindSuggestionChips(queriesEl, (query) => {
      $('#search-input').value = query;
      $('#search-input').dispatchEvent(new Event('input', { bubbles: true }));
    });

    if (recent.length === 0) {
      itemsEl.innerHTML = '<div class="empty">Save a few pages to get personalized recommendations.</div>';
      hint.textContent = 'Try one of the suggested searches below';
      return;
    }

    hint.textContent = 'Recently saved — click to open';
    itemsEl.innerHTML = recent.map((item) => renderSearchItemCard(item, { compact: true, showDelete: true })).join('');
    bindSearchCards(itemsEl, {
      onOpen: (url) => window.open(url, '_blank', 'noopener'),
      onDelete: handleDeleteItem,
    });
  } catch (error) {
    itemsEl.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  }
}

function renderMainResults() {
  const container = $('#results');
  const meta = $('#results-meta');

  if (state.results.length === 0) {
    container.innerHTML = '<div class="empty">No matches yet. Keep typing or try a different phrase.</div>';
    meta.hidden = true;
    return;
  }

  meta.hidden = false;
  meta.textContent = `${state.results.length} live result${state.results.length === 1 ? '' : 's'}`;

  container.innerHTML = state.results
    .map((item, index) => {
      const transcript = state.transcripts.get(item.id);
      const showTranscript = transcript !== undefined;

      return `
        <article class="result${index === state.focusedIndex ? ' focused' : ''}" data-index="${index}" data-id="${item.id}">
          <div class="result-header">
            <div>
              <h2><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || item.url)}</a></h2>
              <p class="summary">${escapeHtml(truncate(item.summary || item.note || 'No summary yet.', 220))}</p>
            </div>
            ${item.score != null ? `<span class="chip score">${Math.round(item.score * 100)}% match</span>` : ''}
          </div>
          <div class="result-meta">
            <span class="chip">${sourceTypeLabel(item.source_type)}</span>
            <span class="chip">${escapeHtml(item.domain || '')}</span>
            <span class="chip">${formatTimeAgo(item.created_at)}</span>
            <span class="chip">${item.save_mode === 'manual_note' ? 'Manual note' : 'Auto-scrape'}</span>
          </div>
          <div class="result-actions">
            ${
              item.source_type === 'video'
                ? `<button type="button" data-action="transcript" data-id="${item.id}">${showTranscript ? 'Hide transcript' : 'Show transcript'}</button>`
                : ''
            }
            <button type="button" data-action="open" data-url="${escapeHtml(item.url)}">Open original</button>
            <button type="button" class="delete-btn" data-action="delete" data-id="${item.id}">Delete</button>
          </div>
          ${showTranscript ? `<div class="transcript">${escapeHtml(transcript || 'Transcript not available.')}</div>` : ''}
        </article>
      `;
    })
    .join('');

  container.querySelectorAll('[data-action="open"]').forEach((button) => {
    button.addEventListener('click', () => {
      window.open(button.dataset.url, '_blank', 'noopener');
    });
  });

  container.querySelectorAll('[data-action="transcript"]').forEach((button) => {
    button.addEventListener('click', () => toggleTranscript(button.dataset.id));
  });

  container.querySelectorAll('[data-action="delete"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const confirmed = window.confirm('Delete this item from Recall? This cannot be undone.');
      if (!confirmed) {
        return;
      }

      button.disabled = true;
      try {
        await handleDeleteItem(button.dataset.id);
      } catch (error) {
        alert(error.message);
        button.disabled = false;
      }
    });
  });

  container.querySelectorAll('.result').forEach((row) => {
    row.addEventListener('mouseenter', () => {
      state.focusedIndex = Number(row.dataset.index);
      highlightFocused();
    });
  });
}

function renderRelatedResults() {
  const container = $('#related-results');

  if (state.related.length === 0) {
    $('#related-panel').hidden = true;
    return;
  }

  $('#related-panel').hidden = false;
  container.innerHTML = state.related
    .map((item) => renderSearchItemCard(item, { showScore: true, showDelete: true }))
    .join('');

  bindSearchCards(container, {
    onOpen: (url) => window.open(url, '_blank', 'noopener'),
    onDelete: handleDeleteItem,
  });
}

function highlightFocused() {
  document.querySelectorAll('.result').forEach((row, index) => {
    row.classList.toggle('focused', index === state.focusedIndex);
  });

  document.querySelector('.result.focused')?.scrollIntoView({ block: 'nearest' });
}

async function runLiveSearch(query, { signal, requestId, empty }) {
  if (empty) {
    state.results = [];
    state.related = [];
    state.transcripts.clear();
    state.focusedIndex = -1;
    setPanelVisibility({ showRecommendations: true, showResults: false, showRelated: false });
    await loadRecommendations();
    return;
  }

  setPanelVisibility({ showRecommendations: false, showResults: true, showRelated: false });
  $('#results').innerHTML = '<div class="empty">Searching…</div>';
  $('#results-meta').hidden = true;

  const result = await search(query, getFilters(), { signal });

  if (requestId !== state.activeRequestId) {
    return;
  }

  state.results = result.results || [];
  state.related = result.related || [];
  state.transcripts.clear();
  state.focusedIndex = state.results.length > 0 ? 0 : -1;

  renderMainResults();
  renderRelatedResults();
}

function scheduleSearch() {
  const query = $('#search-input').value;

  liveSearch.schedule(query, async ({ query: q, empty, signal, requestId }) => {
    state.activeRequestId = requestId;

    try {
      await runLiveSearch(q, { signal, requestId, empty });
    } catch (error) {
      if (error.name === 'AbortError') {
        return;
      }

      $('#results-panel').hidden = false;
      $('#results').innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
      $('#results-meta').hidden = true;
      $('#related-panel').hidden = true;
    }
  });
}

async function toggleTranscript(id) {
  if (state.transcripts.has(id)) {
    state.transcripts.delete(id);
    renderMainResults();
    return;
  }

  try {
    const data = await getItem(id, { includeTranscript: true });
    state.transcripts.set(id, data.item.transcript_text || 'Transcript not available.');
    renderMainResults();
  } catch (error) {
    state.transcripts.set(id, `Failed to load transcript: ${error.message}`);
    renderMainResults();
  }
}

function openFocusedResult() {
  const item = state.results[state.focusedIndex];
  if (!item?.url) {
    return;
  }

  window.open(item.url, '_blank', 'noopener');
}

async function loadJobHistory() {
  const container = $('#job-history');

  try {
    const { jobs } = await getJobHistory(30, 30);

    if (!jobs?.length) {
      container.textContent = 'No jobs in the last 30 days.';
      return;
    }

    container.innerHTML = jobs
      .map((job) => `
        <div class="history-row ${job.processing === 'failed' ? 'failed' : ''}">
          <div>
            <div>${escapeHtml(job.title || job.url)}</div>
            <div class="meta">${escapeHtml(job.domain || '')} · ${formatTimeAgo(job.created_at)} · ${job.processing}</div>
            ${job.error_message ? `<div class="meta">${escapeHtml(job.error_message)}</div>` : ''}
          </div>
          <span class="chip">${sourceTypeLabel(job.source_type)}</span>
        </div>
      `)
      .join('');
  } catch (error) {
    container.textContent = error.message;
  }
}

async function refreshFooter() {
  try {
    const [healthResult, status] = await Promise.all([health(), getStatus()]);
    $('#footer-status').textContent = healthResult.ok
      ? `Daemon online · ${status.itemCount} items saved`
      : 'Daemon online';
  } catch {
    $('#footer-status').textContent = 'Daemon offline — start the backend on port 7878';
  }
}

$('#search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  scheduleSearch();
});

$('#search-input').addEventListener('input', scheduleSearch);

$('#search-input').addEventListener('focus', () => {
  if (!$('#search-input').value.trim()) {
    loadRecommendations();
  }
});

$('#clear-test-data-btn').addEventListener('click', async () => {
  const confirmed = window.confirm('Remove all example.com and benchmark test items from your library?');
  if (!confirmed) {
    return;
  }

  const button = $('#clear-test-data-btn');
  button.disabled = true;

  try {
    const result = await clearTestData();
    alert(`Removed ${result.count} example/test item(s).`);
    scheduleSearch();
    await loadRecommendations();
    await refreshFooter();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
    await updateTestDataButton();
  }
});

['filter-type', 'filter-save-mode', 'filter-since'].forEach((id) => {
  $(`#${id}`).addEventListener('change', scheduleSearch);
});

document.addEventListener('keydown', (event) => {
  if (state.results.length === 0) {
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    state.focusedIndex = Math.min(state.focusedIndex + 1, state.results.length - 1);
    highlightFocused();
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    state.focusedIndex = Math.max(state.focusedIndex - 1, 0);
    highlightFocused();
    return;
  }

  if (event.key === 'Enter' && state.focusedIndex >= 0) {
    event.preventDefault();
    openFocusedResult();
    return;
  }

  if (event.key.toLowerCase() === 't' && state.focusedIndex >= 0) {
    const item = state.results[state.focusedIndex];
    if (item?.source_type === 'video') {
      event.preventDefault();
      toggleTranscript(item.id);
    }
  }
});

const params = new URLSearchParams(window.location.search);
const initialQuery = params.get('q');

if (initialQuery) {
  $('#search-input').value = initialQuery;
  scheduleSearch();
} else {
  setPanelVisibility({ showRecommendations: true, showResults: false, showRelated: false });
  loadRecommendations();
}

refreshFooter();
loadJobHistory();
