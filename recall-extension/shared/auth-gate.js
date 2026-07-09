import { getMe, isAuthenticated } from './auth.js';

const LOGIN_PAGE = 'auth/login.html';

export function getLoginUrl() {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(LOGIN_PAGE);
  }

  return `../${LOGIN_PAGE}`;
}

function extensionUrl(path) {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }

  return `../${path}`;
}

export function openLoginPage() {
  window.location.replace(getLoginUrl());
}

export function openSettingsPage() {
  window.location.replace(extensionUrl('settings/settings.html'));
}

export async function requireAuth({ allowUnverified = false } = {}) {
  if (!(await isAuthenticated())) {
    openLoginPage();
    return false;
  }

  if (!allowUnverified) {
    try {
      const user = await getMe();

      if (!user?.email_verified) {
        openSettingsPage();
        return false;
      }
    } catch (error) {
      if (error?.status === 401 || error?.code === 'auth_required') {
        openLoginPage();
        return false;
      }
      // Transient network errors — allow popup to render with offline state.
    }
  }

  return true;
}

export async function redirectIfAuthenticated(target = 'popup/popup.html') {
  if (!(await isAuthenticated())) {
    return false;
  }

  window.location.replace(extensionUrl(target));
  return true;
}
