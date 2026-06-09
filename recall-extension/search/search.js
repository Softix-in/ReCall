import { getItem, getJobHistory, getStatus, health, search } from '../shared/api.js';
import {
  formatTimeAgo,
  sourceTypeLabel,
  truncate,
} from '../shared/utils.js';

const $ = (selector) => document.querySelector(selector);

const state = {
  results: [],
  focusedIndex: -1,
  transcripts: new Map(),
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

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

function renderResults() {
  const container = $('#results');
  const meta = $('#results-meta');

  if (state.results.length === 0) {
    container.innerHTML = '<div class="empty">No results yet. Try a different query.</div>';
    meta.hidden = true;
    return;
  }

  meta.hidden = false;
  meta.textContent = `${state.results.length} result${state.results.length === 1 ? '' : 's'}`;

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
            ${item.score != null ? `<span class="chip score">${item.score.toFixed(3)}</span>` : ''}
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

  container.querySelectorAll('.result').forEach((row) => {
    row.addEventListener('mouseenter', () => {
      state.focusedIndex = Number(row.dataset.index);
      highlightFocused();
    });
  });
}

function highlightFocused() {
  document.querySelectorAll('.result').forEach((row, index) => {
    row.classList.toggle('focused', index === state.focusedIndex);
  });

  const focused = document.querySelector('.result.focused');
  focused?.scrollIntoView({ block: 'nearest' });
}

async function runSearch() {
  const query = $('#search-input').value.trim();
  const container = $('#results');

  if (!query) {
    container.innerHTML = '<div class="empty">Enter a search query to begin.</div>';
    $('#results-meta').hidden = true;
    return;
  }

  container.innerHTML = '<div class="empty">Searching…</div>';
  state.transcripts.clear();
  state.focusedIndex = -1;

  try {
    const sinceValue = $('#filter-since').value;
    const since = sinceValue ? sinceToIso(sinceValue) : null;

    const result = await search(query, {
      type: $('#filter-type').value || undefined,
      mode: $('#filter-save-mode').value || undefined,
      since: since || undefined,
    });

    state.results = result.results || [];
    renderResults();
  } catch (error) {
    container.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
    $('#results-meta').hidden = true;
  }
}

async function toggleTranscript(id) {
  if (state.transcripts.has(id)) {
    state.transcripts.delete(id);
    renderResults();
    return;
  }

  try {
    const data = await getItem(id, { includeTranscript: true });
    state.transcripts.set(id, data.item.transcript_text || 'Transcript not available.');
    renderResults();
  } catch (error) {
    state.transcripts.set(id, `Failed to load transcript: ${error.message}`);
    renderResults();
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
  runSearch();
});

['filter-type', 'filter-save-mode', 'filter-since'].forEach((id) => {
  $(`#${id}`).addEventListener('change', () => {
    if ($('#search-input').value.trim()) {
      runSearch();
    }
  });
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
  runSearch();
} else {
  $('#results').innerHTML = '<div class="empty">Enter a search query to begin.</div>';
}

refreshFooter();
loadJobHistory();
