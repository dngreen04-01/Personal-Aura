/**
 * expo-sqlite mock backed by better-sqlite3.
 *
 * Mirrors the subset of expo-sqlite's async API that lib/database.js uses:
 *   - openDatabaseAsync(name)
 *   - db.execAsync(sql)
 *   - db.runAsync(sql, params)
 *   - db.getAllAsync(sql, params)
 *   - db.getFirstAsync(sql, params)
 *   - db.closeAsync()
 *
 * Every openDatabaseAsync call gets an in-memory database by default, so each
 * test can ask for a fresh DB via a unique name. Pass ":memory:" to reuse.
 */
const Database = require('better-sqlite3');

const registry = new Map();

function wrap(bdb) {
  return {
    execAsync: async (sql) => {
      bdb.exec(sql);
    },
    runAsync: async (sql, params = []) => {
      const stmt = bdb.prepare(sql);
      const info = Array.isArray(params) ? stmt.run(...params) : stmt.run(params);
      return { lastInsertRowId: info.lastInsertRowid, changes: info.changes };
    },
    getAllAsync: async (sql, params = []) => {
      const stmt = bdb.prepare(sql);
      return Array.isArray(params) ? stmt.all(...params) : stmt.all(params);
    },
    getFirstAsync: async (sql, params = []) => {
      const stmt = bdb.prepare(sql);
      const row = Array.isArray(params) ? stmt.get(...params) : stmt.get(params);
      return row || null;
    },
    closeAsync: async () => {
      // No-op: keep the in-memory DB alive across close/reopen so tests can
      // verify idempotent re-initialization without losing data. Tests that
      // want a truly fresh DB should call openDatabaseAsync with a new name.
    },
    __raw: bdb,
  };
}

async function openDatabaseAsync(name) {
  // Always use in-memory so tests don't leave files behind. Use the name as
  // a registry key so reopening the same "name" returns a fresh DB unless
  // the caller explicitly resets it.
  if (registry.has(name)) return registry.get(name);
  const bdb = new Database(':memory:');
  // Match expo-sqlite's default (FKs off unless PRAGMA foreign_keys=ON).
  bdb.pragma('foreign_keys = OFF');
  const wrapped = wrap(bdb);
  registry.set(name, wrapped);
  return wrapped;
}

function __resetAll() {
  for (const w of registry.values()) {
    try { w.__raw.close(); } catch { /* ignore */ }
  }
  registry.clear();
}

module.exports = {
  openDatabaseAsync,
  __resetAll,
};
