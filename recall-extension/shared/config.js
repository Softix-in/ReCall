import { BUILTIN_BACKEND_URL } from './defaults.js';

const LOCAL_API_BASE = 'http://127.0.0.1:7878';
const STORAGE_KEY_BACKEND_URL = 'recallBackendUrl';
const HOSTED_BACKEND_URL = (BUILTIN_BACKEND_URL || '').replace(/\/$/, '');

export const API_BASE = HOSTED_BACKEND_URL || LOCAL_API_BASE;

function isLocalBackendUrl(url) {
  if (!url) return true;
  try {
    const host = new URL(url).hostname;
    return host === '127.0.0.1' || host === 'localhost';
  } catch {
    return /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:|\/|$)/i.test(url);
  }
}

export function resolveBackendUrl(storedUrl) {
  const cleaned = storedUrl ? storedUrl.replace(/\/$/, '') : '';

  if (HOSTED_BACKEND_URL && isStaleBackendUrl(cleaned)) {
    return HOSTED_BACKEND_URL;
  }

  if (cleaned) {
    return cleaned;
  }

  return LOCAL_API_BASE;
}

function isStaleBackendUrl(url) {
  if (!url) {
    return true;
  }

  if (isLocalBackendUrl(url)) {
    return Boolean(HOSTED_BACKEND_URL);
  }

  try {
    const parsed = new URL(url);

    // Old public HTTP on 7878 is closed; the hosted API is HTTPS on 443.
    if (parsed.protocol === 'http:' && parsed.port === '7878') {
      return Boolean(HOSTED_BACKEND_URL);
    }

    if (HOSTED_BACKEND_URL) {
      const hosted = new URL(HOSTED_BACKEND_URL);
      if (parsed.hostname === hosted.hostname && parsed.protocol !== hosted.protocol) {
        return true;
      }
    }
  } catch {
    return true;
  }

  return false;
}

export async function getBackendBase() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return resolveBackendUrl('');
  }

  const stored = await chrome.storage.local.get([STORAGE_KEY_BACKEND_URL]);
  const resolved = resolveBackendUrl(stored[STORAGE_KEY_BACKEND_URL]);
  const current = stored[STORAGE_KEY_BACKEND_URL]
    ? String(stored[STORAGE_KEY_BACKEND_URL]).replace(/\/$/, '')
    : '';

  if (resolved && current !== resolved) {
    await chrome.storage.local.set({
      [STORAGE_KEY_BACKEND_URL]: resolved,
      recallDefaultsSeeded: true,
    });
  }

  return resolved;
}

export async function getExtensionConfig() {
  return { base: await getBackendBase() };
}

export async function ensureDefaultConnection() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }

  if (!HOSTED_BACKEND_URL) {
    return;
  }

  const stored = await chrome.storage.local.get([STORAGE_KEY_BACKEND_URL]);
  const current = stored[STORAGE_KEY_BACKEND_URL]
    ? String(stored[STORAGE_KEY_BACKEND_URL]).replace(/\/$/, '')
    : '';

  if (isStaleBackendUrl(current)) {
    await chrome.storage.local.set({
      [STORAGE_KEY_BACKEND_URL]: HOSTED_BACKEND_URL,
      recallDefaultsSeeded: true,
    });
  }
}

export async function saveExtensionConfig({ backendUrl }) {
  const payload = {};

  if (backendUrl !== undefined) {
    payload[STORAGE_KEY_BACKEND_URL] = backendUrl.trim().replace(/\/$/, '') || resolveBackendUrl('');
  }

  await chrome.storage.local.set(payload);
}

export async function loadExtensionConfig() {
  const { base } = await getExtensionConfig();
  return { backendUrl: base };
}

export async function getConnectionSettings() {
  return getExtensionConfig();
}
