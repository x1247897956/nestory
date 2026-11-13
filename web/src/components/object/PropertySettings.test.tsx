import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {PropertySettings} from './PropertySettings';
import {OptionSettings} from './OptionSettings';
import {setLanguage} from '../../i18n/language';
import type {PropertyDefinition} from './propertyTypes';

afterEach(()=>{cleanup();setLanguage('zh-CN');localStorage.clear();vi.useRealTimers();});
const definition:PropertyDefinition={id:'draft-definition',project_id:'p',object_type:'tasks',name:'文本',kind:'single_select',version:1,options:[{id:'o',name:'未选择',color:'red'}]};
it('preserves a pending property name and its recovery record across language changes',()=>{
 vi.useFakeTimers();
 render(<PropertySettings definition={definition} archived={false} onSaved={vi.fn()} onReload={async()=>{}} onDeleted={vi.fn()} focusName={false}/>);
 const input=screen.getByRole('textbox',{name:'属性名称'});
 fireEvent.change(input,{target:{value:'我的草稿'}});
 const records=Array.from({length:localStorage.length},(_,index)=>localStorage.getItem(localStorage.key(index)!));
 act(()=>setLanguage('en'));
 expect(screen.getByRole('textbox',{name:'Property name'})).toBe(input);
 expect(input).toHaveValue('我的草稿');
 expect(screen.getByRole('button',{name:'Delete property'})).toBeDisabled();
 expect(Array.from({length:localStorage.length},(_,index)=>localStorage.getItem(localStorage.key(index)!))).toEqual(records);
 act(()=>setLanguage('zh-CN'));
 expect(screen.getByRole('textbox',{name:'属性名称'})).toHaveValue('我的草稿');
});
it('localizes option colors while leaving a pending user option name verbatim',()=>{
 vi.useFakeTimers();
 render(<OptionSettings definition={definition} option={definition.options[0]} archived={false} valuePending={false} onSaved={vi.fn()} onDeleted={async()=>{}} onPending={vi.fn()}/>);
 const input=screen.getByRole('textbox',{name:'选项名称'});
 expect(input).toHaveValue('未选择');
 fireEvent.change(input,{target:{value:'文本'}});
 act(()=>setLanguage('en'));
 expect(screen.getByRole('textbox',{name:'Option name'})).toBe(input);
 expect(input).toHaveValue('文本');
 expect(screen.getByRole('button',{name:'Color Red'})).toHaveAttribute('data-color','red');
 expect(screen.getByRole('button',{name:'Color Red'})).toHaveAttribute('aria-pressed','true');
});
