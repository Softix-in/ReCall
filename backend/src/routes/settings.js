const express = require('express');
const { getSettings, saveSettings } = require('../services/settings-service');
const { startBackupScheduler } = require('../services/backup-service');
const { sendError } = require('../utils/http-error');

const router = express.Router();

router.get('/settings', async (req, res) => {
  try {
    const settings = await getSettings(req.user.id);
    res.json({ settings });
  } catch (error) {
    sendError(res, error, 'Failed to load settings');
  }
});

router.put('/settings', async (req, res) => {
  try {
    const settings = await saveSettings(req.user.id, req.body || {});
    startBackupScheduler();
    res.json({ settings });
  } catch (error) {
    sendError(res, error, 'Failed to save settings');
  }
});

module.exports = router;
