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

  // Prefer hosted builtin over a stale local URL left in chrome.storage.
  if (HOSTED_BACKEND_URL && (!cleaned || isLocalBackendUrl(cleaned))) {
    return HOSTED_BACKEND_URL;
  }

  if (cleaned) {
    return cleaned;
  }

  return LOCAL_API_BASE;
}

export async function getBackendBase() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return resolveBackendUrl('');
  }

  const stored = await chrome.storage.local.get([STORAGE_KEY_BACKEND_URL]);
  return resolveBackendUrl(stored[STORAGE_KEY_BACKEND_URL]);
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

  // Seed hosted URL, and migrate any leftover local backend URL.
  if (!current || isLocalBackendUrl(current)) {
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
