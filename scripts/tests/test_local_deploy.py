"""Explicit deployment stays separate from data recovery and scheduling."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfo

SCRIPTS = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('local_deploy', SCRIPTS / 'local_deploy.py')
deploy = None
if (SCRIPTS / 'local_deploy.py').exists():
    deploy = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(deploy)


class LocalDeployTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(deploy, 'Explicit deployment tool is missing')
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.root_patch = patch.object(deploy, 'ROOT', self.root)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)

    def test_configure_only_prepares_timezone_without_docker_or_backup(self):
        env = self.root / '.env'
        env.write_text('# pins\nAPP_PORT=18084\nAPP_IMAGE=sha256:original\nAPP_VOLUME_NAME=current\nAPP_TIMEZONE=Asia/Shanghai\n')
        with patch.object(deploy, 'host_timezone', return_value=ZoneInfo('America/New_York')):
            self.assertEqual(deploy.configure(), 'America/New_York')
        self.assertEqual(env.read_text(), '# pins\nAPP_PORT=18084\nAPP_IMAGE=sha256:original\nAPP_VOLUME_NAME=current\nAPP_TIMEZONE=America/New_York\n')
        self.assertFalse((self.root / 'backups').exists())
        self.assertFalse((self.root / 'deploy').exists())

    def test_system_timezone_ignores_process_tz(self):
        localtime = self.root / 'localtime'
        localtime.symlink_to('/usr/share/zoneinfo/America/New_York')
        with patch.dict(os.environ, {'TZ': 'Asia/Shanghai'}):
            self.assertEqual(deploy.host_timezone(localtime=localtime).key, 'America/New_York')
        zone = self.root / 'timezone'
        zone.write_text('Europe/Berlin\n')
        self.assertEqual(deploy.host_timezone(localtime=self.root / 'missing', timezone_file=zone).key, 'Europe/Berlin')
        with self.assertRaises(ValueError):
            deploy.host_timezone(localtime=self.root / 'missing', timezone_file=self.root / 'missing')

    def test_configure_preserves_pins_and_removes_duplicate_timezone_overrides(self):
        env = self.root / '.env'
        env.write_text('APP_VOLUME_NAME=keep\nAPP_TIMEZONE=UTC\nexport APP_TIMEZONE=Asia/Shanghai\n')
        deploy.write_timezone_env(env, 'Europe/Berlin')
        deploy.write_timezone_env(env, 'Europe/Berlin')
        self.assertEqual(env.read_text(), 'APP_VOLUME_NAME=keep\nAPP_TIMEZONE=Europe/Berlin\n')

    def test_old_automatic_commands_are_rejected(self):
        for command in ['scheduled', 'schedule-plist', 'backup', 'verify-restore']:
            result = subprocess.run([sys.executable, str(SCRIPTS / 'local_deploy.py'), command], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2, command)
        self.assertFalse((self.root / '.env').exists())

    def test_missing_env_is_not_silently_created(self):
        with self.assertRaises(ValueError):
            deploy.configure()
        self.assertFalse((self.root / '.env').exists())

    def test_deployment_lock_is_exclusive_and_released_after_failure(self):
        with self.assertRaisesRegex(RuntimeError, 'failed'):
            with deploy.deployment_lock():
                with self.assertRaises(BlockingIOError):
                    with deploy.deployment_lock():
                        self.fail('Concurrent deployment entered')
                raise RuntimeError('failed')
        with deploy.deployment_lock():
            pass


if __name__ == '__main__':
    unittest.main()
