const cheerio = require('cheerio');
const researchDb = require('../db/research');
const { fetchHtml, fetchOgMetadata } = require('../pipeline/fetch-og');
const { fetchArticleText } = require('../pipeline/fetch-article');
const { completeStructured, LlmError } = require('../services/llm-client');
const embedClient = require('../services/embed-client');
const { logJob } = require('../utils/logger');

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

function truncate(text, max = 12_000) {
  if (!text) return '';
  const cleaned = String(text).replace(/\s+/g, ' ').trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

function absolutize(baseUrl, href) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function classifyPageType(url) {
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return '';
    }
  })();

  if (/pricing|plans/.test(path)) return 'pricing';
  if (/about|team|company/.test(path)) return 'about';
  if (/blog|news|changelog/.test(path)) return 'blog';
  if (/careers|jobs/.test(path)) return 'careers';
  if (/docs|documentation/.test(path)) return 'docs';
  if (/customers|case-stud/.test(path)) return 'customers';
  if (/security|trust/.test(path)) return 'security';
  return 'homepage';
}

async function crawlCompanyWebsite(userId, company) {
  if (!company.website) {
    return { pages: [], textBundle: '' };
  }

  let websiteUrl = company.website.trim();
  if (!/^https?:\/\//i.test(websiteUrl)) {
    websiteUrl = `https://${websiteUrl}`;
  }

  const pages = [];
  const texts = [];

  try {
    const html = await fetchHtml(websiteUrl);
    const $ = cheerio.load(html);
    const title = $('title').first().text().trim() || company.name;
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 20_000);

    await researchDb.addCompanyPage(userId, {
      company_id: company.id,
      page_type: 'homepage',
      title,
      url: websiteUrl,
      raw_text: bodyText,
      summary: bodyText.slice(0, 400),
    });

    pages.push({ url: websiteUrl, title, page_type: 'homepage' });
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
        if (/pricing|about|blog|news|careers|customers|docs|security|product/i.test(u.pathname)) {
          candidateHrefs.add(`${u.origin}${u.pathname}`);
        }
      } catch {
        // ignore
      }
    });

    const extras = [...candidateHrefs].slice(0, 4);

    for (const pageUrl of extras) {
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

        const pageType = classifyPageType(pageUrl);
        await researchDb.addCompanyPage(userId, {
          company_id: company.id,
          page_type: pageType,
          title: pageTitle,
          url: pageUrl,
          raw_text: pageText.slice(0, 20_000),
          summary: pageText.slice(0, 400),
        });

        pages.push({ url: pageUrl, title: pageTitle, page_type: pageType });
        texts.push(`${pageType} (${pageUrl}):\n${pageText.slice(0, 2500)}`);
      } catch (error) {
        logJob(`[research ${company.id}] page crawl failed ${pageUrl}: ${error.message}`);
      }
    }
  } catch (error) {
    logJob(`[research ${company.id}] website crawl failed: ${error.message}`);
  }

  return {
    pages,
    textBundle: texts.join('\n\n---\n\n'),
  };
}

async function enrichFounderSources(userId, company, founders) {
  let enriched = 0;

  for (const founder of founders) {
    const urls = [
      { type: 'LinkedIn', url: founder.linkedin_url },
      { type: 'GitHub', url: founder.github_url },
      { type: 'Personal website', url: founder.personal_website },
      { type: 'Twitter', url: founder.twitter_url },
    ].filter((entry) => entry.url);

    for (const entry of urls) {
      try {
        // LinkedIn/Twitter often block bots — still record the URL as evidence.
        if (/linkedin\.com|twitter\.com|x\.com/i.test(entry.url)) {
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
          enriched += 1;
          continue;
        }

        const og = await fetchOgMetadata(entry.url);
        await researchDb.addFounderSource(userId, {
          founder_id: founder.id,
          company_id: company.id,
          source_type: entry.type,
          source_title: og.title || `${founder.full_name} — ${entry.type}`,
          source_url: entry.url,
          raw_text: og.text || null,
          extracted_summary: og.description || og.text?.slice(0, 300) || null,
          credibility_score: 7,
        });
        enriched += 1;
      } catch (error) {
        logJob(`[research ${company.id}] founder source ${entry.url}: ${error.message}`);
      }
    }
  }

  return enriched;
}

async function discoverNewsSignals(userId, company, analysis) {
  const signals = Array.isArray(analysis.news_signals) ? analysis.news_signals : [];
  let created = 0;

  for (const signal of signals.slice(0, 8)) {
    if (!signal?.title) continue;

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
  }

  // Also store a synthetic "YC listing" news row as a baseline signal.
  if (company.yc_url) {
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
  }

  return created;
}

function buildAnalysisPrompt(company, founders, websiteText) {
  const founderLines = founders
    .map((f) => `- ${f.full_name}${f.company_role ? ` (${f.company_role})` : ''}${f.linkedin_url ? ` LinkedIn: ${f.linkedin_url}` : ''}`)
    .join('\n');

  return `You are a startup research analyst. Analyze this YC / startup company for a founder researching markets and adjacent opportunities.

Do NOT invent specific funding amounts, customers, or facts that are not supported by the source text.
If unknown, say "Unknown from available sources."
Scores are 1-10 integers.
opportunity_score should roughly equal market_demand + problem_pain + long_term - competition_intensity (clamped 1-10).
personal_fit_score: leave as null or mid-range unless user note implies fit — use null if unsure (send as 5).

Company:
Name: ${company.name}
Batch: ${company.yc_batch || 'Unknown'}
Industry: ${company.industry || 'Unknown'}
Location: ${company.location || 'Unknown'}
Website: ${company.website || 'Unknown'}
YC URL: ${company.yc_url || 'Unknown'}
Description: ${company.short_description || 'Unknown'}
User note: ${company.user_note || 'None'}
User tags: ${(company.tags || []).join(', ') || 'None'}

Founders:
${founderLines || 'Unknown'}

YC / page text:
${truncate(company.raw_page_text, 8000)}

Website crawl text:
${truncate(websiteText, 8000)}

Return structured research covering problem, customer, why now, competitors, technical depth, AI/deep-tech angle, risks, adjacent opportunities (especially non-copy ideas), and news_signals inferred from the materials (product focus, market, hiring clues — not fake headlines).`;
}

async function runAiAnalysis(userId, company, founders, websiteText) {
  try {
    const analysis = await completeStructured({
      userId,
      schemaName: 'startup_research_analysis',
      schema: ANALYSIS_SCHEMA,
      prompt: buildAnalysisPrompt(company, founders, websiteText),
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
      });

      return { analysis: fallback, raw: {}, skipped: true };
    }

    throw error;
  }
}

async function embedCompany(userId, company, analysis) {
  try {
    const text = [
      company.name,
      company.short_description,
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

async function setProgress(userId, jobId, progress) {
  await researchDb.updateJob(userId, jobId, { progress });
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
    await setProgress(userId, jobId, { step: 'website_crawl' });
    const crawl = await crawlCompanyWebsite(userId, company);

    await setProgress(userId, jobId, {
      step: 'founder_enrichment',
      pages_crawled: crawl.pages.length,
    });

    const founders = await researchDb.listFoundersForCompany(userId, company.id);
    const founderSources = await enrichFounderSources(userId, company, founders);

    await setProgress(userId, jobId, {
      step: 'ai_analysis',
      pages_crawled: crawl.pages.length,
      founder_sources: founderSources,
    });

    const refreshed = await researchDb.getCompany(userId, company.id);
    const { analysis, raw, skipped } = await runAiAnalysis(
      userId,
      refreshed,
      founders,
      crawl.textBundle,
    );

    await setProgress(userId, jobId, {
      step: 'news_signals',
      pages_crawled: crawl.pages.length,
      founder_sources: founderSources,
      ai_skipped: skipped,
    });

    const newsCount = await discoverNewsSignals(userId, refreshed, raw || {});

    await setProgress(userId, jobId, {
      step: 'embedding',
      pages_crawled: crawl.pages.length,
      founder_sources: founderSources,
      news_count: newsCount,
      ai_skipped: skipped,
    });

    await embedCompany(userId, refreshed, analysis);

    await researchDb.updateCompany(userId, company.id, {
      status: skipped ? 'needs_review' : 'processed',
    });

    await researchDb.updateJob(userId, jobId, {
      status: skipped ? 'needs_review' : 'completed',
      completed_at: Date.now(),
      progress: {
        step: 'done',
        pages_crawled: crawl.pages.length,
        founder_sources: founderSources,
        news_count: newsCount,
        ai_skipped: skipped,
      },
    });

    logJob(`[research ${jobId}] completed for ${company.name}`);
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
