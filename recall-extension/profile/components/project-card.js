import { escapeHtml } from '../profile-utils.js';

export function renderProjectCard(project, { onEdit, onDelete, onMoveUp, onMoveDown, isFirst, isLast }) {
  const card = document.createElement('article');
  card.className = 'project-card';
  card.dataset.projectId = project.id;

  const tech = (project.tech_stack || [])
    .map((item) => `<span class="tag-chip static">${escapeHtml(item)}</span>`)
    .join('');

  const bullets = (project.impact_bullets || [])
    .slice(0, 3)
    .map((bullet) => `<li>${escapeHtml(bullet)}</li>`)
    .join('');

  const featured = project.is_featured ? '<span class="badge">Featured</span>' : '';

  card.innerHTML = `
    <div class="project-card-header">
      <div>
        <h3>${escapeHtml(project.name)} ${featured}</h3>
        ${project.tagline ? `<p class="project-tagline">${escapeHtml(project.tagline)}</p>` : ''}
      </div>
      <div class="project-card-actions">
        <button type="button" class="icon-btn move-up-btn" title="Move up" ${isFirst ? 'disabled' : ''}>↑</button>
        <button type="button" class="icon-btn move-down-btn" title="Move down" ${isLast ? 'disabled' : ''}>↓</button>
        <button type="button" class="text-btn edit-btn">Edit</button>
        <button type="button" class="text-btn danger delete-btn">Delete</button>
      </div>
    </div>
    ${tech ? `<div class="project-tech">${tech}</div>` : ''}
    ${bullets ? `<ul class="project-bullets">${bullets}</ul>` : ''}
    ${project.has_embedding ? '' : '<p class="project-embed-hint">Embedding pending…</p>'}
  `;

  card.querySelector('.edit-btn').addEventListener('click', () => onEdit?.(project));
  card.querySelector('.delete-btn').addEventListener('click', () => onDelete?.(project));
  card.querySelector('.move-up-btn').addEventListener('click', () => onMoveUp?.(project));
  card.querySelector('.move-down-btn').addEventListener('click', () => onMoveDown?.(project));

  return card;
}
