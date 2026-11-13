import { act, render } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { BodyDocument } from '../../app/document';
const native = vi.hoisted(() => ({ editor: {} as any, emit: () => {} }));
vi.mock('@blocknote/core', () => ({ BlockNoteEditor: {create: () => native.editor}, filterSuggestionItems: vi.fn() }));
vi.mock('@blocknote/core/extensions', () => ({SideMenuExtension:{}}));
vi.mock('@blocknote/ariakit', () => ({BlockNoteView: ({onChange,children}:{onChange:()=>void;children:ReactNode}) => {native.emit=onChange;return <div>{children}</div>;}}));
vi.mock('@blocknote/react', () => ({SideMenuController:()=>null, FormattingToolbarController:()=>null, SuggestionMenuController:()=>null, AddBlockButton:()=>null, useBlockNoteEditor:vi.fn(), useExtensionState:vi.fn(), useComponentsContext:vi.fn(), getDefaultReactSlashMenuItems:vi.fn()}));
import { BlockEditor } from './BlockEditor';
const doc = (text:string):BodyDocument => ({version:1,blocks:[{id:text,type:'paragraph',props:{backgroundColor:'default',textColor:'default',textAlignment:'left'},children:[],content:[{type:'text',text,styles:{}}]}]});
beforeEach(() => {
  native.editor = {dictionary:{},document:[],replaceBlocks:vi.fn((_old:unknown,blocks:unknown[]) => {native.editor.document=blocks;})};
});
it('a delayed local document echo cannot replace newer native edits or uploaded blocks', () => {
  const publish = vi.fn();
  const view = render(<BlockEditor body_document={doc('initial')} onChange={publish}/>);
  act(() => {native.editor.document=doc('import').blocks; native.emit();});
  const imported = publish.mock.calls[0][0];
  act(() => {native.editor.document=doc('uploaded image').blocks; native.emit();});
  const uploaded = publish.mock.calls[1][0];
  // React can commit the import's props after the next native transaction.
  view.rerender(<BlockEditor body_document={imported} onChange={publish}/>);
  expect(native.editor.document).toEqual(uploaded.blocks);
  expect(native.editor.replaceBlocks).not.toHaveBeenCalled();
  view.rerender(<BlockEditor body_document={uploaded} onChange={publish}/>);
  expect(native.editor.document).toEqual(uploaded.blocks);
});
it('an explicit external recovery document still replaces native content', () => {
  const publish = vi.fn();
  const view = render(<BlockEditor body_document={doc('initial')} onChange={publish}/>);
  act(() => {native.editor.document=doc('local').blocks;native.emit();});
  const recovered=doc('recovered');
  view.rerender(<BlockEditor body_document={recovered} onChange={publish}/>);
  expect(native.editor.document).toEqual(recovered.blocks);
  expect(native.editor.replaceBlocks).toHaveBeenCalledOnce();
});
