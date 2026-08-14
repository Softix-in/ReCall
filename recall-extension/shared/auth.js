import { getBackendBase } from './config.js';

export const AUTH_STORAGE_KEYS = {
  accessToken: 'recallAccessToken',
  refreshToken: 'recallRefreshToken',
  user: 'recallUser',
  tokenExpiresAt: 'recallTokenExpiresAt',
};

const DEVICE = 'chrome-extension';
const REFRESH_LOCK_KEY = 'recallRefreshLock';
const REFRESH_BACKOFF_KEY = 'recallRefreshBackoffUntil';
const REFRESH_LOCK_MS = 10_000;

export class AuthError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.code = code;
  }
}

let refreshPromise = null;
const listeners = new Set();

function notifyAuthStateChanged() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  }
}

export function onAuthStateChanged(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');

  if (parts.length < 2) {
    return null;
  }

  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getTokenExpiresAt(accessToken) {
  const payload = decodeJwtPayload(accessToken);
  return payload?.exp ? Number(payload.exp) : null;
}

async function readAuthStorage() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return {
      accessToken: null,
      refreshToken: null,
      user: null,
      tokenExpiresAt: null,
    };
  }

  const stored = await chrome.storage.local.get(Object.values(AUTH_STORAGE_KEYS));

  return {
    accessToken: stored[AUTH_STORAGE_KEYS.accessToken] || null,
    refreshToken: stored[AUTH_STORAGE_KEYS.refreshToken] || null,
    user: stored[AUTH_STORAGE_KEYS.user] || null,
    tokenExpiresAt: stored[AUTH_STORAGE_KEYS.tokenExpiresAt] || null,
  };
}

async function writeSession({ access_token, refresh_token, user }) {
  const expiresAt = getTokenExpiresAt(access_token);
  const payload = {
    [AUTH_STORAGE_KEYS.accessToken]: access_token,
    [AUTH_STORAGE_KEYS.refreshToken]: refresh_token,
    [AUTH_STORAGE_KEYS.user]: user,
    [AUTH_STORAGE_KEYS.tokenExpiresAt]: expiresAt,
  };

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set(payload);
    await chrome.storage.local.remove([REFRESH_LOCK_KEY, REFRESH_BACKOFF_KEY]);
  }

  notifyAuthStateChanged();
  return { accessToken: access_token, refreshToken: refresh_token, user, expiresAt };
}

export async function clearSession() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.remove([
      ...Object.values(AUTH_STORAGE_KEYS),
      REFRESH_LOCK_KEY,
    ]);
  }

  notifyAuthStateChanged();
}

export async function getSession() {
  const session = await readAuthStorage();
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    user: session.user,
    expiresAt: session.tokenExpiresAt,
  };
}

function isAccessTokenValid(accessToken, expiresAt) {
  if (!accessToken) {
    return false;
  }

  const exp = expiresAt || getTokenExpiresAt(accessToken);

  if (!exp) {
    return true;
  }

  return exp - Math.floor(Date.now() / 1000) > 0;
}

function toPublicSession(session) {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    user: session.user,
    expiresAt: session.tokenExpiresAt ?? session.expiresAt ?? null,
  };
}

async function readValidSession() {
  const session = await readAuthStorage();
  if (session.accessToken && isAccessTokenValid(session.accessToken, session.tokenExpiresAt)) {
    return toPublicSession(session);
  }
  return null;
}

function isServiceWorkerContext() {
  return typeof ServiceWorkerGlobalScope !== 'undefined'
    && typeof self !== 'undefined'
    && self instanceof ServiceWorkerGlobalScope;
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getBackoffUntil() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return 0;
  }
  const stored = await chrome.storage.local.get(REFRESH_BACKOFF_KEY);
  return Number(stored[REFRESH_BACKOFF_KEY] || 0);
}

export async function isRefreshBackoffActive() {
  return Date.now() < await getBackoffUntil();
}

async function setRefreshBackoff(ms) {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }
  await chrome.storage.local.set({ [REFRESH_BACKOFF_KEY]: Date.now() + ms });
}

function rateLimitedError() {
  return new AuthError('Session refresh delayed — wait a moment and reload', {
    status: 429,
    code: 'rate_limited',
  });
}

export async function isAuthenticated() {
  const session = await readAuthStorage();

  if (isAccessTokenValid(session.accessToken, session.tokenExpiresAt)) {
    return true;
  }

  return Boolean(session.refreshToken);
}

async function authRequest(path, { method = 'POST', body } = {}) {
  const base = await getBackendBase();
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new AuthError(data?.error || `Auth request failed (${response.status})`, {
      status: response.status,
      code: data?.error,
    });
  }

  return data;
}

export async function login(email, password) {
  const data = await authRequest('/auth/login', {
    body: { email, password, device: DEVICE },
  });

  return writeSession(data);
}

export async function register(email, password) {
  const data = await authRequest('/auth/register', {
    body: { email, password, device: DEVICE },
  });

  const session = await writeSession(data);

  return { ...session, message: data.message };
}

export async function forgotPassword(email) {
  return authRequest('/auth/forgot-password', { body: { email } });
}

export async function resetPassword(token, newPassword) {
  return authRequest('/auth/reset-password', {
    body: { token, new_password: newPassword },
  });
}

export async function resendVerification() {
  const headers = await getAuthHeaders();
  const base = await getBackendBase();
  const response = await fetch(`${base}/auth/resend-verification`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
  });
  const data = await response.json();

  if (!response.ok) {
    throw new AuthError(data?.error || 'Failed to resend verification', { status: response.status });
  }

  return data;
}

export async function changePassword(currentPassword, newPassword) {
  const headers = await getAuthHeaders();
  const base = await getBackendBase();
  const response = await fetch(`${base}/auth/change-password`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new AuthError(data?.error || 'Failed to change password', { status: response.status });
  }

  if (data.user) {
    await chrome.storage.local.set({ [AUTH_STORAGE_KEYS.user]: data.user });
    notifyAuthStateChanged();
  }

  return data;
}

export async function changeEmail(newEmail, currentPassword) {
  const headers = await getAuthHeaders();
  const base = await getBackendBase();
  const response = await fetch(`${base}/auth/change-email`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ new_email: newEmail, current_password: currentPassword }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new AuthError(data?.error || 'Failed to change email', { status: response.status });
  }

  if (data.pending_email) {
    const session = await getSession();
    await chrome.storage.local.set({
      [AUTH_STORAGE_KEYS.user]: { ...session.user, pending_email: data.pending_email },
    });
    notifyAuthStateChanged();
  }

  return data;
}

async function acquireRefreshLock() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return { owner: null };
  }

  const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const valid = await readValidSession();
    if (valid) {
      return { owner: null, session: valid };
    }

    const stored = await chrome.storage.local.get(REFRESH_LOCK_KEY);
    const lock = stored[REFRESH_LOCK_KEY];
    const until = Number(lock?.until || 0);

    if (until > Date.now() && lock?.owner && lock.owner !== owner) {
      await wait(Math.min(until - Date.now() + 20, 400));
      continue;
    }

    await chrome.storage.local.set({
      [REFRESH_LOCK_KEY]: { owner, until: Date.now() + REFRESH_LOCK_MS },
    });

    const check = await chrome.storage.local.get(REFRESH_LOCK_KEY);
    if (check[REFRESH_LOCK_KEY]?.owner === owner) {
      return { owner };
    }

    await wait(40 + Math.random() * 80);
  }

  return { owner };
}

async function releaseRefreshLock(lock) {
  if (!lock?.owner || typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }

  const stored = await chrome.storage.local.get(REFRESH_LOCK_KEY);
  if (stored[REFRESH_LOCK_KEY]?.owner === lock.owner) {
    await chrome.storage.local.remove(REFRESH_LOCK_KEY);
  }
}

async function refreshViaServiceWorker() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'REFRESH_SESSION' });

    if (response?.ok) {
      if (response.session?.accessToken) {
        return toPublicSession(response.session);
      }

      const valid = await readValidSession();
      if (valid) {
        return valid;
      }
    }

    if (response && response.ok === false) {
      throw new AuthError(response.error || 'Session expired — sign in again', {
        status: response.status || 401,
        code: response.code || 'auth_required',
      });
    }
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
  }

  return refreshInThisContext();
}

async function refreshInThisContext() {
  const existing = await readValidSession();
  if (existing) {
    return existing;
  }

  if (await isRefreshBackoffActive()) {
    throw rateLimitedError();
  }

  const lock = await acquireRefreshLock();
  if (lock.session) {
    return lock.session;
  }

  try {
    const afterLock = await readValidSession();
    if (afterLock) {
      return afterLock;
    }

    const session = await readAuthStorage();
    if (!session.refreshToken) {
      throw new AuthError('Sign in required', { status: 401, code: 'auth_required' });
    }

    try {
      const data = await authRequest('/auth/refresh', {
        body: {
          refresh_token: session.refreshToken,
          device: DEVICE,
        },
      });
      return writeSession(data);
    } catch (error) {
      if (error?.status === 429) {
        await setRefreshBackoff(60_000);
        throw rateLimitedError();
      }

      if (error?.status === 401) {
        await wait(150);
        const sibling = await readValidSession();
        if (sibling) {
          return sibling;
        }

        await clearSession();
        throw new AuthError('Session expired — sign in again', {
          status: 401,
          code: 'auth_required',
        });
      }

      throw error;
    }
  } finally {
    await releaseRefreshLock(lock);
  }
}

export async function refreshTokens() {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const existing = await readValidSession();
    if (existing) {
      return existing;
    }

    if (await isRefreshBackoffActive()) {
      throw rateLimitedError();
    }

    if (
      !isServiceWorkerContext()
      && typeof chrome !== 'undefined'
      && chrome.runtime?.sendMessage
    ) {
      return refreshViaServiceWorker();
    }

    return refreshInThisContext();
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function ensureValidAccessToken() {
  const session = await readAuthStorage();

  if (session.accessToken && isAccessTokenValid(session.accessToken, session.tokenExpiresAt)) {
    return session.accessToken;
  }

  if (!session.refreshToken) {
    throw new AuthError('Sign in required', { status: 401, code: 'auth_required' });
  }

  const refreshed = await refreshTokens();
  return refreshed.accessToken;
}

export async function getAuthHeaders() {
  const accessToken = await ensureValidAccessToken();

  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function getMe() {
  const headers = await getAuthHeaders();
  const base = await getBackendBase();
  const response = await fetch(`${base}/auth/me`, { headers: { Accept: 'application/json', ...headers } });
  const data = await response.json();

  if (!response.ok) {
    throw new AuthError(data?.error || 'Failed to load account', { status: response.status });
  }

  if (data.user) {
    await chrome.storage.local.set({ [AUTH_STORAGE_KEYS.user]: data.user });
    notifyAuthStateChanged();
  }

  return data.user;
}

export async function logout() {
  const session = await readAuthStorage();

  try {
    if (session.accessToken) {
      const base = await getBackendBase();
      await fetch(`${base}/auth/logout`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          refresh_token: session.refreshToken,
        }),
      });
    }
  } catch {
    // Always clear local session even if server logout fails
  }

  await clearSession();
}

export function isAuthError(error) {
  if (!(error instanceof AuthError || error?.name === 'AuthError')) {
    return false;
  }
  return error.status !== 429 && error.code !== 'rate_limited';
}
