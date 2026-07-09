const { Pool } = require('pg');
const config = require('../config');

let pool;

function getPool() {
  if (!pool) {
    if (!config.DATABASE_URL) {
      throw new Error('DATABASE_URL is required. Set it to your PostgreSQL connection string.');
    }

    pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    pool.on('error', (error) => {
      console.error('Unexpected PostgreSQL pool error:', error);
    });
  }

  return pool;
}

async function setUserContext(client, userId) {
  if (userId) {
    await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', userId]);
  }
}

async function withUserContext(userId, fn) {
  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    await setUserContext(client, userId);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function query(text, params = []) {
  const result = await getPool().query(text, params);
  return result;
}

async function queryAsUser(userId, text, params = []) {
  return withUserContext(userId, (client) => client.query(text, params));
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

function formatVector(embedding) {
  if (!embedding?.length) {
    return null;
  }

  return `[${embedding.join(',')}]`;
}

module.exports = {
  getPool,
  withUserContext,
  setUserContext,
  query,
  queryAsUser,
  closePool,
  formatVector,
};
