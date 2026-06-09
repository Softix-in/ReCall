const fs = require('fs');
const path = require('path');
const config = require('../config');

const JOBS_LOG = path.join(config.LOGS_DIR, 'jobs.log');
const DAEMON_LOG = path.join(config.LOGS_DIR, 'daemon.log');

function ensureLogDir() {
  if (!fs.existsSync(config.LOGS_DIR)) {
    fs.mkdirSync(config.LOGS_DIR, { recursive: true });
  }
}

function appendLine(filePath, line) {
  ensureLogDir();
  fs.appendFileSync(filePath, line);
}

function logJob(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  appendLine(JOBS_LOG, line);
  console.log(message);
}

function logDaemon(level, message, error) {
  const stack = error?.stack ? `\n${error.stack}` : '';
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}${stack}\n`;
  appendLine(DAEMON_LOG, line);

  if (level === 'error') {
    console.error(message, error || '');
  } else {
    console.log(message);
  }
}

module.exports = {
  logJob,
  logDaemon,
  JOBS_LOG,
  DAEMON_LOG,
};
