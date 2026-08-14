import {
  askLibrary,
  clearTestData,
  deleteItem,
  downloadExport,
  getAskStatus,
  getItem,
  getItemTags,
  getJobHistory,
  getItems,
  getSearchRecommendations,
  getStatus,
  getTestDataCount,
  health,
  search,
  updateItemTags,
} from '../shared/api.js';
import { ejectFullPageFromPopup, requireAuth } from '../shared/auth-gate.js';
import { mountAppShell } from '../shared/app-shell.js';
import { createLiveSearchRunner } from '../shared/live-search.js';
import {
  bindSearchCards,
  bindSuggestionChips,
  escapeHtml,
  renderSearchItemCard,
  renderSuggestionChips,
  safeAnchor,
  safeHref,
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
  knowledgeFiles: new Map(),
  activeRequestId: 0,
  tagEditor: { itemId: null, tags: [] },
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

  if (state.tagEditor.itemId === id) {
    closeTagEditor();
  }

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
      const knowledge = state.knowledgeFiles.get(item.id);
      const showKnowledge = knowledge !== undefined;
      const saveModeLabel = item.save_mode === 'manual_note'
        ? 'Manual note'
        : item.save_mode === 'doc_extract'
          ? 'Doc extract'
          : 'Auto-scrape';

      return `
        <article class="result${index === state.focusedIndex ? ' focused' : ''}" data-index="${index}" data-id="${item.id}">
          <div class="result-header">
            <div>
              <h2>${safeAnchor(item.url, item.title || item.url)}</h2>
              <p class="summary">${escapeHtml(truncate(item.summary || item.note || 'No summary yet.', 220))}</p>
            </div>
            ${item.score != null ? `<span class="chip score">${Math.round(item.score * 100)}% match</span>` : ''}
          </div>
          <div class="result-meta">
            <span class="chip">${sourceTypeLabel(item.source_type)}</span>
            <span class="chip">${escapeHtml(item.domain || '')}</span>
            <span class="chip">${formatTimeAgo(item.created_at)}</span>
            <span class="chip">${saveModeLabel}</span>
            ${item.tags ? item.tags.split(',').filter(Boolean).map((t) => `<span class="chip tag-chip">#${escapeHtml(t.trim())}</span>`).join('') : ''}
          </div>
          <div class="result-actions">
            ${
              item.source_type === 'video'
                ? `<button type="button" data-action="transcript" data-id="${item.id}">${showTranscript ? 'Hide transcript' : 'Show transcript'}</button>`
                : ''
            }
            ${
              item.source_type === 'documentation'
                ? `<button type="button" data-action="knowledge" data-id="${item.id}">${showKnowledge ? 'Hide knowledge' : 'View knowledge'}</button>`
                : ''
            }
            <button type="button" data-action="open" data-url="${escapeHtml(item.url)}">Open original</button>
            <button type="button" data-action="tags" data-id="${item.id}" class="${state.tagEditor.itemId === item.id ? 'active' : ''}">${state.tagEditor.itemId === item.id ? 'Close tags' : 'Tags'}</button>
            <button type="button" class="delete-btn" data-action="delete" data-id="${item.id}">Delete</button>
          </div>
          ${state.tagEditor.itemId === item.id ? renderInlineTagEditorHtml() : ''}
          ${showTranscript ? `<div class="transcript">${escapeHtml(transcript || 'Transcript not available.')}</div>` : ''}
          ${showKnowledge ? `<div class="transcript">${escapeHtml(knowledge || 'Knowledge file not available.')}</div>` : ''}
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

  container.querySelectorAll('[data-action="knowledge"]').forEach((button) => {
    button.addEventListener('click', () => toggleKnowledge(button.dataset.id));
  });

  container.querySelectorAll('[data-action="tags"]').forEach((button) => {
    button.addEventListener('click', () => toggleTagEditor(button.dataset.id));
  });

  bindInlineTagEditor(container);

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
    state.knowledgeFiles.clear();
    state.focusedIndex = -1;
    setPanelVisibility({ showRecommendations: true, showResults: false, showRelated: false });
    await loadRecommendations();
    return;
  }

  setPanelVisibility({ showRecommendations: false, showResults: true, showRelated: false });
  $('#results').innerHTML = '<div class="empty">Searching…</div>';
  $('#results-meta').hidden = true;

  // Strip leading # so clicking a collection tag chip works as a search
  const cleanQuery = query.startsWith('#') ? query.slice(1) : query;
  const result = await search(cleanQuery, getFilters(), { signal });

  if (requestId !== state.activeRequestId) {
    return;
  }

  state.results = result.results || [];
  state.related = result.related || [];
  state.transcripts.clear();
  state.knowledgeFiles.clear();
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

async function toggleKnowledge(id) {
  if (state.knowledgeFiles.has(id)) {
    state.knowledgeFiles.delete(id);
    renderMainResults();
    return;
  }

  try {
    const data = await getItem(id);
    state.knowledgeFiles.set(id, data.item.content || 'Knowledge file not available.');
    renderMainResults();
  } catch (error) {
    state.knowledgeFiles.set(id, `Failed to load knowledge file: ${error.message}`);
    renderMainResults();
  }
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
    const healthResult = await health();
    if (!healthResult?.ok) {
      $('#footer-status').textContent = 'Daemon offline — backend unreachable';
      return;
    }

    try {
      const status = await getStatus();
      $('#footer-status').textContent = `Daemon online · ${status.itemCount} items saved`;
    } catch {
      $('#footer-status').textContent = 'Daemon online';
    }
  } catch {
    $('#footer-status').textContent = 'Daemon offline — backend unreachable';
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

// ── Inline tag editor (no full-screen overlay) ─────────────────────────────

function renderInlineTagEditorHtml() {
  const tags = state.tagEditor.tags;
  const pills = tags
    .map((tag) => `
      <span class="tag-pill">
        #${escapeHtml(tag)}
        <button type="button" class="tag-remove" data-tag="${escapeHtml(tag)}" aria-label="Remove ${escapeHtml(tag)}">×</button>
      </span>
    `)
    .join('');

  return `
    <div class="tag-editor-inline" data-tag-editor>
      <p class="tag-editor-label">Edit tags</p>
      <div class="tag-list" data-tag-list>${pills || '<span class="tag-empty">No tags yet</span>'}</div>
      <div class="tag-input-row">
        <input type="text" data-tag-input placeholder="Add tag…" autocomplete="off" maxlength="40" />
        <button type="button" class="text-btn" data-tag-add>Add</button>
      </div>
      <div class="tag-editor-actions">
        <button type="button" class="text-btn" data-tag-cancel>Cancel</button>
        <button type="button" data-tag-save>Save tags</button>
      </div>
    </div>
  `;
}

function closeTagEditor() {
  state.tagEditor.itemId = null;
  state.tagEditor.tags = [];
}

async function toggleTagEditor(itemId) {
  if (state.tagEditor.itemId === itemId) {
    closeTagEditor();
    renderMainResults();
    return;
  }

  state.tagEditor.itemId = itemId;
  state.tagEditor.tags = [];

  try {
    const { tags } = await getItemTags(itemId);
    state.tagEditor.tags = tags;
  } catch {
    state.tagEditor.tags = [];
  }

  renderMainResults();

  const input = document.querySelector('[data-tag-input]');
  input?.focus();
}

function bindInlineTagEditor(container) {
  const panel = container.querySelector('[data-tag-editor]');
  if (!panel) {
    return;
  }

  const list = panel.querySelector('[data-tag-list]');
  const input = panel.querySelector('[data-tag-input]');

  function refreshTagList() {
    if (state.tagEditor.tags.length === 0) {
      list.innerHTML = '<span class="tag-empty">No tags yet</span>';
      return;
    }

    list.innerHTML = state.tagEditor.tags
      .map((tag) => `
        <span class="tag-pill">
          #${escapeHtml(tag)}
          <button type="button" class="tag-remove" data-tag="${escapeHtml(tag)}">×</button>
        </span>
      `)
      .join('');

    list.querySelectorAll('.tag-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.tagEditor.tags = state.tagEditor.tags.filter((t) => t !== btn.dataset.tag);
        refreshTagList();
      });
    });
  }

  function addTag() {
    const raw = input.value.trim().toLowerCase().replace(/[^a-z0-9-_ ]/g, '');
    if (!raw || state.tagEditor.tags.includes(raw) || state.tagEditor.tags.length >= 20) {
      return;
    }
    state.tagEditor.tags = [...state.tagEditor.tags, raw];
    input.value = '';
    refreshTagList();
  }

  panel.querySelector('[data-tag-add]').addEventListener('click', addTag);

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTag();
    }
    if (event.key === 'Escape') {
      closeTagEditor();
      renderMainResults();
    }
  });

  panel.querySelector('[data-tag-cancel]').addEventListener('click', () => {
    closeTagEditor();
    renderMainResults();
  });

  panel.querySelector('[data-tag-save]').addEventListener('click', async () => {
    const { itemId, tags } = state.tagEditor;
    if (!itemId) {
      return;
    }

    const saveBtn = panel.querySelector('[data-tag-save]');
    saveBtn.disabled = true;

    try {
      await updateItemTags(itemId, tags);
      const patch = (item) => (item.id === itemId ? { ...item, tags: tags.join(',') } : item);
      state.results = state.results.map(patch);
      state.related = state.related.map(patch);
      closeTagEditor();
      renderMainResults();
      renderRelatedResults();
    } catch (error) {
      alert(error.message);
      saveBtn.disabled = false;
    }
  });
}

// ── Collections ─────────────────────────────────────────────────────────────

async function loadCollections() {
  const container = $('#collections-list');
  const countEl = $('#collections-count');

  try {
    const { items } = await getItems(200);

    // Group items by tag
    const tagMap = new Map();
    for (const item of items) {
      const tags = item.tags ? item.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
      for (const tag of tags) {
        if (!tagMap.has(tag)) tagMap.set(tag, []);
        tagMap.get(tag).push(item);
      }
    }

    const untagged = items.filter((item) => !item.tags?.trim());

    if (tagMap.size === 0 && untagged.length === 0) {
      container.innerHTML = '<p class="section-hint">No items yet. Save some pages and add tags to create collections.</p>';
      countEl.textContent = '';
      return;
    }

    countEl.textContent = tagMap.size ? `${tagMap.size}` : '';

    const collections = [...tagMap.entries()].sort((a, b) => b[1].length - a[1].length);

    container.innerHTML = collections
      .map(([tag, tagItems]) => `
        <div class="collection-card" data-tag="${escapeHtml(tag)}">
          <div class="collection-icon">#</div>
          <div>
            <div class="collection-name">${escapeHtml(tag)}</div>
            <div class="collection-count">${tagItems.length} item${tagItems.length === 1 ? '' : 's'}</div>
          </div>
        </div>
      `)
      .join('');

    container.querySelectorAll('.collection-card').forEach((card) => {
      card.addEventListener('click', () => {
        const tag = card.dataset.tag;
        $('#search-input').value = `#${tag}`;
        $('#search-input').dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('collections-panel').open = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    if (untagged.length > 0) {
      const untaggedCard = document.createElement('div');
      untaggedCard.className = 'collection-card collection-untagged';
      untaggedCard.innerHTML = `
        <div class="collection-icon">∅</div>
        <div>
          <div class="collection-name">Untagged</div>
          <div class="collection-count">${untagged.length} item${untagged.length === 1 ? '' : 's'}</div>
        </div>
      `;
      container.appendChild(untaggedCard);
    }
  } catch (error) {
    container.innerHTML = `<p class="section-hint">${escapeHtml(error.message)}</p>`;
  }
}

document.getElementById('collections-panel').addEventListener('toggle', function () {
  if (this.open) loadCollections();
});

// ── Ask ──────────────────────────────────────────────────────────────────────

async function initAskPanel() {
  const statusBar = $('#ask-status-bar');

  try {
    const status = await getAskStatus();
    if (status.available) {
      statusBar.innerHTML = `<span class="ask-online">Ollama online · model: ${escapeHtml(status.model)}</span>`;
    } else {
      statusBar.innerHTML = `<span class="ask-offline">Ollama not running — <a href="https://ollama.com" target="_blank" rel="noopener">install Ollama</a> then run: <code>ollama pull ${escapeHtml(status.model)}</code></span>`;
    }
  } catch {
    statusBar.innerHTML = '<span class="ask-offline">Could not reach Ollama status endpoint</span>';
  }
}

document.getElementById('ask-panel').addEventListener('toggle', function () {
  if (this.open) initAskPanel();
});

$('#ask-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const question = $('#ask-input').value.trim();
  if (!question) return;

  const resultEl = $('#ask-result');
  const btn = $('#ask-btn');

  resultEl.hidden = false;
  resultEl.innerHTML = '<div class="ask-thinking">Thinking…</div>';
  btn.disabled = true;

  try {
    const { answer, sources } = await askLibrary(question);

    const sourcesHtml = sources.length
      ? `<div class="ask-sources"><strong>Sources used:</strong><ol>${
          sources.map((s) => `<li>${safeAnchor(s.url, s.title)}</li>`).join('')
        }</ol></div>`
      : '';

    resultEl.innerHTML = `
      <div class="ask-answer">${escapeHtml(answer)}</div>
      ${sourcesHtml}
    `;
  } catch (error) {
    resultEl.innerHTML = `<div class="ask-error">${escapeHtml(error.message)}</div>`;
  } finally {
    btn.disabled = false;
  }
});

// ── Export ──────────────────────────────────────────────────────────────────

async function triggerExportDownload(format) {
  const blob = await downloadExport(format);
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = `recall-export.${format === 'markdown' ? 'md' : 'json'}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

$('#export-json-btn').addEventListener('click', () => {
  triggerExportDownload('json').catch((error) => {
    alert(error.message);
  });
});
$('#export-md-btn').addEventListener('click', () => {
  triggerExportDownload('markdown').catch((error) => {
    alert(error.message);
  });
});

// ── Initialise ───────────────────────────────────────────────────────────────

async function start() {
  if (ejectFullPageFromPopup()) {
    return;
  }

  mountAppShell({ active: 'search' });

  if (!(await requireAuth())) {
    return;
  }

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
}

start();
