const { Pool } = require('pg');
const { readFile, exists, dbgitPath } = require('../utils/fileUtils');
const { parse } = require('../utils/jsonUtils');

function getPool() {
  const configPath = dbgitPath('metadata.json');
  if (!exists(configPath)) {
    throw new Error('DBGit not initialized. Run: dbgit init');
  }
  const meta = parse(readFile(configPath));
  // meta.connection is either a connection-string object { connectionString, ssl? }
  // or individual fields { host, port, database, user, password, ssl? }
  // pg.Pool accepts both formats natively.
  return new Pool(meta.connection);
}

async function getUserTables(pool) {
  const result = await pool.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  return result.rows.map(r => r.tablename);
}

async function fetchTableRows(pool, table) {
  // Sanitize table name against identifier injection — only allow valid PG identifiers
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }
  const result = await pool.query(`SELECT * FROM "${table}"`);
  return result.rows;
}

async function getPrimaryKey(pool, table) {
  const result = await pool.query(`
    SELECT a.attname
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = $1::regclass AND i.indisprimary
    ORDER BY a.attnum
  `, [table]);
  return result.rows.map(r => r.attname);
}

async function fetchTableSchema(pool, table) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }
  const result = await pool.query(`
    SELECT
      column_name,
      data_type,
      is_nullable,
      column_default,
      character_maximum_length,
      numeric_precision,
      numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [table]);
  return result.rows;
}

module.exports = { getPool, getUserTables, fetchTableRows, getPrimaryKey, fetchTableSchema };
