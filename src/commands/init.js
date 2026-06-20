const readline = require('readline');
const { DBGIT_DIR, dbgitPath, ensureDir, writeFile, exists } = require('../utils/fileUtils');
const { stringify } = require('../utils/jsonUtils');

function prompt(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function scaffoldDirs() {
  ensureDir(DBGIT_DIR);
  ensureDir(dbgitPath('objects'));
  ensureDir(dbgitPath('snapshots'));
}

function saveMetadata(connection) {
  const metadata = {
    version: '1.0.0',
    created: new Date().toISOString(),
    connection,
  };
  writeFile(dbgitPath('metadata.json'), stringify(metadata));
  writeFile(dbgitPath('HEAD'), 'null');
}

// --url "postgresql://user:pass@host:port/db"  (also accepts ?sslmode=require in the URL)
async function initFromUrl(url, sslFlag) {
  const connection = { connectionString: url };

  // SSL: explicit --ssl flag OR sslmode present in the URL itself
  if (sslFlag || url.includes('sslmode=') || url.includes('ssl=')) {
    connection.ssl = { rejectUnauthorized: false };
  }

  scaffoldDirs();
  saveMetadata(connection);

  console.log('\nInitialized DBGit repository.');
  console.log(`  Mode     : URL / connection string`);
  console.log(`  SSL      : ${connection.ssl ? 'enabled' : 'disabled'}`);
  console.log(`  Directory: ${DBGIT_DIR}`);
}

// Interactive prompts — local or Docker
async function initInteractive() {
  console.log('Initializing DBGit repository...\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const host     = (await prompt(rl, 'PostgreSQL host     [localhost]: ')).trim() || 'localhost';
  const portStr  = (await prompt(rl, 'PostgreSQL port     [5432]: ')).trim() || '5432';
  const database = (await prompt(rl, 'Database name      : ')).trim();
  const user     = (await prompt(rl, 'Username           : ')).trim();
  const password = (await prompt(rl, 'Password           : ')).trim();
  const sslInput = (await prompt(rl, 'Enable SSL?        [y/N]: ')).trim().toLowerCase();

  rl.close();

  if (!database || !user) {
    console.error('\nError: database name and username are required.');
    process.exit(1);
  }

  const connection = {
    host,
    port: parseInt(portStr, 10),
    database,
    user,
    password,
  };

  if (sslInput === 'y' || sslInput === 'yes') {
    connection.ssl = { rejectUnauthorized: false };
  }

  scaffoldDirs();
  saveMetadata(connection);

  console.log('\nInitialized DBGit repository.');
  console.log(`  Mode     : ${host === 'localhost' || host === '127.0.0.1' ? 'local / Docker' : 'remote'}`);
  console.log(`  SSL      : ${connection.ssl ? 'enabled' : 'disabled'}`);
  console.log(`  Directory: ${DBGIT_DIR}`);
}

async function init({ url, ssl } = {}) {
  if (exists(DBGIT_DIR)) {
    console.log('DBGit repository already exists.');
    return;
  }

  if (url) {
    await initFromUrl(url, !!ssl);
  } else {
    await initInteractive();
  }
}

module.exports = { init };
