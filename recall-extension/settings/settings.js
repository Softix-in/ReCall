import {
  fetchProfile,
  getSettings,
  health,
  isAuthError,
  loadExtensionConfig,
  saveExtensionConfig,
  testAiSettings,
  updateProfileAiSettings,
  updateSettings,
} from '../shared/api.js';
import { changeEmail, changePassword, getMe, getSession, isAuthenticated, logout, resendVerification } from '../shared/auth.js';
import { getLoginUrl } from '../shared/auth-gate.js';
import { mountAppShell } from '../shared/app-shell.js';
import {
  CHAT_MODELS,
  CUSTOM_MODEL_VALUE,
  DEFAULT_CHAT_MODEL,
  DEFAULT_QUALITY_MODEL,
  DEFAULT_REASONING_MODEL,
  QUALITY_MODELS,
  REASONING_MODELS,
  fillModelSelect,
  resolveSelectedModel,
  syncCustomModelVisibility,
} from '../shared/fireworks-models.js';

const $ = (id) => document.getElementById(id);

let syncQualityCustom = () => {};
let syncChatCustom = () => {};
let syncReasoningCustom = () => {};

function bindModelSelect(selectId, customInputId, customWrapId) {
  const selectEl = $(selectId);
  const customInputEl = $(customInputId);
  const wrapEl = $(customWrapId);

  if (!selectEl) {
    return () => {};
  }

  const sync = () => {
    const isCustom = selectEl.value === CUSTOM_MODEL_VALUE;
    if (wrapEl) wrapEl.hidden = !isCustom;
    syncCustomModelVisibility(selectEl, customInputEl);
  };

  selectEl.addEventListener('change', sync);
  return sync;
}

function initModelSelectors() {
  syncQualityCustom = bindModelSelect('aiQualityModel', 'aiQualityModelCustom', 'aiQualityModelCustomWrap');
  syncChatCustom = bindModelSelect('aiChatModel', 'aiChatModelCustom', 'aiChatModelCustomWrap');
  syncReasoningCustom = bindModelSelect('aiReasoningModel', 'aiReasoningModelCustom', 'aiReasoningModelCustomWrap');
}

async function refreshAccountSection() {
  const signedIn = await isAuthenticated();
  const session = await getSession();
  let user = session.user;
  
  if (signedIn) {
    try {
      user = await getMe();
    } catch {
      user = session.user;
    }
  }

  if (signedIn && user?.email) {
    $('account-email').textContent = `Signed in as ${user.email}`;
    $('account-status-pill').textContent = 'Signed in';
    $('account-status-pill').classList.add('signed-in');
    $('sign-out-btn').hidden = false;
    $('open-login-btn').hidden = true;
    $('account-security').hidden = false;

    if (user.email_verified) {
      $('verification-status').textContent = 'Email verified';
      $('verification-status').style.color = '#86efac';
      $('resend-verification-btn').hidden = true;
    } else {
      $('verification-status').textContent = 'Email not verified — check your inbox';
      $('verification-status').style.color = '#fcd34d';
      $('resend-verification-btn').hidden = false;
    }

    if (user.pending_email) {
      $('pending-email-hint').textContent = `Pending confirmation: ${user.pending_email}`;
      $('pending-email-hint').hidden = false;
    } else {
      $('pending-email-hint').hidden = true;
    }

    return;
  }

  $('account-email').textContent = 'Not signed in';
  $('account-status-pill').textContent = 'Not signed in';
  $('account-status-pill').classList.remove('signed-in');
  $('sign-out-btn').hidden = true;
  $('open-login-btn').hidden = false;
  $('account-security').hidden = true;
}

async function loadAiSettings() {
  if (!(await isAuthenticated())) {
    $('aiStatus').textContent = 'Sign in to configure AI settings';
    $('aiStatus').style.color = '#fcd34d';
    fillModelSelect($('aiQualityModel'), QUALITY_MODELS, DEFAULT_QUALITY_MODEL, DEFAULT_QUALITY_MODEL);
    fillModelSelect($('aiChatModel'), CHAT_MODELS, DEFAULT_CHAT_MODEL, DEFAULT_CHAT_MODEL);
    fillModelSelect($('aiReasoningModel'), REASONING_MODELS, DEFAULT_REASONING_MODEL, DEFAULT_REASONING_MODEL);
    syncQualityCustom();
    syncChatCustom();
    syncReasoningCustom();
    return;
  }

  try {
    const { user_profile: profile } = await fetchProfile();
    const quality = profile.ai_quality_model || DEFAULT_QUALITY_MODEL;
    const chat = profile.ai_chat_model || DEFAULT_CHAT_MODEL;
    const reasoning = profile.ai_reasoning_model || DEFAULT_REASONING_MODEL;

    fillModelSelect($('aiQualityModel'), QUALITY_MODELS, quality, DEFAULT_QUALITY_MODEL);
    fillModelSelect($('aiChatModel'), CHAT_MODELS, chat, DEFAULT_CHAT_MODEL);
    fillModelSelect($('aiReasoningModel'), REASONING_MODELS, reasoning, DEFAULT_REASONING_MODEL);

    $('aiQualityModelCustom').value = QUALITY_MODELS.some((m) => m.id === quality) ? '' : quality;
    $('aiChatModelCustom').value = CHAT_MODELS.some((m) => m.id === chat) ? '' : chat;
    $('aiReasoningModelCustom').value = REASONING_MODELS.some((m) => m.id === reasoning) ? '' : reasoning;

    syncQualityCustom();
    syncChatCustom();
    syncReasoningCustom();

    $('aiDeepAnalysis').checked = Boolean(profile.ai_deep_analysis_enabled);
    $('fireworksApiKey').placeholder = profile.has_fireworks_api_key
      ? 'Key saved (enter new key to replace)'
      : 'fw_...';
  } catch (error) {
    $('aiStatus').textContent = `AI settings unavailable: ${error.message}`;
    $('aiStatus').style.color = '#fcd34d';
  }
}

async function load() {
  mountAppShell({ active: 'settings' });
  initModelSelectors();

  const connection = await loadExtensionConfig();
  $('backendUrl').value = connection.backendUrl;
  await refreshAccountSection();

  if (await isAuthenticated()) {
    try {
      await getMe();
      await refreshAccountSection();
    } catch {
      // Session may be stale; account section still reflects storage.
    }
  }

  await loadAiSettings();

  if (!(await isAuthenticated())) {
    $('status').textContent = 'Sign in to load server settings';
    $('status').style.color = '#fcd34d';
    return;
  }

  try {
    const { settings } = await getSettings();
    $('whisperModel').value = settings.whisperModel;
    $('defaultSaveMode').value = settings.defaultSaveMode;
    $('maxTranscriptLength').value = settings.maxTranscriptLength;
    $('backupDir').value = settings.backupDir;
    $('backupEnabled').checked = settings.backupEnabled;
    $('backupRetentionDays').value = settings.backupRetentionDays;
  } catch (error) {
    $('status').textContent = `Backend settings unavailable: ${error.message}`;
    $('status').style.color = '#fcd34d';
  }
}

$('settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    await saveExtensionConfig({
      backendUrl: $('backendUrl').value,
    });

    await health();

    if (!(await isAuthenticated())) {
      $('status').textContent = 'Backend URL saved — sign in to sync settings';
      $('status').style.color = '#86efac';
      setTimeout(() => { $('status').textContent = ''; }, 2500);
      return;
    }

    try {
      await updateSettings({
        whisperModel: $('whisperModel').value,
        defaultSaveMode: $('defaultSaveMode').value,
        maxTranscriptLength: Number($('maxTranscriptLength').value),
        backupDir: $('backupDir').value.trim(),
        backupEnabled: $('backupEnabled').checked,
        backupRetentionDays: Number($('backupRetentionDays').value),
      });
    } catch (error) {
      $('status').textContent = `Connected, but server settings not saved: ${error.message}`;
      $('status').style.color = '#fcd34d';
      return;
    }

    $('status').textContent = 'Saved — backend reachable';
    $('status').style.color = '#86efac';
    setTimeout(() => { $('status').textContent = ''; }, 2500);
  } catch (error) {
    $('status').textContent = error.message;
    $('status').style.color = '#fca5a5';
  }
});

$('sign-out-btn').addEventListener('click', async () => {
  await logout();
  window.location.replace(getLoginUrl());
});

$('open-login-btn').addEventListener('click', () => {
  window.location.replace(getLoginUrl());
});

$('resend-verification-btn').addEventListener('click', async () => {
  $('password-status').textContent = '';

  try {
    const result = await resendVerification();
    let message = result.message || 'Verification email sent';

    if (result.verification_url) {
      message += ` — dev: ${result.verification_url}`;
    }

    $('verification-status').textContent = message;
    $('verification-status').style.color = '#86efac';
  } catch (error) {
    $('verification-status').textContent = error.message;
    $('verification-status').style.color = '#fca5a5';
  }
});

$('change-password-btn').addEventListener('click', async () => {
  $('password-status').textContent = '';

  try {
    await changePassword($('current-password').value, $('new-password').value);
    $('current-password').value = '';
    $('new-password').value = '';
    $('password-status').textContent = 'Password updated';
    $('password-status').style.color = '#86efac';
  } catch (error) {
    $('password-status').textContent = error.message;
    $('password-status').style.color = '#fca5a5';
  }
});

$('change-email-btn').addEventListener('click', async () => {
  $('email-status').textContent = '';

  try {
    const result = await changeEmail($('new-email').value.trim(), $('current-password').value);
    $('new-email').value = '';
    let message = result.message || 'Confirmation sent to new email';

    if (result.confirm_url) {
      message += ` — dev: ${result.confirm_url}`;
    }

    $('email-status').textContent = message;
    $('email-status').style.color = '#86efac';
    await refreshAccountSection();
  } catch (error) {
    $('email-status').textContent = error.message;
    $('email-status').style.color = '#fca5a5';
  }
});

$('saveAiSettings').addEventListener('click', async () => {
  $('aiStatus').textContent = '';

  if (!(await isAuthenticated())) {
    $('aiStatus').textContent = 'Sign in first';
    $('aiStatus').style.color = '#fca5a5';
    return;
  }

  try {
    const payload = {
      ai_deep_analysis_enabled: $('aiDeepAnalysis').checked,
    };

    const fireworks_api_key = $('fireworksApiKey').value.trim();
    if (fireworks_api_key) {
      payload.fireworks_api_key = fireworks_api_key;
    }

    const qualityModel = resolveSelectedModel(
      $('aiQualityModel'),
      $('aiQualityModelCustom'),
      DEFAULT_QUALITY_MODEL,
    );
    const chatModel = resolveSelectedModel(
      $('aiChatModel'),
      $('aiChatModelCustom'),
      DEFAULT_CHAT_MODEL,
    );
    const reasoningModel = resolveSelectedModel(
      $('aiReasoningModel'),
      $('aiReasoningModelCustom'),
      DEFAULT_REASONING_MODEL,
    );

    if (qualityModel) payload.ai_quality_model = qualityModel;
    if (chatModel) payload.ai_chat_model = chatModel;
    if (reasoningModel) payload.ai_reasoning_model = reasoningModel;

    await updateProfileAiSettings(payload);
    $('fireworksApiKey').value = '';
    $('aiStatus').textContent = 'AI settings saved';
    $('aiStatus').style.color = '#86efac';
    await loadAiSettings();
  } catch (error) {
    $('aiStatus').textContent = error.message;
    $('aiStatus').style.color = '#fca5a5';
  }
});

$('testFireworksKey').addEventListener('click', async () => {
  $('aiStatus').textContent = 'Testing…';
  $('aiStatus').style.color = '#c8c8c8';

  if (!(await isAuthenticated())) {
    $('aiStatus').textContent = 'Sign in first';
    $('aiStatus').style.color = '#fca5a5';
    return;
  }

  try {
    const fireworks_api_key = $('fireworksApiKey').value.trim();
    const result = await testAiSettings(
      fireworks_api_key ? { fireworks_api_key } : {},
    );

    if (result.ok) {
      $('aiStatus').textContent = 'API key is valid';
      $('aiStatus').style.color = '#86efac';
    } else {
      $('aiStatus').textContent = result.error || 'API key test failed';
      $('aiStatus').style.color = '#fca5a5';
    }
  } catch (error) {
    $('aiStatus').textContent = error.message || 'API key test failed';
    $('aiStatus').style.color = '#fca5a5';
  }
});

load().catch((error) => {
  if (isAuthError(error)) {
    return;
  }

  $('status').textContent = `Failed to load: ${error.message}`;
});
