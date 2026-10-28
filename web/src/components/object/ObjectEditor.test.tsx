import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {ObjectEditorHeader, ObjectEditorBody, ObjectEditorFooter} from './ObjectEditor';
describe('shared object editor composition',()=>{
  it('keeps title, menu, properties, body, status and recovery in consistent order',()=>{
    const {container}=render(<><ObjectEditorHeader title="Title" menu={<button>Menu</button>} properties={<div>Properties</div>}><input aria-label="Title" /></ObjectEditorHeader><ObjectEditorBody>Body</ObjectEditorBody><ObjectEditorFooter busy={false} dirty error="Failed"><div role="alert">Recovery</div></ObjectEditorFooter></>);
    expect(Array.from(container.children).map(node=>node.tagName)).toEqual(['HEADER','DIV','FOOTER']);
    expect(container.querySelector('header')?.textContent).toBe('MenuProperties');
    expect(screen.getByRole('status').textContent).toBe('保存失败，草稿已保留');
    expect(container.querySelector('footer')?.lastElementChild?.textContent).toBe('Recovery');
  });
});

import {vi} from 'vitest';
import {renderObjectEditor} from '../../test/renderObjectEditor';
import {TaskEditor} from '../../features/task/TaskEditor';
import {PageEditor} from '../../features/page/Pages';
import {EventEditor} from '../../features/event/EventEditor';
vi.mock('./ObjectProperties',()=>({ObjectProperties:({children}:{children?:import('react').ReactNode})=><div data-testid="properties">{children}</div>}));
vi.mock('./ObjectMenu',()=>({ObjectMenu:()=> <button aria-label="对象菜单"/>}));
vi.mock('../markdown/MarkdownEditor',()=>({MarkdownEditor:()=> <textarea aria-label="Markdown 正文"/>}));
const base={id:'e',project_id:'p',title:'Title',body_document:{version:1 as const,blocks:[]},version:1,created_at:0,updated_at:0};
it.each(['task','page','event'] as const)('%s uses the same structure and keeps archived fields disabled',kind=>{
 const props={archived:true,onSave:async()=>{},onReload:async()=>{}};
 const {container,unmount}=renderObjectEditor(kind==='task'? <TaskEditor {...props} task={{...base,stage:'todo',priority:'none',due_date:null,parent_id:null,position:0}}/> : kind==='page'? <PageEditor {...props} page={{...base,parent_id:null,position:0}} focusTitle={false}/> : <EventEditor {...props} event={{...base,start_at:'2026-10-24T01:00:00Z',end_at:'2026-10-24T02:00:00Z'}} zone="Asia/Shanghai"/>);
 const editor=container.querySelector('.editor')!;
 expect(Array.from(editor.children).map(node=>node.tagName)).toEqual(['HEADER','DIV','FOOTER']);
 expect(editor.querySelector('header > .object-title-row + [data-testid="properties"]')).not.toBeNull();
 expect(editor.querySelector('header input')).toBeDisabled();
 expect(editor.querySelector('.object-editor-body textarea')).not.toBeNull();
 expect(editor.querySelector('footer [role="status"]')).toHaveTextContent('已保存');
 unmount();
});
