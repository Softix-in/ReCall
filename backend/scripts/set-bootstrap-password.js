#!/usr/bin/env node
/**
 * Set a password on an existing user (e.g. bootstrap@recall.local after SQLite migration).
 * Usage: DATABASE_URL=... node scripts/set-bootstrap-password.js <email> <password>
 */

const usersDb = require('../src/db/users');
const { closePool } = require('../src/db/pg-pool');

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error('Usage: node scripts/set-bootstrap-password.js <email> <password>');
    process.exit(1);
  }

  const user = await usersDb.findUserByEmail(email);

  if (!user) {
    throw new Error(`User not found: ${email}`);
  }

  await usersDb.updatePassword(user.id, password);
  console.log(`Password set for ${email} (${user.id})`);
}

main()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message);
    closePool().finally(() => process.exit(1));
  });
