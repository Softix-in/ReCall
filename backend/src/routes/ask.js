const express = require('express');
const http = require('http');
const itemsDb = require('../db/items');
const embedClient = require('../services/embed-client');
const { pickRelevantSections } = require('../services/document-knowledge-service');
const { logDaemon } = require('../utils/logger');
const { sendError } = require('../utils/http-error');

const OLLAMA_HOST = process.env.OLLAMA_HOST || '127.0.0.1';
const OLLAMA_PORT = Number(process.env.OLLAMA_PORT) || 11434;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';

const router = express.Router();

function ollamaAvailable() {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: OLLAMA_HOST, port: OLLAMA_PORT, path: '/api/tags', method: 'GET' },
      (res) => resolve(res.statusCode === 200),
    );
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    req.end();
  });
}

function ollamaGenerate(prompt, signal) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
    });

    const req = http.request(
      {
        hostname: OLLAMA_HOST,
        port: OLLAMA_PORT,
        path: '/api/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.response || '');
          } catch {
            reject(new Error('Invalid Ollama response'));
          }
        });
      },
    );

    if (signal) {
      signal.addEventListener('abort', () => {
        req.destroy();
        reject(new Error('Request aborted'));
      });
    }

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function buildContext(items, question) {
  return items
    .map((item, i) => {
      const lines = [
        `[${i + 1}] "${item.title || item.url}"`,
        `URL: ${item.url}`,
      ];
      if (item.summary) lines.push(`Summary: ${item.summary}`);
      if (item.note) lines.push(`Note: ${item.note}`);

      if (item.source_type === 'documentation' && item.content?.trim()) {
        const sections = pickRelevantSections(item.content, question);
        if (sections.length) {
          lines.push('Knowledge sections:');
          for (const section of sections) {
            lines.push(section.content);
          }
        }
      }

      return lines.join('\n');
    })
    .join('\n\n');
}

function buildPrompt(question, context) {
  return `You are a helpful assistant with access to the user's saved knowledge library.
Answer the question using ONLY the provided sources. If the answer is not in the sources, say so.
Be concise. Cite sources by number [1], [2] etc.

SOURCES:
${context}

QUESTION: ${question}

ANSWER:`;
}

router.get('/ask/status', async (_req, res) => {
  const available = await ollamaAvailable();
  res.json({
    available,
    model: OLLAMA_MODEL,
    hint: available ? null : 'Install Ollama from https://ollama.com and run: ollama pull llama3',
  });
});

router.post('/ask', async (req, res) => {
  const { question, limit = 8 } = req.body || {};

  if (!question?.trim()) {
    res.status(400).json({ error: 'question is required' });
    return;
  }

  const available = await ollamaAvailable();
  if (!available) {
    res.status(503).json({
      error: 'Ollama is not running',
      hint: 'Install Ollama from https://ollama.com and run: ollama pull llama3',
    });
    return;
  }

  try {
    const userId = req.user.id;
    const embedding = await embedClient.embedText(question.trim());
    const matches = await itemsDb.searchSemantic(userId, embedding, Math.min(limit, 20));
    const ids = matches.map((match) => match.id);
    const items = await itemsDb.getItemsByIds(userId, ids);

    if (items.length === 0) {
      res.json({
        answer: "I couldn't find any relevant items in your library for this question.",
        sources: [],
      });
      return;
    }

    const context = buildContext(items, question.trim());
    const prompt = buildPrompt(question.trim(), context);

    logDaemon('info', `Asking Ollama: "${question.trim().slice(0, 60)}…"`);
    const answer = await ollamaGenerate(prompt);

    res.json({
      answer,
      sources: items.map((item, i) => ({
        index: i + 1,
        id: item.id,
        title: item.title || item.url,
        url: item.url,
        domain: item.domain,
      })),
    });
  } catch (error) {
    logDaemon('error', 'Ask failed', error);
    sendError(res, error, 'Ask failed');
  }
});

module.exports = router;
