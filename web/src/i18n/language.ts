import {useSyncExternalStore} from 'react';
import type {Language} from './types';

let language: Language = 'zh-CN';
const listeners = new Set<() => void>();
export const getLanguage = () => language;
const subscribe = (listener: () => void) => {listeners.add(listener);return () => {listeners.delete(listener);};};
export function setLanguage(next: Language) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next;
    document.title = next === 'en' ? 'Nestory · Personal workspace' : 'Nestory · 个人工作空间';
  }
  if (next === language) return;
  language = next;
  listeners.forEach(listener => listener());
}
export const useLanguage = () => useSyncExternalStore(subscribe,getLanguage,() => 'zh-CN' as const);
