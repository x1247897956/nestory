#!/usr/bin/env node
// Uses only the versions installed by web/package-lock.json.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const require = createRequire(new URL('../web/package.json', import.meta.url));
export const sourceHash = (body) => createHash('sha256').update(body, 'utf8').digest('hex');

export async function createParser() {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'DocumentFragment', 'DOMParser', 'MutationObserver', 'getComputedStyle']) {
    Object.defineProperty(globalThis, key, { configurable: true, value: key === 'getComputedStyle' ? dom.window[key].bind(dom.window) : dom.window[key] });
  }
  const packageFile = resolve(require.resolve('@blocknote/core'), '../../package.json');
  const pinned = JSON.parse(readFileSync(new URL('../web/package.json', import.meta.url))).dependencies['@blocknote/core'];
  if (JSON.parse(readFileSync(packageFile)).version !== pinned) throw new Error('Installed BlockNote differs from pinned web dependency; run npm ci in web.');
  const { BlockNoteEditor } = await import(pathToFileURL(resolve(require.resolve('@blocknote/core'), '../blocknote.js')).href);
  const editor = BlockNoteEditor.create();
  return {
    parse: (markdown) => ({ version: 1, blocks: markdown === '' ? [] : editor.tryParseMarkdownToBlocks(markdown) }),
    close: () => { editor._tiptapEditor.destroy(); dom.window.close(); },
  };
}

export async function prepare(databasePath, { offline = false } = {}) {
  if (!offline) throw new Error('Maintenance/offline acknowledgement required: --offline. Stop every app process and use a stopped database COPY.');
  if (!existsSync(databasePath)) throw new Error('Database must already exist; refusing to create one.');
  const parser = await createParser();
  const db = new DatabaseSync(databasePath);
  let transaction = false;
  try {
    db.exec('PRAGMA busy_timeout=0; BEGIN EXCLUSIVE');
    transaction = true;
    const candidates = [];
    for (const type of ['tasks', 'pages', 'events']) {
      for (const row of db.prepare(`SELECT id, body FROM ${type} WHERE body_document IS NULL AND body != '' ORDER BY id`).all()) {
        candidates.push({ type, ...row });
      }
    }
    db.exec('CREATE TABLE IF NOT EXISTS block_migration_prepared(object_type TEXT, object_id TEXT, source_sha256 TEXT, body_document BLOB, PRIMARY KEY(object_type,object_id))');
    const get = db.prepare('SELECT source_sha256, body_document FROM block_migration_prepared WHERE object_type=? AND object_id=?');
    const insert = db.prepare('INSERT INTO block_migration_prepared(object_type,object_id,source_sha256,body_document) VALUES(?,?,?,?)');
    let inserted = 0, reused = 0;
    for (const row of candidates) {
      const hash = sourceHash(row.body);
      const previous = get.get(row.type, row.id);
      if (previous) {
        if (previous.source_sha256 !== hash) throw new Error(`Source changed for ${row.type}/${row.id}; refusing to overwrite prepared data.`);
        const document = JSON.parse(Buffer.from(previous.body_document).toString('utf8'));
        const withoutIDs = (value) => JSON.stringify(value, (key, item) => key === 'id' ? undefined : item);
        if (withoutIDs(document) !== withoutIDs(parser.parse(row.body))) throw new Error(`Invalid prepared document for ${row.type}/${row.id}; refusing to overwrite prepared data.`);
        reused++;
        continue;
      }
      insert.run(row.type, row.id, hash, Buffer.from(JSON.stringify(parser.parse(row.body)), 'utf8'));
      inserted++;
    }
    db.exec('COMMIT');
    transaction = false;
    return { candidates: candidates.length, inserted, reused };
  } finally {
    if (transaction) db.exec('ROLLBACK');
    db.close();
    parser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.includes('--help')) {
      console.log('Usage: node scripts/prepare-block-migration.mjs --database PATH --offline\nMAINTENANCE ONLY: stop all app processes; prepare a stopped database COPY. Exclusive locking cannot detect idle apps or WAL readers.');
    } else {
      if (args.length !== 3 || !args.includes('--offline') || args.indexOf('--database') < 0 || !args[args.indexOf('--database') + 1] || args[args.indexOf('--database') + 1].startsWith('--')) throw new Error('Usage: --database PATH --offline');
      console.error('MAINTENANCE/OFFLINE: operate on a stopped database COPY. Do not start the app until preparation completes.');
      console.log(JSON.stringify(await prepare(resolve(args[args.indexOf('--database') + 1]), { offline: true })));
    }
  } catch (error) {
    console.error(`Preparation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
