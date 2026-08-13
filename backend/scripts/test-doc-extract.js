#!/usr/bin/env node
/**
 * Document extractor integration tests.
 * Requires: DATABASE_URL, JWT keys, running backend, FIRECRAWL_API_KEY for live tests.
 */

const config = require('../src/config');
const {
  markdownToSections,
  sectionsToYaml,
  pickRelevantSections,
  buildKnowledgeDocument,
} = require('../src/services/document-knowledge-service');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function testDeterministicStructuring() {
  const markdown = `# Getting Started\n\nInstall the package.\n\n\`\`\`bash\nnpm install recall\n\`\`\`\n\n## API\n\nUse the client.`;

  const sections = markdownToSections(markdown);
  assert(sections.length >= 2, 'Expected multiple sections from markdown');

  const yaml = sectionsToYaml({
    title: 'Test Docs',
    url: 'https://example.com/docs',
    domain: 'example.com',
    extractor: 'client',
    summary: 'Test summary',
    sections,
  });

  assert(yaml.includes('Getting Started'), 'YAML should include heading');
  assert(yaml.includes('npm install recall'), 'YAML should include code block');

  const picked = pickRelevantSections(yaml, 'how do I install the package');
  assert(picked.length > 0, 'Expected relevant sections for install question');

  const built = await buildKnowledgeDocument({
    url: 'https://example.com/docs',
    title: 'Test Docs',
    domain: 'example.com',
    extractor: 'client',
    markdown,
    useLlm: false,
  });

  assert(built.content.includes('sections:'), 'Built knowledge should contain sections');
  assert(built.summary, 'Built knowledge should have summary');

  console.log('PASS deterministic structuring');
}

async function testLiveApi(baseUrl, token) {
  if (!config.FIRECRAWL_API_KEY) {
    console.log('SKIP live API tests — FIRECRAWL_API_KEY not set');
    return;
  }

  const testUrl = 'https://docs.firecrawl.dev/features/scrape';

  const captureRes = await fetch(`${baseUrl}/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      url: testUrl,
      title: 'Firecrawl scrape docs',
      save_mode: 'doc_extract',
      source_type: 'documentation',
    }),
  });

  const captureBody = await captureRes.json();
  assert(captureRes.status === 201, `Capture failed: ${captureRes.status} ${JSON.stringify(captureBody)}`);

  const itemId = captureBody.id;
  let item = null;

  for (let i = 0; i < 60; i += 1) {
    const statusRes = await fetch(`${baseUrl}/status/${itemId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const statusBody = await statusRes.json();
    if (statusBody.processing === 'done' || statusBody.processing === 'failed') {
      const itemRes = await fetch(`${baseUrl}/items/${itemId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const itemBody = await itemRes.json();
      item = itemBody.item;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  assert(item, 'Timed out waiting for doc extract item');
  assert(item.processing === 'done', `Item failed: ${item.error_message}`);
  assert(item.source_type === 'documentation', 'Expected documentation source type');
  assert(item.content?.includes('sections:'), 'Expected YAML knowledge content');

  const crawlRes = await fetch(`${baseUrl}/knowledge/crawl`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      seed_url: 'https://docs.firecrawl.dev/features/scrape',
      path_filter: '/features',
      max_pages: 2,
    }),
  });

  const crawlBody = await crawlRes.json();
  assert(crawlRes.status === 201, `Crawl start failed: ${crawlRes.status} ${JSON.stringify(crawlBody)}`);

  let crawlJob = null;
  for (let i = 0; i < 90; i += 1) {
    const jobRes = await fetch(`${baseUrl}/knowledge/jobs/${crawlBody.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const jobBody = await jobRes.json();
    crawlJob = jobBody.job;
    if (['done', 'failed'].includes(crawlJob.status)) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  assert(crawlJob, 'Timed out waiting for crawl job');
  assert(crawlJob.status === 'done', `Crawl failed: ${crawlJob.error_message}`);
  assert(crawlJob.pages_saved >= 1, 'Expected at least one crawled page saved');

  console.log('PASS live API doc extract + crawl');
}

async function main() {
  await testDeterministicStructuring();

  const baseUrl = `http://${config.HOST}:${config.PORT}`;
  const token = process.env.TEST_ACCESS_TOKEN;

  if (token) {
    await testLiveApi(baseUrl, token);
  } else {
    console.log('SKIP live API tests — set TEST_ACCESS_TOKEN to run end-to-end checks');
  }

  console.log('All doc extract tests completed.');
}

main().catch((error) => {
  console.error('FAIL', error.message);
  process.exit(1);
});
