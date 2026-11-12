import { expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';

export function assertReleaseFixture(baseURL: string | undefined) {
  expect(new URL(baseURL!).port).toBe('18187');
  const name = process.env.NOTEAPP_AUDIT_CONTAINER;
  const front = process.env.NOTEAPP_AUDIT_FRONTEND;
  expect(name?.startsWith('noteapp-release-audit-')).toBe(true);
  expect(front).toBe(name + '-frontend');
  const inspect = (id: string) => JSON.parse(execFileSync('docker', ['inspect', id], { encoding: 'utf8' }))[0];
  const backend = inspect(name!);
  const frontend = inspect(front!);
  expect(frontend.NetworkSettings.Ports['8080/tcp'][0].HostPort).toBe('18187');
  expect(backend.NetworkSettings.Ports['8080/tcp']).toBeFalsy();
  expect(backend.Mounts.some((mount: { Name: string; Destination: string }) => mount.Name === name && mount.Destination === '/data')).toBe(true);
  expect(frontend.Mounts.some((mount: { Destination: string }) => mount.Destination === '/data')).toBe(false);
  expect(Object.keys(backend.NetworkSettings.Networks)).toEqual([name]);
  expect(Object.keys(frontend.NetworkSettings.Networks)).toEqual([name]);
}
