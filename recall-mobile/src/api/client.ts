import { getApiBaseUrl } from '../config';
import { ApiError, AuthError, mapHttpError, userFacingMessage } from './errors';

export { ApiError, AuthError, userFacingMessage };

export const PUBLIC_PATHS = new Set([
  '/health',
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/verify-email',
  '/auth/reset-password',
  '/auth/confirm-email-change',
]);

const REQUEST_TIMEOUT_MS = 20_000;

export type AuthHooks = {
  getAccessToken: () => Promise<string | null>;
  refresh: () => Promise<void>;
  onAuthFailure: () => Promise<void>;
};

let authHooks: AuthHooks | null = null;

export function configureClientAuth(hooks: AuthHooks | null): void {
  authHooks = hooks;
}

export type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  skipAuth?: boolean;
};

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.has(path.split('?')[0]);
}

async function parseJsonSafe(response: Response): Promise<Record<string, unknown> | null> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function timeoutError(): ApiError {
  return new ApiError('The request timed out. Check your connection and retry.', { status: 0, code: 'timeout' });
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
  { retryOn401 = true }: { retryOn401?: boolean } = {},
): Promise<T> {
  const { signal: userSignal, skipAuth = false, method = 'GET', headers: extraHeaders, body } = options;
  const needsAuth = !skipAuth && !isPublicPath(path);
  const accessToken = needsAuth && authHooks ? await authHooks.getAccessToken() : null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const onUserAbort = () => controller.abort();
  if (userSignal) {
    if (userSignal.aborted) {
      controller.abort();
    } else {
      userSignal.addEventListener('abort', onUserAbort);
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...extraHeaders,
  };

  let response: Response;

  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    userSignal?.removeEventListener('abort', onUserAbort);

    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof Error && (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'))) {
      throw timeoutError();
    }

    throw new ApiError(userFacingMessage(error), { status: 0, code: 'network' });
  }

  clearTimeout(timeout);
  userSignal?.removeEventListener('abort', onUserAbort);

  const data = await parseJsonSafe(response);

  if (response.status === 401 && needsAuth && retryOn401 && authHooks) {
    try {
      await authHooks.refresh();
    } catch (error) {
      if (error instanceof ApiError && (error.status === 429 || error.code === 'rate_limited')) {
        throw error;
      }
      await authHooks.onAuthFailure();
      throw new AuthError('Session expired — sign in again', { status: 401, code: 'auth_required' });
    }

    return request<T>(path, options, { retryOn401: false });
  }

  if (!response.ok) {
    const payload = data as { error?: string; message?: string; code?: string; existingId?: string } | null;
    throw mapHttpError(payload, response.status);
  }

  if (data === null && response.status !== 204) {
    throw new ApiError('The server returned an unreadable response.', { status: response.status, code: 'invalid_json' });
  }

  return data as T;
}

export function health() {
  return request<{ ok: boolean; version?: string }>('/health', { skipAuth: true });
}
