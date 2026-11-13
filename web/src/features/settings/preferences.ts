import {setLanguage} from '../../i18n/language';
import type {Language} from '../../i18n/types';
import { useEffect, useSyncExternalStore } from 'react';

export const SETTINGS_KEY = 'noteapp:settings:v1';
const LAST_PATH_KEY = 'noteapp:last-location';
const RESET_KEY = 'noteapp:preferences-reset';
export type Settings = {
  language: Language;
  startup: 'workspace' | 'last';
  theme: 'light' | 'dark' | 'system';
  fontSize: 13 | 14 | 16;
  density: 'comfortable' | 'compact';
  firstDay: 0 | 1;
  hourCycle: '12' | '24';
  calendarView: 'dayGridMonth' | 'timeGridWeek';
  eventDuration: 15 | 30 | 60 | 90 | 120;
  editorFontSize: 14 | 15 | 17 | 19;
  editorWidth: 'standard' | 'wide';
  spellCheck: boolean;
};
export const defaultSettings: Settings = {
  language:'zh-CN',startup:'workspace',theme:'system',fontSize:14,density:'comfortable',
  firstDay:1,hourCycle:'24',calendarView:'dayGridMonth',eventDuration:60,
  editorFontSize:15,editorWidth:'standard',spellCheck:true,
};

export function normalizeSettings(raw: unknown): Settings {
  const value = raw && typeof raw === 'object' ? raw as Record<string,unknown> : {};
  const next = {...defaultSettings};
  const choices: {[K in keyof Settings]: readonly Settings[K][]} = {
    language:['zh-CN','en'],startup:['workspace','last'],theme:['light','dark','system'],fontSize:[13,14,16],density:['comfortable','compact'],
    firstDay:[0,1],hourCycle:['12','24'],calendarView:['dayGridMonth','timeGridWeek'],eventDuration:[15,30,60,90,120],
    editorFontSize:[14,15,17,19],editorWidth:['standard','wide'],spellCheck:[true,false],
  };
  for (const key of Object.keys(choices) as (keyof Settings)[]) {
    if ((choices[key] as readonly unknown[]).includes(value[key])) Object.assign(next,{[key]:value[key]});
  }
  return next;
}

let settings = defaultSettings;
let storedRaw: string | null | undefined;
let storageError = '';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

export function readSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw !== storedRaw) {
      storedRaw = raw;
      try { settings = raw ? normalizeSettings(JSON.parse(raw)) : defaultSettings; }
      catch { settings = defaultSettings; }
    }
  } catch { storageError = '浏览器不允许保存偏好；本次调整仍然有效，刷新后可能丢失。'; }
  return settings;
}

export function saveSettings(next: Settings): boolean {
  readSettings();
  settings = normalizeSettings(next);
  let saved = true;
  try {
    const raw = JSON.stringify(settings);
    window.localStorage.setItem(SETTINGS_KEY,raw);
    storedRaw = raw;
    storageError = '';
  } catch { saved = false; storageError = '偏好未能保存到浏览器；本次调整仍然有效，请检查浏览器存储权限后重试。'; }
  applySettings(settings);
  emit();
  return saved;
}

function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useSettings() { return useSyncExternalStore(subscribe,readSettings,() => defaultSettings); }
export function useResolvedTheme() { return useSyncExternalStore(subscribe,() => resolvedTheme(),() => 'light' as const); }
export function useSettingsStorageError() { return useSyncExternalStore(subscribe,() => storageError,() => ''); }
export function updateSettings(patch: Partial<Settings>) { return saveSettings({...readSettings(),...patch}); }

export function resolvedTheme(settings = readSettings()): 'light' | 'dark' {
  return settings.theme === 'system' ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : settings.theme;
}
export function applySettings(value = readSettings()) {
  setLanguage(value.language);
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme(value);
  root.dataset.density = value.density;
  root.dataset.editorWidth = value.editorWidth;
  root.style.setProperty('--interface-scale',String(value.fontSize / 14));
  root.style.setProperty('--editor-font-size',value.editorFontSize+'px');
  root.style.colorScheme = resolvedTheme(value);
}

export function SettingsEffects() {
  const value = useSettings();
  useEffect(() => {
    applySettings(value);
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const change = () => { applySettings(readSettings()); emit(); };
    const storage = (event: StorageEvent) => {
      if (event.key === SETTINGS_KEY || event.key === null) { readSettings(); applySettings(); emit(); }
      if (event.key === RESET_KEY || event.key === null) window.dispatchEvent(new Event('noteapp:preferences-reset'));
    };
    media?.addEventListener('change',change);
    window.addEventListener('storage',storage);
    return () => { media?.removeEventListener('change',change); window.removeEventListener('storage',storage); };
  },[value]);
  return null;
}

export function resetPreferences(): boolean {
  let success = true;
  try {
    const keys = Array.from({length:localStorage.length},(_,index) => localStorage.key(index));
    for (const key of keys) if (key && (key.startsWith('noteapp:view:') || key.startsWith('noteapp:task-view:') || key.startsWith('noteapp:task-filters:v1:') || key.startsWith('noteapp:page-filters:v1:') || key === LAST_PATH_KEY)) localStorage.removeItem(key);
  } catch { success = false; }
  const saved = saveSettings(defaultSettings);
  try { localStorage.setItem(RESET_KEY,Date.now()+':'+Math.random()); } catch { success=false; }
  window.dispatchEvent(new Event('noteapp:preferences-reset'));
  return saved && success;
}

export function safeStartupPath(value: string): string {
  return /^\/(?:trash|projects\/[A-Za-z0-9_-]+(?:\/(?:tasks|pages|events))?)?$/.test(value) ? value : '/';
}
export function rememberLocation(path: string) {
  if (safeStartupPath(path) !== path) return;
  try { localStorage.setItem(LAST_PATH_KEY,path); } catch { /* Navigation remains available. */ }
}
export function startupPath(path: string): string {
  if (path !== '/' || readSettings().startup !== 'last') return path;
  try { return safeStartupPath(localStorage.getItem(LAST_PATH_KEY) ?? '/'); } catch { return '/'; }
}

export function calendarTimeFormat(hourCycle: Settings['hourCycle']) {
  return {hour:'2-digit',minute:'2-digit',hour12:hourCycle === '12'} as const;
}
