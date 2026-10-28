import {describe,it,expect} from 'vitest';
import {normalizeTaskDisplay} from './taskDisplay';
describe('task display settings',()=>{
 it('keeps recognized settings and rejects corrupt, unknown or duplicate stage entries',()=>{
  expect(normalizeTaskDisplay(null)).toEqual({grouped:true,collapsed:[],sort:{field:'position',direction:'asc'}});
  expect(normalizeTaskDisplay({grouped:false,collapsed:['done','bad','done'],sort:{field:'due_date',direction:'desc'}})).toEqual({grouped:false,collapsed:['done'],sort:{field:'due_date',direction:'desc'}});
  expect(normalizeTaskDisplay({grouped:'false',collapsed:'done',sort:{field:'unknown',direction:'desc'}})).toEqual({grouped:true,collapsed:[],sort:{field:'position',direction:'asc'}});
 });
});
