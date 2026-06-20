const { getPool, getUserTables, fetchTableRows, fetchTableSchema, getPrimaryKey } = require('../services/postgres');
const { hashRows } = require('../services/hash');
const {
  getHead, setHead,
  loadSnapshot, saveSnapshot,
  saveObject, objectExists,
  nextSnapshotId,
} = require('../services/snapshotService');
const { isInitialized } = require('../utils/fileUtils');

async function snapshot(message) {
  if (!isInitialized()) {
    console.error('Error: DBGit not initialized. Run: dbgit init');
    process.exit(1);
  }

  const pool = getPool();

  try {
    console.log('Reading database tables...');
    const tables = await getUserTables(pool);

    if (tables.length === 0) {
      console.log('No tables found in public schema. Nothing to snapshot.');
      return;
    }

    const parentId = getHead();
    const parentSnapshot = parentId ? loadSnapshot(parentId) : null;
    const parentTables = parentSnapshot ? parentSnapshot.tables : {};

    const newTables = {};
    const stats = { stored: 0, reused: 0 };

    for (const table of tables) {
      process.stdout.write(`  Hashing ${table}... `);

      // Data
      const rows = await fetchTableRows(pool, table);
      const dataHash = hashRows(rows);

      if (!objectExists(dataHash)) {
        saveObject(dataHash, rows);
      }

      // Schema
      const schema = await fetchTableSchema(pool, table);
      const schemaHash = hashRows(schema);

      if (!objectExists(schemaHash)) {
        saveObject(schemaHash, schema);
      }

      // Check if anything changed vs parent
      const prev = parentTables[table];
      const prevDataHash = prev ? (typeof prev === 'string' ? prev : prev.dataHash) : null;
      const prevSchemaHash = prev ? (typeof prev === 'string' ? null : prev.schemaHash) : null;

      const dataChanged = dataHash !== prevDataHash;
      const schemaChanged = schemaHash !== prevSchemaHash;

      if (!prev) {
        process.stdout.write('new table\n');
        stats.stored++;
      } else if (dataChanged || schemaChanged) {
        const parts = [];
        if (schemaChanged) parts.push('schema changed');
        if (dataChanged) parts.push('data changed');
        process.stdout.write(parts.join(', ') + '\n');
        stats.stored++;
      } else {
        process.stdout.write('unchanged\n');
        stats.reused++;
      }

      newTables[table] = { dataHash, schemaHash };
    }

    // Detect dropped tables (were in parent, not in current)
    const droppedTables = Object.keys(parentTables).filter(t => !tables.includes(t));
    if (droppedTables.length > 0) {
      droppedTables.forEach(t => console.log(`  ${t}... dropped`));
    }

    const id = nextSnapshotId();
    const snap = {
      id,
      message: message || `Snapshot ${id}`,
      timestamp: new Date().toISOString(),
      parent: parentId,
      tables: newTables,
    };

    saveSnapshot(snap);
    setHead(id);

    console.log(`\nSnapshot ${id} created.`);
    console.log(`  Message : ${snap.message}`);
    console.log(`  Tables  : ${tables.length} (${stats.stored} changed, ${stats.reused} unchanged)`);
    if (droppedTables.length) console.log(`  Dropped : ${droppedTables.join(', ')}`);
    console.log(`  Parent  : ${parentId || 'none'}`);
  } finally {
    await pool.end();
  }
}

module.exports = { snapshot };
