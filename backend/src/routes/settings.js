const express = require('express');
const { getSettings, saveSettings } = require('../services/settings-service');
const { startBackupScheduler } = require('../services/backup-service');

const router = express.Router();

router.get('/settings', async (req, res) => {
  try {
    const settings = await getSettings(req.user.id);
    res.json({ settings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const settings = await saveSettings(req.user.id, req.body || {});
    startBackupScheduler();
    res.json({ settings });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
