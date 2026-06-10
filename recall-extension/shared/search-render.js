import { formatTimeAgo, sourceTypeIcon, sourceTypeLabel, truncate } from './utils.js';

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderSearchItemCard(item, { compact = false, showScore = false, showDelete = false } = {}) {
  const summary = truncate(item.summary || item.note || 'No summary yet.', compact ? 90 : 160);
  const score = showScore && item.score != null
    ? `<span class="match-score">${Math.round(item.score * 100)}% match</span>`
    : '';

  const deleteBtn = showDelete
    ? `<button type="button" class="delete-btn" data-id="${item.id}" title="Delete from library">Delete</button>`
    : '';

  return `
    <article class="search-card${compact ? ' compact' : ''}" data-url="${escapeHtml(item.url)}" data-id="${item.id}">
      <div class="search-card-icon">${sourceTypeIcon(item.source_type)}</div>
      <div class="search-card-body">
        <h3>${escapeHtml(item.title || item.url)}</h3>
        <p class="search-card-summary">${escapeHtml(summary)}</p>
        <div class="search-card-meta">
          <span>${escapeHtml(item.domain || '')}</span>
          <span>·</span>
          <span>${formatTimeAgo(item.created_at)}</span>
          <span>·</span>
          <span>${sourceTypeLabel(item.source_type)}</span>
          ${score}
        </div>
      </div>
      ${deleteBtn}
    </article>
  `;
}

export function bindSearchCards(container, { onOpen, onDelete } = {}) {
  container.querySelectorAll('.search-card').forEach((card) => {
    card.addEventListener('click', (event) => {
      if (event.target.closest('.delete-btn')) {
        return;
      }

      const url = card.dataset.url;
      if (onOpen) {
        onOpen(url, card.dataset.id);
      } else {
        chrome.tabs.create({ url });
      }
    });
  });

  if (onDelete) {
    bindDeleteButtons(container, onDelete);
  }
}

export function bindDeleteButtons(container, onDelete) {
  container.querySelectorAll('.delete-btn').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const id = button.dataset.id;
      const confirmed = window.confirm('Delete this item from Recall? This cannot be undone.');
      if (!confirmed) {
        return;
      }
      button.disabled = true;
      await onDelete(id, button);
    });
  });
}

export function renderSuggestionChips(queries, { onSelect } = {}) {
  if (!queries?.length) {
    return '';
  }

  return `
    <div class="suggestion-chips">
      ${queries.map((query) => `<button type="button" class="suggestion-chip" data-query="${escapeHtml(query)}">${escapeHtml(query)}</button>`).join('')}
    </div>
  `;
}

export function bindSuggestionChips(container, onSelect) {
  container.querySelectorAll('.suggestion-chip').forEach((chip) => {
    chip.addEventListener('click', () => onSelect(chip.dataset.query));
  });
}
