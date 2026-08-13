const BINARY_URL_RE = /\.(exe|dmg|msi|pkg|zip|gz|tgz|rar|7z|deb|rpm|apk|ipa|iso|img|bin|dll|so|dylib|appimage)(\?|#|$)/i;
const RELEASE_DOWNLOAD_RE = /\/releases\/download\//i;
const ASSET_DOWNLOAD_RE = /\/download\/|\.s3[.-]|cloudfront\.net\/.*\.(exe|zip|dmg)/i;

const BOGUS_NAME_RE = /\b(download|install|windows|macos|linux|detected|click here|sign up|log in|get started|learn more|privacy|terms|cookies?|subscribe|newsletter|pricing|docs?|documentation|github|linkedin|twitter|follow us|try (it )?free|open source)\b/i;
const BRACKET_TAG_RE = /\[[^\]]+\]/;

function isBinaryOrDownloadUrl(url) {
  if (!url || typeof url !== 'string') return true;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/i.test(parsed.protocol)) return true;
    const href = parsed.href;
    return BINARY_URL_RE.test(href)
      || RELEASE_DOWNLOAD_RE.test(href)
      || ASSET_DOWNLOAD_RE.test(href);
  } catch {
    return true;
  }
}

function isLoginWalledUrl(url) {
  return /linkedin\.com|twitter\.com|x\.com/i.test(url || '');
}

function isSafeHttpUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (!/^https?:$/i.test(parsed.protocol)) return false;
    if (parsed.username || parsed.password) return false;
    return !isBinaryOrDownloadUrl(url);
  } catch {
    return false;
  }
}

function looksLikePersonName(name) {
  const cleaned = String(name || '').trim().replace(/\s+/g, ' ');
  if (cleaned.length < 2 || cleaned.length > 80) return false;
  if (BOGUS_NAME_RE.test(cleaned)) return false;
  if (BRACKET_TAG_RE.test(cleaned)) return false;
  if (/https?:\/\//i.test(cleaned) || /@/.test(cleaned)) return false;
  if (/\d{3,}/.test(cleaned)) return false;

  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length < 1 || parts.length > 5) return false;

  // Prefer letter-heavy tokens (allow initials like "J.")
  const personLike = parts.every((part) => /^[A-Za-z][A-Za-z.'’-]*$/.test(part));
  return personLike;
}

function sanitizeProfileUrl(url, { allowLoginWalled = true } = {}) {
  const value = emptyToNull(url);
  if (!value) return null;
  if (!isSafeHttpUrl(value) && !(allowLoginWalled && isLoginWalledUrl(value))) return null;
  if (isBinaryOrDownloadUrl(value)) return null;
  return value;
}

function emptyToNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || /^unknown|n\/a|none|not (found|available)|null$/i.test(s)) return null;
  return s;
}

function sanitizeFounderInput(input = {}) {
  const fullName = emptyToNull(input.full_name || input.name);
  if (!fullName || !looksLikePersonName(fullName)) return null;

  return {
    full_name: fullName,
    current_role: emptyToNull(input.current_role || input.role),
    linkedin_url: sanitizeProfileUrl(input.linkedin_url, { allowLoginWalled: true }),
    twitter_url: sanitizeProfileUrl(input.twitter_url, { allowLoginWalled: true }),
    github_url: sanitizeProfileUrl(input.github_url, { allowLoginWalled: false }),
    personal_website: sanitizeProfileUrl(input.personal_website, { allowLoginWalled: false }),
  };
}

function truncateText(text, max = 12_000) {
  if (!text) return '';
  const cleaned = String(text).replace(/\s+/g, ' ').trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

const MAX_SCRAPE_MARKDOWN_CHARS = 40_000;

module.exports = {
  BINARY_URL_RE,
  isBinaryOrDownloadUrl,
  isLoginWalledUrl,
  isSafeHttpUrl,
  looksLikePersonName,
  sanitizeProfileUrl,
  sanitizeFounderInput,
  emptyToNull,
  truncateText,
  MAX_SCRAPE_MARKDOWN_CHARS,
};
