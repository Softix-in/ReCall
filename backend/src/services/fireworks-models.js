const QUALITY_MODELS = [
  'accounts/fireworks/models/deepseek-v4-flash-0731',
  'accounts/fireworks/models/deepseek-v4-flash',
  'accounts/fireworks/models/deepseek-v4-pro',
  'accounts/fireworks/models/minimax-m3',
  'accounts/fireworks/models/minimax-m2p7',
  'accounts/fireworks/models/qwen3p7-plus',
  'accounts/fireworks/models/glm-5p2',
  'accounts/fireworks/models/gpt-oss-120b',
];

const CHAT_MODELS = [
  'accounts/fireworks/models/kimi-k2p6',
  'accounts/fireworks/models/kimi-k3',
  'accounts/fireworks/models/kimi-k2p7-code',
  'accounts/fireworks/routers/kimi-k2p6-turbo',
  'accounts/fireworks/routers/kimi-k3-fast',
  'accounts/fireworks/models/minimax-m3',
  'accounts/fireworks/models/glm-5p2',
];

const REASONING_MODELS = [
  'accounts/fireworks/models/deepseek-v4-flash-0731',
  'accounts/fireworks/models/deepseek-v4-pro',
  'accounts/fireworks/models/glm-5p2',
  'accounts/fireworks/routers/glm-5p2-fast',
  'accounts/fireworks/models/kimi-k3',
  'accounts/fireworks/models/minimax-m3',
];

const MODEL_ID_RE = /^accounts\/fireworks\/(models|routers)\/[a-zA-Z0-9._-]{1,80}$/;

function isAllowedModel(modelId, list) {
  if (!modelId) {
    return true;
  }

  const trimmed = String(modelId).trim();
  if (!MODEL_ID_RE.test(trimmed)) {
    return false;
  }

  return list.includes(trimmed);
}

function sanitizeModelId(modelId, list) {
  if (modelId == null || modelId === '') {
    return null;
  }

  const trimmed = String(modelId).trim();
  if (!isAllowedModel(trimmed, list)) {
    const error = new Error('Model is not in the allowed Fireworks list');
    error.status = 400;
    error.code = 'invalid_model';
    throw error;
  }

  return trimmed;
}

module.exports = {
  QUALITY_MODELS,
  CHAT_MODELS,
  REASONING_MODELS,
  isAllowedModel,
  sanitizeModelId,
};
