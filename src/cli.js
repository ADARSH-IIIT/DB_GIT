#!/usr/bin/env node

const { Command } = require('commander');
const { init } = require('./commands/init');
const { snapshot } = require('./commands/snapshot');
const { diff } = require('./commands/diff');
const { log } = require('./commands/log');

const program = new Command();

program
  .name('dbgit')
  .description('Git-like version control for PostgreSQL snapshots')
  .version('1.0.0');

program
  .command('init')
  .description('Initialize a DBGit repository in the current directory')
  .option('--url <url>', 'PostgreSQL connection URL (skips interactive prompts)')
  .option('--ssl', 'Enable SSL (required for most cloud providers)')
  .action(opts => init(opts).catch(err => { console.error(err.message); process.exit(1); }));

program
  .command('snapshot')
  .description('Take a snapshot of the current database state')
  .option('-m, --message <message>', 'Snapshot message')
  .action(opts => snapshot(opts.message).catch(err => { console.error(err.message); process.exit(1); }));

program
  .command('diff <snapshotA> <snapshotB>')
  .description('Compare two snapshots and generate an HTML diff report')
  .action((a, b) => diff(a, b).catch(err => { console.error(err.message); process.exit(1); }));

program
  .command('log')
  .description('List all snapshots, newest first')
  .action(() => log());

program.parse(process.argv);
