#!/usr/bin/env python3
"""Offline named-volume backup/restore. Requires Python 3.9+ and Docker; no pip packages."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import uuid


def docker(*args, **kwargs):
    return subprocess.run(['docker', *args], check=True, **kwargs)


def output(*args):
    return docker(*args, stdout=subprocess.PIPE, text=True).stdout.strip()


def inspect_container(name):
    return json.loads(output('container', 'inspect', name))[0]


def image_id(image):
    return json.loads(output('image', 'inspect', image))[0]['Id']


def require_volume(name):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*', name):
        raise ValueError('Use an explicit named Docker volume, not a host path')
    output('volume', 'inspect', name)  # Do not silently create a mistyped volume.


def require_offline(volume, except_container=None):
    active = output('ps', '-q', '--filter', 'volume=' + volume).splitlines()
    for cid in active:
        if not except_container or cid != except_container[:len(cid)]:
            raise ValueError('Volume has a running container; stop all writers first: ' + cid)


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def extract(archive, root):
    # Treat backup archives as untrusted: reject absolute paths, traversal, links,
    # devices and duplicate files before extraction; never use extractall().
    with tarfile.open(archive, 'r:gz') as tf:
        seen = set()
        for m in tf.getmembers():
            p = PurePosixPath(m.name)
            if p.is_absolute() or '..' in p.parts or not (m.isfile() or m.isdir()):
                raise ValueError('Unsafe archive member: ' + m.name)
            if str(p) in seen:
                raise ValueError('Duplicate archive member: ' + m.name)
            seen.add(str(p))
            dest = root.joinpath(*p.parts)
            if m.isdir():
                dest.mkdir(parents=True, exist_ok=True)
            else:
                dest.parent.mkdir(parents=True, exist_ok=True)
                with tf.extractfile(m) as src, dest.open('wb') as dst:
                    shutil.copyfileobj(src, dst)


def snapshot(root):
    # Hash original bytes before SQLite opens a copied WAL snapshot. Only the
    # disposable extraction may gain SHM files; the archive stays unchanged.
    files = {p.relative_to(root).as_posix(): sha(p) for p in sorted(root.rglob('*')) if p.is_file()}
    dbpath = root / 'noteapp.db'
    if not dbpath.is_file():
        raise ValueError('Backup has no noteapp.db')
    with sqlite3.connect(dbpath.as_uri() + '?mode=ro', uri=True) as db:
        integrity = [row[0] for row in db.execute('PRAGMA integrity_check')]
        foreign = db.execute('PRAGMA foreign_key_check').fetchall()
        if integrity != ['ok'] or foreign:
            raise ValueError('SQLite integrity/foreign key checks failed')
        tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
        counts = {table: db.execute('SELECT count(*) FROM "' + table.replace('"', '""') + '"').fetchone()[0] for table in tables}
        versions = [r[0] for r in db.execute('SELECT version FROM schema_migrations ORDER BY version')]
        assets = []
        for aid, key, size in db.execute('SELECT id,storage_key,size FROM assets ORDER BY id'):
            path = root / 'assets' / key
            if not re.fullmatch(r'[a-f0-9]+', key) or not path.is_file() or path.stat().st_size != size:
                raise ValueError('Missing or invalid asset: ' + aid)
            assets.append({'id': aid, 'storage_key': key, 'size': size, 'sha256': sha(path)})
    return {'schema_versions': versions, 'counts': counts, 'assets': assets, 'files': files, 'integrity_check': 'ok', 'foreign_key_check': []}


def archive_snapshot(archive):
    with tempfile.TemporaryDirectory(prefix='noteapp-verify-') as tmp:
        root = Path(tmp)
        extract(archive, root)
        return snapshot(root)


def checksum_bundle(root):
    names = ['data.tar.gz', 'manifest.json']
    (root / 'SHA256SUMS').write_text(''.join(sha(root / n) + '  ' + n + '\n' for n in names), encoding='ascii')


def validate_bundle(root):
    sums = (root / 'SHA256SUMS').read_text(encoding='ascii').splitlines()
    expected = {}
    for line in sums:
        digest, name = line.split('  ', 1)
        if name not in ('data.tar.gz', 'manifest.json') or name in expected or not re.fullmatch('[a-f0-9]{64}', digest):
            raise ValueError('Invalid SHA256SUMS')
        expected[name] = digest
    if set(expected) != {'data.tar.gz', 'manifest.json'}:
        raise ValueError('Incomplete SHA256SUMS')
    for name, digest in expected.items():
        if sha(root / name) != digest:
            raise ValueError('SHA-256 mismatch: ' + name)
    manifest = json.loads((root / 'manifest.json').read_text())
    if manifest.get('format_version') != 1:
        raise ValueError('Unsupported backup manifest format')
    actual = archive_snapshot(root / 'data.tar.gz')
    for field in actual:
        if actual[field] != manifest[field]:
            raise ValueError('Snapshot does not match manifest: ' + field)
    return manifest


def backup(args):
    require_volume(args.volume)
    container = inspect_container(args.container)
    iid = image_id(args.image)
    if container['Image'] != iid:
        raise ValueError('Container image does not match --image')
    if not any(m.get('Name') == args.volume and m['Destination'] == '/data' for m in container['Mounts']):
        raise ValueError('Container does not mount the supplied volume at /data')
    if container['State'].get('Paused'):
        raise ValueError('Unpause the container before backup')
    require_offline(args.volume, container['Id'])
    dest = Path(args.output).absolute()
    if dest.exists() or dest.is_symlink():
        raise ValueError('Backup output already exists; refusing overwrite')
    if not dest.parent.is_dir():
        raise ValueError('Backup output parent must already exist')
    stage = Path(tempfile.mkdtemp(prefix='.' + dest.name + '.partial-', dir=dest.parent))
    was_running = container['State']['Running']
    helper = 'noteapp-backup-helper-' + uuid.uuid4().hex
    try:
        if was_running:
            docker('stop', '--time', '15', args.container, stdout=subprocess.DEVNULL)
        if inspect_container(args.container)['State']['Running']:
            raise ValueError('Container did not stop')
        require_offline(args.volume)
        with (stage / 'data.tar.gz').open('wb') as stream:
            docker('run', '--rm', '--name', helper, '--network', 'none', '--user', '0:0', '--entrypoint', '/bin/sh', '-v', args.volume + ':/data:ro', iid, '-ec', 'tar -czf - -C /data .', stdout=stream)
        manifest = archive_snapshot(stage / 'data.tar.gz')
        manifest.update({'format_version': 1, 'app_version': args.app_version, 'image_reference': args.image, 'image_id': iid, 'source_container': args.container, 'source_volume': args.volume, 'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat()})
        (stage / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
        checksum_bundle(stage)
        validate_bundle(stage)
        if dest.exists():
            raise ValueError('Backup target appeared during operation')
        stage.rename(dest)
        print('Verified backup: ' + str(dest))
    finally:
        # Remove a possibly interrupted helper BEFORE restarting the writer.
        try:
            subprocess.run(['docker', 'rm', '-f', helper], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if stage.exists():
                shutil.rmtree(stage)
        finally:
            if was_running:
                docker('start', args.container, stdout=subprocess.DEVNULL)
                print('Original container running state restored: ' + args.container)


def restore(args):
    require_volume(args.volume)
    require_offline(args.volume)
    iid = image_id(args.image)
    root = Path(args.backup).absolute()
    manifest = validate_bundle(root)
    if manifest['image_id'] != iid:
        raise ValueError('Use the exact image_id recorded in manifest.json; restore first, upgrade separately')
    # Docker's helper checks emptiness and extracts in a single command. No
    # overlay/overwrite restore is available. Root only fixes archive ownership;
    # the application continues to run as UID/GID 10001.
    require_offline(args.volume)
    with (root / 'data.tar.gz').open('rb') as stream:
        docker('run', '--rm', '-i', '--network', 'none', '--user', '0:0', '--entrypoint', '/bin/sh', '--mount', 'type=volume,src=' + args.volume + ',dst=/data,volume-nocopy', iid, '-ec',
               'test -z "$(ls -A /data)" || { echo "Target volume must be empty" >&2; exit 1; }; tar -xzf - -C /data; chown -R 10001:10001 /data', stdin=stream)
    # Read back actual target bytes and SQL, not only the source archive.
    with tempfile.TemporaryDirectory(prefix='noteapp-restored-') as tmp:
        archive = Path(tmp) / 'actual.tar.gz'
        with archive.open('wb') as stream:
            docker('run', '--rm', '--network', 'none', '--user', '0:0', '--entrypoint', '/bin/sh', '-v', args.volume + ':/data:ro', iid, '-ec', 'tar -czf - -C /data .', stdout=stream)
        actual = archive_snapshot(archive)
        for field in actual:
            if actual[field] != manifest[field]:
                raise ValueError('Restored volume mismatch: ' + field)
    print('Verified restore to empty volume: ' + args.volume)
    print(json.dumps({'app_version': manifest['app_version'], 'schema_versions': actual['schema_versions'], 'counts': actual['counts'], 'assets': actual['assets'], 'integrity_check': 'ok', 'foreign_key_check': []}, ensure_ascii=False))


def smoke(args):
    base = args.url.rstrip('/')
    for path in ['/api/v1/healthz', '/api/v1/readyz', '/api/v1/config', '/api/v1/projects', '/api/v1/workspace/today', '/api/v1/trash']:
        with urllib.request.urlopen(base + path, timeout=10) as res:
            if res.status != 200:
                raise ValueError('Smoke failed: ' + path)
            json.load(res)
        print('PASS ' + path)
    with urllib.request.urlopen(base + '/', timeout=10) as res:
        if b'<div id="root">' not in res.read():
            raise ValueError('Frontend bundle not served')
    print('PASS static frontend')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='mode', required=True)
    b = sub.add_parser('backup')
    for name in ['container', 'volume', 'image', 'app-version', 'output']:
        b.add_argument('--' + name, required=True)
    r = sub.add_parser('restore')
    for name in ['volume', 'image', 'backup']:
        r.add_argument('--' + name, required=True)
    s = sub.add_parser('smoke'); s.add_argument('--url', required=True)
    args = parser.parse_args()
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))
    try:
        {'backup': backup, 'restore': restore, 'smoke': smoke}[args.mode](args)
    except (Exception, KeyboardInterrupt) as err:
        print('ERROR: ' + str(err), file=sys.stderr)
        return 1
    return 0
if __name__ == '__main__':
    sys.exit(main())
