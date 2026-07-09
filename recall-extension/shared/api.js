import {
  AuthError,
  clearSession,
  ensureValidAccessToken,
  getAuthHeaders,
  isAuthError,
  refreshTokens,
} from './auth.js';
import {
  ensureDefaultConnection,
  getBackendBase,
  getExtensionConfig,
  getConnectionSettings,
  loadExtensionConfig,
  saveExtensionConfig,
} from './config.js';

export {
  AuthError,
  isAuthError,
  ensureDefaultConnection,
  getExtensionConfig,
  loadExtensionConfig,
  saveExtensionConfig,
  getBackendBase,
  getConnectionSettings,
};

const PUBLIC_PATHS = new Set([
  '/health',
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/verify-email',
  '/auth/reset-password',
  '/auth/confirm-email-change',
]);

function isPublicPath(path) {
  const normalized = path.split('?')[0];
  return PUBLIC_PATHS.has(normalized);
}

async function parseResponse(response) {
  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return data;
}

function buildRequestError(data, status) {
  const error = new Error(data?.error || data?.message || `Request failed (${status})`);
  error.status = status;
  error.code = data?.code || data?.error;
  error.data = data;

  if (status === 401 || (status === 403 && data?.error === 'email_not_verified')) {
    const authError = new AuthError(error.message, { status, code: data?.error || error.code });
    authError.data = data;
    return authError;
  }

  return error;
}

async function request(path, options = {}, { retryOn401 = true } = {}) {
  const { signal, skipAuth = false, ...fetchOptions } = options;
  const base = await getBackendBase();
  const needsAuth = !skipAuth && !isPublicPath(path);

  if (needsAuth) {
    await ensureValidAccessToken();
  }

  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(needsAuth ? await getAuthHeaders() : {}),
    ...options.headers,
  };

  const response = await fetch(`${base}${path}`, {
    signal,
    ...fetchOptions,
    headers,
  });

  let data = await parseResponse(response);

  if (response.status === 401 && needsAuth && retryOn401) {
    try {
      await refreshTokens();
    } catch {
      await clearSession();
      throw new AuthError('Session expired — sign in again', { status: 401, code: 'auth_required' });
    }

    return request(path, options, { retryOn401: false });
  }

  if (!response.ok) {
    throw buildRequestError(data, response.status);
  }

  return data;
}

async function authenticatedFetch(path, options = {}, { retryOn401 = true } = {}) {
  const base = await getBackendBase();
  await ensureValidAccessToken();

  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      Accept: options.headers?.Accept || 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(await getAuthHeaders()),
      ...options.headers,
    },
  });

  if (response.status === 401 && retryOn401) {
    try {
      await refreshTokens();
    } catch {
      await clearSession();
      throw new AuthError('Session expired — sign in again', { status: 401, code: 'auth_required' });
    }

    return authenticatedFetch(path, options, { retryOn401: false });
  }

  return response;
}

export function health() {
  return request('/health', { skipAuth: true });
}

export function capture(payload) {
  return request('/capture', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function saveLink(payload) {
  return request('/link', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getStatus() {
  return request('/status');
}

export function getItemStatus(id) {
  return request(`/status/${id}`);
}

export function getItems(limit = 20) {
  const params = new URLSearchParams({ limit: String(limit) });
  return request(`/items?${params}`);
}

export function getItem(id, { includeTranscript = false } = {}) {
  const params = includeTranscript ? '?include_transcript=1' : '';
  return request(`/items/${id}${params}`);
}

export function getSettings() {
  return request('/settings');
}

export function updateSettings(patch) {
  return request('/settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export function getJobHistory(days = 30, limit = 50) {
  const params = new URLSearchParams({ days: String(days), limit: String(limit) });
  return request(`/jobs/history?${params}`);
}

export function getFailedJobs(limit = 10) {
  const params = new URLSearchParams({ limit: String(limit) });
  return request(`/jobs/failed?${params}`);
}

export function retryItem(id) {
  return request(`/items/${id}/retry`, { method: 'POST' });
}

export function deleteItem(id) {
  return request(`/items/${id}`, { method: 'DELETE' });
}

export function getTestDataCount() {
  return request('/items/test-data/count');
}

export function clearTestData() {
  return request('/items/clear-test-data', { method: 'POST' });
}

export function pauseQueue() {
  return request('/queue/pause', { method: 'POST' });
}

export function resumeQueue() {
  return request('/queue/resume', { method: 'POST' });
}

export function search(query, filters = {}, { signal } = {}) {
  const params = new URLSearchParams({ q: query });

  if (filters.type) {
    params.set('type', filters.type);
  }

  if (filters.mode) {
    params.set('mode', filters.mode);
  }

  if (filters.since) {
    params.set('since', filters.since);
  }

  return request(`/search?${params}`, { signal });
}

export function getSearchRecommendations() {
  return request('/search/recommendations');
}

export function getItemTags(id) {
  return request(`/items/${id}/tags`);
}

export function updateItemTags(id, tags) {
  return request(`/items/${id}/tags`, {
    method: 'PUT',
    body: JSON.stringify({ tags }),
  });
}

export async function getExportUrl(format = 'json', type = null) {
  const base = await getBackendBase();
  const params = new URLSearchParams({ format });
  if (type) params.set('type', type);
  return `${base}/export?${params}`;
}

export async function downloadExport(format = 'json', type = null) {
  const params = new URLSearchParams({ format });
  if (type) params.set('type', type);
  const response = await authenticatedFetch(`/export?${params}`, {
    headers: { Accept: '*/*' },
  });

  if (!response.ok) {
    const data = await parseResponse(response);
    throw buildRequestError(data, response.status);
  }

  return response.blob();
}

export function getAskStatus() {
  return request('/ask/status');
}

export function askLibrary(question, limit = 8) {
  return request('/ask', {
    method: 'POST',
    body: JSON.stringify({ question, limit }),
  });
}

export function fetchProfile() {
  return request('/profile');
}

export function updateProfile(patch) {
  return request('/profile', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export function fetchProjects() {
  return request('/profile/projects');
}

export function createProject(payload) {
  return request('/profile/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateProject(id, payload) {
  return request(`/profile/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteProject(id) {
  return request(`/profile/projects/${id}`, {
    method: 'DELETE',
  });
}

export function reorderProjects(orderedIds) {
  return request('/profile/projects/reorder', {
    method: 'PUT',
    body: JSON.stringify({ ordered_ids: orderedIds }),
  });
}

export function fetchMasterResume() {
  return request('/profile/resume');
}

export function saveMasterResume(payload) {
  return request('/profile/resume', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchResumeHistory() {
  return request('/profile/resume/history');
}

export function updateProfileAiSettings(patch) {
  return request('/profile/ai-settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });
}

export function testAiSettings(payload = {}) {
  return request('/profile/ai-settings/test', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function careerChat(messages) {
  return request('/career/chat', {
    method: 'POST',
    body: JSON.stringify({ messages }),
  });
}

export function listJdAnalyses() {
  return request('/career/analyses');
}

export function getJdAnalysis(id) {
  return request(`/career/analyses/${id}`);
}

export async function analyzeJd(jdText, { onEvent, streamBullets = true } = {}) {
  const response = await authenticatedFetch('/career/analyze-jd', {
    method: 'POST',
    headers: {
      Accept: streamBullets ? 'text/event-stream' : 'application/json',
    },
    body: JSON.stringify({
      jd_text: jdText,
      stream_bullets: streamBullets,
    }),
  });

  if (!response.ok) {
    const data = await parseResponse(response);
    throw buildRequestError(data, response.status);
  }

  if (!streamBullets) {
    return response.json();
  }

  if (!response.body) {
    throw new Error('Streaming response not supported');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalAnalysis = null;

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const line = part.trim();

      if (!line.startsWith('data:')) {
        continue;
      }

      const payload = line.slice(5).trim();

      if (!payload || payload === '[DONE]') {
        continue;
      }

      const event = JSON.parse(payload);
      onEvent?.(event);

      if (event.type === 'error') {
        const error = new Error(event.message || event.error || 'JD analysis failed');
        error.status = event.error === 'invalid_api_key' ? 401 : 500;
        error.code = event.error;
        error.data = event;
        throw error;
      }

      if (event.type === 'done') {
        finalAnalysis = event.analysis;
      }
    }
  }

  return { analysis: finalAnalysis };
}

export async function buildResume(payload) {
  const format = payload.format || 'json';

  const response = await authenticatedFetch('/career/build-resume', {
    method: 'POST',
    headers: {
      Accept: format === 'json' ? 'application/json' : '*/*',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await parseResponse(response);
    throw buildRequestError(data, response.status);
  }

  const resume_id = response.headers.get('X-Resume-Id');

  if (format === 'pdf') {
    return {
      blob: await response.blob(),
      resume_id,
    };
  }

  if (format === 'text') {
    return {
      plain_text: await response.text(),
      resume_id,
    };
  }

  const data = await response.json();
  return { ...data, resume_id: data.resume_id || resume_id };
}

export function fetchResumeById(id) {
  return request(`/profile/resume/${id}`);
}

export function generateBio(payload = {}) {
  return request('/career/generate/bio', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function generatePitch(payload = {}) {
  return request('/career/generate/pitch', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function generateCoverLetter(payload = {}, { onToken } = {}) {
  const response = await authenticatedFetch('/career/generate/cover-letter', {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await parseResponse(response);
    throw buildRequestError(data, response.status);
  }

  if (!response.body) {
    throw new Error('Streaming response not supported');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const line = part.trim();

      if (!line.startsWith('data:')) {
        continue;
      }

      const payloadText = line.slice(5).trim();

      if (!payloadText || payloadText === '[DONE]') {
        continue;
      }

      const event = JSON.parse(payloadText);
      const token = event.text || '';
      fullText += token;
      onToken?.(token, fullText);
    }
  }

  return { text: fullText };
}

export { authenticatedFetch };
