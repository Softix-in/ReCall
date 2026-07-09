const config = require('../config');
const { withUserContext } = require('./pg-pool');

const DEFAULTS = {
  whisperModel: 'small',
  backupDir: config.BACKUPS_DIR,
  maxTranscriptLength: 50_000,
  defaultSaveMode: 'auto_scrape',
  backupRetentionDays: 7,
  backupEnabled: true,
  backupHourUtc: 3,
};

function normalizeSettings(input = {}) {
  const merged = { ...DEFAULTS, ...input };

  merged.whisperModel = ['tiny', 'small', 'medium'].includes(merged.whisperModel)
    ? merged.whisperModel
    : DEFAULTS.whisperModel;

  merged.defaultSaveMode = ['auto_scrape', 'manual_note'].includes(merged.defaultSaveMode)
    ? merged.defaultSaveMode
    : DEFAULTS.defaultSaveMode;

  merged.maxTranscriptLength = Math.min(
    Math.max(Number(merged.maxTranscriptLength) || DEFAULTS.maxTranscriptLength, 1000),
    500_000,
  );

  merged.backupRetentionDays = Math.min(
    Math.max(Number(merged.backupRetentionDays) || DEFAULTS.backupRetentionDays, 1),
    30,
  );

  merged.backupHourUtc = Math.min(
    Math.max(Number(merged.backupHourUtc) || DEFAULTS.backupHourUtc, 0),
    23,
  );

  merged.backupEnabled = Boolean(merged.backupEnabled);
  merged.backupDir = merged.backupDir || DEFAULTS.backupDir;

  return merged;
}

function rowToSettings(row) {
  if (!row) {
    return normalizeSettings();
  }

  return normalizeSettings({
    whisperModel: row.whisper_model,
    defaultSaveMode: row.default_save_mode,
    maxTranscriptLength: row.max_transcript_length,
    backupDir: row.backup_dir,
    backupEnabled: row.backup_enabled,
    backupRetentionDays: row.backup_retention_days,
    backupHourUtc: DEFAULTS.backupHourUtc,
  });
}

async function getSettings(userId) {
  return withUserContext(userId, async (client) => {
    const result = await client.query(
      'SELECT * FROM user_settings WHERE user_id = $1',
      [userId],
    );

    if (result.rows[0]) {
      return rowToSettings(result.rows[0]);
    }

    const now = Date.now();
    const defaults = normalizeSettings();

    await client.query(
      `INSERT INTO user_settings (
        user_id, whisper_model, default_save_mode, max_transcript_length,
        backup_dir, backup_enabled, backup_retention_days, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        defaults.whisperModel,
        defaults.defaultSaveMode,
        defaults.maxTranscriptLength,
        defaults.backupDir,
        defaults.backupEnabled,
        defaults.backupRetentionDays,
        now,
      ],
    );

    return defaults;
  });
}

async function saveSettings(userId, patch) {
  const current = await getSettings(userId);
  const next = normalizeSettings({ ...current, ...patch });

  return withUserContext(userId, async (client) => {
    await client.query(
      `INSERT INTO user_settings (
        user_id, whisper_model, default_save_mode, max_transcript_length,
        backup_dir, backup_enabled, backup_retention_days, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (user_id) DO UPDATE SET
        whisper_model = EXCLUDED.whisper_model,
        default_save_mode = EXCLUDED.default_save_mode,
        max_transcript_length = EXCLUDED.max_transcript_length,
        backup_dir = EXCLUDED.backup_dir,
        backup_enabled = EXCLUDED.backup_enabled,
        backup_retention_days = EXCLUDED.backup_retention_days,
        updated_at = EXCLUDED.updated_at`,
      [
        userId,
        next.whisperModel,
        next.defaultSaveMode,
        next.maxTranscriptLength,
        next.backupDir,
        next.backupEnabled,
        next.backupRetentionDays,
        Date.now(),
      ],
    );

    return next;
  });
}

module.exports = {
  DEFAULTS,
  getSettings,
  saveSettings,
  normalizeSettings,
};
