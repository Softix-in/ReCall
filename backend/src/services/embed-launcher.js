const { spawn } = require('child_process');
const path = require('path');
const config = require('../config');
const embedClient = require('./embed-client');

let embedProcess = null;
let startingPromise = null;

function getEmbedServicePath() {
  return path.join(__dirname, '..', '..', '..', 'recall-embed', 'embed_service.py');
}

async function waitForHealthy(maxAttempts = 60, intervalMs = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const health = await embedClient.checkHealth();
      return health;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error(
    `Embed service did not become healthy at ${config.EMBED_BASE_URL} within ${maxAttempts}s`
  );
}

async function startEmbedService() {
  if (startingPromise) {
    return startingPromise;
  }

  startingPromise = (async () => {
    try {
      const health = await embedClient.checkHealth();
      console.log(
        `Embed service already running (${health.vector_count ?? 0} vectors indexed)`
      );
      return health;
    } catch {
      // not running — spawn below
    }

    const scriptPath = getEmbedServicePath();

    embedProcess = spawn(
      config.PYTHON_BIN,
      [scriptPath],
      {
        cwd: path.dirname(scriptPath),
        env: {
          ...process.env,
          RECALL_HOME: config.RECALL_HOME,
          EMBED_HOST: config.EMBED_HOST,
          EMBED_PORT: String(config.EMBED_PORT),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      }
    );

    embedProcess.stdout.on('data', (chunk) => {
      const line = chunk.toString().trim();
      if (line) console.log(`[embed] ${line}`);
    });

    embedProcess.stderr.on('data', (chunk) => {
      const line = chunk.toString().trim();
      if (line) console.error(`[embed] ${line}`);
    });

    embedProcess.on('exit', (code, signal) => {
      if (code !== 0 && code !== null) {
        console.error(`Embed service exited with code ${code}`);
      }
      if (signal) {
        console.error(`Embed service killed by signal ${signal}`);
      }
      embedProcess = null;
    });

    const health = await waitForHealthy();
    console.log(`Embed service ready at ${config.EMBED_BASE_URL}`);
    return health;
  })();

  try {
    return await startingPromise;
  } finally {
    startingPromise = null;
  }
}

async function stopEmbedService() {
  if (!embedProcess) {
    return;
  }

  const processToStop = embedProcess;
  embedProcess = null;

  await new Promise((resolve) => {
    processToStop.once('exit', resolve);
    processToStop.kill('SIGTERM');

    setTimeout(() => {
      if (!processToStop.killed) {
        processToStop.kill('SIGKILL');
      }
      resolve();
    }, 5_000);
  });
}

module.exports = {
  startEmbedService,
  stopEmbedService,
};
