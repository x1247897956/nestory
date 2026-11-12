#!/usr/bin/env python3
"""Explicit local deployment and host timezone configuration. No background jobs."""
import argparse
from contextlib import contextmanager
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.request
import uuid
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]


def host_timezone(localtime=Path('/etc/localtime'), timezone_file=Path('/etc/timezone')):
    try:
        target = localtime.resolve().as_posix()
        if '/zoneinfo/' in target:
            return ZoneInfo(target.split('/zoneinfo/', 1)[1])
        name = timezone_file.read_text().strip()
        if name:
            return ZoneInfo(name)
    except (OSError, ValueError, KeyError) as error:
        raise ValueError('Cannot determine the host system IANA timezone from /etc/localtime or /etc/timezone') from error
    raise ValueError('Cannot determine the host system IANA timezone')


def write_timezone_env(path, timezone):
    ZoneInfo(timezone)
    if path.is_symlink() or not path.is_file():
        raise ValueError('Expected an existing regular .env file; copy .env.example first')
    original = path.read_text()
    result = []
    replaced = False
    for line in original.splitlines():
        if re.match(r'^\s*(?:export\s+)?APP_TIMEZONE\s*=', line):
            if not replaced:
                result.append('APP_TIMEZONE=' + timezone)
                replaced = True
        else:
            result.append(line)
    if not replaced:
        result.extend(['# Automatically configured from the host system timezone.', 'APP_TIMEZONE=' + timezone])
    text = '\n'.join(result) + '\n'
    if text == original:
        return
    temporary = path.with_name('.env.timezone-' + uuid.uuid4().hex)
    try:
        with temporary.open('x') as stream:
            os.chmod(temporary, 0o600)
            stream.write(text)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


@contextmanager
def deployment_lock():
    with (ROOT / '.local-deploy.lock').open('a') as stream:
        os.chmod(ROOT / '.local-deploy.lock', 0o600)
        fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            yield
        finally:
            fcntl.flock(stream, fcntl.LOCK_UN)


def compose_env():
    return {key: value for key, value in os.environ.items()
            if not key.startswith(('APP_', 'COMPOSE_'))}


def compose_base():
    if not (ROOT / '.env').is_file():
        raise ValueError('Copy .env.example and configure the deployment first')
    return ['docker', 'compose', '--project-directory', str(ROOT),
            '--env-file', str(ROOT / '.env'), '-f', str(ROOT / 'compose.yaml')]


def configure():
    with deployment_lock():
        timezone = host_timezone().key
        write_timezone_env(ROOT / '.env', timezone)
        return timezone


def status():
    base = compose_base()
    config = json.loads(subprocess.check_output(base + ['config', '--format', 'json'], text=True, env=compose_env()))
    ids = subprocess.check_output(base + ['ps', '--all', '-q', 'noteapp'], text=True, env=compose_env()).split()
    containers = []
    for cid in ids:
        container = json.loads(subprocess.check_output(['docker', 'inspect', cid], text=True))[0]
        environment = dict(item.split('=', 1) for item in container['Config']['Env'])
        bindings = container['NetworkSettings']['Ports'].get('8080/tcp') or []
        containers.append({
            'id': container['Id'], 'image': container['Image'],
            'running': container['State']['Running'],
            'timezone': environment.get('APP_TIMEZONE'),
            'volume': next((mount.get('Name') for mount in container['Mounts'] if mount['Destination'] == '/data'), None),
            'url': 'http://127.0.0.1:' + bindings[0]['HostPort'] if bindings else None,
        })
    return {'project': config['name'], 'host_timezone': host_timezone().key,
            'configured_image': config['services']['noteapp']['image'],
            'configured_volume': config['volumes']['noteapp-data']['name'],
            'containers': containers}


def start():
    with deployment_lock():
        timezone = host_timezone().key
        write_timezone_env(ROOT / '.env', timezone)
        subprocess.run(compose_base() + ['up', '-d', '--no-build', 'noteapp'], check=True, env=compose_env())
        current = status()
        if len(current['containers']) != 1:
            raise ValueError('Expected one noteapp container after starting the deployment')
        app = current['containers'][0]
        if not app['url'] or app['timezone'] != timezone:
            raise ValueError('Application did not receive the host timezone or publish its port')
        deadline = time.monotonic() + 45
        while True:
            try:
                with urllib.request.urlopen(app['url'] + '/api/v1/readyz', timeout=3) as response:
                    if response.status == 200:
                        return current
            except OSError:
                pass
            if time.monotonic() >= deadline:
                raise RuntimeError('Application did not become ready; inspect docker compose logs')
            time.sleep(0.3)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['configure', 'sync-timezone', 'up', 'status'])
    args = parser.parse_args()
    try:
        if args.command in ('configure', 'sync-timezone'):
            print('Host timezone configured: ' + configure() + '; run up explicitly to apply it to a container')
        else:
            print(json.dumps(start() if args.command == 'up' else status(), indent=2))
        return 0
    except (Exception, KeyboardInterrupt) as error:
        print('ERROR: ' + str(error), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
