import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, expect, it } from 'vitest';
import { SortControl } from './SortControl';
import type { SortSpec } from './sorting';
beforeAll(() => {
 HTMLElement.prototype.showPopover = function () { this.style.display = 'block'; };
 HTMLElement.prototype.hidePopover = function () { this.style.display = 'none'; };
});
const fields = [{value:'position',label:'默认顺序'},{value:'title',label:'标题'}];
function Fixture({initial = {field:'position',direction:'asc'} as SortSpec, available=fields}) {
 const [value,setValue] = useState(initial);
 return <><SortControl value={value} fields={available} onChange={setValue} label="任务排序"/><output>{value.field}:{value.direction}</output></>;
}
it('only applies draft sorting on explicit apply and supports editing and reset', () => {
 render(<Fixture/>);
 fireEvent.click(screen.getByRole('button',{name:'任务排序器'}));
 fireEvent.change(screen.getByRole('combobox',{name:'任务排序字段'}),{target:{value:'title'}});
 fireEvent.change(screen.getByRole('combobox',{name:'任务排序方向'}),{target:{value:'desc'}});
 expect(screen.getByRole('status')).toHaveTextContent('position:asc');
 fireEvent.click(screen.getByRole('button',{name:'应用排序'}));
 expect(screen.getByRole('status')).toHaveTextContent('title:desc');
 fireEvent.click(screen.getByRole('button',{name:'编辑排序 标题 · 降序'}));
 expect(screen.getByRole('combobox',{name:'任务排序方向'})).toHaveValue('desc');
 fireEvent.click(screen.getByRole('button',{name:'取消'}));
 fireEvent.click(screen.getByRole('button',{name:'移除排序 标题 · 降序'}));
 expect(screen.getByRole('status')).toHaveTextContent('position:asc');
});
it('discards cancelled and escaped drafts and returns focus to the trigger', () => {
 render(<Fixture/>);
 const trigger=screen.getByRole('button',{name:'任务排序器'});
 fireEvent.click(trigger);
 fireEvent.change(screen.getByRole('combobox',{name:'任务排序字段'}),{target:{value:'title'}});
 fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});
 expect(trigger).toHaveFocus();
 fireEvent.click(trigger);
 expect(screen.getByRole('combobox',{name:'任务排序字段'})).toHaveValue('position');
 fireEvent.change(screen.getByRole('combobox',{name:'任务排序方向'}),{target:{value:'desc'}});
 fireEvent.click(screen.getByRole('button',{name:'取消'}));
 expect(screen.getByRole('status')).toHaveTextContent('position:asc');
});
it('safely normalizes stale fields and disables sorting without available fields', () => {
 const {rerender}=render(<Fixture initial={{field:'deleted',direction:'desc'}}/>);
 fireEvent.click(screen.getByRole('button',{name:'任务排序器'}));
 expect(screen.getByRole('combobox',{name:'任务排序字段'})).toHaveValue('position');
 fireEvent.click(screen.getByRole('button',{name:'应用排序'}));
 expect(screen.getByRole('status')).toHaveTextContent('position:asc');
 rerender(<Fixture available={[]}/>);
 expect(screen.getByRole('button',{name:'任务排序器'})).toBeDisabled();
});
it('drops the draft after native light dismissal', () => {
 render(<Fixture/>);
 const trigger=screen.getByRole('button',{name:'任务排序器'});
 fireEvent.click(trigger);
 fireEvent.change(screen.getByRole('combobox',{name:'任务排序字段'}),{target:{value:'title'}});
 const dialog=screen.getByRole('dialog');
 actDismiss(dialog);
 expect(trigger).toHaveAttribute('aria-expanded','false');
 fireEvent.click(trigger);
 expect(screen.getByRole('combobox',{name:'任务排序字段'})).toHaveValue('position');
 expect(screen.getByRole('status')).toHaveTextContent('position:asc');
});
function actDismiss(dialog:HTMLElement) {
 dialog.hidePopover();
 const event=new Event('toggle');
 Object.defineProperty(event,'newState',{value:'closed'});
 fireEvent(dialog,event);
}
