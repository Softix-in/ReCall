const Database = require('better-sqlite3');
const config = require('../config');

let db;

function getDb() {
  if (!db) {
    db = new Database(config.DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }

  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  getDb,
  closeDb,
};
