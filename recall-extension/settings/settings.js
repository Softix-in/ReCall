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

const $ = (id) => document.getElementById(id);

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
  $('sign-out-btn').hidden = true;
  $('open-login-btn').hidden = false;
  $('account-security').hidden = true;
}

async function loadAiSettings() {
  if (!(await isAuthenticated())) {
    $('aiStatus').textContent = 'Sign in to configure AI settings';
    $('aiStatus').style.color = '#fcd34d';
    return;
  }

  try {
    const { user_profile: profile } = await fetchProfile();
    $('aiQualityModel').value = profile.ai_quality_model || '';
    $('aiChatModel').value = profile.ai_chat_model || '';
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

  await loadAiSettings();
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
