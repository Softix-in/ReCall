const { closePool } = require('./pg-pool');

function getDb() {
  throw new Error('SQLite has been removed. Use pg-pool.js with DATABASE_URL instead.');
}

function closeDb() {
  return closePool();
}

module.exports = {
  getDb,
  closeDb,
};
