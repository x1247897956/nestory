#!/usr/bin/env python3
"""Measure ONLY a newly created disposable instance; never accepts a live URL/volume."""
import argparse
import concurrent.futures
import gzip
import json
import math
import pathlib
import platform
import statistics
import subprocess
import time
import urllib.request
import uuid


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def summarize(samples):
    ordered = sorted(samples)
    if not ordered:
        raise ValueError('empty samples')
    return {'samples_ms': samples, 'p50_ms': statistics.median(ordered),
            'p95_ms': ordered[math.ceil(.95 * len(ordered)) - 1], 'max_ms': ordered[-1]}


def measure(args, count):
    name = 'nestory-perf-' + uuid.uuid4().hex[:12]
    result = {'count_per_type': count, 'container': name, 'rounds': []}
    made_volume = made_container = False
    try:
        run('docker', 'volume', 'create', name)
        made_volume = True
        run('docker', 'create', '--name', name, '-p', '127.0.0.1::8080',
            '-e', 'APP_TIMEZONE=Asia/Shanghai', '-v', name + ':/data', args.image)
        made_container = True
        run('docker', 'start', name)
        info = json.loads(run('docker', 'inspect', name))[0]
        result['limits'] = {k: info['HostConfig'][k] for k in ('Memory', 'NanoCpus')}
        port = info['NetworkSettings']['Ports']['8080/tcp'][0]['HostPort']
        base = 'http://127.0.0.1:' + port + '/api/v1'

        def request(path, body=None, method=None, encoding='gzip'):
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            payload = None if body is None else json.dumps(body).encode()
            req = urllib.request.Request(base + path, data=payload, method=method,
                  headers={'Content-Type': 'application/json', 'Accept-Encoding': encoding})
            start = time.perf_counter()
            with opener.open(req, timeout=120) as response:
                raw = response.read()
                elapsed = (time.perf_counter() - start) * 1000
                compressed = response.headers.get('Content-Encoding') == 'gzip'
                status = response.status
            decoded = gzip.decompress(raw) if compressed else raw
            return json.loads(decoded), elapsed, len(raw), len(decoded), status

        for attempt in range(100):
            try:
                request('/readyz')
                break
            except OSError:
                if attempt == 99:
                    raise
                time.sleep(.1)
        pid = request('/projects', {'title': 'Isolated performance'})[0]['id']
        doc = {'version': 1, 'blocks': [{'id': 'body', 'type': 'paragraph',
               'content': [{'type': 'text', 'text': 'searchable中文 ' * 500, 'styles': {}}]}]}
        result['document_bytes'] = len(json.dumps(doc, ensure_ascii=False).encode())
        result['stored_document_bytes'] = len(json.dumps(doc).encode())
        start = time.perf_counter()
        first = None
        for typ in ('tasks', 'pages', 'events'):
            for i in range(count):
                body = {'title': f'{typ}-{i}', 'body_document': doc}
                if typ == 'tasks':
                    body['due_date'] = '2026-11-10'
                if typ == 'events':
                    body.update(start_at='2026-11-10T09:00:00+08:00', end_at='2026-11-10T10:00:00+08:00')
                obj, _, _, _, status = request('/projects/' + pid + '/' + typ, body)
                assert status == 201
                if typ == 'pages' and i == 0:
                    first = obj
        result['seed_seconds'] = time.perf_counter() - start
        paths = {'tasks': '/projects/' + pid + '/tasks', 'pages': '/projects/' + pid + '/pages',
                 'events': '/projects/' + pid + '/events?from=2026-11-01T00:00:00Z&to=2026-12-01T00:00:00Z',
                 'search_miss': '/search?q=no-match-perf-token', 'search_body': '/search?q=searchable',
                 'workspace': '/workspace?from=2026-11-01T00:00:00Z&to=2026-12-01T00:00:00Z'}
        for path in paths.values():
            for _ in range(3):
                request(path)
        for round_number in range(args.rounds):
            measurements = {}
            for key, path in paths.items():
                durations = []
                for _ in range(args.samples):
                    sample = request(path)
                    durations.append(sample[1])
                    sizes = {'wire_bytes': sample[2], 'decoded_bytes': sample[3]}
                    del sample  # Do not retain a batch of large parsed collection responses.
                measurements[key] = summarize(durations)
                measurements[key].update(sizes)
            saves = []
            for _ in range(args.samples):
                obj, elapsed, _, _, _ = request('/pages/' + first['id'],
                    {'version': first['version'], 'title': 'Saved ' + str(first['version']), 'body_document': doc}, 'PATCH')
                first = obj
                saves.append(elapsed)
            measurements['save'] = summarize(saves)
            # Barrier ensures requests start together; single-person multi-tab stress, not multiuser throughput.
            import threading
            barrier = threading.Barrier(9)
            def concurrent_search():
                barrier.wait()
                return request(paths['search_miss'])[1]
            def concurrent_save():
                barrier.wait()
                return request('/pages/' + first['id'], {'version': first['version'], 'title': 'Concurrent save'}, 'PATCH')
            with concurrent.futures.ThreadPoolExecutor(9) as pool:
                searches = [pool.submit(concurrent_search) for _ in range(8)]
                saving = pool.submit(concurrent_save)
                first, elapsed, _, _, _ = saving.result()
                search_times = [f.result() for f in searches]
            result['rounds'].append({'index': round_number + 1, 'measurements': measurements,
                  'concurrent': {'search_ms': search_times, 'save_ms': elapsed},
                  'memory_sample': run('docker', 'stats', '--no-stream', '--format', '{{json .}}', name)})
            print(f'count={count} round={round_number + 1} finished', flush=True)
        result['success'] = True
        return result
    except Exception as error:
        result['error'] = repr(error)
        if made_container:
            result['state'] = json.loads(run('docker', 'inspect', name))[0]['State']
            logs = subprocess.run(['docker', 'logs', name], capture_output=True, text=True)
            result['logs'] = logs.stdout + logs.stderr
        return result
    finally:
        if made_container:
            subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL, check=True)
        if made_volume:
            subprocess.run(['docker', 'volume', 'rm', name], stdout=subprocess.DEVNULL, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', required=True)
    parser.add_argument('--counts', type=int, nargs='+', default=[100, 1000, 5000])
    parser.add_argument('--rounds', type=int, default=3)
    parser.add_argument('--samples', type=int, default=20)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    if min(args.counts + [args.rounds, args.samples]) < 1:
        parser.error('counts, rounds and samples must be positive')
    report = {'image': run('docker', 'image', 'inspect', args.image, '--format', '{{.Id}}'),
              'host': platform.platform(), 'machine': platform.machine(),
              'docker': json.loads(run('docker', 'info', '--format', '{{json .}}')),
              'samples_per_round': args.samples, 'results': []}
    # Retain only public resource/version context, not daemon credentials or unrelated configuration.
    report['docker'] = {k: report['docker'][k] for k in ('ServerVersion', 'NCPU', 'MemTotal', 'Architecture', 'OperatingSystem')}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    for count in args.counts:
        item = measure(args, count)
        report['results'].append(item)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        if not item.get('success'):
            raise SystemExit(item['error'])


if __name__ == '__main__':
    main()
