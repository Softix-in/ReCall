const config = require('../config');
const itemsDb = require('../db/items');
const docCrawlDb = require('../db/doc-crawl');
const { mapDocumentationUrls, scrapeDocumentation } = require('../pipeline/fetch-firecrawl');
const { buildKnowledgeDocument } = require('../services/document-knowledge-service');
const embeddingService = require('../services/embedding-service');
const { logJob } = require('../utils/logger');

function filterUrls(urls, { seedUrl, pathFilter, maxPages }) {
  let seedHost;

  try {
    seedHost = new URL(seedUrl).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return urls.slice(0, maxPages);
  }

  const normalizedFilter = pathFilter?.trim() || null;

  const filtered = urls.filter((url) => {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();

      if (host !== seedHost) {
        return false;
      }

      if (normalizedFilter && !parsed.pathname.startsWith(normalizedFilter)) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  });

  const unique = [...new Set(filtered)];
  return unique.slice(0, maxPages);
}

async function saveCrawledPage(userId, job, page) {
  const knowledge = await buildKnowledgeDocument({
    url: page.url,
    title: page.title,
    domain: (() => {
      try {
        return new URL(page.url).hostname;
      } catch {
        return null;
      }
    })(),
    extractor: 'firecrawl',
    markdown: page.markdown,
    userId,
    useLlm: false,
  });

  const captureMeta = {
    ...knowledge.capture_meta,
    crawl_job_id: job.id,
    page_path: (() => {
      try {
        return new URL(page.url).pathname;
      } catch {
        return null;
      }
    })(),
  };

  const item = await itemsDb.createItem(userId, {
    url: page.url,
    title: page.title || page.url,
    summary: knowledge.summary,
    content: knowledge.content,
    source_type: 'documentation',
    save_mode: 'doc_extract',
    tags: 'doc-crawl',
    domain: (() => {
      try {
        return new URL(page.url).hostname;
      } catch {
        return null;
      }
    })(),
    processing: 'done',
    processed_at: Date.now(),
    capture_meta: JSON.stringify(captureMeta),
  });

  await embeddingService.embedAndStoreItem(userId, item);

  return item;
}

async function processDocCrawlJob(jobId) {
  const job = await docCrawlDb.getJobInternal(jobId);

  if (!job) {
    throw new Error(`Doc crawl job not found: ${jobId}`);
  }

  const userId = job.user_id;

  await docCrawlDb.updateJob(userId, jobId, {
    status: 'running',
    error_message: null,
  });

  logJob(`[doc-crawl:${jobId}] started for ${job.seed_url}`);

  try {
    const mapped = await mapDocumentationUrls(job.seed_url, {
      limit: Math.max(job.max_pages * 4, 50),
    });

    const urls = filterUrls(mapped, {
      seedUrl: job.seed_url,
      pathFilter: job.path_filter,
      maxPages: job.max_pages,
    });

    if (!urls.includes(job.seed_url)) {
      urls.unshift(job.seed_url);
    }

    const uniqueUrls = [...new Set(urls)].slice(0, job.max_pages);

    await docCrawlDb.updateJob(userId, jobId, {
      pages_found: uniqueUrls.length,
    });

    let pagesSaved = 0;

    for (const url of uniqueUrls) {
      try {
        const scraped = await scrapeDocumentation(url);
        await saveCrawledPage(userId, job, scraped);
        pagesSaved += 1;

        await docCrawlDb.updateJob(userId, jobId, {
          pages_saved: pagesSaved,
        });

        logJob(`[doc-crawl:${jobId}] saved ${pagesSaved}/${uniqueUrls.length} — ${url}`);
      } catch (pageError) {
        logJob(`[doc-crawl:${jobId}] skipped ${url} — ${pageError.message}`);
      }
    }

    await docCrawlDb.updateJob(userId, jobId, {
      status: 'done',
      pages_saved: pagesSaved,
      completed_at: Date.now(),
      error_message: pagesSaved === 0 ? 'No pages could be extracted' : null,
    });

    logJob(`[doc-crawl:${jobId}] done — ${pagesSaved} page(s) saved`);
  } catch (error) {
    await docCrawlDb.updateJob(userId, jobId, {
      status: 'failed',
      error_message: error.message,
      completed_at: Date.now(),
    });

    throw error;
  }
}

module.exports = {
  processDocCrawlJob,
};
