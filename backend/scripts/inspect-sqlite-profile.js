const Database = require('better-sqlite3');
const db = new Database('/data/recall/data/recall.db', { readonly: true });

function count(table) {
  try {
    return db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
  } catch {
    return null;
  }
}

const profile = db.prepare('SELECT display_name, headline, bio_short FROM user_profile LIMIT 1').get();
const projects = db.prepare('SELECT id, name FROM projects LIMIT 10').all();
const resumes = count('resume_template');
const analyses = count('jd_analyses');

console.log(JSON.stringify({ profile, projectCount: count('projects'), projects, resumes, analyses }, null, 2));
