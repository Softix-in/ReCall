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

ensureRecallDirs();
runMigrations();

const queue = new JobQueue(processItem, {
  onPermanentFailure: (itemId, error) => {
    itemsDb.updateItem(itemId, {
      processing: 'failed',
      error_message: error.message,
    });
    console.error(`Marked item ${itemId} as failed: ${error.message}`);
  },
});

const app = express();

app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
  });

  next();
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    version: config.VERSION,
    service: 'recall-backend',
  });
});

app.use(createCaptureRouter(queue));
app.use(createStatusRouter(queue));
app.use(itemsRouter);
app.use(searchRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`Recall backend listening on http://${config.HOST}:${config.PORT}`);
});

async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);

  server.close();
  console.log('HTTP server closed. Draining job queue...');

  try {
    await queue.drain();
  } catch (error) {
    console.error(`Error while draining queue: ${error.message}`);
  }

  closeDb();
  console.log('Shutdown complete.');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { app, server, queue };
