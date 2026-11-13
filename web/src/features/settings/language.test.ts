import {beforeEach, expect, it} from 'vitest';
import {act, renderHook} from '@testing-library/react';
import {applySettings, defaultSettings, normalizeSettings, resetPreferences, saveSettings} from './preferences';
import {getLanguage, t, useI18n} from '../../i18n';

beforeEach(() => {localStorage.clear();resetPreferences();});
it('defaults old preferences to Chinese and accepts only supported languages',()=>{
 expect(normalizeSettings({}).language).toBe('zh-CN');
 expect(normalizeSettings({language:'en'}).language).toBe('en');
 expect(normalizeSettings({language:'invalid'}).language).toBe('zh-CN');
});
it('switches and persists translations',()=>{
 const {result}=renderHook(()=>useI18n());
 act(()=>saveSettings({...defaultSettings,language:'en'}));
 expect(result.current.language).toBe('en');
 expect(t('设置')).toBe('Settings');
 expect(document.documentElement.lang).toBe('en');
 expect(document.title).toBe('Nestory · Personal workspace');
 expect(JSON.parse(localStorage.getItem('noteapp:settings:v1')!).language).toBe('en');
 expect(t('共 {count} 项',{count:1})).toBe('1 item');
 expect(t('共 {count} 项',{count:2})).toBe('2 items');
 act(()=>applySettings({...defaultSettings,language:'zh-CN'}));
 expect(getLanguage()).toBe('zh-CN');expect(t('设置')).toBe('设置');
});
