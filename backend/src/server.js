const express = require('express');
const config = require('./config');
const { runMigrations } = require('./migrate');
const { ensureRecallDirs } = require('./fs');
const { closeDb } = require('./db/connection');
const itemsDb = require('./db/items');
const { JobQueue } = require('./queue/job-queue');
const { processItem } = require('./workers/pipeline-worker');
const { createCaptureRouter } = require('./routes/capture');
const { createStatusRouter } = require('./routes/status');
const itemsRouter = require('./routes/items');
const searchRouter = require('./routes/search');
const settingsRouter = require('./routes/settings');
const { createJobsRouter } = require('./routes/jobs');
const askRouter = require('./routes/ask');
const { createProfileRouter } = require('./routes/profile');
const { createCareerRouter } = require('./routes/career');
const { ProjectEmbedQueue } = require('./queue/project-embed-queue');
const { embedProject } = require('./workers/project-embed-worker');
const { startBackupScheduler, stopBackupScheduler } = require('./services/backup-service');
const { logDaemon } = require('./utils/logger');
const { startEmbedService, stopEmbedService } = require('./services/embed-launcher');
const embedClient = require('./services/embed-client');
const { corsMiddleware, authMiddleware } = require('./middleware/security');

let queue;
let projectEmbedQueue;
let server;

function resumeStuckJobs(activeQueue) {
  const stuck = itemsDb.listStuckItems();

  if (stuck.length === 0) {
    return;
  }

  logDaemon('info', `Resuming ${stuck.length} queued/processing item(s) from previous session`);

  for (const item of stuck) {
    if (item.processing === 'processing') {
      itemsDb.updateItem(item.id, { processing: 'queued' });
    }

    try {
      activeQueue.addJob({ itemId: item.id, url: item.url });
    } catch (error) {
      logDaemon('error', `Failed to resume item ${item.id}`, error);
    }
  }
}

async function bootstrap() {
  ensureRecallDirs();
  runMigrations();

  if (config.EMBED_AUTO_START) {
    try {
      await startEmbedService();
    } catch (error) {
      console.error(`Warning: embed service failed to start: ${error.message}`);
      console.error('Semantic search and embeddings will be unavailable until the embed service is running.');
    }
  } else {
    try {
      const health = await embedClient.checkHealth();
      console.log(`Using external embed service (${health.vector_count ?? 0} vectors indexed)`);
    } catch (error) {
      console.error(`Warning: embed service not reachable at ${config.EMBED_BASE_URL}: ${error.message}`);
    }
  }

  queue = new JobQueue(processItem, {
    onPermanentFailure: (itemId, error) => {
      itemsDb.updateItem(itemId, {
        processing: 'failed',
        processed_at: Date.now(),
        error_message: error.message,
      });
      logDaemon('error', `Item ${itemId} failed permanently: ${error.message}`, error);
    },
  });

  projectEmbedQueue = new ProjectEmbedQueue(embedProject);

  resumeStuckJobs(queue);
  startBackupScheduler();

  const app = express();

  app.use(express.json());
  app.use(corsMiddleware);
  app.use(authMiddleware);

  app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
      const ms = Date.now() - start;
      console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
    });

    next();
  });

  app.get('/health', async (req, res) => {
    let embed = { ok: false };

    try {
      embed = await embedClient.checkHealth();
    } catch (error) {
      embed = { ok: false, error: error.message };
    }

    res.json({
      ok: true,
      version: config.VERSION,
      service: 'recall-backend',
      embed,
    });
  });

  app.use(createCaptureRouter(queue));
  app.use(createStatusRouter(queue));
  app.use(createJobsRouter(queue));
  app.use(itemsRouter);
  app.use(searchRouter);
  app.use(settingsRouter);
  app.use(askRouter);
  app.use(createProfileRouter(projectEmbedQueue));
  app.use(createCareerRouter({ projectEmbedQueue }));

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found', path: req.path });
  });

  server = app.listen(config.PORT, config.HOST, () => {
    console.log(`Recall backend listening on http://${config.HOST}:${config.PORT}`);
  });

  return { app, server, queue, projectEmbedQueue };
}

async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);

  if (server) {
    await new Promise((resolve) => server.close(resolve));
    console.log('HTTP server closed.');
  }

  if (queue) {
    console.log('Draining job queue...');
    try {
      await queue.drain();
    } catch (error) {
      console.error(`Error while draining queue: ${error.message}`);
    }
  }

  if (projectEmbedQueue) {
    console.log('Draining project embed queue...');
    try {
      await projectEmbedQueue.drain();
    } catch (error) {
      console.error(`Error while draining project embed queue: ${error.message}`);
    }
  }

  stopBackupScheduler();
  await stopEmbedService();
  closeDb();
  console.log('Shutdown complete.');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

bootstrap().catch((error) => {
  console.error('Failed to start Recall backend:', error);
  process.exit(1);
});

module.exports = { bootstrap, shutdown };
