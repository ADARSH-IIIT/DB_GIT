const fs = require('fs');
const path = require('path');

const DBGIT_DIR = path.join(process.cwd(), '.dbgit');

function dbgitPath(...parts) {
  return path.join(DBGIT_DIR, ...parts);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

function listDir(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath);
}

function isInitialized() {
  return fs.existsSync(DBGIT_DIR);
}

module.exports = { dbgitPath, ensureDir, exists, readFile, writeFile, listDir, isInitialized, DBGIT_DIR };
