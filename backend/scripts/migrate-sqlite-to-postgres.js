#!/usr/bin/env node
/**
 * One-time migration: SQLite recall.db → PostgreSQL.
 * Usage: DATABASE_URL=... RECALL_HOME=... node scripts/migrate-sqlite-to-postgres.js
 */

const path = require('path');
const config = require('../src/config');
const { runMigrations } = require('../src/migrate');
const { query, closePool } = require('../src/db/pg-pool');
const usersDb = require('../src/db/users');
const itemsDb = require('../src/db/items');
const embeddingService = require('../src/services/embedding-service');
const { startEmbedService } = require('../src/services/embed-launcher');

function openSqlite() {
  let Database;

  try {
    Database = require('better-sqlite3');
  } catch {
    throw new Error('better-sqlite3 is required. Run: npm install');
  }

  const dbPath = config.DB_PATH;

  if (!require('fs').existsSync(dbPath)) {
    throw new Error(`SQLite database not found at ${dbPath}`);
  }

  return new Database(dbPath, { readonly: true });
}

async function migrateProfile(sqlite, userId) {
  const profile = sqlite.prepare('SELECT * FROM user_profile LIMIT 1').get();
  if (!profile) {
    return;
  }

  await query(
    `INSERT INTO user_profile (
      id, user_id, display_name, headline, github_url, linkedin_url, twitter_url,
      website_url, bio_short, skills, fireworks_api_key_enc, ai_quality_model,
      ai_chat_model, ai_reasoning_model, ai_deep_analysis_enabled, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
    ) ON CONFLICT (user_id) DO NOTHING`,
    [
      profile.id,
      userId,
      profile.display_name,
      profile.headline,
      profile.github_url,
      profile.linkedin_url,
      profile.twitter_url,
      profile.website_url,
      profile.bio_short,
      profile.skills,
      profile.fireworks_api_key_enc,
      profile.ai_quality_model,
      profile.ai_chat_model,
      profile.ai_reasoning_model,
      profile.ai_deep_analysis_enabled,
      profile.created_at,
      profile.updated_at,
    ],
  );
}

async function migrateItems(sqlite, userId) {
  const rows = sqlite.prepare('SELECT * FROM items ORDER BY created_at ASC').all();
  let migrated = 0;

  for (const row of rows) {
    const existing = await itemsDb.getItemByIdInternal(row.id);

    if (existing) {
      continue;
    }

    await query(
      `INSERT INTO items (
        id, user_id, url, title, summary, note, content, source_type, save_mode,
        domain, tags, processing, error_message, thumbnail, transcript,
        thumbnail_url, transcript_url, capture_meta, created_at, processed_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
      )`,
      [
        row.id,
        userId,
        row.url,
        row.title,
        row.summary,
        row.note,
        row.content,
        row.source_type,
        row.save_mode,
        row.domain,
        row.tags,
        row.processing,
        row.error_message,
        row.thumbnail,
        row.transcript,
        row.thumbnail_url || null,
        row.transcript_url || null,
        row.capture_meta,
        row.created_at,
        row.processed_at,
      ],
    );

    migrated += 1;
  }

  return migrated;
}

async function reembedItems(userId) {
  const items = await itemsDb.listDoneItems(userId, { limit: 10_000 });
  let embedded = 0;

  for (const item of items) {
    if (item.embedding) {
      continue;
    }

    try {
      await embeddingService.embedAndStoreItem(userId, item);
      embedded += 1;
    } catch (error) {
      console.error(`Embed failed for ${item.id}: ${error.message}`);
    }
  }

  return embedded;
}

async function main() {
  const email = process.env.BOOTSTRAP_USER_EMAIL || config.BOOTSTRAP_USER_EMAIL || 'bootstrap@recall.local';

  console.log('Running Postgres migrations...');
  await runMigrations();

  const bootstrapUser = await usersDb.getOrCreateBootstrapUser(email);
  console.log(`Bootstrap user: ${bootstrapUser.email} (${bootstrapUser.id})`);

  const sqlite = openSqlite();

  try {
    const itemCount = await migrateItems(sqlite, bootstrapUser.id);
    console.log(`Migrated ${itemCount} items`);

    try {
      await migrateProfile(sqlite, bootstrapUser.id);
      console.log('Migrated profile (if present)');
    } catch (error) {
      console.log(`Profile migration skipped: ${error.message}`);
    }
  } finally {
    sqlite.close();
  }

  console.log('Starting embed service for re-embedding...');

  try {
    await startEmbedService();
    const embedded = await reembedItems(bootstrapUser.id);
    console.log(`Re-embedded ${embedded} items`);
  } catch (error) {
    console.warn(`Re-embedding skipped: ${error.message}`);
  }

  console.log('SQLite → Postgres migration complete.');
}

main()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error.message);
    closePool().finally(() => process.exit(1));
  });
