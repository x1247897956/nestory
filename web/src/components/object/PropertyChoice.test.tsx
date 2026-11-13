import {render,screen,cleanup,act,fireEvent} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {PropertyChoice} from './PropertyChoice';
import type {PropertyDefinition} from './propertyTypes';
import {setLanguage} from '../../i18n/language';
afterEach(()=>{cleanup();setLanguage('zh-CN');});
it('shows an empty choice when selected IDs were removed from the definition',()=>{
 const definition={id:'d',project_id:'p',object_type:'tasks',name:'标签',kind:'multi_select',version:3,options:[{id:'b',name:'乙'}]} as PropertyDefinition;
 render(<PropertyChoice definition={definition} value={['a']} disabled={false} pending={false} onChange={vi.fn()} onDefinition={vi.fn()} onOptionDeleted={async()=>{}}/>);
 expect(screen.getByRole('button',{name:'属性值 标签'})).toHaveTextContent('未选择');
});

it('switches choice controls live while preserving Chinese user content and a pending search',()=>{
 const definition={id:'d',project_id:'p',object_type:'tasks',name:'文本',kind:'multi_select',version:3,options:[{id:'b',name:'未选择'}]} as PropertyDefinition;
 render(<PropertyChoice definition={definition} value={['b']} disabled={false} pending={false} onChange={vi.fn()} onDefinition={vi.fn()} onOptionDeleted={async()=>{}}/>);
 const search=screen.getByRole('textbox',{name:'搜索或创建选项',hidden:true});
 fireEvent.change(search,{target:{value:'草稿'}});
 act(()=>setLanguage('en'));
 expect(screen.getByRole('button',{name:'Property value 文本'})).toHaveTextContent('未选择');
 expect(screen.getByRole('textbox',{name:'Search or create an option',hidden:true})).toBe(search);
 expect(search).toHaveValue('草稿');
 expect(screen.getByRole('button',{name:'Create “草稿”',hidden:true})).toBeInTheDocument();
 act(()=>setLanguage('zh-CN'));
 expect(screen.getByRole('textbox',{name:'搜索或创建选项',hidden:true})).toHaveValue('草稿');
});
