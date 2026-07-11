const VIDEO_HOSTS = [
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)tiktok\.com$/i,
];

const ARTICLE_HOSTS = [
  /(^|\.)medium\.com$/i,
  /(^|\.)substack\.com$/i,
  /(^|\.)dev\.to$/i,
];

const SOCIAL_HOSTS = [
  /(^|\.)twitter\.com$/i,
  /(^|\.)x\.com$/i,
];

function parseHostname(url) {
  return new URL(url).hostname.replace(/^www\./i, '');
}

function matchesHost(hostname, patterns) {
  return patterns.some((pattern) => pattern.test(hostname));
}

function isInstagramReel(url) {
  return /instagram\.com\/reels\//i.test(url);
}

function isTwitterVideoUrl(url) {
  return /(twitter\.com|x\.com)\/.+\/status\//i.test(url) && /\/video\//i.test(url);
}

function isPdfUrl(url) {
  try {
    const u = new URL(url);
    return u.pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

function isYcCompanyUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    return host === 'ycombinator.com' && /^\/companies\/[^/]+\/?$/i.test(u.pathname);
  } catch {
    return false;
  }
}

function classifyUrl(url, metadata = {}) {
  if (isPdfUrl(url)) return 'pdf';

  if (isYcCompanyUrl(url) || metadata.research === true || metadata.trigger_type === 'yc_company_page') {
    return 'yc-startup';
  }

  const hostname = parseHostname(url);
  const ogType = (metadata.og_type || metadata.ogType || '').toLowerCase();
  const hasVideo = Boolean(metadata.has_video ?? metadata.hasVideo);

  // Only trust og:type=video for known video hosts — generic docs/article sites
  // sometimes emit og:type="video" for embedded demo clips.
  const isKnownVideoHost = matchesHost(hostname, VIDEO_HOSTS) || isInstagramReel(url);
  if ((ogType === 'video' || ogType === 'video.other') && isKnownVideoHost) {
    return 'video';
  }

  if (ogType === 'article') {
    return 'article';
  }

  if (matchesHost(hostname, VIDEO_HOSTS) || isInstagramReel(url)) {
    return 'video';
  }

  if (matchesHost(hostname, SOCIAL_HOSTS)) {
    if (hasVideo || isTwitterVideoUrl(url)) {
      return 'video';
    }
    return 'social-post';
  }

  if (matchesHost(hostname, ARTICLE_HOSTS)) {
    return 'article';
  }

  if (hostname.endsWith('github.io') || hostname.includes('blog.')) {
    return 'article';
  }

  return 'link';
}

module.exports = {
  classifyUrl,
  parseHostname,
  isYcCompanyUrl,
};
