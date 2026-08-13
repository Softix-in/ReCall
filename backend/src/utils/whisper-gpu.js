const { execSync } = require('child_process');

function hasNvidiaGpu() {
  if (process.platform !== 'linux' && process.platform !== 'win32') {
    return false;
  }

  try {
    execSync('nvidia-smi', { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function getWhisperAccelArgs() {
  if (process.platform === 'darwin') {
    return ['-ngl', '99'];
  }

  if (hasNvidiaGpu()) {
    return ['-ngl', '99'];
  }

  return [];
}

module.exports = {
  getWhisperAccelArgs,
  hasNvidiaGpu,
};
