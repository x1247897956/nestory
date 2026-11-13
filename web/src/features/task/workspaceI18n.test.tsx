import {act, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach,beforeAll,expect,it,vi} from 'vitest';
import {setLanguage} from '../../i18n/language';
import {filterFields,validFilters} from './filterEngine';
import {TaskBoard} from './TaskBoard';
import {SortControl} from '../view/SortControl';
import {taskSortFields} from '../view/sorting';
import type {TaskProperties} from '../../app/api';
beforeAll(()=>{
 HTMLElement.prototype.showPopover=function(){this.style.display='block';};
 HTMLElement.prototype.hidePopover=function(){this.style.display='none';};
});
afterEach(()=>act(()=>setLanguage('zh-CN')));
it('updates board metadata in place and leaves user titles and stage IDs unchanged',()=>{
 const task={id:'t',project_id:'p',title:'任务',stage:'todo',priority:'high',parent_id:null,due_date:null,position:0,version:1,created_at:0,updated_at:0} as TaskProperties;
 render(<TaskBoard projectId="p" tasks={[task]} allTasks={[task]} readOnly={false} busy={false} onOpen={vi.fn()} onStageChange={vi.fn()} onCreate={vi.fn()}/>);
 const title=screen.getByText('任务');
 act(()=>setLanguage('en'));
 expect(screen.getByRole('region',{name:'Task board'})).toBeInTheDocument();
 expect(screen.getByRole('region',{name:'To do board column'})).toBeInTheDocument();
 expect(screen.getByText('任务')).toBe(title);
 expect(screen.getByText('Priority · High')).toBeInTheDocument();
 expect(screen.getByRole('combobox',{name:'Change board stage 任务'})).toHaveValue('todo');
});
it('keeps a pending sort draft while translating field names and directions',()=>{
 render(<SortControl fields={taskSortFields} value={{field:'position',direction:'asc'}} onChange={vi.fn()} label="任务排序"/>);
 fireEvent.click(screen.getByRole('button',{name:'任务排序器'}));
 const field=screen.getByRole('combobox',{name:'任务排序字段'});
 fireEvent.change(field,{target:{value:'title'}});
 act(()=>setLanguage('en'));
 const translated=screen.getByRole('combobox',{name:'Task sort field'});
 expect(translated).toBe(field);
 expect(translated).toHaveValue('title');
 expect(within(translated).getByRole('option',{name:'Title'})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Apply sort'})).toBeInTheDocument();
});
it('localizes built-in filter metadata while preserving custom property names and options',()=>{
 act(()=>setLanguage('en'));
 const fields=filterFields([{id:'custom',project_id:'p',object_type:'tasks',name:'优先级',kind:'single_select',options:[{id:'option',name:'高'}],version:1}]);
 expect(fields.find(field=>field.id==='priority')).toMatchObject({name:'Priority',options:expect.arrayContaining([{id:'high',name:'High'}])});
 expect(fields.find(field=>field.id==='custom')).toMatchObject({name:'优先级',options:[{id:'option',name:'高'}]});
 expect(validFilters([{id:'f',field:'custom',op:'is',value:'option'}],fields)).toBe(true);
});
