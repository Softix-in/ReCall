const cheerio = require('cheerio');
const config = require('../config');
const researchDb = require('../db/research');
const { fetchHtml, fetchOgMetadata } = require('../pipeline/fetch-og');
const { fetchArticleText } = require('../pipeline/fetch-article');
const {
  hasFirecrawlKey,
  scrapeDocumentation,
  researchSitePages,
  searchWeb,
  FirecrawlError,
} = require('../pipeline/fetch-firecrawl');
const { completeStructured, LlmError, RESEARCH_ANALYSIS_MODEL } = require('../services/llm-client');
const embedClient = require('../services/embed-client');
const { logJob } = require('../utils/logger');
const {
  emptyToNull,
  truncateText: truncate,
  isLoginWalledUrl: isLoginWalled,
  isBinaryOrDownloadUrl,
  isSafeHttpUrl,
  looksLikePersonName,
  sanitizeFounderInput,
  sanitizeProfileUrl,
} = require('../services/research-guards');

const YC_METADATA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    yc_batch: { type: 'string' },
    yc_status: { type: 'string' },
    short_description: { type: 'string' },
    industry: { type: 'string' },
    location: { type: 'string' },
    team_size: { type: 'string' },
    founded_year: { type: ['integer', 'null'] },
    website: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    founders: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          full_name: { type: 'string' },
          role: { type: 'string' },
          linkedin_url: { type: 'string' },
          twitter_url: { type: 'string' },
          github_url: { type: 'string' },
          personal_website: { type: 'string' },
        },
        required: ['full_name', 'role', 'linkedin_url', 'twitter_url', 'github_url', 'personal_website'],
      },
    },
  },
  required: [
    'name', 'yc_batch', 'yc_status', 'short_description', 'industry', 'location',
    'team_size', 'founded_year', 'website', 'tags', 'founders',
  ],
};

const FOUNDER_PROFILE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    education: { type: 'string' },
    previous_companies: { type: 'string' },
    previous_startups: { type: 'string' },
    technical_background: { type: 'string' },
    domain_expertise: { type: 'string' },
    achievements: { type: 'string' },
    public_bio: { type: 'string' },
    location: { type: 'string' },
    linkedin_url: { type: 'string' },
    twitter_url: { type: 'string' },
    github_url: { type: 'string' },
    personal_website: { type: 'string' },
  },
  required: [
    'education', 'previous_companies', 'previous_startups', 'technical_background',
    'domain_expertise', 'achievements', 'public_bio', 'location',
    'linkedin_url', 'twitter_url', 'github_url', 'personal_website',
  ],
};

const FUNDING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    revenue_notes: { type: 'string' },
    funding_summary: { type: 'string' },
    rounds: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          round_name: { type: 'string' },
          amount: { type: 'string' },
          currency: { type: 'string' },
          announced_date: { type: 'string' },
          investors: { type: 'string' },
          valuation: { type: 'string' },
          source_url: { type: 'string' },
          source_title: { type: 'string' },
          evidence_quote: { type: 'string' },
          confidence: { type: 'integer' },
          notes: { type: 'string' },
        },
        required: [
          'round_name', 'amount', 'currency', 'announced_date', 'investors',
          'valuation', 'source_url', 'source_title', 'evidence_quote', 'confidence', 'notes',
        ],
      },
    },
  },
  required: ['revenue_notes', 'funding_summary', 'rounds'],
};

const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    one_line_understanding: { type: 'string' },
    problem_statement: { type: 'string' },
    target_customer: { type: 'string' },
    current_solution: { type: 'string' },
    why_now: { type: 'string' },
    market_size_notes: { type: 'string' },
    business_model: { type: 'string' },
    competitors: { type: 'string' },
    moat: { type: 'string' },
    technical_depth: { type: 'string' },
    ai_or_deeptech_angle: { type: 'string' },
    go_to_market_strategy: { type: 'string' },
    risks: { type: 'string' },
    insight_summary: { type: 'string' },
    adjacent_opportunities: { type: 'string' },
    revenue_notes: { type: 'string' },
    funding_notes: { type: 'string' },
    market_demand_score: { type: 'integer' },
    problem_pain_score: { type: 'integer' },
    technical_depth_score: { type: 'integer' },
    competition_score: { type: 'integer' },
    buildability_score: { type: 'integer' },
    long_term_score: { type: 'integer' },
    opportunity_score: { type: 'integer' },
    personal_fit_score: { type: 'integer' },
    suggested_tags: {
      type: 'array',
      items: { type: 'string' },
    },
    news_signals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          news_type: { type: 'string' },
          summary: { type: 'string' },
          key_signal: { type: 'string' },
          importance_score: { type: 'integer' },
        },
        required: ['title', 'news_type', 'summary', 'key_signal', 'importance_score'],
      },
    },
  },
  required: [
    'one_line_understanding',
    'problem_statement',
    'target_customer',
    'current_solution',
    'why_now',
    'market_size_notes',
    'business_model',
    'competitors',
    'moat',
    'technical_depth',
    'ai_or_deeptech_angle',
    'go_to_market_strategy',
    'risks',
    'insight_summary',
    'adjacent_opportunities',
    'revenue_notes',
    'funding_notes',
    'market_demand_score',
    'problem_pain_score',
    'technical_depth_score',
    'competition_score',
    'buildability_score',
    'long_term_score',
    'opportunity_score',
    'personal_fit_score',
    'suggested_tags',
    'news_signals',
  ],
};

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function normalizeWebsite(url) {
  if (!url) return null;
  let websiteUrl = String(url).trim();
  if (!websiteUrl) return null;
  if (!/^https?:\/\//i.test(websiteUrl)) {
    websiteUrl = `https://${websiteUrl}`;
  }
  if (!isSafeHttpUrl(websiteUrl)) return null;
  return websiteUrl;
}

function classifyPageType(url) {
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return '';
    }
  })();

  if (/ycombinator\.com\/companies\//i.test(url)) return 'yc_profile';
  if (/pricing|plans/.test(path)) return 'pricing';
  if (/about|team|company/.test(path)) return 'about';
  if (/blog|news|changelog/.test(path)) return 'blog';
  if (/careers|jobs/.test(path)) return 'careers';
  if (/docs|documentation/.test(path)) return 'docs';
  if (/customers|case-stud/.test(path)) return 'customers';
  if (/security|trust/.test(path)) return 'security';
  if (!path || path === '/') return 'homepage';
  return 'page';
}

function absolutize(baseUrl, href) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

async function setProgress(userId, jobId, progress) {
  await researchDb.updateJob(userId, jobId, { progress });
}

async function persistPage(userId, companyId, page) {
  const pageType = page.page_type || classifyPageType(page.url);
  const text = page.markdown || page.raw_text || '';
  await researchDb.addCompanyPage(userId, {
    company_id: companyId,
    page_type: pageType,
    title: page.title || page.url,
    url: page.url,
    raw_text: text.slice(0, 40_000),
    summary: (page.description || text).slice(0, 400),
  });
  return {
    url: page.url,
    title: page.title || page.url,
    page_type: pageType,
    text,
  };
}

async function shallowCrawlWebsite(userId, company, websiteUrl) {
  const pages = [];
  const texts = [];

  try {
    const html = await fetchHtml(websiteUrl);
    const $ = cheerio.load(html);
    const title = $('title').first().text().trim() || company.name;
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 20_000);

    const saved = await persistPage(userId, company.id, {
      url: websiteUrl,
      title,
      page_type: 'homepage',
      raw_text: bodyText,
    });
    pages.push(saved);
    texts.push(`Homepage (${websiteUrl}):\n${bodyText.slice(0, 4000)}`);

    const candidateHrefs = new Set();
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      const abs = absolutize(websiteUrl, href);
      if (!abs) return;
      try {
        const u = new URL(abs);
        const base = new URL(websiteUrl);
        if (u.hostname !== base.hostname) return;
        if (/pricing|about|blog|news|careers|customers|docs|security|product|team/i.test(u.pathname)) {
          candidateHrefs.add(`${u.origin}${u.pathname}`);
        }
      } catch {
        // ignore
      }
    });

    for (const pageUrl of [...candidateHrefs].slice(0, 4)) {
      try {
        let pageText = '';
        let pageTitle = pageUrl;
        try {
          const article = await fetchArticleText(pageUrl);
          pageText = article.text || '';
          pageTitle = article.title || pageUrl;
        } catch {
          const og = await fetchOgMetadata(pageUrl);
          pageText = og.text || '';
          pageTitle = og.title || pageUrl;
        }
        if (!pageText.trim()) continue;
        const savedPage = await persistPage(userId, company.id, {
          url: pageUrl,
          title: pageTitle,
          page_type: classifyPageType(pageUrl),
          raw_text: pageText,
        });
        pages.push(savedPage);
        texts.push(`${savedPage.page_type} (${pageUrl}):\n${pageText.slice(0, 2500)}`);
      } catch (error) {
        logJob(`[research ${company.id}] shallow page fail ${pageUrl}: ${error.message}`);
      }
    }
  } catch (error) {
    logJob(`[research ${company.id}] shallow crawl failed: ${error.message}`);
  }

  return { pages, textBundle: texts.join('\n\n---\n\n'), engine: 'shallow' };
}

async function crawlWithFirecrawl(userId, company) {
  const pages = [];
  const texts = [];
  const limit = config.RESEARCH_MAX_CRAWL_PAGES || 12;

  if (company.yc_url) {
    try {
      const yc = await scrapeDocumentation(company.yc_url);
      const saved = await persistPage(userId, company.id, {
        ...yc,
        page_type: 'yc_profile',
      });
      pages.push(saved);
      texts.push(`YC profile (${company.yc_url}):\n${truncate(yc.markdown, 8000)}`);
    } catch (error) {
      logJob(`[research ${company.id}] YC Firecrawl scrape failed: ${error.message}`);
    }
  }

  const websiteUrl = normalizeWebsite(company.website);
  if (websiteUrl) {
    try {
      const sitePages = await researchSitePages(websiteUrl, { limit });
      for (const page of sitePages) {
        const saved = await persistPage(userId, company.id, page);
        pages.push(saved);
        texts.push(`${saved.page_type} (${page.url}):\n${truncate(page.markdown, 3500)}`);
      }
    } catch (error) {
      logJob(`[research ${company.id}] Firecrawl site crawl failed: ${error.message}`);
      const fallback = await shallowCrawlWebsite(userId, company, websiteUrl);
      return {
        pages: [...pages, ...fallback.pages],
        textBundle: [...texts, fallback.textBundle].filter(Boolean).join('\n\n---\n\n'),
        engine: 'firecrawl+shallow',
      };
    }
  }

  return {
    pages,
    textBundle: texts.join('\n\n---\n\n'),
    engine: 'firecrawl',
  };
}

async function crawlCompanySources(userId, company) {
  if (hasFirecrawlKey()) {
    try {
      return await crawlWithFirecrawl(userId, company);
    } catch (error) {
      if (error instanceof FirecrawlError && error.code === 'missing_firecrawl_key') {
        // fall through
      } else {
        logJob(`[research ${company.id}] Firecrawl unavailable, shallow fallback: ${error.message}`);
      }
    }
  }

  const websiteUrl = normalizeWebsite(company.website);
  if (!websiteUrl && !company.yc_url) {
    return { pages: [], textBundle: '', engine: 'none' };
  }

  if (company.yc_url && !websiteUrl) {
    // Try article fetch for YC only
    try {
      const article = await fetchArticleText(company.yc_url);
      const saved = await persistPage(userId, company.id, {
        url: company.yc_url,
        title: article.title || company.name,
        page_type: 'yc_profile',
        raw_text: article.text || '',
      });
      return {
        pages: [saved],
        textBundle: `YC profile (${company.yc_url}):\n${truncate(article.text, 8000)}`,
        engine: 'shallow',
      };
    } catch (error) {
      logJob(`[research ${company.id}] YC shallow fetch failed: ${error.message}`);
      return { pages: [], textBundle: company.raw_page_text || '', engine: 'none' };
    }
  }

  return shallowCrawlWebsite(userId, company, websiteUrl);
}

async function extractYcMetadata(userId, company, crawlText) {
  const sourceText = [
    company.raw_page_text,
    crawlText,
  ].filter(Boolean).join('\n\n');

  if (!sourceText.trim()) {
    return { skipped: true, meta: null };
  }

  try {
    const meta = await completeStructured({
      userId,
      model: RESEARCH_ANALYSIS_MODEL,
      schemaName: 'startup_yc_metadata',
      schema: YC_METADATA_SCHEMA,
      temperature: 0.1,
      prompt: `Extract structured YC / company metadata from the source text.
Only use facts present in the text. Use empty string for unknown strings, null for founded_year if unknown.
yc_status examples: Active, Acquired, Public, Inactive — only if stated.
Do not invent LinkedIn/Twitter URLs; leave empty string if not present.
CRITICAL: founders must be real people (human full names). NEVER treat UI labels, download buttons, OS names, CTAs, nav items, or product names as founders (e.g. "Download for Windows", "Get started", "Docs").
If no clear founder names appear, return an empty founders array.

Known seed values:
Name: ${company.name}
Batch: ${company.yc_batch || ''}
Website: ${company.website || ''}
YC URL: ${company.yc_url || ''}

Source text:
${truncate(sourceText, 14_000)}`,
    });

    const patch = {};
    if (emptyToNull(meta.name) && meta.name !== company.name) patch.name = meta.name.trim();
    if (emptyToNull(meta.yc_batch)) patch.yc_batch = meta.yc_batch.trim();
    if (emptyToNull(meta.yc_status)) patch.yc_status = meta.yc_status.trim();
    if (emptyToNull(meta.short_description)) patch.short_description = meta.short_description.trim();
    if (emptyToNull(meta.industry)) patch.industry = meta.industry.trim();
    if (emptyToNull(meta.location)) patch.location = meta.location.trim();
    if (emptyToNull(meta.team_size)) patch.team_size = meta.team_size.trim();
    if (Number.isFinite(meta.founded_year)) patch.founded_year = meta.founded_year;
    if (emptyToNull(meta.website) && !company.website) {
      patch.website = normalizeWebsite(meta.website);
    }
    if (Array.isArray(meta.tags) && meta.tags.length) {
      patch.tags = [...new Set([...(company.tags || []), ...meta.tags.map(String)])].slice(0, 25);
    }

    if (Object.keys(patch).length) {
      await researchDb.updateCompany(userId, company.id, patch);
    }

    return { skipped: false, meta };
  } catch (error) {
    if (error instanceof LlmError && error.code === 'missing_api_key') {
      return { skipped: true, meta: null, missingKey: true };
    }
    logJob(`[research ${company.id}] YC metadata extract failed: ${error.message}`);
    return { skipped: true, meta: null, error: error.message };
  }
}

async function upsertFoundersFromMeta(userId, company, metaFounders = []) {
  const existing = await researchDb.listFoundersForCompany(userId, company.id);
  const byName = new Map(existing.map((f) => [f.full_name.toLowerCase(), f]));

  for (const entry of metaFounders.slice(0, 10)) {
    const sanitized = sanitizeFounderInput({
      full_name: entry.full_name,
      role: entry.role,
      linkedin_url: entry.linkedin_url,
      twitter_url: entry.twitter_url,
      github_url: entry.github_url,
      personal_website: entry.personal_website,
    });
    if (!sanitized) {
      logJob(`[research ${company.id}] skipped bogus founder candidate: ${entry.full_name || '(empty)'}`);
      continue;
    }

    const key = sanitized.full_name.toLowerCase();
    let founder = byName.get(key);

    if (!founder) {
      founder = await researchDb.createFounder(userId, sanitized);
      await researchDb.linkFounderToCompany(userId, company.id, founder.id, {
        role: sanitized.current_role,
        source_url: company.yc_url || company.website || company.source_url,
      });
      byName.set(key, founder);
    } else {
      const patch = {};
      if (sanitized.current_role && !founder.current_role) patch.current_role = sanitized.current_role;
      if (sanitized.linkedin_url && !founder.linkedin_url) patch.linkedin_url = sanitized.linkedin_url;
      if (sanitized.twitter_url && !founder.twitter_url) patch.twitter_url = sanitized.twitter_url;
      if (sanitized.github_url && !founder.github_url) patch.github_url = sanitized.github_url;
      if (sanitized.personal_website && !founder.personal_website) {
        patch.personal_website = sanitized.personal_website;
      }
      if (Object.keys(patch).length) {
        founder = await researchDb.updateFounder(userId, founder.id, patch);
        byName.set(key, founder);
      }
    }
  }

  const founders = await researchDb.listFoundersForCompany(userId, company.id);
  return founders.filter((f) => looksLikePersonName(f.full_name));
}

async function gatherFounderEvidence(userId, company, founder) {
  if (!looksLikePersonName(founder.full_name)) {
    logJob(`[research ${company.id}] skip enrichment for invalid founder name: ${founder.full_name}`);
    return '';
  }

  const chunks = [];
  const urls = [
    { type: 'Personal website', url: sanitizeProfileUrl(founder.personal_website, { allowLoginWalled: false }) },
    { type: 'GitHub', url: sanitizeProfileUrl(founder.github_url, { allowLoginWalled: false }) },
    { type: 'LinkedIn', url: sanitizeProfileUrl(founder.linkedin_url, { allowLoginWalled: true }) },
    { type: 'Twitter', url: sanitizeProfileUrl(founder.twitter_url, { allowLoginWalled: true }) },
  ].filter((e) => e.url);

  for (const entry of urls) {
    if (isBinaryOrDownloadUrl(entry.url)) {
      logJob(`[research ${company.id}] skip binary URL: ${entry.url}`);
      continue;
    }

    if (isLoginWalled(entry.url)) {
      await researchDb.addFounderSource(userId, {
        founder_id: founder.id,
        company_id: company.id,
        source_type: entry.type,
        source_title: `${founder.full_name} — ${entry.type}`,
        source_url: entry.url,
        raw_text: null,
        extracted_summary: `Public ${entry.type} profile URL captured (content not scraped — login wall).`,
        credibility_score: 6,
      });
      continue;
    }

    try {
      let title = entry.url;
      let text = '';
      let summary = null;

      if (hasFirecrawlKey()) {
        try {
          const doc = await scrapeDocumentation(entry.url, { waitFor: 1500, timeout: 20_000 });
          title = doc.title || title;
          text = truncate(doc.markdown || '', 6_000);
          summary = doc.description || text.slice(0, 300);
        } catch {
          const og = await fetchOgMetadata(entry.url);
          title = og.title || title;
          text = truncate(og.text || '', 4_000);
          summary = og.description || text.slice(0, 300);
        }
      } else {
        const og = await fetchOgMetadata(entry.url);
        title = og.title || title;
        text = truncate(og.text || '', 4_000);
        summary = og.description || text.slice(0, 300);
      }

      await researchDb.addFounderSource(userId, {
        founder_id: founder.id,
        company_id: company.id,
        source_type: entry.type,
        source_title: title,
        source_url: entry.url,
        raw_text: text || null,
        extracted_summary: summary,
        credibility_score: 7,
      });

      if (text) {
        chunks.push(`${entry.type} (${entry.url}):\n${truncate(text, 2000)}`);
      }
    } catch (error) {
      logJob(`[research ${company.id}] founder source ${entry.url}: ${error.message}`);
    }
  }

  if (hasFirecrawlKey() && looksLikePersonName(founder.full_name)) {
    try {
      // Snippets only — avoid scraping full pages into memory during search.
      const query = `"${founder.full_name}" "${company.name}" founder OR co-founder`;
      const { hits } = await searchWeb(query, {
        limit: Math.min(config.RESEARCH_MAX_SEARCH_RESULTS || 5, 3),
        scrape: false,
      });

      for (const hit of hits.slice(0, 3)) {
        if (!hit.url || isLoginWalled(hit.url) || isBinaryOrDownloadUrl(hit.url)) continue;
        const text = truncate(hit.description || '', 800);
        await researchDb.addFounderSource(userId, {
          founder_id: founder.id,
          company_id: company.id,
          source_type: 'web_search',
          source_title: hit.title || hit.url,
          source_url: hit.url,
          raw_text: text || null,
          extracted_summary: text || null,
          credibility_score: 5,
        });
        if (text) {
          chunks.push(`Search hit (${hit.url}):\n${text}`);
        }
      }
    } catch (error) {
      logJob(`[research ${company.id}] founder search failed: ${error.message}`);
    }
  }

  return chunks.join('\n\n---\n\n');
}

async function enrichFoundersDeep(userId, company, founders) {
  let enriched = 0;
  const validFounders = (founders || []).filter((f) => looksLikePersonName(f.full_name));

  for (const founder of validFounders) {
    const evidence = await gatherFounderEvidence(userId, company, founder);
    if (!evidence.trim()) {
      enriched += 1;
      continue;
    }

    try {
      const profile = await completeStructured({
        userId,
        model: RESEARCH_ANALYSIS_MODEL,
        schemaName: 'startup_founder_profile',
        schema: FOUNDER_PROFILE_SCHEMA,
        temperature: 0.1,
        prompt: `Extract a founder profile from the evidence below.
Only use facts supported by the evidence. Use empty string when unknown.
Do NOT invent LinkedIn/Twitter/GitHub URLs — only fill if explicitly present.
Prefer concise factual phrases over marketing language.
Never set github_url / personal_website to installer or binary download links.

Founder: ${founder.full_name}
Company: ${company.name}
Role: ${founder.company_role || founder.current_role || ''}

Evidence:
${truncate(evidence, 8_000)}`,
      });

      const patch = {};
      for (const key of [
        'education', 'previous_companies', 'previous_startups', 'technical_background',
        'domain_expertise', 'achievements', 'public_bio', 'location',
      ]) {
        const value = emptyToNull(profile[key]);
        if (value && !founder[key]) patch[key] = value;
      }

      const linkedin = sanitizeProfileUrl(profile.linkedin_url, { allowLoginWalled: true });
      const twitter = sanitizeProfileUrl(profile.twitter_url, { allowLoginWalled: true });
      const github = sanitizeProfileUrl(profile.github_url, { allowLoginWalled: false });
      const website = sanitizeProfileUrl(profile.personal_website, { allowLoginWalled: false });
      if (linkedin && !founder.linkedin_url) patch.linkedin_url = linkedin;
      if (twitter && !founder.twitter_url) patch.twitter_url = twitter;
      if (github && !founder.github_url) patch.github_url = github;
      if (website && !founder.personal_website) patch.personal_website = website;

      if (Object.keys(patch).length) {
        await researchDb.updateFounder(userId, founder.id, patch);
      }
      enriched += 1;
    } catch (error) {
      if (error instanceof LlmError && error.code === 'missing_api_key') {
        return { enriched, missingKey: true };
      }
      logJob(`[research ${company.id}] founder LLM enrich failed: ${error.message}`);
      enriched += 1;
    }
  }

  return { enriched, missingKey: false };
}

async function researchFunding(userId, company, crawlText) {
  const evidenceChunks = [];

  if (hasFirecrawlKey()) {
    const queries = [
      `"${company.name}" funding OR raised OR seed OR Series`,
      company.website ? `"${company.name}" revenue OR ARR` : null,
    ].filter(Boolean);

    for (const query of queries) {
      try {
        const { hits } = await searchWeb(query, {
          limit: config.RESEARCH_MAX_SEARCH_RESULTS || 5,
          scrape: false,
          sources: ['web', 'news'],
        });

        for (const hit of hits.slice(0, 4)) {
          if (!hit.url || isBinaryOrDownloadUrl(hit.url)) continue;
          let text = truncate(hit.description || '', 1200);

          // Optionally fetch one page of markdown for stronger evidence, with hard caps.
          if (hasFirecrawlKey() && evidenceChunks.length < 4) {
            try {
              const doc = await scrapeDocumentation(hit.url, { waitFor: 1000, timeout: 20_000 });
              text = truncate(doc.markdown || text, 2500);
            } catch {
              // keep snippet
            }
          }
          await researchDb.addSource(userId, {
            company_id: company.id,
            source_type: 'funding_search',
            title: hit.title || hit.url,
            url: hit.url,
            extracted_text: text ? text.slice(0, 10_000) : null,
            credibility_score: 6,
          });
          if (text) {
            evidenceChunks.push(`${hit.title || 'Result'} (${hit.url}):\n${truncate(text, 2500)}`);
          }
        }
      } catch (error) {
        logJob(`[research ${company.id}] funding search failed: ${error.message}`);
      }
    }
  }

  evidenceChunks.push(`Company crawl context:\n${truncate(crawlText, 4000)}`);
  if (company.raw_page_text) {
    evidenceChunks.push(`Seed page:\n${truncate(company.raw_page_text, 3000)}`);
  }

  try {
    const extracted = await completeStructured({
      userId,
      model: RESEARCH_ANALYSIS_MODEL,
      schemaName: 'startup_funding_extract',
      schema: FUNDING_SCHEMA,
      temperature: 0.1,
      prompt: `Extract funding and revenue facts for ${company.name}.
CRITICAL RULES:
- Do NOT invent funding amounts, investors, valuations, or revenue figures.
- Only include a round when the evidence explicitly supports it.
- Every round MUST include source_url from the evidence and an evidence_quote copied/paraphrased tightly from that source.
- If nothing is evidenced, return empty rounds and say so in funding_summary / revenue_notes.
- confidence is 1-10 based on source quality (press release / Crunchbase / company blog higher).

Evidence:
${truncate(evidenceChunks.join('\n\n---\n\n'), 14_000)}`,
    });

    await researchDb.clearFundingForCompany(userId, company.id);

    let roundsSaved = 0;
    for (const round of (extracted.rounds || []).slice(0, 12)) {
      if (!emptyToNull(round.round_name) && !emptyToNull(round.amount)) continue;
      if (!emptyToNull(round.source_url) || !emptyToNull(round.evidence_quote)) continue;

      await researchDb.addFunding(userId, {
        company_id: company.id,
        round_name: emptyToNull(round.round_name),
        amount: emptyToNull(round.amount),
        currency: emptyToNull(round.currency),
        announced_date: emptyToNull(round.announced_date),
        investors: emptyToNull(round.investors),
        valuation: emptyToNull(round.valuation),
        source_url: emptyToNull(round.source_url),
        source_title: emptyToNull(round.source_title),
        evidence_quote: emptyToNull(round.evidence_quote),
        confidence: clampScore(round.confidence),
        notes: emptyToNull(round.notes),
      });
      roundsSaved += 1;
    }

    const companyPatch = {};
    if (emptyToNull(extracted.revenue_notes)) companyPatch.revenue_notes = extracted.revenue_notes.trim();
    if (emptyToNull(extracted.funding_summary)) companyPatch.funding_summary = extracted.funding_summary.trim();
    if (Object.keys(companyPatch).length) {
      await researchDb.updateCompany(userId, company.id, companyPatch);
    }

    return {
      skipped: false,
      roundsSaved,
      revenue_notes: emptyToNull(extracted.revenue_notes),
      funding_summary: emptyToNull(extracted.funding_summary),
    };
  } catch (error) {
    if (error instanceof LlmError && error.code === 'missing_api_key') {
      return { skipped: true, missingKey: true, roundsSaved: 0 };
    }
    logJob(`[research ${company.id}] funding extract failed: ${error.message}`);
    return { skipped: true, roundsSaved: 0, error: error.message };
  }
}

function buildAnalysisPrompt(company, founders, websiteText, funding) {
  const founderLines = founders
    .map((f) => {
      const bits = [
        f.full_name,
        f.company_role || f.current_role,
        f.education,
        f.previous_companies,
        f.technical_background,
      ].filter(Boolean);
      return `- ${bits.join(' | ')}`;
    })
    .join('\n');

  return `You are a startup research analyst. Synthesize deep research for a founder studying markets and adjacent opportunities.

Do NOT invent specific funding amounts, customers, or facts unsupported by sources.
If unknown, say "Unknown from available sources."
Scores are 1-10 integers.
opportunity_score should roughly equal market_demand + problem_pain + long_term - competition (clamped 1-10).
personal_fit_score: use 5 if unsure.
revenue_notes / funding_notes: only restate evidenced facts; otherwise "Unknown from available sources."

Company:
Name: ${company.name}
Batch: ${company.yc_batch || 'Unknown'}
YC status: ${company.yc_status || 'Unknown'}
Industry: ${company.industry || 'Unknown'}
Location: ${company.location || 'Unknown'}
Website: ${company.website || 'Unknown'}
YC URL: ${company.yc_url || 'Unknown'}
Description: ${company.short_description || 'Unknown'}
Funding summary: ${funding?.funding_summary || company.funding_summary || 'Unknown'}
Revenue notes: ${funding?.revenue_notes || company.revenue_notes || 'Unknown'}
User note: ${company.user_note || 'None'}
User tags: ${(company.tags || []).join(', ') || 'None'}

Founders:
${founderLines || 'Unknown'}

YC / page text:
${truncate(company.raw_page_text, 6000)}

Website / crawl text:
${truncate(websiteText, 9000)}

Return structured research covering problem, customer, why now, competitors, technical depth, AI/deep-tech angle, risks, adjacent opportunities (especially non-copy ideas), and news_signals inferred from materials (not fake headlines).`;
}

async function runAiAnalysis(userId, company, founders, websiteText, funding) {
  try {
    const analysis = await completeStructured({
      userId,
      model: RESEARCH_ANALYSIS_MODEL,
      schemaName: 'startup_research_analysis',
      schema: ANALYSIS_SCHEMA,
      prompt: buildAnalysisPrompt(company, founders, websiteText, funding),
      temperature: 0.2,
    });

    const scores = {
      market_demand_score: clampScore(analysis.market_demand_score),
      problem_pain_score: clampScore(analysis.problem_pain_score),
      technical_depth_score: clampScore(analysis.technical_depth_score),
      competition_score: clampScore(analysis.competition_score),
      buildability_score: clampScore(analysis.buildability_score),
      long_term_score: clampScore(analysis.long_term_score),
      opportunity_score: clampScore(analysis.opportunity_score),
      personal_fit_score: clampScore(analysis.personal_fit_score),
    };

    if (!scores.opportunity_score && scores.market_demand_score && scores.problem_pain_score) {
      const raw =
        (scores.market_demand_score || 5)
        + (scores.problem_pain_score || 5)
        + (scores.long_term_score || 5)
        - (scores.competition_score || 5);
      scores.opportunity_score = clampScore(raw / 2);
    }

    const saved = await researchDb.upsertAnalysis(userId, company.id, {
      ...analysis,
      ...scores,
      revenue_notes: emptyToNull(analysis.revenue_notes) || funding?.revenue_notes || company.revenue_notes,
      funding_notes: emptyToNull(analysis.funding_notes) || funding?.funding_summary || company.funding_summary,
    });

    if (Array.isArray(analysis.suggested_tags) && analysis.suggested_tags.length) {
      const merged = [...new Set([...(company.tags || []), ...analysis.suggested_tags.map(String)])].slice(0, 25);
      await researchDb.updateCompany(userId, company.id, { tags: merged });
    }

    return { analysis: saved, raw: analysis, skipped: false };
  } catch (error) {
    if (error instanceof LlmError && error.code === 'missing_api_key') {
      logJob(`[research ${company.id}] AI skipped — no Fireworks API key`);

      const fallback = await researchDb.upsertAnalysis(userId, company.id, {
        one_line_understanding: company.short_description || `${company.name} (analysis pending — add Fireworks API key)`,
        problem_statement: 'Pending AI analysis — configure Fireworks API key in Profile settings.',
        target_customer: 'Unknown',
        why_now: 'Unknown',
        insight_summary: company.user_note || company.short_description || 'Captured for research; AI analysis pending.',
        adjacent_opportunities: 'Run research again after configuring an API key.',
        revenue_notes: company.revenue_notes || 'Unknown',
        funding_notes: company.funding_summary || 'Unknown',
      });

      return { analysis: fallback, raw: {}, skipped: true };
    }

    throw error;
  }
}

async function discoverNewsSignals(userId, company, analysis) {
  const signals = Array.isArray(analysis.news_signals) ? analysis.news_signals : [];
  let created = 0;

  for (const signal of signals.slice(0, 8)) {
    if (!signal?.title) continue;

    try {
      await researchDb.addNews(userId, {
        company_id: company.id,
        title: signal.title,
        url: null,
        publisher: 'AI-extracted signal',
        news_type: signal.news_type || 'Market analysis',
        summary: signal.summary,
        key_signal: signal.key_signal || null,
        importance_score: clampScore(signal.importance_score),
        raw_text: signal.summary,
      });
      created += 1;
    } catch (error) {
      logJob(`[research ${company.id}] news signal skip: ${error.message}`);
    }
  }

  if (company.yc_url) {
    try {
      await researchDb.addNews(userId, {
        company_id: company.id,
        title: `${company.name} listed on YC directory`,
        url: company.yc_url,
        publisher: 'Y Combinator',
        news_type: 'YC announcement',
        summary: company.short_description || analysis.one_line_understanding || null,
        key_signal: company.yc_batch ? `Part of ${company.yc_batch}` : 'YC company',
        importance_score: 7,
      });
      created += 1;
    } catch (error) {
      logJob(`[research ${company.id}] YC news skip: ${error.message}`);
    }
  }

  if (hasFirecrawlKey()) {
    try {
      const { hits } = await searchWeb(`"${company.name}" startup`, {
        limit: 3,
        sources: ['news'],
        scrape: false,
      });
      for (const hit of hits.slice(0, 3)) {
        try {
          await researchDb.addNews(userId, {
            company_id: company.id,
            title: hit.title || hit.url,
            url: hit.url,
            publisher: hit.publisher || 'Web search',
            news_type: 'Press',
            summary: hit.description || null,
            key_signal: null,
            importance_score: 5,
            raw_text: hit.description || null,
          });
          created += 1;
        } catch (error) {
          logJob(`[research ${company.id}] press news skip: ${error.message}`);
        }
      }
    } catch (error) {
      logJob(`[research ${company.id}] news search failed: ${error.message}`);
    }
  }

  return created;
}

async function embedCompany(userId, company, analysis) {
  try {
    const text = [
      company.name,
      company.short_description,
      company.funding_summary,
      analysis?.one_line_understanding,
      analysis?.problem_statement,
      analysis?.insight_summary,
      analysis?.adjacent_opportunities,
      (company.tags || []).join(' '),
    ]
      .filter(Boolean)
      .join('\n');

    if (!text.trim()) return;

    const embedding = await embedClient.embedText(text);
    await researchDb.updateCompany(userId, company.id, { embedding });
  } catch (error) {
    logJob(`[research ${company.id}] embedding skipped: ${error.message}`);
  }
}

async function processResearchJob(jobId) {
  const job = await researchDb.getJobInternal(jobId);

  if (!job) {
    throw new Error(`Research job not found: ${jobId}`);
  }

  const userId = job.user_id;
  const company = await researchDb.getCompanyInternal(job.company_id);

  if (!company) {
    throw new Error(`Company not found for job ${jobId}`);
  }

  await researchDb.updateJob(userId, jobId, {
    status: 'running',
    started_at: Date.now(),
    error_message: null,
    progress: { step: 'starting' },
  });

  await researchDb.updateCompany(userId, company.id, { status: 'processing' });

  try {
    await setProgress(userId, jobId, { step: 'firecrawl_crawl' });
    const crawl = await crawlCompanySources(userId, company);

    await setProgress(userId, jobId, {
      step: 'yc_metadata',
      pages_crawled: crawl.pages.length,
      crawl_engine: crawl.engine,
    });

    const { meta, skipped: metaSkipped, missingKey: metaMissingKey } = await extractYcMetadata(
      userId,
      company,
      crawl.textBundle,
    );

    let working = await researchDb.getCompany(userId, company.id);

    await setProgress(userId, jobId, {
      step: 'founder_discovery',
      pages_crawled: crawl.pages.length,
      crawl_engine: crawl.engine,
      yc_metadata: !metaSkipped,
    });

    let founders = await upsertFoundersFromMeta(userId, working, meta?.founders || []);

    await setProgress(userId, jobId, {
      step: 'founder_enrichment',
      pages_crawled: crawl.pages.length,
      founders: founders.length,
    });

    const founderResult = await enrichFoundersDeep(userId, working, founders);
    founders = await researchDb.listFoundersForCompany(userId, company.id);

    await setProgress(userId, jobId, {
      step: 'funding_research',
      pages_crawled: crawl.pages.length,
      founder_sources: founderResult.enriched,
    });

    working = await researchDb.getCompany(userId, company.id);
    const funding = await researchFunding(userId, working, crawl.textBundle);

    await setProgress(userId, jobId, {
      step: 'ai_synthesis',
      pages_crawled: crawl.pages.length,
      founder_sources: founderResult.enriched,
      funding_rounds: funding.roundsSaved || 0,
    });

    working = await researchDb.getCompany(userId, company.id);
    const { analysis, raw, skipped } = await runAiAnalysis(
      userId,
      working,
      founders,
      crawl.textBundle,
      funding,
    );

    const aiSkipped = skipped || metaMissingKey || founderResult.missingKey || funding.missingKey;

    await setProgress(userId, jobId, {
      step: 'news_signals',
      pages_crawled: crawl.pages.length,
      founder_sources: founderResult.enriched,
      funding_rounds: funding.roundsSaved || 0,
      ai_skipped: aiSkipped,
    });

    const newsCount = await discoverNewsSignals(userId, working, raw || {});

    await setProgress(userId, jobId, {
      step: 'embedding',
      pages_crawled: crawl.pages.length,
      news_count: newsCount,
    });

    await embedCompany(userId, working, analysis);

    await researchDb.updateCompany(userId, company.id, {
      status: aiSkipped ? 'needs_review' : 'processed',
    });

    await researchDb.updateJob(userId, jobId, {
      status: aiSkipped ? 'needs_review' : 'completed',
      completed_at: Date.now(),
      progress: {
        step: 'done',
        pages_crawled: crawl.pages.length,
        crawl_engine: crawl.engine,
        yc_metadata: !metaSkipped,
        founder_sources: founderResult.enriched,
        funding_rounds: funding.roundsSaved || 0,
        news_count: newsCount,
        ai_skipped: aiSkipped,
      },
    });

    logJob(`[research ${jobId}] completed for ${company.name} via ${crawl.engine}`);
  } catch (error) {
    await researchDb.updateJob(userId, jobId, {
      status: 'failed',
      error_message: error.message,
      completed_at: Date.now(),
      retry_count: (job.retry_count || 0) + 1,
    });

    await researchDb.updateCompany(userId, company.id, { status: 'needs_review' });
    throw error;
  }
}

module.exports = {
  processResearchJob,
};
