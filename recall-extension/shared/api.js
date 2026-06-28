import { BUILTIN_API_KEY, BUILTIN_BACKEND_URL } from './defaults.js';

const LOCAL_API_BASE = 'http://127.0.0.1:7878';
const STORAGE_KEYS = {
  backendUrl: 'recallBackendUrl',
  apiKey: 'recallApiKey',
};

function resolveBackendUrl(storedUrl) {
  if (storedUrl) {
    return storedUrl.replace(/\/$/, '');
  }

  if (BUILTIN_BACKEND_URL) {
    return BUILTIN_BACKEND_URL.replace(/\/$/, '');
  }

  return LOCAL_API_BASE;
}

function resolveApiKey(storedKey) {
  if (storedKey) {
    return storedKey;
  }

  return BUILTIN_API_KEY || '';
}

export const API_BASE = BUILTIN_BACKEND_URL || LOCAL_API_BASE;

export async function getExtensionConfig() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return {
      base: resolveBackendUrl(''),
      apiKey: resolveApiKey(''),
    };
  }

  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.backendUrl,
    STORAGE_KEYS.apiKey,
  ]);

  return {
    base: resolveBackendUrl(stored[STORAGE_KEYS.backendUrl]),
    apiKey: resolveApiKey(stored[STORAGE_KEYS.apiKey]),
  };
}

/** Seed Chrome storage from defaults.js on first install (no Settings step). */
export async function ensureDefaultConnection() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }

  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.backendUrl,
    STORAGE_KEYS.apiKey,
    'recallDefaultsSeeded',
  ]);

  if (stored.recallDefaultsSeeded) {
    return;
  }

  const payload = { recallDefaultsSeeded: true };

  if (!stored[STORAGE_KEYS.backendUrl] && BUILTIN_BACKEND_URL) {
    payload[STORAGE_KEYS.backendUrl] = BUILTIN_BACKEND_URL.replace(/\/$/, '');
  }

  if (!stored[STORAGE_KEYS.apiKey] && BUILTIN_API_KEY) {
    payload[STORAGE_KEYS.apiKey] = BUILTIN_API_KEY;
  }

  await chrome.storage.local.set(payload);
}

export async function saveExtensionConfig({ backendUrl, apiKey }) {
  const payload = {};

  if (backendUrl !== undefined) {
    payload[STORAGE_KEYS.backendUrl] = backendUrl.trim().replace(/\/$/, '') || resolveBackendUrl('');
  }

  if (apiKey !== undefined) {
    payload[STORAGE_KEYS.apiKey] = apiKey.trim();
  }

  await chrome.storage.local.set(payload);
}

export async function getConnectionSettings() {
  return getExtensionConfig();
}

export async function loadExtensionConfig() {
  const { base, apiKey } = await getExtensionConfig();
  return {
    backendUrl: base,
    apiKey,
  };
}

async function buildAuthHeaders(apiKey) {
  if (!apiKey) {
    return {};
  }

  return {
    Authorization: `Bearer ${apiKey}`,
  };
}

async function request(path, options = {}) {
  const { signal, ...fetchOptions } = options;
  const { base, apiKey } = await getExtensionConfig();

  const response = await fetch(`${base}${path}`, {
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(await buildAuthHeaders(apiKey)),
      ...options.headers,
    },
    signal,
    ...fetchOptions,
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export function health() {
  return request('/health');
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
  const { base } = await getExtensionConfig();
  const params = new URLSearchParams({ format });
  if (type) params.set('type', type);
  return `${base}/export?${params}`;
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
  const { base, apiKey } = await getExtensionConfig();

  const response = await fetch(`${base}/career/analyze-jd`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: streamBullets ? 'text/event-stream' : 'application/json',
      ...(await buildAuthHeaders(apiKey)),
    },
    body: JSON.stringify({
      jd_text: jdText,
      stream_bullets: streamBullets,
    }),
  });

  if (!response.ok) {
    let data = null;

    try {
      data = await response.json();
    } catch {
      data = null;
    }

    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = data?.code || data?.error;
    error.data = data;
    throw error;
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
  const { base, apiKey } = await getExtensionConfig();
  const format = payload.format || 'json';

  const response = await fetch(`${base}/career/build-resume`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: format === 'json' ? 'application/json' : '*/*',
      ...(await buildAuthHeaders(apiKey)),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let data = null;

    try {
      data = await response.json();
    } catch {
      data = null;
    }

    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = data?.code || data?.error;
    error.data = data;
    throw error;
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
  const { base, apiKey } = await getExtensionConfig();

  const response = await fetch(`${base}/career/generate/cover-letter`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(await buildAuthHeaders(apiKey)),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let data = null;

    try {
      data = await response.json();
    } catch {
      data = null;
    }

    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.code = data?.code || data?.error;
    throw error;
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

export async function authenticatedFetch(path, options = {}) {
  const { base, apiKey } = await getExtensionConfig();

  return fetch(`${base}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(await buildAuthHeaders(apiKey)),
      ...options.headers,
    },
  });
}
