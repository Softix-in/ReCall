const embedClient = require('./embed-client');
const itemsDb = require('../db/items');

const SEMANTIC_WEIGHT = 0.7;
const KEYWORD_WEIGHT = 0.3;
const RECENCY_WEIGHT = 0.2;
const SOURCE_WEIGHT = 0.1;

const SOURCE_BOOST = {
  video: 1.0,
  article: 0.95,
  'social-post': 0.9,
  link: 0.85,
};

function isKeywordOriented(query) {
  if (/"/.test(query)) {
    return true;
  }

  const words = query.trim().split(/\s+/).filter(Boolean);

  if (words.length > 0 && words.length <= 3) {
    return !/^(how|what|why|when|where|who|which|explain|describe)\b/i.test(query);
  }

  return false;
}

function normalizeScores(items, scoreKey) {
  if (items.length === 0) {
    return items;
  }

  const max = Math.max(...items.map((item) => item[scoreKey] ?? 0), 0.0001);

  return items.map((item) => ({
    ...item,
    [scoreKey]: (item[scoreKey] ?? 0) / max,
  }));
}

function recencyScore(createdAt) {
  const ageMs = Math.max(0, Date.now() - createdAt);
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  return Math.exp(-ageMs / thirtyDaysMs);
}

function sourceBoost(sourceType) {
  return SOURCE_BOOST[sourceType] ?? 0.85;
}

function applyFilters(item, filters) {
  if (filters.type && item.source_type !== filters.type) {
    return false;
  }

  if (filters.mode && item.save_mode !== filters.mode) {
    return false;
  }

  if (filters.since) {
    const sinceMs = Date.parse(filters.since);
    if (!Number.isNaN(sinceMs) && item.created_at < sinceMs) {
      return false;
    }
  }

  return item.processing === 'done';
}

function computeFinalScore(item, { hybrid }) {
  const semantic = item.semantic_score ?? 0;
  const keyword = item.keyword_score ?? 0;

  const retrievalScore = hybrid
    ? (semantic * SEMANTIC_WEIGHT) + (keyword * KEYWORD_WEIGHT)
    : semantic * SEMANTIC_WEIGHT;

  const recency = recencyScore(item.created_at) * RECENCY_WEIGHT;
  const source = sourceBoost(item.source_type) * SOURCE_WEIGHT;

  return retrievalScore + recency + source;
}

function mergeCandidates(semanticMatches, keywordMatches, hybrid) {
  const merged = new Map();

  for (const match of semanticMatches) {
    merged.set(match.id, {
      id: match.id,
      semantic_score: match.score,
      keyword_score: 0,
    });
  }

  if (hybrid) {
    for (const match of keywordMatches) {
      const existing = merged.get(match.id) ?? {
        id: match.id,
        semantic_score: 0,
        keyword_score: 0,
      };
      existing.keyword_score = Math.max(existing.keyword_score, match.score);
      merged.set(match.id, existing);
    }
  }

  return Array.from(merged.values());
}

function buildSuggestedQueries(recentItems) {
  const fromTitles = recentItems
    .map((item) => item.title || item.summary || item.note)
    .filter(Boolean)
    .map((text) => text.split(/[.|:–-]/)[0].trim())
    .filter((text) => text.length >= 4 && text.length <= 80);

  const defaults = [
    'recent videos',
    'articles about technology',
    'notes I wrote',
    'tutorials and guides',
  ];

  return [...new Set([...fromTitles, ...defaults])].slice(0, 6);
}

function rankCandidates(candidates, itemMap, filters, { hybrid }) {
  const scored = candidates
    .map((candidate) => {
      const item = itemMap.get(candidate.id);
      if (!item || !applyFilters(item, filters)) {
        return null;
      }

      return {
        ...item,
        semantic_score: candidate.semantic_score,
        keyword_score: candidate.keyword_score,
      };
    })
    .filter(Boolean);

  const normalized = normalizeScores(
    normalizeScores(scored, 'semantic_score'),
    'keyword_score',
  );

  return normalized
    .map((item) => ({
      ...item,
      score: computeFinalScore(item, { hybrid }),
    }))
    .sort((a, b) => b.score - a.score);
}

async function findRelatedItems(userId, primaryResults, filters, { hybrid }) {
  if (primaryResults.length === 0) {
    return [];
  }

  const top = primaryResults[0];
  const seedText = top.summary || top.note || top.title || top.content;

  if (!seedText?.trim()) {
    return [];
  }

  const embedding = await embedClient.embedText(seedText.trim());
  const matches = await itemsDb.searchSemantic(userId, embedding, 20);
  const excludeIds = new Set(primaryResults.map((item) => item.id));

  const candidates = matches
    .filter((match) => !excludeIds.has(match.id))
    .map((match) => ({
      id: match.id,
      semantic_score: match.score,
      keyword_score: 0,
    }));

  const items = await itemsDb.getItemsByIds(userId, candidates.map((candidate) => candidate.id));
  const itemMap = new Map(items.map((item) => [item.id, item]));

  return rankCandidates(candidates, itemMap, filters, { hybrid }).slice(0, 5);
}

async function getRecommendations(userId) {
  const recent = await itemsDb.listDoneItems(userId, { limit: 8 });

  return {
    recent,
    suggested_queries: buildSuggestedQueries(recent),
  };
}

async function search(userId, query, filters = {}) {
  const trimmed = query.trim();

  if (!trimmed) {
    const error = new Error('Query is required');
    error.status = 400;
    throw error;
  }

  const hybrid = isKeywordOriented(trimmed);
  const queryEmbedding = await embedClient.embedText(trimmed);

  const [semanticMatches, keywordMatches] = await Promise.all([
    itemsDb.searchSemantic(userId, queryEmbedding, 20),
    hybrid ? itemsDb.searchFts(userId, trimmed, 20) : Promise.resolve([]),
  ]);

  const candidates = mergeCandidates(semanticMatches, keywordMatches, hybrid);
  const ids = candidates.map((candidate) => candidate.id);
  const items = await itemsDb.getItemsByIds(userId, ids);
  const itemMap = new Map(items.map((item) => [item.id, item]));

  const ranked = rankCandidates(candidates, itemMap, filters, { hybrid }).slice(0, 10);
  const related = await findRelatedItems(userId, ranked, filters, { hybrid });

  return {
    query: trimmed,
    mode: hybrid ? 'hybrid' : 'semantic',
    results: ranked,
    related,
  };
}

module.exports = {
  search,
  getRecommendations,
  isKeywordOriented,
};
