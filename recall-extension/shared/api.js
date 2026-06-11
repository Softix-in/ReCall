export const API_BASE = 'http://127.0.0.1:7878';

async function request(path, options = {}) {
  const { signal, ...fetchOptions } = options;

  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
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

export function getExportUrl(format = 'json', type = null) {
  const params = new URLSearchParams({ format });
  if (type) params.set('type', type);
  return `${API_BASE}/export?${params}`;
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
