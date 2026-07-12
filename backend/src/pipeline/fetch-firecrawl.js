const { Firecrawl } = require('@mendable/firecrawl-js');
const config = require('../config');

class FirecrawlError extends Error {
  constructor(message, { status = 503, code = 'firecrawl_unavailable' } = {}) {
    super(message);
    this.name = 'FirecrawlError';
    this.status = status;
    this.code = code;
  }
}

function hasFirecrawlKey() {
  return Boolean(config.FIRECRAWL_API_KEY);
}

function getClient() {
  if (!config.FIRECRAWL_API_KEY) {
    throw new FirecrawlError(
      'FIRECRAWL_API_KEY is not configured. Add it to .env to use document extraction.',
      { status: 503, code: 'missing_firecrawl_key' },
    );
  }

  return new Firecrawl({ apiKey: config.FIRECRAWL_API_KEY });
}

function parseDocument(doc, fallbackUrl) {
  const metadata = doc?.metadata || {};
  const markdown = doc?.markdown || '';

  return {
    url: metadata.sourceURL || metadata.url || fallbackUrl,
    title: metadata.title || metadata.ogTitle || null,
    markdown,
    description: metadata.description || metadata.ogDescription || null,
    metadata,
  };
}

function normalizeSearchHits(result) {
  const buckets = [];
  if (Array.isArray(result?.web)) buckets.push(...result.web);
  if (Array.isArray(result?.news)) buckets.push(...result.news);
  if (Array.isArray(result?.data?.web)) buckets.push(...result.data.web);
  if (Array.isArray(result?.data?.news)) buckets.push(...result.data.news);
  if (Array.isArray(result?.data) && !result?.web) buckets.push(...result.data);

  return buckets
    .map((hit) => {
      if (!hit || typeof hit !== 'object') return null;
      const url = hit.url || hit.metadata?.sourceURL || hit.metadata?.url || null;
      if (!url) return null;
      return {
        url,
        title: hit.title || hit.metadata?.title || null,
        description: hit.description || hit.snippet || hit.metadata?.description || null,
        markdown: hit.markdown || null,
        publisher: hit.publisher || hit.source || null,
      };
    })
    .filter(Boolean);
}

async function scrapeDocumentation(url, options = {}) {
  const client = getClient();

  const doc = await client.scrape(url, {
    formats: ['markdown'],
    onlyMainContent: true,
    waitFor: options.waitFor ?? 2000,
    timeout: options.timeout ?? 45_000,
  });

  const parsed = parseDocument(doc, url);

  if (!parsed.markdown?.trim()) {
    throw new FirecrawlError(`Firecrawl returned no content for ${url}`, { status: 502 });
  }

  return parsed;
}

async function mapDocumentationUrls(seedUrl, { search = null, limit = 100 } = {}) {
  const client = getClient();

  const options = { limit };
  if (search) {
    options.search = search;
  }

  const result = await client.map(seedUrl, options);
  const links = result?.links || [];

  return links
    .map((link) => (typeof link === 'string' ? link : link?.url))
    .filter((link) => typeof link === 'string' && /^https?:\/\//i.test(link));
}

async function crawlDocumentation(seedUrl, { includePaths = [], limit = 25 } = {}) {
  const client = getClient();

  const options = {
    limit,
    scrapeOptions: {
      formats: ['markdown'],
      onlyMainContent: true,
      waitFor: 2000,
    },
    pollInterval: 2,
    timeout: 300,
  };

  if (includePaths.length > 0) {
    options.includePaths = includePaths;
  }

  const result = await client.crawl(seedUrl, options);
  const pages = result?.data || [];

  return pages
    .map((page) => parseDocument(page, seedUrl))
    .filter((page) => page.markdown?.trim());
}

/**
 * Map + selective scrape for startup research (lighter than full crawl).
 * Falls back to crawl when map finds few URLs.
 */
async function researchSitePages(seedUrl, {
  limit = 12,
  pathHint = /about|team|pricing|blog|news|product|docs|customers|careers|security|company/i,
} = {}) {
  const client = getClient();
  const pages = [];
  const seen = new Set();

  const pushPage = (parsed) => {
    if (!parsed?.url || !parsed.markdown?.trim()) return;
    const key = parsed.url.replace(/\/$/, '');
    if (seen.has(key)) return;
    seen.add(key);
    pages.push(parsed);
  };

  try {
    const homepage = await scrapeDocumentation(seedUrl);
    pushPage(homepage);
  } catch (error) {
    // continue — map/crawl may still work
    if (!(error instanceof FirecrawlError)) {
      throw error;
    }
  }

  let mapped = [];
  try {
    mapped = await mapDocumentationUrls(seedUrl, { limit: Math.max(limit * 3, 30) });
  } catch {
    mapped = [];
  }

  const prioritized = mapped
    .filter((url) => {
      try {
        const path = new URL(url).pathname;
        return pathHint.test(path) || path === '/' || path === '';
      } catch {
        return false;
      }
    })
    .slice(0, Math.max(limit - pages.length, 0));

  for (const url of prioritized) {
    if (pages.length >= limit) break;
    try {
      const doc = await scrapeDocumentation(url, { waitFor: 1500 });
      pushPage(doc);
    } catch {
      // skip failed page
    }
  }

  if (pages.length < 2) {
    try {
      const crawled = await crawlDocumentation(seedUrl, { limit });
      for (const page of crawled) {
        if (pages.length >= limit) break;
        pushPage(page);
      }
    } catch {
      // keep whatever we have
    }
  }

  return pages;
}

async function searchWeb(query, {
  limit = 5,
  sources = ['web'],
  scrape = false,
  tbs = null,
} = {}) {
  const client = getClient();

  const req = {
    limit,
    sources,
  };

  if (tbs) req.tbs = tbs;
  if (scrape) {
    req.scrapeOptions = {
      formats: ['markdown'],
      onlyMainContent: true,
    };
  }

  const result = await client.search(query, req);
  return {
    id: result?.id || null,
    hits: normalizeSearchHits(result),
  };
}

module.exports = {
  FirecrawlError,
  hasFirecrawlKey,
  scrapeDocumentation,
  mapDocumentationUrls,
  crawlDocumentation,
  researchSitePages,
  searchWeb,
};
