const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const cron = require('node-cron');
const config = require('../config');
const { logDaemon } = require('../utils/logger');
const { getSettings } = require('./settings-service');

let scheduledTask = null;

function listBackupFiles(backupDir) {
  if (!fs.existsSync(backupDir)) {
    return [];
  }

  return fs.readdirSync(backupDir)
    .filter((name) => name.endsWith('.zip'))
    .map((name) => ({
      name,
      path: path.join(backupDir, name),
      mtime: fs.statSync(path.join(backupDir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
}

function pruneOldBackups(backupDir, retentionDays) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  for (const file of listBackupFiles(backupDir)) {
    if (file.mtime < cutoff) {
      fs.unlinkSync(file.path);
      logDaemon('info', `Removed old backup ${file.name}`);
    }
  }

  const files = listBackupFiles(backupDir);
  const maxKeep = retentionDays;

  for (const file of files.slice(maxKeep)) {
    fs.unlinkSync(file.path);
    logDaemon('info', `Removed excess backup ${file.name}`);
  }
}

function createZipArchive(sourcePaths, outputPath) {
  if (process.platform === 'win32') {
    const tempDir = path.join(config.RECALL_HOME, 'tmp-backup');
    fs.mkdirSync(tempDir, { recursive: true });

    for (const source of sourcePaths) {
      if (!fs.existsSync(source)) {
        continue;
      }

      const destName = path.basename(source);
      const dest = path.join(tempDir, destName);

      if (fs.statSync(source).isDirectory()) {
        fs.cpSync(source, dest, { recursive: true });
      } else {
        fs.copyFileSync(source, dest);
      }
    }

    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path '${tempDir}\\*' -DestinationPath '${outputPath}' -Force`,
      ],
      { stdio: 'pipe' }
    );

    fs.rmSync(tempDir, { recursive: true, force: true });
    return;
  }

  const zipBin = process.platform === 'darwin' ? 'zip' : 'zip';
  const args = ['-r', outputPath, ...sourcePaths.map((p) => path.basename(p))];
  const cwd = path.dirname(sourcePaths[0]);

  execFileSync(zipBin, args, { cwd, stdio: 'pipe' });
}

function runBackup() {
  const settings = getSettings();

  if (!settings.backupEnabled) {
    return { skipped: true, reason: 'backups disabled' };
  }

  const backupDir = settings.backupDir;
  fs.mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(backupDir, `recall-backup-${stamp}.zip`);

  const sources = [
    config.DB_PATH,
    config.CHROMA_DIR,
  ].filter((source) => fs.existsSync(source));

  if (sources.length === 0) {
    return { skipped: true, reason: 'no data to backup' };
  }

  try {
    if (process.platform === 'win32') {
      createZipArchive(sources, outputPath);
    } else {
      execFileSync('zip', ['-r', outputPath, ...sources], { stdio: 'pipe' });
    }

    pruneOldBackups(backupDir, settings.backupRetentionDays);
    logDaemon('info', `Backup created: ${outputPath}`);

    return { ok: true, path: outputPath };
  } catch (error) {
    logDaemon('error', 'Backup failed', error);
    throw error;
  }
}

function startBackupScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
  }

  const settings = getSettings();

  if (!settings.backupEnabled) {
    return;
  }

  const hour = settings.backupHourUtc;
  const expression = `0 ${hour} * * *`;

  scheduledTask = cron.schedule(expression, () => {
    try {
      runBackup();
    } catch (error) {
      logDaemon('error', 'Scheduled backup failed', error);
    }
  });

  logDaemon('info', `Backup scheduler active (daily at ${hour}:00 UTC)`);
}

function stopBackupScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

module.exports = {
  runBackup,
  startBackupScheduler,
  stopBackupScheduler,
  listBackupFiles,
};
