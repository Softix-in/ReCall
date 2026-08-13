const path = require('path');
const { spawn } = require('child_process');

function runCommand(command, args = [], options = {}) {
  const {
    timeout = 120_000,
    cwd,
    env,
    input,
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeout);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    if (input) {
      child.stdin.write(input);
    }

    child.stdin.end();

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      if (timedOut) {
        reject(new Error(`Command timed out after ${timeout}ms: ${command} ${args.join(' ')}`));
        return;
      }

      if (code !== 0) {
        let message = stderr.trim() || stdout.trim();

        // 0xC0000135 = STATUS_DLL_NOT_FOUND — binary crashed before producing output
        if (!message && (code === 3221225781 || code === -1073741515)) {
          const bin = path.basename(command);
          message = `${bin} failed to start — a required DLL is missing on this Windows installation. ` +
            `Install the Visual C++ Redistributable: https://aka.ms/vs/17/release/vc_redist.x64.exe`;
        }

        if (!message) {
          message = `Command failed with exit code ${code}`;
        }

        const error = new Error(message);
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }

      resolve({ stdout, stderr, code });
    });
  });
}

module.exports = {
  runCommand,
};
