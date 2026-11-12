"""Explicit deployment checks against isolated Compose resources only."""
import ipaddress
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
import urllib.request
import urllib.error
import uuid

SCRIPTS = Path(__file__).resolve().parents[1]

IMAGE = os.environ.get('NOTEAPP_TEST_IMAGE', 'noteapp:local')
FRONTEND_IMAGE = os.environ.get('NOTEAPP_TEST_FRONTEND_IMAGE', 'noteapp-web:local')


class ComposeDeployment(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.name = 'nestory-deploy-test-' + uuid.uuid4().hex[:10]
        compose = (SCRIPTS.parent / 'compose.yaml').read_text()
        # Static address reservation in the DNS replacement test requires an
        # explicit subnet on Linux Engine; Desktop also permits automatic pools.
        ids = subprocess.check_output(['docker', 'network', 'ls', '-q'], text=True).split()
        networks = json.loads(subprocess.check_output(['docker', 'network', 'inspect', *ids], text=True))
        used = [ipaddress.ip_network(config['Subnet']) for network in networks
                for config in (network['IPAM'].get('Config') or []) if config.get('Subnet')]
        candidates = list(ipaddress.ip_network('172.16.0.0/12').subnets(new_prefix=24))
        offset = int(self.name.rsplit('-', 1)[1], 16) % len(candidates)
        subnet = next((candidates[(offset + n) % len(candidates)] for n in range(len(candidates))
                       if not any(candidates[(offset + n) % len(candidates)].overlaps(existing)
                                  for existing in used if existing.version == 4)), None)
        self.assertIsNotNone(subnet, 'No free isolated test subnet')
        compose += f'\nnetworks:\n  default:\n    ipam:\n      config:\n        - subnet: {subnet}\n'
        (self.root / 'compose.yaml').write_text(compose)
        (self.root / '.env').write_text(f'COMPOSE_PROJECT_NAME={self.name}\nAPP_IMAGE={IMAGE}\nAPP_FRONTEND_IMAGE={FRONTEND_IMAGE}\nAPP_PORT=0\nAPP_VOLUME_NAME={self.name}\nAPP_TIMEZONE=Asia/Shanghai\n')
        self.env = {key: value for key, value in os.environ.items()
                    if not key.startswith(('APP_', 'COMPOSE_'))}
        self.addCleanup(self.cleanup)
        self.start()
        app = self.container()
        port = app['url'].rsplit(':', 1)[1]
        env = self.root / '.env'
        env.write_text(env.read_text().replace('APP_PORT=0', 'APP_PORT=' + port))
        self.start()
        self.url = self.container()['url']
        request = urllib.request.Request(self.url + '/api/v1/projects', data=json.dumps({'title': '保留原始数据'}).encode(), headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(request) as response:
            self.project = json.load(response)

    def cleanup(self):
        self.set_timezone('UTC')
        self.compose('down', '-v', check=False)
        self.tmp.cleanup()

    def compose(self, *args, check=True):
        result = subprocess.run(['docker', 'compose', '--project-directory', str(self.root),
                               '--env-file', str(self.root / '.env'), '-f', str(self.root / 'compose.yaml'), *args],
                              env=self.env, capture_output=True, text=True)
        if check and result.returncode:
            self.fail(result.stdout + result.stderr)
        return result

    def container(self, service='noteapp'):
        cid = self.compose('ps', '--all', '-q', service).stdout.strip()
        raw = json.loads(subprocess.check_output(['docker', 'inspect', cid], text=True))[0]
        environment = dict(item.split('=', 1) for item in raw['Config']['Env'])
        front_cid = self.compose('ps', '--all', '-q', 'frontend').stdout.strip()
        front = json.loads(subprocess.check_output(['docker', 'inspect', front_cid], text=True))[0]
        port = front['NetworkSettings']['Ports'].get('8080/tcp') or []
        return {'id': raw['Id'], 'image': raw['Image'], 'running': raw['State']['Running'],
                'timezone': environment.get('APP_TIMEZONE'),
                'volume': next((mount['Name'] for mount in raw['Mounts'] if mount['Destination'] == '/data'), None),
                'url': 'http://127.0.0.1:' + port[0]['HostPort'] if port else None}

    def start(self):
        self.compose('up', '-d', '--no-build')
        url = self.container()['url']
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            try:
                with urllib.request.urlopen(url + '/api/v1/readyz', timeout=2) as response:
                    if response.status == 200:
                        return
            except OSError:
                pass
            time.sleep(0.1)
        self.fail('Compose deployment did not become ready: ' + self.compose('logs', 'noteapp').stdout)

    def set_timezone(self, timezone):
        env = self.root / '.env'
        lines = [line for line in env.read_text().splitlines() if not line.startswith('APP_TIMEZONE=')]
        if timezone is not None:
            lines.append('APP_TIMEZONE=' + timezone)
        env.write_text('\n'.join(lines) + '\n')

    def test_editing_env_changes_no_running_container_or_data(self):
        original = self.container()
        timezone = 'America/New_York' if original['timezone'] != 'America/New_York' else 'Europe/Berlin'
        self.set_timezone(timezone)
        config = json.loads(self.compose('config', '--format', 'json').stdout)
        self.assertEqual(config['services']['noteapp']['environment']['APP_TIMEZONE'], timezone)
        self.assertEqual(self.container(), original)
        self.assertFalse((self.root / 'backups').exists())

    def test_explicit_up_applies_configured_timezone_and_preserves_data_and_pins(self):
        original = self.container()
        timezone = 'America/New_York' if original['timezone'] != 'America/New_York' else 'Europe/Berlin'
        self.set_timezone(timezone)
        configured = (self.root / '.env').read_bytes()
        self.env['TZ'] = 'UTC'
        self.start()
        self.assertEqual((self.root / '.env').read_bytes(), configured)
        current = self.container()
        self.assertNotEqual(current['id'], original['id'])
        for key in ['image', 'volume', 'url']:
            self.assertEqual(current[key], original[key])
        self.assertEqual(current['timezone'], timezone)
        with urllib.request.urlopen(self.url + '/api/v1/config') as response:
            self.assertEqual(json.load(response)['timezone'], timezone)
        with urllib.request.urlopen(self.url + '/api/v1/projects/' + self.project['id']) as response:
            self.assertEqual(json.load(response)['title'], '保留原始数据')
        self.assertFalse((self.root / 'backups').exists())

    def test_status_does_not_start_an_intentionally_stopped_instance(self):
        original = self.container()
        subprocess.run(['docker', 'stop', original['id']], check=True, capture_output=True)
        self.set_timezone('Europe/Berlin')
        self.compose('config')
        self.compose('ps', '--all')
        current = self.container()
        self.assertFalse(current['running'])
        self.assertEqual(current['id'], original['id'])

    def test_direct_compose_reads_explicit_timezone_and_rejects_missing_or_empty(self):
        self.set_timezone('Europe/Berlin')
        config = json.loads(self.compose('config', '--format', 'json').stdout)
        self.assertEqual(config['services']['noteapp']['environment']['APP_TIMEZONE'], 'Europe/Berlin')
        for timezone in [None, '']:
            self.set_timezone(timezone)
            result = self.compose('config', check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('APP_TIMEZONE', result.stderr)
        self.set_timezone('Asia/Shanghai')


    def test_two_services_keep_backend_private_and_frontend_without_data(self):
        backend = self.container()
        front = self.container('frontend')
        self.assertNotEqual(backend['id'], front['id'])
        self.assertIsNone(front['volume'])
        raw = json.loads(subprocess.check_output(['docker', 'inspect', backend['id']], text=True))[0]
        self.assertFalse(raw['NetworkSettings']['Ports'].get('8080/tcp'))
        self.assertEqual(front['image'], subprocess.check_output(['docker', 'image', 'inspect', FRONTEND_IMAGE, '--format', '{{.Id}}'], text=True).strip())

    def test_proxy_and_static_boundaries(self):
        with urllib.request.urlopen(self.url + '/projects/nested/path') as response:
            self.assertIn(b'<html', response.read())
        with urllib.request.urlopen(self.url + '/version.json') as response:
            expected = subprocess.check_output(['docker', 'image', 'inspect', FRONTEND_IMAGE, '--format', '{{index .Config.Labels \"org.opencontainers.image.revision\"}}'], text=True).strip()
            self.assertEqual(json.load(response)['version'], expected)
        for path in ['/api/v1/missing', '/assets/missing.js']:
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(self.url + path)
            self.assertEqual(error.exception.code, 404)
            error.exception.close()
        for path in ['/', '/api/v1/config']:
            req = urllib.request.Request(self.url + path, headers={'Host': 'evil.invalid', 'X-Forwarded-Host': 'localhost'})
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(req)
            self.assertEqual(error.exception.code, 403)
            error.exception.close()
        req = urllib.request.Request(self.url + '/api/v1/projects', data=b'{"title":"denied"}', headers={'Content-Type': 'application/json', 'Origin': 'http://evil.invalid'})
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(req)
        self.assertEqual(error.exception.code, 403)
        error.exception.close()

    def test_proxy_upload_ranges_and_workspace_archive(self):
        content = b'0123456789abcdef' * (128 * 1024)
        boundary = 'nestory-proxy-test'
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="large.txt"\r\nContent-Type: text/plain\r\n\r\n'.encode() + content + f'\r\n--{boundary}--\r\n'.encode())
        request = urllib.request.Request(self.url + '/api/v1/projects/' + self.project['id'] + '/assets', data=body,
                                         headers={'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Origin': self.url})
        with urllib.request.urlopen(request, timeout=15) as response:
            asset = json.load(response)
            self.assertEqual(asset['size'], len(content))
        for path in ['/', asset['url']]:
            request = urllib.request.Request(self.url + path, headers={'Range': 'bytes=0-3'})
            with urllib.request.urlopen(request) as response:
                self.assertEqual(response.status, 206)
                self.assertTrue(response.headers.get('Content-Range'))
                self.assertEqual(len(response.read()), 4)
        with urllib.request.urlopen(self.url + asset['url'] + '?download=1') as response:
            self.assertIn('attachment', response.headers['Content-Disposition'])
            self.assertEqual(response.read(), content)
        request = urllib.request.Request(self.url + asset['url'], headers={'Range': 'bytes=0-1,4-5'})
        with urllib.request.urlopen(request) as response:
            self.assertEqual(response.status, 206)
            self.assertIn('multipart/byteranges', response.headers['Content-Type'])
            self.assertIn(b'Content-Range: bytes 0-1/', response.read())
        with urllib.request.urlopen(self.url + '/api/v1/transfer/export', timeout=15) as response:
            archive = response.read()
            self.assertTrue(archive.startswith(b'PK'))
            self.assertIn('attachment', response.headers['Content-Disposition'])
        request = urllib.request.Request(self.url + '/api/v1/transfer/import', data=archive,
                                         headers={'Content-Type': 'application/zip', 'Origin': self.url})
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(request)
        self.assertEqual(error.exception.code, 409)
        error.exception.close()
        for host in ['LOCALHOST.:' + self.url.rsplit(':', 1)[1], '[::1]:' + self.url.rsplit(':', 1)[1]]:
            request = urllib.request.Request(self.url + '/api/v1/config', headers={'Host': host})
            with urllib.request.urlopen(request) as response:
                self.assertEqual(response.status, 200)

    def test_backend_recreation_preserves_frontend_and_data(self):
        original = self.container()
        frontend = self.container('frontend')['id']
        raw = json.loads(subprocess.check_output(['docker', 'inspect', original['id']], text=True))[0]
        network, endpoint = next(iter(raw['NetworkSettings']['Networks'].items()))
        previous_ip = endpoint['IPAddress']
        self.compose('stop', 'noteapp')
        self.compose('rm', '-f', 'noteapp')
        holder = self.name + '-old-ip'
        try:
            # Occupy the old address so this verifies DNS refresh, not address reuse.
            reserved = subprocess.run(['docker', 'run', '-d', '--name', holder, '--network', network, '--ip', previous_ip,
                                       '--entrypoint', 'sleep', IMAGE, '60'], capture_output=True, text=True)
            self.assertEqual(reserved.returncode, 0, reserved.stdout + reserved.stderr)
            self.compose('up', '-d', '--no-build', '--no-deps', 'noteapp')
            current = json.loads(subprocess.check_output(['docker', 'inspect', self.container()['id']], text=True))[0]
            self.assertNotEqual(current['NetworkSettings']['Networks'][network]['IPAddress'], previous_ip)
        finally:
            subprocess.run(['docker', 'rm', '-f', holder], capture_output=True)
        self.assertNotEqual(self.container()['id'], original['id'])
        self.assertEqual(self.container('frontend')['id'], frontend)
        deadline = time.monotonic() + 20
        while True:
            try:
                with urllib.request.urlopen(self.url + '/api/v1/projects/' + self.project['id'], timeout=2) as response:
                    self.assertEqual(json.load(response)['title'], '保留原始数据')
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(.2)
        backend_id = self.container()['id']
        self.compose('up', '-d', '--no-build', '--no-deps', '--force-recreate', 'frontend')
        self.assertEqual(self.container()['id'], backend_id)
        self.assertEqual(self.container()['image'], original['image'])
        self.assertEqual(self.container()['volume'], original['volume'])

if __name__ == '__main__':
    unittest.main()
