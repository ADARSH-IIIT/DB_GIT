const path = require('path');
const { getPool, getPrimaryKey } = require('../services/postgres');
const { loadSnapshot, loadObject } = require('../services/snapshotService');
const { diffSnapshots } = require('../services/diffService');
const { generateReport } = require('../services/htmlReport');
const { writeFile, isInitialized } = require('../utils/fileUtils');

async function diff(idA, idB) {
  if (!isInitialized()) {
    console.error('Error: DBGit not initialized. Run: dbgit init');
    process.exit(1);
  }

  let snapA, snapB;
  try {
    snapA = loadSnapshot(idA);
    snapB = loadSnapshot(idB);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  console.log(`Comparing ${idA} → ${idB}...`);

  // Fetch primary keys for all tables involved
  const allTables = new Set([
    ...Object.keys(snapA.tables),
    ...Object.keys(snapB.tables),
  ]);

  const pool = getPool();
  const tablePrimaryKeys = {};

  try {
    for (const table of allTables) {
      try {
        tablePrimaryKeys[table] = await getPrimaryKey(pool, table);
      } catch {
        tablePrimaryKeys[table] = [];
      }
    }
  } finally {
    await pool.end();
  }

  const diffs = diffSnapshots(snapA, snapB, loadObject, tablePrimaryKeys);

  const reportPath = path.join(process.cwd(), 'diff-report.html');
  const html = generateReport(snapA, snapB, diffs);
  writeFile(reportPath, html);

  if (diffs.length === 0) {
    console.log('No differences found between the two snapshots.');
  } else {
    console.log(`\nChanged tables: ${diffs.length}`);
    for (const d of diffs) {
      if (d.status === 'added') {
        console.log(`  [NEW]     ${d.table} (+${d.added.length} rows)`);
      } else if (d.status === 'dropped') {
        console.log(`  [DROPPED] ${d.table} (-${d.deleted.length} rows)`);
      } else {
        const sc = d.schemaChanges;
        const schemaLine = sc
          ? ` | schema: +${sc.addedColumns.length} col, -${sc.removedColumns.length} col, ~${sc.changedColumns.length} col`
          : '';
        console.log(`  [MOD]     ${d.table}: +${d.added.length} added, ~${d.updated.length} updated, -${d.deleted.length} deleted${schemaLine}`);
      }
    }
  }

  console.log(`\nReport saved to: ${reportPath}`);
}

module.exports = { diff };
