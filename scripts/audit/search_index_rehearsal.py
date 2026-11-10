#!/usr/bin/env python3
"""Upgrade a validated schema9 backup ONLY in new disposable volumes, then restore it."""
import argparse
from collections import Counter
import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('operations', ROOT / 'scripts/operations.py')
operations = importlib.util.module_from_spec(spec)
spec.loader.exec_module(operations)


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def compare_source(before, after):
    ma, mb = [operations.validate_bundle(path) for path in (before, after)]
    assert ma['schema_versions'] == list(range(1, 10))
    assert mb['schema_versions'] == list(range(1, 11))
    assert ma['assets'] == mb['assets']
    with tempfile.TemporaryDirectory() as directory:
        paths = [Path(directory) / x for x in ('before', 'after')]
        for root, bundle in zip(paths, (before, after)):
            operations.extract(bundle / 'data.tar.gz', root)
        with sqlite3.connect(paths[0] / 'noteapp.db') as old, sqlite3.connect(paths[1] / 'noteapp.db') as new:
            tables = old.execute("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()
            for table, schema in tables:
                assert new.execute('SELECT sql FROM sqlite_master WHERE name=?', (table,)).fetchone()[0] == schema
                query = 'SELECT * FROM "' + table.replace('"', '""') + '"'
                if table == 'schema_migrations':
                    query += ' WHERE version<=9'
                assert Counter(old.execute(query).fetchall()) == Counter(new.execute(query).fetchall()), table
            expected = sum(new.execute('SELECT count(*) FROM ' + table + ' WHERE deleted_at IS NULL').fetchone()[0] for table in ('projects', 'tasks', 'pages', 'events'))
            assert new.execute('SELECT count(*) FROM search_documents').fetchone()[0] == expected
            new.execute("INSERT INTO search_fts(search_fts,rank) VALUES('integrity-check',1)")
            print(f'PASS schema9→10: {len(tables)} original tables/rows unchanged, source block JSON unchanged, attachments unchanged; {expected} derived search entries verified', flush=True)
            print('Database bytes before/after:', [(path / 'noteapp.db').stat().st_size for path in paths], flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backup', type=Path, required=True)
    parser.add_argument('--source-image', required=True)
    parser.add_argument('--image', required=True)
    args = parser.parse_args()
    source = args.backup.resolve()
    operations.validate_bundle(source)
    tag = uuid.uuid4().hex[:12]
    names = ['nestory-search-upgrade-' + tag, 'nestory-search-restore-' + tag]
    made = []
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    def start(name):
        run('docker', 'run', '-d', '--name', name, '-p', '127.0.0.1::8080', '-v', name + ':/data', args.image)
        return address(name)
    def address(name):
        port = json.loads(run('docker', 'inspect', name))[0]['NetworkSettings']['Ports']['8080/tcp'][0]['HostPort']
        base = 'http://127.0.0.1:' + port
        for attempt in range(100):
            try:
                with opener.open(base + '/api/v1/readyz', timeout=3) as response:
                    assert response.status == 200
                    return base
            except OSError:
                if attempt == 99:
                    raise
                time.sleep(.1)
    def backup(name, target):
        run(str(ROOT / 'scripts/backup.sh'), '--container', name, '--volume', name, '--image', args.image,
            '--app-version', 'search-index-rehearsal', '--output', str(target))
    try:
        for name in names:
            run('docker', 'volume', 'create', name)
            made.append(name)
        run(str(ROOT / 'scripts/restore.sh'), '--volume', names[0], '--image', args.source_image, '--backup', str(source))
        base = start(names[0])
        with tempfile.TemporaryDirectory(prefix='nestory-search-rehearsal-') as work:
            upgraded, valued, restored = [Path(work) / key for key in ('upgraded', 'valued', 'restored')]
            backup(names[0], upgraded)
            compare_source(source, upgraded)
            base = address(names[0])  # Backup restart may receive a new random host port.
            def request(path, data=None):
                req = urllib.request.Request(base + '/api/v1' + path,
                    data=None if data is None else json.dumps(data).encode(), headers={'Content-Type': 'application/json'})
                with opener.open(req, timeout=10) as response:
                    return json.load(response)
            project = request('/projects', {'title': 'Isolated indexed restore fixture'})
            doc = {'version': 1, 'blocks': [{'id': 'b', 'type': 'paragraph', 'content': [
                {'type': 'text', 'text': 'search-rehearsal-marker 中文', 'styles': {}}]}]}
            objects = []
            for typ in ('tasks', 'pages', 'events'):
                payload = {'title': 'Isolated ' + typ, 'body_document': doc}
                if typ == 'events':
                    payload.update(start_at='2026-11-10T09:00:00Z', end_at='2026-11-10T10:00:00Z')
                objects.append((typ, request('/projects/' + project['id'] + '/' + typ, payload)))
            assert request('/search?q=search-rehearsal-marker')['total'] == 3
            backup(names[0], valued)
            # Recreate only this owned container on the same volume; then test a clean volume restore.
            run('docker', 'rm', '-f', names[0])
            base = start(names[0])
            assert request('/search?q=search-rehearsal-marker')['total'] == 3
            for typ, obj in objects:
                assert request('/' + typ + '/' + obj['id'])['body_document'] == obj['body_document']
            run(str(ROOT / 'scripts/restore.sh'), '--volume', names[1], '--image', args.image, '--backup', str(valued))
            base = start(names[1])
            assert request('/search?q=search-rehearsal-marker')['total'] == 3
            for typ, obj in objects:
                assert request('/' + typ + '/' + obj['id'])['body_document'] == obj['body_document']
            backup(names[1], restored)
            # Same-schema restore must preserve source AND FTS shadow-table records exactly.
            compare_spec = importlib.util.spec_from_file_location('compare', Path(__file__).with_name('compare_backups.py'))
            comparison = importlib.util.module_from_spec(compare_spec)
            compare_spec.loader.exec_module(comparison)
            comparison.compare(valued, restored)
            print('PASS same-volume container recreation and clean-volume search-index backup/restore', flush=True)
    finally:
        for name in made:
            subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            subprocess.run(['docker', 'volume', 'rm', name], stdout=subprocess.DEVNULL, check=True)


if __name__ == '__main__':
    main()
