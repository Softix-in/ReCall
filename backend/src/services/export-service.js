const itemsDb = require('../db/items');

const SOURCE_TYPE_LABELS = {
  video: 'Video',
  article: 'Article',
  'social-post': 'Social post',
  link: 'Link',
  'yc-startup': 'YC Startup',
  pdf: 'PDF',
};

function formatDateIso(ms) {
  if (!ms) return '';
  return new Date(ms).toISOString().slice(0, 10);
}

function tagsArray(item) {
  if (!item.tags) return [];
  return item.tags.split(',').map((t) => t.trim()).filter(Boolean);
}

function toMarkdown(items) {
  const lines = [
    '# Recall export',
    '',
    `Exported ${items.length} item(s) on ${new Date().toISOString().slice(0, 10)}`,
    '',
    '---',
    '',
  ];

  for (const item of items) {
    const tags = tagsArray(item);
    lines.push(`## ${item.title || item.url}`);
    lines.push('');
    lines.push(`- **URL:** ${item.url}`);
    lines.push(`- **Type:** ${SOURCE_TYPE_LABELS[item.source_type] || item.source_type}`);
    lines.push(`- **Saved:** ${formatDateIso(item.created_at)}`);
    lines.push(`- **Domain:** ${item.domain || ''}`);
    if (tags.length) {
      lines.push(`- **Tags:** ${tags.join(', ')}`);
    }
    if (item.note) {
      lines.push('');
      lines.push(`> ${item.note.replace(/\n/g, '\n> ')}`);
    }
    if (item.summary) {
      lines.push('');
      lines.push(item.summary);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

function toJson(items) {
  const rows = items.map((item) => ({
    id: item.id,
    url: item.url,
    title: item.title,
    summary: item.summary,
    note: item.note,
    source_type: item.source_type,
    save_mode: item.save_mode,
    domain: item.domain,
    tags: tagsArray(item),
    created_at: item.created_at ? new Date(item.created_at).toISOString() : null,
    processed_at: item.processed_at ? new Date(item.processed_at).toISOString() : null,
  }));

  return JSON.stringify({ exported_at: new Date().toISOString(), count: rows.length, items: rows }, null, 2);
}

async function exportItems(userId, { format = 'json', type = null } = {}) {
  let items = await itemsDb.listDoneItems(userId, { limit: 10_000 });

  if (type) {
    items = items.filter((item) => item.source_type === type);
  }

  const dateStr = new Date().toISOString().slice(0, 10);

  if (format === 'markdown') {
    return {
      content: toMarkdown(items),
      filename: `recall-export-${dateStr}.md`,
      contentType: 'text/markdown; charset=utf-8',
    };
  }

  return {
    content: toJson(items),
    filename: `recall-export-${dateStr}.json`,
    contentType: 'application/json; charset=utf-8',
  };
}

module.exports = { exportItems };
