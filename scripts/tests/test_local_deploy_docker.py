"""Explicit deployment checks against isolated Compose resources only."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import urllib.request
import uuid
from zoneinfo import ZoneInfo

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
import local_deploy as deploy

IMAGE = os.environ.get('NOTEAPP_TEST_IMAGE', 'noteapp:local')


class LocalDeployDocker(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.name = 'nestory-deploy-test-' + uuid.uuid4().hex[:10]
        (self.root / 'compose.yaml').write_bytes((SCRIPTS.parent / 'compose.yaml').read_bytes())
        (self.root / '.env').write_text(f'COMPOSE_PROJECT_NAME={self.name}\nAPP_IMAGE={IMAGE}\nAPP_PORT=0\nAPP_VOLUME_NAME={self.name}\n')
        self.root_patch = patch.object(deploy, 'ROOT', self.root)
        self.root_patch.start()
        self.addCleanup(self.cleanup)
        deploy.start()
        app = deploy.status()['containers'][0]
        port = app['url'].rsplit(':', 1)[1]
        env = self.root / '.env'
        env.write_text(env.read_text().replace('APP_PORT=0', 'APP_PORT=' + port))
        deploy.start()
        self.url = deploy.status()['containers'][0]['url']
        request = urllib.request.Request(self.url + '/api/v1/projects', data=json.dumps({'title': '保留原始数据'}).encode(), headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(request) as response:
            self.project = json.load(response)

    def cleanup(self):
        subprocess.run(deploy.compose_base() + ['down', '-v'], env=deploy.compose_env(), capture_output=True)
        self.root_patch.stop()
        self.tmp.cleanup()

    def test_configure_changes_no_running_container_or_data(self):
        original = deploy.status()['containers'][0]
        timezone = 'America/New_York' if original['timezone'] != 'America/New_York' else 'Europe/Berlin'
        with patch.object(deploy, 'host_timezone', return_value=ZoneInfo(timezone)):
            deploy.configure()
        self.assertEqual(deploy.status()['containers'][0], original)
        self.assertFalse((self.root / 'backups').exists())

    def test_explicit_up_applies_host_timezone_and_preserves_data_and_pins(self):
        original = deploy.status()['containers'][0]
        timezone = 'America/New_York' if original['timezone'] != 'America/New_York' else 'Europe/Berlin'
        with patch.object(deploy, 'host_timezone', return_value=ZoneInfo(timezone)), patch.dict(os.environ, {'APP_TIMEZONE': original['timezone']}):
            deploy.start()
        current = deploy.status()['containers'][0]
        self.assertNotEqual(current['id'], original['id'])
        for key in ['image', 'volume', 'url']:
            self.assertEqual(current[key], original[key])
        self.assertEqual(current['timezone'], timezone)
        with urllib.request.urlopen(self.url + '/api/v1/projects/' + self.project['id']) as response:
            self.assertEqual(json.load(response)['title'], '保留原始数据')
        self.assertFalse((self.root / 'backups').exists())

    def test_configure_does_not_start_an_intentionally_stopped_instance(self):
        original = deploy.status()['containers'][0]
        subprocess.run(['docker', 'stop', original['id']], check=True, capture_output=True)
        deploy.configure()
        current = deploy.status()['containers'][0]
        self.assertFalse(current['running'])
        self.assertEqual(current['id'], original['id'])


if __name__ == '__main__':
    unittest.main()
