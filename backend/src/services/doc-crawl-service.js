const config = require('../config');
const docCrawlDb = require('../db/doc-crawl');
const { FirecrawlError } = require('../pipeline/fetch-firecrawl');
const { assertPublicHttpUrl } = require('../utils/safe-url');

async function normalizeCrawlPayload(body) {
  const seed_url = body.seed_url?.trim() || body.url?.trim();

  if (!seed_url) {
    const error = new Error('seed_url is required');
    error.status = 400;
    throw error;
  }

  await assertPublicHttpUrl(seed_url);

  const max_pages = Math.min(
    Math.max(Number(body.max_pages) || config.FIRECRAWL_MAX_CRAWL_PAGES, 1),
    config.FIRECRAWL_MAX_CRAWL_PAGES,
  );

  return {
    seed_url,
    path_filter: body.path_filter?.trim() || null,
    max_pages,
  };
}

async function startCrawl(userId, body, queue) {
  if (!config.FIRECRAWL_API_KEY) {
    throw new FirecrawlError(
      'FIRECRAWL_API_KEY is not configured',
      { status: 503, code: 'missing_firecrawl_key' },
    );
  }

  const payload = await normalizeCrawlPayload(body);
  const job = await docCrawlDb.createJob(userId, payload);

  queue.addJob({
    jobId: job.id,
    userId,
  });

  return {
    id: job.id,
    status: job.status,
    seed_url: job.seed_url,
    max_pages: job.max_pages,
  };
}

module.exports = {
  startCrawl,
  normalizeCrawlPayload,
};
