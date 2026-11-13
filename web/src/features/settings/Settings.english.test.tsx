import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, expect, it} from 'vitest';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {SettingsPage} from './Settings';
import {defaultSettings, readSettings, resetPreferences} from './preferences';
function show() {
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
 client.setQueryData(['config'],{timezone:'UTC',version:'test'});
 render(<QueryClientProvider client={client}><SettingsPage/></QueryClientProvider>);
}
function preferencesFile(settings:Record<string,unknown>) {
 const file=new File(['preferences'],'preferences.json',{type:'application/json'});
 Object.defineProperty(file,'text',{value:async()=>JSON.stringify({format:'nestory-preferences',version:1,settings})});
 return file;
}
beforeEach(()=>resetPreferences());
afterEach(()=>resetPreferences());
it('switches labels immediately, persists language, and opens matching English guides',()=>{
 show();
 fireEvent.change(screen.getByLabelText('语言'),{target:{value:'en'}});
 expect(readSettings().language).toBe('en');
 expect(document.documentElement.lang).toBe('en');
 expect(screen.getByRole('heading',{name:'Settings'})).toBeVisible();
 expect(screen.getByLabelText('Language')).toHaveValue('en');
 expect(screen.getByRole('option',{name:'简体中文'})).toBeInTheDocument();
 expect(screen.getByRole('link',{name:/User guide/})).toHaveAttribute('href',expect.stringContaining('/README.md'));
 expect(screen.getByRole('link',{name:/Data migration guide/})).toHaveAttribute('href',expect.stringContaining('/docs/operations.en.md'));
 fireEvent.change(screen.getByLabelText('Language'),{target:{value:'zh-CN'}});
 expect(screen.getByRole('heading',{name:'设置'})).toBeVisible();
});
it('accepts legacy settings without language but rejects provided invalid language and other missing fields',async()=>{
 show();
 fireEvent.change(screen.getByLabelText('语言'),{target:{value:'en'}});
 const {language:_language,...legacy}=defaultSettings;
 fireEvent.change(screen.getByLabelText('Personal settings file'),{target:{files:[preferencesFile({...legacy,theme:'dark'})]}});
 await waitFor(()=>expect(readSettings().theme).toBe('dark'));
 expect(readSettings().language).toBe('zh-CN');
 expect(screen.getByText('个人设置已导入并生效。')).toBeVisible();
 fireEvent.change(screen.getByLabelText('个人设置文件'),{target:{files:[preferencesFile({...defaultSettings,language:'fr'})]}});
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('设置文件包含无效或缺失的选项'));
 const {theme:_theme,...missingTheme}=legacy;
 fireEvent.change(screen.getByLabelText('个人设置文件'),{target:{files:[preferencesFile(missingTheme)]}});
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('设置文件包含无效或缺失的选项'));
 expect(readSettings().theme).toBe('dark');
});
it('renders invalid and oversized preference import errors in English',async()=>{
 show();
 fireEvent.change(screen.getByLabelText('语言'),{target:{value:'en'}});
 fireEvent.change(screen.getByLabelText('Personal settings file'),{target:{files:[preferencesFile({...defaultSettings,language:'fr'})]}});
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('The settings file has invalid or missing options. Export it again.'));
 expect(readSettings().language).toBe('en');
 const oversized=new File(['x'.repeat(65537)],'preferences.json',{type:'application/json'});
 fireEvent.change(screen.getByLabelText('Personal settings file'),{target:{files:[oversized]}});
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('This settings file is too large. Choose a settings JSON exported by Nestory.'));
 expect(readSettings().language).toBe('en');
});
