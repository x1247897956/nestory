import {describe,it,expect} from 'vitest';
import {matchesFilters,filterFields,validFilters,readFilters,type TaskFilter} from './filterEngine';
import type {Task} from '../../app/api';
const task={id:'t',title:'Read Report',stage:'todo',priority:'high',due_date:'2026-10-27'} as Task;
const snapshot={definitions:[{id:'tags',name:'标签',kind:'multi_select',options:[{id:'a',name:'A'},{id:'b',name:'B'}]},{id:'memo',name:'备注',kind:'text',options:[]}] as any[],values:{t:{tags:['a','b'],memo:'Hello'}}};
const fields=filterFields(snapshot.definitions);
const f=(field:string,op:string,value:string|string[]=''):TaskFilter=>({id:field,field,op,value});
describe('task filter semantics',()=>{
 it('ANDs defaults and custom fields without changing tasks',()=>{
  expect(matchesFilters(task,[f('stage','is','todo'),f('memo','contains','HELLO')],snapshot.values,'Asia/Shanghai')).toBe(true);
  expect(matchesFilters(task,[f('priority','is','low'),f('memo','contains','hello')],snapshot.values,'Asia/Shanghai')).toBe(false);
 });
 it('distinguishes missing values and multi-select any/all/none',()=>{
  expect(matchesFilters(task,[f('tags','all',['a','b'])],snapshot.values,'UTC')).toBe(true);
  expect(matchesFilters(task,[f('tags','none',['b'])],snapshot.values,'UTC')).toBe(false);
  expect(matchesFilters(task,[f('memo','empty')],{},'UTC')).toBe(true);
  expect(matchesFilters(task,[f('due_date','empty')],{},'UTC')).toBe(false);
 });
 it('uses application timezone and inclusive Monday-week ranges',()=>{
  const now='2026-10-26T16:30:00Z';
  expect(matchesFilters(task,[f('due_date','today')],{},'Asia/Shanghai',now)).toBe(true);
  expect(matchesFilters(task,[f('due_date','today')],{},'UTC',now)).toBe(false);
  expect(matchesFilters({...task,due_date:'2026-11-01'},[f('due_date','week')],{},'Asia/Shanghai',now)).toBe(true);
  expect(matchesFilters({...task,due_date:'2026-11-02'},[f('due_date','week')],{},'Asia/Shanghai',now)).toBe(false);
  expect(matchesFilters(task,[f('due_date','between',['2026-10-27','2026-10-28'])],{},'UTC')).toBe(true);
 });
 it('rejects incomplete, unknown and deleted-option conditions',()=>{
  expect(validFilters([f('tags','any',['a'])],fields)).toBe(true);
  for(const filter of [f('missing','empty'),f('tags','any',['deleted']),f('title','contains',''),f('due_date','between',['2026-11-02','2026-11-01'])]) expect(validFilters([filter],fields)).toBe(false);
 });
 it('parses only bounded structured preferences and keeps storage failures harmless',()=>{
  expect(readFilters('broken')).toEqual([]);
  expect(readFilters(JSON.stringify([{field:'stage',op:'is',value:'todo'}]))).toEqual([]);
  expect(readFilters(JSON.stringify([f('stage','is','todo')]))).toEqual([f('stage','is','todo')]);
 });
});
