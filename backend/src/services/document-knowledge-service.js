const yaml = require('js-yaml');
const config = require('../config');
const { completeStructured, LlmError } = require('./llm-client');

const DOC_STRUCTURE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          heading: { type: 'string' },
          level: { type: 'integer' },
          content: { type: 'string' },
          code_examples: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                language: { type: 'string' },
                code: { type: 'string' },
              },
              required: ['language', 'code'],
            },
          },
          keywords: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['id', 'heading', 'level', 'content'],
      },
    },
  },
  required: ['summary', 'sections'],
};

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'section';
}

function extractCodeBlocks(text) {
  const examples = [];
  const cleaned = String(text || '').replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    examples.push({
      language: lang || 'text',
      code: code.trim(),
    });
    return '';
  });

  return { text: cleaned.trim(), code_examples: examples };
}

function markdownToSections(markdown) {
  const lines = String(markdown || '').split('\n');
  const sections = [];
  let current = null;
  let buffer = [];

  function flush() {
    if (!current) {
      return;
    }

    const raw = buffer.join('\n').trim();
    const { text, code_examples } = extractCodeBlocks(raw);

    sections.push({
      id: slugify(current.heading),
      heading: current.heading,
      level: current.level,
      content: text,
      code_examples,
      keywords: [],
    });

    buffer = [];
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      flush();
      current = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
      };
      continue;
    }

    if (!current && line.trim()) {
      current = { heading: 'Overview', level: 1 };
    }

    if (current) {
      buffer.push(line);
    }
  }

  flush();

  if (sections.length === 0 && markdown?.trim()) {
    const { text, code_examples } = extractCodeBlocks(markdown.trim());
    sections.push({
      id: 'overview',
      heading: 'Overview',
      level: 1,
      content: text,
      code_examples,
      keywords: [],
    });
  }

  return sections;
}

function domSectionsToMarkdown(sections) {
  return sections.map((section) => {
    const parts = [`${'#'.repeat(Math.min(section.level || 1, 6))} ${section.heading}`];

    for (const block of section.blocks || []) {
      if (block.type === 'code') {
        parts.push(`\`\`\`${block.lang || ''}\n${block.text}\n\`\`\``);
      } else if (block.text?.trim()) {
        parts.push(block.text.trim());
      }
    }

    return parts.join('\n\n');
  }).join('\n\n');
}

function clientStructureToSections(rawStructure) {
  if (!rawStructure?.sections?.length) {
    return [];
  }

  return rawStructure.sections.map((section) => {
    const textParts = [];
    const code_examples = [];

    for (const block of section.blocks || []) {
      if (block.type === 'code') {
        code_examples.push({
          language: block.lang || 'text',
          code: block.text || '',
        });
      } else if (block.text?.trim()) {
        textParts.push(block.text.trim());
      }
    }

    return {
      id: slugify(section.heading),
      heading: section.heading || 'Section',
      level: section.level || 2,
      content: textParts.join('\n\n'),
      code_examples,
      keywords: [],
    };
  });
}

function countClientChars(rawStructure) {
  if (!rawStructure?.sections?.length) {
    return 0;
  }

  return rawStructure.sections.reduce((total, section) => {
    const sectionChars = (section.blocks || []).reduce((sum, block) => sum + (block.text?.length || 0), 0);
    return total + sectionChars;
  }, 0);
}

function buildSummary(sections, fallback = '') {
  const first = sections.find((s) => s.content?.trim());
  if (!first) {
    return fallback.slice(0, 500);
  }

  const text = first.content.replace(/\s+/g, ' ').trim();
  const sentence = text.match(/^[^.!?\n]+[.!?]?/);
  return (sentence?.[0] || text).slice(0, 500);
}

function sectionsToYaml({ title, url, domain, extractor, summary, sections }) {
  const doc = {
    doc: {
      title: title || url,
      source_url: url,
      domain: domain || null,
      extracted_at: new Date().toISOString(),
      extractor,
    },
    summary: summary || buildSummary(sections),
    sections: sections.map((section) => ({
      id: section.id,
      heading: section.heading,
      level: section.level,
      content: section.content,
      ...(section.code_examples?.length ? { code_examples: section.code_examples } : {}),
      ...(section.keywords?.length ? { keywords: section.keywords } : {}),
    })),
  };

  return yaml.dump(doc, { lineWidth: 120, noRefs: true });
}

function parseYamlContent(yamlContent) {
  if (!yamlContent?.trim()) {
    return null;
  }

  try {
    return yaml.load(yamlContent);
  } catch {
    return null;
  }
}

function pickRelevantSections(yamlContent, question, { maxSections = 3, maxChars = 4000 } = {}) {
  const parsed = parseYamlContent(yamlContent);
  const sections = parsed?.sections || [];

  if (!sections.length || !question?.trim()) {
    return [];
  }

  const terms = question.toLowerCase().split(/\W+/).filter((t) => t.length > 2);

  const scored = sections.map((section) => {
    const haystack = [
      section.heading,
      section.content,
      ...(section.keywords || []),
      ...(section.code_examples || []).map((c) => c.code),
    ].join(' ').toLowerCase();

    let score = 0;
    for (const term of terms) {
      if (haystack.includes(term)) {
        score += 1;
      }
    }

    return { section, score };
  }).sort((a, b) => b.score - a.score);

  const picked = [];
  let chars = 0;

  for (const { section, score } of scored) {
    if (score === 0 && picked.length > 0) {
      continue;
    }

    const sectionText = [
      `## ${section.heading}`,
      section.content,
      ...(section.code_examples || []).map((c) => `\`\`\`${c.language}\n${c.code}\n\`\`\``),
    ].join('\n\n');

    if (chars + sectionText.length > maxChars && picked.length > 0) {
      continue;
    }

    picked.push({
      heading: section.heading,
      content: sectionText.slice(0, maxChars),
    });
    chars += sectionText.length;

    if (picked.length >= maxSections) {
      break;
    }
  }

  if (picked.length === 0 && sections[0]) {
    picked.push({
      heading: sections[0].heading,
      content: (sections[0].content || '').slice(0, maxChars),
    });
  }

  return picked;
}

function buildSectionsIndex(sections) {
  return sections.map((s) => ({
    id: s.id,
    heading: s.heading,
    level: s.level,
  }));
}

function getEmbeddingTextFromYaml(yamlContent) {
  const parsed = parseYamlContent(yamlContent);
  if (!parsed) {
    return yamlContent?.slice(0, 8000) || '';
  }

  const parts = [
    parsed.doc?.title,
    parsed.summary,
    ...(parsed.sections || []).map((s) => `${s.heading}: ${(s.content || '').slice(0, 300)}`),
  ].filter(Boolean);

  return parts.join('\n').slice(0, 8000);
}

async function structureWithLlm(markdown, { userId, title, url } = {}) {
  try {
    const result = await completeStructured({
      prompt: `Convert this documentation page into structured sections for an LLM knowledge base.

Title: ${title || 'Unknown'}
URL: ${url || ''}

Content:
${markdown.slice(0, 24_000)}

Return a concise summary and well-organized sections with headings, content, and code_examples where present.`,
      schema: DOC_STRUCTURE_SCHEMA,
      schemaName: 'doc_knowledge',
      userId,
      temperature: 0.1,
    });

    return {
      summary: result.summary,
      sections: result.sections.map((section) => ({
        ...section,
        id: section.id || slugify(section.heading),
        code_examples: section.code_examples || [],
        keywords: section.keywords || [],
      })),
    };
  } catch (error) {
    if (error instanceof LlmError && error.code === 'missing_api_key') {
      return null;
    }
    return null;
  }
}

async function buildKnowledgeDocument({
  url,
  title,
  domain,
  extractor,
  markdown = null,
  rawStructure = null,
  userId = null,
  useLlm = true,
}) {
  let sections = [];
  let summary = '';
  let sourceMarkdown = markdown || '';

  if (rawStructure?.sections?.length) {
    sections = clientStructureToSections(rawStructure);
    sourceMarkdown = domSectionsToMarkdown(rawStructure.sections);
  } else if (markdown?.trim()) {
    sections = markdownToSections(markdown);
  }

  if (useLlm && sourceMarkdown.trim()) {
    const llmResult = await structureWithLlm(sourceMarkdown, { userId, title, url });
    if (llmResult?.sections?.length) {
      sections = llmResult.sections;
      summary = llmResult.summary;
    }
  }

  if (!sections.length && sourceMarkdown.trim()) {
    sections = markdownToSections(sourceMarkdown);
  }

  summary = summary || buildSummary(sections, sourceMarkdown);

  const yamlContent = sectionsToYaml({
    title,
    url,
    domain,
    extractor,
    summary,
    sections,
  });

  return {
    content: yamlContent,
    summary,
    sections,
    capture_meta: {
      format: 'yaml',
      extractor,
      section_count: sections.length,
      sections_index: buildSectionsIndex(sections),
      raw_markdown: sourceMarkdown.slice(0, 50_000),
    },
  };
}

function shouldUseFirecrawl(rawStructure) {
  return countClientChars(rawStructure) < config.DOC_EXTRACT_MIN_CLIENT_CHARS;
}

module.exports = {
  markdownToSections,
  domSectionsToMarkdown,
  clientStructureToSections,
  countClientChars,
  sectionsToYaml,
  parseYamlContent,
  pickRelevantSections,
  buildKnowledgeDocument,
  getEmbeddingTextFromYaml,
  shouldUseFirecrawl,
  buildSectionsIndex,
};
