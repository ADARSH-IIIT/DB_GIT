const { listSnapshots } = require('../services/snapshotService');
const { isInitialized } = require('../utils/fileUtils');

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function log() {
  if (!isInitialized()) {
    console.error('Error: DBGit not initialized. Run: dbgit init');
    process.exit(1);
  }

  const snapshots = listSnapshots();

  if (snapshots.length === 0) {
    console.log('No snapshots yet. Run: dbgit snapshot -m "your message"');
    return;
  }

  // Print newest first, like git log
  [...snapshots].reverse().forEach((snap, i) => {
    const tableCount = Object.keys(snap.tables).length;
    const isLatest = i === 0;

    console.log(`snapshot ${snap.id}${isLatest ? '  (HEAD)' : ''}`);
    console.log(`  Message : ${snap.message}`);
    console.log(`  Date    : ${formatDate(snap.timestamp)}`);
    console.log(`  Tables  : ${tableCount}`);
    console.log(`  Parent  : ${snap.parent || 'none'}`);
    console.log('');
  });
}

module.exports = { log };
