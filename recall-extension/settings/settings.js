import {
  fetchProfile,
  getSettings,
  health,
  loadExtensionConfig,
  saveExtensionConfig,
  testAiSettings,
  updateProfileAiSettings,
  updateSettings,
} from '../shared/api.js';

const $ = (id) => document.getElementById(id);

async function loadAiSettings() {
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
  $('recallApiKey').value = connection.apiKey;

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
      apiKey: $('recallApiKey').value,
    });

    await health();

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

$('saveAiSettings').addEventListener('click', async () => {
  $('aiStatus').textContent = '';

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
  $('status').textContent = `Failed to load: ${error.message}`;
});
