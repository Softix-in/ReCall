import { getBackendBase } from './config.js';

const ALL_WEB_ORIGINS = ['http://*/*', 'https://*/*'];

export async function ensureBackendHostPermission() {
  if (typeof chrome === 'undefined' || !chrome.permissions?.request) {
    return true;
  }

  try {
    const base = await getBackendBase();
    const origin = `${new URL(base).origin}/*`;
    const have = await chrome.permissions.contains({ origins: [origin] });
    if (have) {
      return true;
    }
    return chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}

export async function ensureCaptureHostPermission() {
  if (typeof chrome === 'undefined' || !chrome.permissions?.request) {
    return true;
  }

  const have = await chrome.permissions.contains({ origins: ALL_WEB_ORIGINS });
  if (have) {
    return true;
  }

  return chrome.permissions.request({ origins: ALL_WEB_ORIGINS });
}
