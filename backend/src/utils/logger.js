const fs = require('fs');
const path = require('path');
const config = require('../config');

const JOBS_LOG = path.join(config.LOGS_DIR, 'jobs.log');

function ensureLogDir() {
  if (!fs.existsSync(config.LOGS_DIR)) {
    fs.mkdirSync(config.LOGS_DIR, { recursive: true });
  }
}

function logJob(message) {
  ensureLogDir();
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(JOBS_LOG, line);
  console.log(message);
}

module.exports = {
  logJob,
  JOBS_LOG,
};
