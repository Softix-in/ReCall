const express = require('express');
const { getSettings, saveSettings } = require('../services/settings-service');
const { startBackupScheduler } = require('../services/backup-service');

const router = express.Router();

router.get('/settings', (req, res) => {
  res.json({ settings: getSettings() });
});

router.put('/settings', (req, res) => {
  try {
    const settings = saveSettings(req.body || {});
    startBackupScheduler();
    res.json({ settings });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
