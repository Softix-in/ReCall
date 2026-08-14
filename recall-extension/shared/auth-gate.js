import { getMe, getSession, isAuthenticated } from './auth.js';

const LOGIN_PAGE = 'auth/login.html';
const POPUP_PAGE = 'popup/popup.html';
const CRAMPED_WIDTH = 480;

export function getLoginUrl() {
  return extensionUrl(LOGIN_PAGE);
}

function extensionUrl(path) {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }

  return `../${path}`;
}

export function isToolbarPopupPage() {
  return /\/popup\/popup\.html$/i.test((window.location.pathname || '').replace(/\\/g, '/'));
}

export function isCrampedExtensionWindow() {
  return document.documentElement.clientWidth > 0
    && document.documentElement.clientWidth <= CRAMPED_WIDTH;
}

export function openExtensionTab(pathOrUrl) {
  const url = /^https?:|^chrome-extension:/i.test(pathOrUrl)
    ? pathOrUrl
    : extensionUrl(pathOrUrl);

  if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
    chrome.tabs.create({ url });
    return;
  }

  window.open(url, '_blank', 'noopener');
}

function restoreToolbarPopup() {
  window.location.replace(extensionUrl(POPUP_PAGE));
}

/**
 * Full app pages (home, YC board, search, …) must not render inside the
 * 380px toolbar popup. Restore the compact popup, optionally moving this
 * page into a real tab first.
 * @returns {boolean} true if the caller should abort page init
 */
export function ejectFullPageFromPopup({ openTab = true } = {}) {
  if (isToolbarPopupPage() || !isCrampedExtensionWindow()) {
    return false;
  }

  if (openTab) {
    openExtensionTab(window.location.href);
  }

  restoreToolbarPopup();
  return true;
}

export function openLoginPage() {
  const url = getLoginUrl();

  if (isToolbarPopupPage() || isCrampedExtensionWindow()) {
    openExtensionTab(url);
    return;
  }

  window.location.replace(url);
}

export function openSettingsPage() {
  if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
    chrome.runtime.openOptionsPage();
    return;
  }

  window.location.replace(extensionUrl('settings/settings.html'));
}

export function continueAfterLogin() {
  const homeUrl = extensionUrl('home/home.html');

  if (isCrampedExtensionWindow()) {
    openExtensionTab(homeUrl);
    window.close();
    return;
  }

  window.location.replace(homeUrl);
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

      if (!allowUnverified) {
        const session = await getSession();
        if (session.user && session.user.email_verified === false) {
          openSettingsPage();
          return false;
        }
      }
    }
  }

  return true;
}

export async function redirectIfAuthenticated(target = 'home/home.html') {
  if (!(await isAuthenticated())) {
    return false;
  }

  if (isToolbarPopupPage() || isCrampedExtensionWindow()) {
    continueAfterLogin();
    return true;
  }

  window.location.replace(extensionUrl(target));
  return true;
}
