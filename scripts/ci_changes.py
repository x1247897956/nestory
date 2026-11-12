"""Select CI jobs from changed paths; unknown inputs run every check."""
import argparse
import json
import os
import subprocess

KEYS = ('frontend', 'backend', 'integration', 'tooling')


def full():
    return dict.fromkeys(KEYS, True)


def classify(paths):
    result = dict.fromkeys(KEYS, False)
    for path in paths:
        if path in ('compose.yaml', '.env.example', '.gitattributes', 'scripts/ci_changes.py', 'scripts/tests/test_ci_changes.py') or path.startswith('.github/'):
            return full()
        if path.startswith(('docs/', 'design/')) or path in ('README.md', 'README.zh-CN.md', 'LICENSE', '.gitignore'):
            continue
        if path in ('web/package.json', 'web/package-lock.json'):
            result['frontend'] = result['integration'] = result['tooling'] = True
        elif path.startswith('web/'):
            result['frontend'] = result['integration'] = True
        elif path.startswith(('internal/', 'cmd/', 'migrations/')) or path in ('go.mod', 'go.sum', 'Dockerfile', '.dockerignore'):
            result['backend'] = result['integration'] = True
        elif path.startswith('scripts/'):
            result['tooling'] = result['integration'] = True
        else:
            return full()
    return result


def select(base, head='HEAD', cwd=None):
    if not base or set(base) == {'0'}:
        return full()
    try:
        paths = subprocess.check_output(['git', 'diff', '--name-only', '--no-renames', '-z', base, head, '--'], cwd=cwd, stderr=subprocess.PIPE)
    except subprocess.CalledProcessError:
        return full()
    return classify(paths.decode().rstrip('\0').split('\0') if paths else [])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default=os.environ.get('BASE_SHA'))
    args = parser.parse_args()
    result = select(args.base)
    print(json.dumps(result))
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            for key, enabled in result.items():
                output.write(f'{key}={str(enabled).lower()}\n')


if __name__ == '__main__':
    main()
