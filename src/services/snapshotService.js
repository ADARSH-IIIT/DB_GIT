const { dbgitPath, exists, readFile, writeFile, listDir } = require('../utils/fileUtils');
const { parse, stringify } = require('../utils/jsonUtils');
const path = require('path');

function getHead() {
  const headPath = dbgitPath('HEAD');
  const content = readFile(headPath).trim();
  return content === 'null' ? null : content;
}

function setHead(snapshotId) {
  writeFile(dbgitPath('HEAD'), snapshotId || 'null');
}

function loadSnapshot(id) {
  const snapshotPath = dbgitPath('snapshots', `${id}.json`);
  if (!exists(snapshotPath)) {
    throw new Error(`Snapshot not found: ${id}`);
  }
  return parse(readFile(snapshotPath));
}

function saveSnapshot(snapshot) {
  const snapshotPath = dbgitPath('snapshots', `${snapshot.id}.json`);
  writeFile(snapshotPath, stringify(snapshot));
}

function loadObject(hash) {
  const objPath = dbgitPath('objects', `${hash}.json`);
  if (!exists(objPath)) {
    throw new Error(`Object not found: ${hash}`);
  }
  return parse(readFile(objPath));
}

function saveObject(hash, rows) {
  const objPath = dbgitPath('objects', `${hash}.json`);
  if (!exists(objPath)) {
    writeFile(objPath, stringify(rows));
  }
}

function objectExists(hash) {
  return exists(dbgitPath('objects', `${hash}.json`));
}

function listSnapshots() {
  return listDir(dbgitPath('snapshots'))
    .filter(f => f.endsWith('.json'))
    .map(f => parse(readFile(dbgitPath('snapshots', f))))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function nextSnapshotId() {
  const existing = listDir(dbgitPath('snapshots')).filter(f => f.endsWith('.json'));
  return `s${existing.length + 1}`;
}

module.exports = {
  getHead, setHead,
  loadSnapshot, saveSnapshot,
  loadObject, saveObject, objectExists,
  listSnapshots, nextSnapshotId,
};
