/**
 * Curated Fireworks serverless models for Recall Settings.
 * IDs follow https://fireworks.ai/models (accounts/fireworks/models/...).
 */

export const DEFAULT_QUALITY_MODEL = 'accounts/fireworks/models/deepseek-v4-flash-0731';
export const DEFAULT_CHAT_MODEL = 'accounts/fireworks/models/kimi-k2p6';
export const DEFAULT_REASONING_MODEL = 'accounts/fireworks/models/deepseek-v4-flash-0731';

/** Quality: JD extract, resume/bio, research analysis */
export const QUALITY_MODELS = [
  { id: 'accounts/fireworks/models/deepseek-v4-flash-0731', label: 'DeepSeek V4 Flash 0731 (default) - fast + JSON' },
  { id: 'accounts/fireworks/models/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
  { id: 'accounts/fireworks/models/deepseek-v4-pro', label: 'DeepSeek V4 Pro - stronger' },
  { id: 'accounts/fireworks/models/minimax-m3', label: 'MiniMax M3 - multimodal (can be overloaded)' },
  { id: 'accounts/fireworks/models/minimax-m2p7', label: 'MiniMax M2.7 - cheaper' },
  { id: 'accounts/fireworks/models/qwen3p7-plus', label: 'Qwen3.7 Plus' },
  { id: 'accounts/fireworks/models/glm-5p2', label: 'GLM 5.2' },
  { id: 'accounts/fireworks/models/gpt-oss-120b', label: 'OpenAI gpt-oss-120b' },
];

/** Chat: profile assistant + tool calling (Kimi family recommended) */
export const CHAT_MODELS = [
  { id: 'accounts/fireworks/models/kimi-k2p6', label: 'Kimi K2.6 (default) - tool calling' },
  { id: 'accounts/fireworks/models/kimi-k3', label: 'Kimi K3 - flagship, 1M context' },
  { id: 'accounts/fireworks/models/kimi-k2p7-code', label: 'Kimi K2.7 Code - coding' },
  { id: 'accounts/fireworks/routers/kimi-k2p6-turbo', label: 'Kimi K2.6 Turbo (router) - lower latency' },
  { id: 'accounts/fireworks/routers/kimi-k3-fast', label: 'Kimi K3 Fast (router)' },
  { id: 'accounts/fireworks/models/minimax-m3', label: 'MiniMax M3' },
  { id: 'accounts/fireworks/models/glm-5p2', label: 'GLM 5.2' },
];

/** Reasoning: deep analysis mode */
export const REASONING_MODELS = [
  { id: 'accounts/fireworks/models/deepseek-v4-flash-0731', label: 'DeepSeek V4 Flash 0731 (default)' },
  { id: 'accounts/fireworks/models/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  { id: 'accounts/fireworks/models/glm-5p2', label: 'GLM 5.2' },
  { id: 'accounts/fireworks/routers/glm-5p2-fast', label: 'GLM 5.2 Fast (router)' },
  { id: 'accounts/fireworks/models/kimi-k3', label: 'Kimi K3' },
  { id: 'accounts/fireworks/models/minimax-m3', label: 'MiniMax M3' },
];

export function fillModelSelect(selectEl, models, currentId, fallbackId) {
  if (!selectEl) return;

  const selected = (currentId || fallbackId || '').trim();
  const known = models.some((m) => m.id === selected);

  selectEl.innerHTML = '';

  for (const model of models) {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.label;
    selectEl.appendChild(option);
  }

  selectEl.value = known ? selected : (fallbackId || models[0]?.id || '');
}

export function resolveSelectedModel(selectEl, fallbackId) {
  if (!selectEl) return fallbackId || '';
  return selectEl.value || fallbackId || '';
}
