const STORAGE_KEY = 'recallResearchQueue';
const MAX_JOBS = 40;
const COMPLETED_TTL_MS = 2 * 60 * 60 * 1000;

const STEP_LABELS = {
  starting: 'Starting…',
  website_crawl: 'Crawling website…',
  founder_enrichment: 'Enriching founders…',
  ai_analysis: 'Running AI analysis…',
  news_signals: 'Extracting news…',
  embedding: 'Embedding…',
  done: 'Done',
  queued: 'Queued',
  running: 'Running…',
  completed: 'Completed',
  failed: 'Failed',
  needs_review: 'Needs review',
};

export function isResearchTerminal(status) {
  return ['completed', 'failed', 'needs_review', 'done'].includes(status);
}

export function formatResearchProgress(job) {
  const step = job?.step || job?.progress?.step || job?.status || 'queued';
  let text = STEP_LABELS[step] || STEP_LABELS[job?.status] || String(step);

  if (job?.pages_crawled != null) {
    text += ` · ${job.pages_crawled} page(s)`;
  } else if (job?.progress?.pages_crawled != null) {
    text += ` · ${job.progress.pages_crawled} page(s)`;
  }

  if (job?.error) {
    text += ` — ${job.error}`;
  } else if (job?.error_message) {
    text += ` — ${job.error_message}`;
  }

  return text;
}

export async function readResearchQueue() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return [];
  }

  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
}

async function writeResearchQueue(queue) {
  await chrome.storage.local.set({ [STORAGE_KEY]: queue });
}

export async function addResearchJob({ id, companyId, name, url, status = 'queued' }) {
  if (!id) {
    return [];
  }

  const queue = await readResearchQueue();
  const entry = {
    id,
    companyId: companyId || null,
    name: name || 'Startup',
    url: url || '',
    status,
    step: status === 'queued' ? 'queued' : status,
    error: null,
    createdAt: Date.now(),
  };

  const existing = queue.findIndex((job) => job.id === id);
  if (existing >= 0) {
    queue[existing] = { ...queue[existing], ...entry };
  } else {
    queue.unshift(entry);
  }

  const next = queue.slice(0, MAX_JOBS);
  await writeResearchQueue(next);
  return next;
}

export function findActiveResearchJob(queue, { companyId, url } = {}) {
  const normalized = url ? String(url).replace(/\/$/, '') : '';
  return (queue || []).find((job) => {
    if (isResearchTerminal(job.status)) {
      return false;
    }
    if (companyId && job.companyId === companyId) {
      return true;
    }
    if (normalized && String(job.url || '').replace(/\/$/, '') === normalized) {
      return true;
    }
    return false;
  }) || null;
}

export async function syncResearchJobFromRemote(jobId, remote) {
  if (!remote) {
    return readResearchQueue();
  }

  const queue = await readResearchQueue();
  const index = queue.findIndex((job) => job.id === jobId);
  if (index < 0) {
    return queue;
  }

  queue[index] = {
    ...queue[index],
    status: remote.status || queue[index].status,
    step: remote.progress?.step || remote.status || queue[index].step,
    pages_crawled: remote.progress?.pages_crawled ?? queue[index].pages_crawled,
    error: remote.error_message || null,
    name: remote.company_name || queue[index].name,
  };

  const now = Date.now();
  const pruned = queue.filter((job) => {
    if (!isResearchTerminal(job.status)) {
      return true;
    }
    return now - (job.createdAt || 0) <= COMPLETED_TTL_MS;
  });

  await writeResearchQueue(pruned);
  return pruned;
}
