#!/usr/bin/env python3
"""Compare validated backup bundles without touching a running instance.

Usage: python3 scripts/audit/compare_backups.py BEFORE AFTER
Only recent_visits timestamps may advance; visit identities must remain equal.
"""
import importlib.util
from pathlib import Path
import sqlite3
import sys
import tempfile
from collections import Counter

spec = importlib.util.spec_from_file_location('operations', Path(__file__).resolve().parents[1] / 'operations.py')
operations = importlib.util.module_from_spec(spec)
spec.loader.exec_module(operations)

def compare(before, after):
    manifests = [operations.validate_bundle(bundle) for bundle in (before, after)]
    with tempfile.TemporaryDirectory() as directory:
        roots = [Path(directory) / 'before', Path(directory) / 'after']
        databases = []
        try:
            for root, bundle in zip(roots, (before, after)):
                operations.extract(bundle / 'data.tar.gz', root)
                databases.append(sqlite3.connect(root / 'noteapp.db'))
            schemas = [db.execute("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall() for db in databases]
            assert schemas[0] == schemas[1], 'Table schemas changed'
            for table, _ in schemas[0]:
                quoted = '"' + table.replace('"', '""') + '"'
                rows = [db.execute('SELECT * FROM ' + quoted).fetchall() for db in databases]
                if table == 'recent_visits' and Counter(rows[0]) != Counter(rows[1]):
                    assert all([c[1] for c in db.execute('PRAGMA table_info(recent_visits)')] == ['object_type', 'object_id', 'visited_at'] for db in databases)
                    visits = [{row[:2]: row[2] for row in result} for result in rows]
                    assert visits[0].keys() == visits[1].keys(), 'Visit identities changed'
                    assert all(visits[1][key] >= visits[0][key] for key in visits[0]), 'Visit time moved backwards'
                    print(f'{table}: same {len(visits[0])} identities; timestamps only advanced')
                else:
                    assert Counter(rows[0]) == Counter(rows[1]), f'Changed table: {table}'
                    print(f'{table}: identical ({len(rows[0])} rows)')
            assert manifests[0]['assets'] == manifests[1]['assets'], 'Changed assets'
            print(f'{len(schemas[0])} table schemas and content verified; attachment manifest unchanged')
        finally:
            for database in databases:
                database.close()

if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: compare_backups.py BEFORE AFTER')
    compare(*map(Path, sys.argv[1:]))
