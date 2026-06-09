const fs = require('fs');
const path = require('path');
const config = require('../config');
const { ensureRecallDirs } = require('../fs');

const DEFAULTS = {
  whisperModel: 'small',
  backupDir: config.BACKUPS_DIR,
  maxTranscriptLength: 50_000,
  defaultSaveMode: 'auto_scrape',
  backupRetentionDays: 7,
  backupEnabled: true,
  backupHourUtc: 3,
};

let cached = null;

function expandPath(value) {
  if (!value) {
    return value;
  }

  if (value.startsWith('~')) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(home, value.slice(1).replace(/^[/\\]/, ''));
  }

  return value;
}

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
    500_000
  );

  merged.backupRetentionDays = Math.min(
    Math.max(Number(merged.backupRetentionDays) || DEFAULTS.backupRetentionDays, 1),
    30
  );

  merged.backupHourUtc = Math.min(
    Math.max(Number(merged.backupHourUtc) || DEFAULTS.backupHourUtc, 0),
    23
  );

  merged.backupEnabled = Boolean(merged.backupEnabled);
  merged.backupDir = expandPath(merged.backupDir || DEFAULTS.backupDir);

  return merged;
}

function loadSettings() {
  if (cached) {
    return cached;
  }

  ensureRecallDirs();

  if (!fs.existsSync(config.SETTINGS_PATH)) {
    cached = normalizeSettings();
    fs.writeFileSync(config.SETTINGS_PATH, JSON.stringify(cached, null, 2));
    return cached;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(config.SETTINGS_PATH, 'utf8'));
    cached = normalizeSettings(raw);
    return cached;
  } catch {
    cached = normalizeSettings();
    return cached;
  }
}

function saveSettings(patch) {
  const next = normalizeSettings({ ...loadSettings(), ...patch });
  fs.mkdirSync(path.dirname(config.SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(config.SETTINGS_PATH, JSON.stringify(next, null, 2));
  cached = next;
  return next;
}

function getSettings() {
  return { ...loadSettings() };
}

function reloadSettings() {
  cached = null;
  return loadSettings();
}

module.exports = {
  DEFAULTS,
  getSettings,
  saveSettings,
  reloadSettings,
  normalizeSettings,
};
