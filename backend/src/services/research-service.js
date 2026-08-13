const researchDb = require('../db/research');
const itemsDb = require('../db/items');
const { sanitizeFounderInput } = require('./research-guards');
const { assertPublicHttpUrl } = require('../utils/safe-url');

function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20);
  }
  if (typeof tags === 'string') {
    return tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  return [];
}

function normalizeFounders(founders) {
  if (!Array.isArray(founders)) return [];

  return founders
    .map((f) => sanitizeFounderInput(f))
    .filter(Boolean)
    .slice(0, 10);
}

async function normalizeStartPayload(body) {
  const extracted = body.extracted || {};
  const triggerUrl = (body.trigger_url || extracted.yc_url || extracted.website || extracted.url || '').trim();

  if (!triggerUrl) {
    const error = new Error('trigger_url is required');
    error.status = 400;
    throw error;
  }

  await assertPublicHttpUrl(triggerUrl);

  let domain = null;
  try {
    domain = new URL(triggerUrl).hostname.replace(/^www\./i, '');
  } catch {
    domain = null;
  }

  const name = (extracted.company_name || extracted.name || body.name || '').trim()
    || (domain ? domain.split('.')[0].replace(/^\w/, (c) => c.toUpperCase()) : '');

  if (!name) {
    const error = new Error('company name is required (extracted.company_name)');
    error.status = 400;
    throw error;
  }

  const triggerType = body.trigger_type || extracted.page_type || 'company_website';
  const isYc = triggerType === 'yc_company_page' || /ycombinator\.com\/companies\//i.test(triggerUrl);

  let website = extracted.website || null;
  if (!website && !isYc) {
    website = triggerUrl;
  }

  if (website) {
    await assertPublicHttpUrl(website);
  }

  return {
    trigger_url: triggerUrl,
    trigger_type: triggerType,
    name,
    yc_batch: extracted.batch || extracted.yc_batch || null,
    yc_url: isYc ? (extracted.yc_url || triggerUrl) : (extracted.yc_url || null),
    website,
    short_description: extracted.short_description || extracted.description || extracted.og_description || null,
    industry: extracted.industry || null,
    location: extracted.location || null,
    team_size: extracted.team_size || null,
    raw_page_text: extracted.visible_text || extracted.raw_page_text || null,
    user_note: body.note || body.user_note || null,
    tags: normalizeTags(body.tags || extracted.user_tags),
    founders: normalizeFounders(extracted.founders || body.founders),
    domain,
    og_title: extracted.og_title || null,
    og_description: extracted.og_description || extracted.short_description || null,
    og_image: extracted.og_image || null,
  };
}

async function startResearch(userId, body, researchQueue) {
  const payload = await normalizeStartPayload(body);

  let company = null;
  if (payload.yc_url) {
    company = await researchDb.findCompanyByYcUrl(userId, payload.yc_url);
  }
  if (!company && payload.website) {
    company = await researchDb.findCompanyByWebsite(userId, payload.website);
  }

  let item = null;

  if (!company) {
    item = await itemsDb.createItem(userId, {
      url: payload.trigger_url,
      title: payload.name,
      summary: payload.short_description,
      content: payload.raw_page_text,
      source_type: payload.yc_url ? 'yc-startup' : 'link',
      save_mode: 'manual_note',
      note: payload.user_note || `Startup research: ${payload.name}`,
      tags: ['startup-intel', ...(payload.yc_url ? ['yc-research'] : []), ...payload.tags].join(','),
      domain: payload.domain,
      thumbnail: payload.og_image,
      processing: 'done',
      processed_at: Date.now(),
      capture_meta: JSON.stringify({
        research: true,
        trigger_type: payload.trigger_type,
        yc_batch: payload.yc_batch,
      }),
    });

    company = await researchDb.createCompany(userId, {
      name: payload.name,
      yc_batch: payload.yc_batch,
      yc_url: payload.yc_url,
      website: payload.website,
      short_description: payload.short_description,
      industry: payload.industry,
      location: payload.location,
      team_size: payload.team_size,
      status: 'processing',
      source_url: payload.trigger_url,
      item_id: item.id,
      tags: payload.tags,
      user_note: payload.user_note,
      raw_page_text: payload.raw_page_text,
    });
  } else {
    company = await researchDb.updateCompany(userId, company.id, {
      name: payload.name || company.name,
      yc_batch: payload.yc_batch || company.yc_batch,
      website: payload.website || company.website,
      short_description: payload.short_description || company.short_description,
      industry: payload.industry || company.industry,
      location: payload.location || company.location,
      team_size: payload.team_size || company.team_size,
      status: 'processing',
      tags: payload.tags.length ? payload.tags : company.tags,
      user_note: payload.user_note || company.user_note,
      raw_page_text: payload.raw_page_text || company.raw_page_text,
    });
  }

  await researchDb.addSource(userId, {
    company_id: company.id,
    item_id: company.item_id || item?.id || null,
    source_type: payload.yc_url ? 'YC profile' : 'Company website',
    title: `${payload.name} — ${payload.yc_url ? 'YC profile' : 'website'}`,
    url: payload.trigger_url,
    extracted_text: payload.raw_page_text,
    credibility_score: payload.yc_url ? 9 : 7,
  });

  for (const founder of payload.founders) {
    const created = await researchDb.createFounder(userId, founder);
    await researchDb.linkFounderToCompany(userId, company.id, created.id, {
      role: founder.current_role,
      source_url: payload.trigger_url,
    });

    if (founder.linkedin_url || founder.twitter_url || founder.github_url) {
      await researchDb.addFounderSource(userId, {
        founder_id: created.id,
        company_id: company.id,
        source_type: payload.yc_url ? 'YC profile' : 'Company website',
        source_title: `${founder.full_name} links`,
        source_url: payload.trigger_url,
        raw_text: JSON.stringify({
          linkedin_url: founder.linkedin_url,
          twitter_url: founder.twitter_url,
          github_url: founder.github_url,
        }),
        credibility_score: 8,
      });
    }
  }

  const job = await researchDb.createJob(userId, company.id, {
    job_type: 'full_research',
  });

  researchQueue.addJob({
    jobId: job.id,
    companyId: company.id,
    userId,
  });

  return {
    company_id: company.id,
    research_job_id: job.id,
    linked_item_id: company.item_id || item?.id || null,
    status: job.status,
    founders_count: payload.founders.length,
    analysis_model: 'accounts/fireworks/models/deepseek-v4-flash-0731',
  };
}

module.exports = {
  startResearch,
  normalizeStartPayload,
};
