import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsPage } from './Settings';
import { readSettings, resetPreferences } from './preferences';

function show() {
 const client = new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
 client.setQueryData(['config'],{timezone:'Asia/Shanghai',version:'v0.1.1+9f5e899'});
 render(<QueryClientProvider client={client}><SettingsPage/></QueryClientProvider>);
}
beforeEach(() => {vi.restoreAllMocks();resetPreferences();});
it('presents all settings groups and persists a choice immediately', () => {
 show();
 for (const name of ['通用','外观','日历与时间','编辑器','数据与维护','关于']) expect(screen.getByRole('heading',{name})).toBeVisible();
 fireEvent.change(screen.getByLabelText('主题'),{target:{value:'dark'}});
 expect(document.documentElement.dataset.theme).toBe('dark');
 expect(readSettings().theme).toBe('dark');
 fireEvent.change(screen.getByLabelText('正文字号'),{target:{value:'19'}});
 expect(document.documentElement.style.getPropertyValue('--editor-font-size')).toBe('19px');
 expect(screen.getByText('Asia/Shanghai',{selector:'span'})).toBeVisible();
 expect(screen.getByText('v0.1.1+9f5e899')).toBeVisible();
});
it('only resets preferences after confirmation and preserves drafts', () => {
 show();localStorage.setItem('noteapp:draft:1','my words');
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 fireEvent.change(screen.getByLabelText('主题'),{target:{value:'dark'}});
 fireEvent.click(screen.getByRole('button',{name:'恢复默认偏好'}));
 expect(readSettings().theme).toBe('dark');
 confirm.mockReturnValue(true);
 fireEvent.click(screen.getByRole('button',{name:'恢复默认偏好'}));
 expect(readSettings().theme).toBe('system');
 expect(localStorage.getItem('noteapp:draft:1')).toBe('my words');
});
it('shows failed workspace restoration and permits retry', async () => {
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{message:'只能恢复到空工作空间'}}),{status:409})));
 show();
 const file=new File(['zip'],'backup.zip',{type:'application/zip'});
 fireEvent.change(screen.getByLabelText('工作空间备份文件'),{target:{files:[file]}});
 fireEvent.click(screen.getByRole('button',{name:'恢复工作空间'}));
 await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('只能恢复到空工作空间'));
 expect(screen.getByRole('button',{name:'恢复工作空间'})).toBeEnabled();
 vi.unstubAllGlobals();
});
