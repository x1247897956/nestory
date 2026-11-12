"""CI selection must never skip consumers of a changed shared boundary."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'ci_changes.py'
spec = importlib.util.spec_from_file_location('ci_changes', SCRIPT)
ci = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ci)


class Changes(unittest.TestCase):
    def test_independent_sources(self):
        for path in ['web/src/app/api.ts', 'web/Dockerfile']:
            self.assertEqual(ci.classify([path]), dict(frontend=True, backend=False, integration=True, tooling=False))
        for path in ['internal/app/app.go', 'cmd/noteapp/main.go', 'migrations/001.sql', 'go.mod', 'Dockerfile', '.dockerignore']:
            self.assertEqual(ci.classify([path]), dict(frontend=False, backend=True, integration=True, tooling=False))

    def test_frontend_dependencies_also_check_migration_parser(self):
        for path in ['web/package.json', 'web/package-lock.json']:
            self.assertEqual(ci.classify([path]), dict(frontend=True, backend=False, integration=True, tooling=True))

    def test_shared_boundaries_and_unknown_files_fail_open_to_full_checks(self):
        for path in ['compose.yaml', '.env.example', '.github/workflows/ci.yml', 'scripts/ci_changes.py', 'new-build-config', '.gitattributes']:
            self.assertTrue(all(ci.classify([path]).values()), path)

    def test_documentation_and_tooling(self):
        self.assertFalse(any(ci.classify(['README.md', 'README.zh-CN.md', 'docs/ci.md', 'LICENSE', 'design/nestory/final/icon.svg']).values()))
        self.assertEqual(ci.classify(['scripts/tests/test_compose_deployment.py']), dict(frontend=False, backend=False, integration=True, tooling=True))
        result = ci.classify(['web/src/deleted.ts', 'internal/renamed.go', 'docs/ci.md'])
        self.assertTrue(result['frontend'] and result['backend'] and result['integration'])

    def test_missing_or_zero_base_runs_all(self):
        for base in [None, '0' * 40, 'not-a-commit']:
            self.assertTrue(all(ci.select(base).values()))

    def test_deleted_and_renamed_paths_are_included(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            def git(*args):
                return subprocess.check_output(['git', '-C', folder, *args], text=True).strip()
            git('init', '-q');git('config', 'user.email', 'ci@example.invalid');git('config', 'user.name', 'CI test')
            (root / 'internal').mkdir();(root / 'internal/old.go').write_text('package old\n')
            git('add', '.');git('commit', '-qm', 'base');base = git('rev-parse', 'HEAD')
            (root / 'web').mkdir();(root / 'internal/old.go').rename(root / 'web/new.ts')
            git('add', '-A');git('commit', '-qm', 'move')
            result = ci.select(base, cwd=folder)
            self.assertTrue(result['backend'] and result['frontend'] and result['integration'])


if __name__ == '__main__':
    unittest.main()
