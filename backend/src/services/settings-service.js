const settingsDb = require('../db/settings');

async function getSettings(userId) {
  return settingsDb.getSettings(userId);
}

async function saveSettings(userId, patch) {
  return settingsDb.saveSettings(userId, patch);
}

function reloadSettings() {
  return null;
}

module.exports = {
  getSettings,
  saveSettings,
  reloadSettings,
  normalizeSettings: settingsDb.normalizeSettings,
  DEFAULTS: settingsDb.DEFAULTS,
};
