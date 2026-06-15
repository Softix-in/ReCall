import {
  getSettings,
  health,
  loadExtensionConfig,
  saveExtensionConfig,
  updateSettings,
} from '../shared/api.js';

const $ = (id) => document.getElementById(id);

async function load() {
  const connection = await loadExtensionConfig();
  $('backendUrl').value = connection.backendUrl;
  $('apiKey').value = connection.apiKey;

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
      apiKey: $('apiKey').value,
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

load().catch((error) => {
  $('status').textContent = `Failed to load: ${error.message}`;
});
