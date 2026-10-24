import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createParser, prepare } from '../prepare-block-migration.mjs';

const markdown = '# Heading\n\n- parent [link](https://example.com)\n  - child **bold**\n\n- [x] done\n- [ ] todo\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nconst x = 1;\n```\n\n![photo](/api/attachments/a/file)\n\n[report.pdf](/api/attachments/b/file)';

test('pinned browser parser preserves rich Markdown structure and attachment URLs', async () => {
  const parser = await createParser();
  try {
    const { version, blocks: b } = parser.parse(markdown);
    assert.equal(version, 1);
    assert.deepEqual(b.map(x => x.type), ['heading', 'bulletListItem', 'checkListItem', 'checkListItem', 'table', 'codeBlock', 'image', 'paragraph']);
    assert.equal(b[0].props.level, 1);
    assert.deepEqual(b[0].content, [{ type: 'text', text: 'Heading', styles: {} }]);
    assert.deepEqual(b[1].content[1], { type: 'link', href: 'https://example.com', content: [{ type: 'text', text: 'link', styles: {} }] });
    assert.equal(b[1].children[0].type, 'bulletListItem');
    assert.deepEqual(b[1].children[0].content, [{ type: 'text', text: 'child ', styles: {} }, { type: 'text', text: 'bold', styles: { bold: true } }]);
    assert.deepEqual([b[2].props.checked, b[3].props.checked], [true, false]);
    assert.equal(b[4].content.headerRows, 1);
    assert.deepEqual(b[4].content.rows.map(r => r.cells.map(c => c.content[0].text)), [['A', 'B'], ['1', '2']]);
    assert.equal(b[5].props.language, 'js');
    assert.equal(b[5].content[0].text, 'const x = 1;');
    assert.equal(b[6].props.url, '/api/attachments/a/file');
    assert.equal(b[6].props.name, 'photo');
    assert.equal(b[7].content[0].href, '/api/attachments/b/file');
    assert.equal(b[7].content[0].content[0].text, 'report.pdf');
    assert.deepEqual(parser.parse(''), { version: 1, blocks: [] });
  } finally { parser.close(); }
});

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'noteapp-block-migration-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'copy.db');
  const db = new DatabaseSync(path);
  db.exec('PRAGMA user_version=6');
  for (const type of ['tasks', 'pages', 'events']) {
    db.exec(`CREATE TABLE ${type}(id TEXT PRIMARY KEY, body TEXT, body_document BLOB, legacy_body TEXT, deleted_at TEXT)`);
    const insert = db.prepare(`INSERT INTO ${type} VALUES(?,?,?,?,?)`);
    insert.run('old', markdown + '\n中文', null, 'original backup', '2026-10-01');
    insert.run('empty', '', null, null, null);
    insert.run('json', 'ignore Markdown', Buffer.from('{"version":1,"blocks":[]}'), 'keep backup', null);
  }
  return { path, db };
}

test('stages all object types including deleted rows, hashes exact UTF8, preserves source and retries byte-for-byte', async t => {
  const { path, db } = fixture(t);
  t.after(() => db.close());
  const before = ['tasks', 'pages', 'events'].map(type => db.prepare(`SELECT * FROM ${type}`).all());
  await assert.rejects(prepare(path), /offline acknowledgement/);
  assert.deepEqual(await prepare(path, { offline: true }), { candidates: 3, inserted: 3, reused: 0 });
  const staged = db.prepare('SELECT * FROM block_migration_prepared ORDER BY object_type').all();
  assert.deepEqual(staged.map(x => x.object_type), ['events', 'pages', 'tasks']);
  for (const row of staged) {
    assert.equal(row.object_id, 'old');
    assert.equal(row.source_sha256, createHash('sha256').update(markdown + '\n中文', 'utf8').digest('hex'));
    assert.equal(JSON.parse(Buffer.from(row.body_document).toString()).blocks[0].type, 'heading');
  }
  assert.deepEqual(await prepare(path, { offline: true }), { candidates: 3, inserted: 0, reused: 3 });
  assert.deepEqual(db.prepare('SELECT * FROM block_migration_prepared ORDER BY object_type').all(), staged);
  assert.deepEqual(['tasks', 'pages', 'events'].map(type => db.prepare(`SELECT * FROM ${type}`).all()), before);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 6);
});

test('source mismatch and corrupt prepared data roll back every staging write', async t => {
  const { path, db } = fixture(t);
  t.after(() => db.close());
  await prepare(path, { offline: true });
  db.exec("DELETE FROM block_migration_prepared WHERE object_type='tasks'; UPDATE pages SET body='changed' WHERE id='old'");
  await assert.rejects(prepare(path, { offline: true }), /Source changed/);
  assert.equal(db.prepare("SELECT count(*) AS n FROM block_migration_prepared WHERE object_type='tasks'").get().n, 0);
  db.prepare("UPDATE pages SET body=? WHERE id='old'").run(markdown + '\n中文');
  db.exec("UPDATE block_migration_prepared SET body_document=x'7b7d' WHERE object_type='pages'");
  await assert.rejects(prepare(path, { offline: true }), /Invalid prepared document/);
  assert.equal(db.prepare("SELECT count(*) AS n FROM block_migration_prepared WHERE object_type='tasks'").get().n, 0);
});

test('refuses active write locks without partial staging', async t => {
  const { path, db } = fixture(t);
  t.after(() => db.close());
  db.exec('BEGIN IMMEDIATE');
  try { await assert.rejects(prepare(path, { offline: true }), /locked/); }
  finally { db.exec('ROLLBACK'); }
  assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='block_migration_prepared'").get().n, 0);
});
