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
const { createAuthRouter } = require('./routes/auth');
const { ProjectEmbedQueue } = require('./queue/project-embed-queue');
const { embedProject } = require('./workers/project-embed-worker');
const { ResearchQueue } = require('./queue/research-queue');
const { processResearchJob } = require('./workers/startup-research-worker');
const { createResearchRouter } = require('./routes/research');
const researchDb = require('./db/research');
const { DocCrawlQueue } = require('./queue/doc-crawl-queue');
const { processDocCrawlJob } = require('./workers/doc-crawl-worker');
const { createKnowledgeRouter } = require('./routes/knowledge');
const docCrawlDb = require('./db/doc-crawl');
const { startBackupScheduler, stopBackupScheduler } = require('./services/backup-service');
const { logDaemon } = require('./utils/logger');
const { startEmbedService, stopEmbedService } = require('./services/embed-launcher');
const embedClient = require('./services/embed-client');
const { corsMiddleware, authMiddleware } = require('./middleware/security');
const { apiRateLimiter, authRateLimiter } = require('./middleware/rate-limit');
const { createEmailVerifiedMiddleware } = require('./middleware/email-verified');

let queue;
let projectEmbedQueue;
let researchQueue;
let docCrawlQueue;
let server;

async function resumeStuckJobs(activeQueue) {
  const stuck = await itemsDb.listStuckItems();

  if (stuck.length === 0) {
    return;
  }

  logDaemon('info', `Resuming ${stuck.length} queued/processing item(s) from previous session`);

  for (const item of stuck) {
    if (item.processing === 'processing') {
      await itemsDb.updateItem(item.user_id, item.id, { processing: 'queued' });
    }

    try {
      activeQueue.addJob({ itemId: item.id, url: item.url });
    } catch (error) {
      logDaemon('error', `Failed to resume item ${item.id}`, error);
    }
  }
}

async function resumeStuckDocCrawlJobs(activeQueue) {
  const stuck = await docCrawlDb.listStuckJobs();

  if (stuck.length === 0) {
    return;
  }

  logDaemon('info', `Resuming ${stuck.length} doc crawl job(s) from previous session`);

  for (const job of stuck) {
    if (job.status === 'running') {
      await docCrawlDb.updateJob(job.user_id, job.id, { status: 'queued' });
    }

    try {
      activeQueue.addJob({
        jobId: job.id,
        userId: job.user_id,
      });
    } catch (error) {
      logDaemon('error', `Failed to resume doc crawl job ${job.id}`, error);
    }
  }
}

async function resumeStuckResearchJobs(activeQueue) {
  const stuck = await researchDb.listStuckJobs();

  if (stuck.length === 0) {
    return;
  }

  logDaemon('info', `Resuming ${stuck.length} research job(s) from previous session`);

  for (const job of stuck) {
    if (job.status === 'running') {
      await researchDb.updateJob(job.user_id, job.id, { status: 'queued' });
    }

    try {
      activeQueue.addJob({
        jobId: job.id,
        companyId: job.company_id,
        userId: job.user_id,
      });
    } catch (error) {
      logDaemon('error', `Failed to resume research job ${job.id}`, error);
    }
  }
}

function ensureAuthConfig() {
  if (!config.DATABASE_URL) {
    return;
  }

  if (config.AUTH_LEGACY_API_KEY) {
    return;
  }

  if (!config.JWT_PRIVATE_KEY || !config.JWT_PUBLIC_KEY) {
    throw new Error(
      'JWT_PRIVATE_KEY and JWT_PUBLIC_KEY are required when AUTH_LEGACY_API_KEY=false and DATABASE_URL is set',
    );
  }
}

async function bootstrap() {
  ensureRecallDirs();
  ensureAuthConfig();
  await runMigrations();

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
      console.log(`Using external embed service (${health.dimensions ?? config.EMBEDDING_DIM} dims)`);
    } catch (error) {
      console.error(`Warning: embed service not reachable at ${config.EMBED_BASE_URL}: ${error.message}`);
    }
  }

  queue = new JobQueue(processItem, {
    onPermanentFailure: async (itemId, error) => {
      const item = await itemsDb.getItemByIdInternal(itemId);

      if (item) {
        await itemsDb.updateItem(item.user_id, itemId, {
          processing: 'failed',
          processed_at: Date.now(),
          error_message: error.message,
        });
      }

      logDaemon('error', `Item ${itemId} failed permanently: ${error.message}`, error);
    },
  });

  projectEmbedQueue = new ProjectEmbedQueue(embedProject);

  researchQueue = new ResearchQueue(processResearchJob, {
    onPermanentFailure: async (jobId, error) => {
      const job = await researchDb.getJobInternal(jobId);
      if (!job) return;

      await researchDb.updateJob(job.user_id, jobId, {
        status: 'failed',
        error_message: error.message,
        completed_at: Date.now(),
      });

      await researchDb.updateCompany(job.user_id, job.company_id, {
        status: 'needs_review',
      });

      logDaemon('error', `Research job ${jobId} failed permanently: ${error.message}`, error);
    },
  });

  docCrawlQueue = new DocCrawlQueue(processDocCrawlJob, {
    onPermanentFailure: async (jobId, error) => {
      const job = await docCrawlDb.getJobInternal(jobId);
      if (!job) return;

      await docCrawlDb.updateJob(job.user_id, jobId, {
        status: 'failed',
        error_message: error.message,
        completed_at: Date.now(),
      });

      logDaemon('error', `Doc crawl job ${jobId} failed permanently: ${error.message}`, error);
    },
  });

  await resumeStuckJobs(queue);
  await resumeStuckResearchJobs(researchQueue);
  await resumeStuckDocCrawlJobs(docCrawlQueue);
  startBackupScheduler();

  const app = express();

  if (config.TRUST_PROXY) {
    app.set('trust proxy', 1);
  }

  app.use(express.json());
  app.use(corsMiddleware);
  app.use(authMiddleware);
  app.use(createEmailVerifiedMiddleware());
  app.use(apiRateLimiter);

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

  const authRouter = createAuthRouter();
  app.post('/auth/register', authRateLimiter);
  app.post('/auth/login', authRateLimiter);
  app.post('/auth/refresh', authRateLimiter);
  app.post('/auth/forgot-password', authRateLimiter);
  app.use('/auth', authRouter);

  app.use(createCaptureRouter(queue));
  app.use(createStatusRouter(queue));
  app.use(createJobsRouter(queue));
  app.use(itemsRouter);
  app.use(searchRouter);
  app.use(settingsRouter);
  app.use(askRouter);
  app.use(createProfileRouter(projectEmbedQueue));
  app.use(createCareerRouter({ projectEmbedQueue }));
  app.use(createResearchRouter(researchQueue));
  app.use(createKnowledgeRouter(docCrawlQueue));

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found', path: req.path });
  });

  server = app.listen(config.PORT, config.HOST, () => {
    console.log(`Recall backend listening on http://${config.HOST}:${config.PORT}`);
  });

  return { app, server, queue, projectEmbedQueue, researchQueue, docCrawlQueue };
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

  if (researchQueue) {
    console.log('Draining research queue...');
    try {
      await researchQueue.drain();
    } catch (error) {
      console.error(`Error while draining research queue: ${error.message}`);
    }
  }

  if (docCrawlQueue) {
    console.log('Draining doc crawl queue...');
    try {
      await docCrawlQueue.drain();
    } catch (error) {
      console.error(`Error while draining doc crawl queue: ${error.message}`);
    }
  }

  stopBackupScheduler();
  await stopEmbedService();
  await closeDb();
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
