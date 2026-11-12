import { beforeEach, expect, it, vi } from 'vitest';
import { defaultSettings, normalizeSettings, readSettings, saveSettings, resetPreferences, safeStartupPath, startupPath, rememberLocation, SETTINGS_KEY } from './preferences';

beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

it('normalizes corrupt and out of range settings without losing valid choices', () => {
  expect(normalizeSettings(null)).toEqual(defaultSettings);
  expect(normalizeSettings({theme:'dark',fontSize:100,eventDuration:0,spellCheck:false,firstDay:0})).toEqual({...defaultSettings,theme:'dark',spellCheck:false,firstDay:0});
  localStorage.setItem(SETTINGS_KEY, '{broken');
  expect(readSettings()).toEqual(defaultSettings);
});

it('reports failed persistence while retaining a usable in-memory choice', () => {
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(saveSettings({...defaultSettings,theme:'dark'})).toBe(false);
  expect(readSettings().theme).toBe('dark');
});

it('resets only preferences and preserves unsaved content and request identities', () => {
  localStorage.setItem('noteapp:view:p:tasks','{"grouped":true}');
  localStorage.setItem('noteapp:task-view:p','board');
  localStorage.setItem('noteapp:draft:tasks:p:t','unsaved');
  localStorage.setItem('noteapp:create-intent','pending');
  saveSettings({...defaultSettings,theme:'dark'});
  expect(resetPreferences()).toBe(true);
  expect(readSettings()).toEqual(defaultSettings);
  expect(localStorage.getItem('noteapp:view:p:tasks')).toBeNull();
  expect(localStorage.getItem('noteapp:task-view:p')).toBeNull();
  expect(localStorage.getItem('noteapp:draft:tasks:p:t')).toBe('unsaved');
  expect(localStorage.getItem('noteapp:create-intent')).toBe('pending');
});

it('restores only supported collection routes and never redirects direct links', () => {
  for (const value of ['https://evil.test','//evil.test','/settings','/search?q=secret','/projects/p/tasks/t','/projects/p/events?create=1','/unknown']) expect(safeStartupPath(value)).toBe('/');
  expect(safeStartupPath('/projects/p/pages')).toBe('/projects/p/pages');
  saveSettings({...defaultSettings,startup:'last'});
  rememberLocation('/projects/p/tasks');
  rememberLocation('/settings');
  expect(startupPath('/')).toBe('/projects/p/tasks');
  expect(startupPath('/trash')).toBe('/trash');
});
