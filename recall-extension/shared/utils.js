export function formatTimeAgo(timestamp) {
  if (!timestamp) {
    return 'just now';
  }

  const ms = typeof timestamp === 'number' ? timestamp : Date.parse(timestamp);
  const diff = Date.now() - ms;

  if (Number.isNaN(diff) || diff < 0) {
    return 'just now';
  }

  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) {
    return 'just now';
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 30) {
    return `${days}d ago`;
  }

  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function sourceTypeLabel(type) {
  switch (type) {
    case 'video':
      return 'Video';
    case 'article':
      return 'Article';
    case 'audio':
      return 'Audio';
    case 'link':
      return 'Link';
    case 'yc-startup':
      return 'YC Startup';
    case 'social-post':
      return 'Social';
    case 'pdf':
      return 'PDF';
    default:
      return type || 'Link';
  }
}

export function sourceTypeIcon(type) {
  switch (type) {
    case 'video':
      return '▶';
    case 'article':
      return '¶';
    case 'audio':
      return '♪';
    case 'yc-startup':
      return '◎';
    default:
      return '🔗';
  }
}

export function processingLabel(status) {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'processing':
      return 'Processing';
    case 'done':
      return 'Done';
    case 'failed':
      return 'Failed';
    default:
      return status || 'Unknown';
  }
}

export function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isAutomatedTestJob(job) {
  const url = job?.url || '';

  if (!url.includes('example.com') && !url.includes('benchmark.recall.local')) {
    return false;
  }

  return /phase\d|fail-job-test|recall-phase|benchmark\.recall/i.test(url);
}

export function friendlyCaptureError(message) {
  if (!message) {
    return 'Cannot capture this page';
  }

  if (message.includes('Receiving end does not exist')) {
    return 'Refresh the page, then open Recall again.';
  }

  if (message.includes('Cannot access a chrome:// URL')) {
    return 'Open a normal website tab first, then open Recall.';
  }

  return message;
}

export function truncate(text, max = 120) {
  if (!text) {
    return '';
  }

  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, max - 1)}…`;
}
