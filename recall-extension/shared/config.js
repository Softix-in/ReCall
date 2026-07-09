import { BUILTIN_BACKEND_URL } from './defaults.js';

const LOCAL_API_BASE = 'http://127.0.0.1:7878';
const STORAGE_KEY_BACKEND_URL = 'recallBackendUrl';

export const API_BASE = BUILTIN_BACKEND_URL || LOCAL_API_BASE;

export function resolveBackendUrl(storedUrl) {
  if (storedUrl) {
    return storedUrl.replace(/\/$/, '');
  }

  if (BUILTIN_BACKEND_URL) {
    return BUILTIN_BACKEND_URL.replace(/\/$/, '');
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

  const stored = await chrome.storage.local.get([
    STORAGE_KEY_BACKEND_URL,
    'recallDefaultsSeeded',
  ]);

  if (stored.recallDefaultsSeeded) {
    return;
  }

  const payload = { recallDefaultsSeeded: true };

  if (!stored[STORAGE_KEY_BACKEND_URL] && BUILTIN_BACKEND_URL) {
    payload[STORAGE_KEY_BACKEND_URL] = BUILTIN_BACKEND_URL.replace(/\/$/, '');
  }

  await chrome.storage.local.set(payload);
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
