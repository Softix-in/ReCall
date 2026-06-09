import { getSettings, updateSettings } from '../shared/api.js';

const $ = (id) => document.getElementById(id);

async function load() {
  const { settings } = await getSettings();

  $('whisperModel').value = settings.whisperModel;
  $('defaultSaveMode').value = settings.defaultSaveMode;
  $('maxTranscriptLength').value = settings.maxTranscriptLength;
  $('backupDir').value = settings.backupDir;
  $('backupEnabled').checked = settings.backupEnabled;
  $('backupRetentionDays').value = settings.backupRetentionDays;
}

$('settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    await updateSettings({
      whisperModel: $('whisperModel').value,
      defaultSaveMode: $('defaultSaveMode').value,
      maxTranscriptLength: Number($('maxTranscriptLength').value),
      backupDir: $('backupDir').value.trim(),
      backupEnabled: $('backupEnabled').checked,
      backupRetentionDays: Number($('backupRetentionDays').value),
    });

    $('status').textContent = 'Saved';
    setTimeout(() => { $('status').textContent = ''; }, 2000);
  } catch (error) {
    $('status').textContent = error.message;
    $('status').style.color = '#fca5a5';
  }
});

load().catch((error) => {
  $('status').textContent = `Failed to load: ${error.message}`;
});
