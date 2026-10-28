import {stages} from '../../app/api';
import {normalizeSort,taskSortFields,type SortSpec} from '../view/sorting';
export type TaskDisplay={grouped:boolean;collapsed:string[];sort:SortSpec};
export const defaultTaskDisplay:TaskDisplay={grouped:true,collapsed:[],sort:{field:'position',direction:'asc'}};
export function normalizeTaskDisplay(raw:unknown):TaskDisplay{
 const value=raw&&typeof raw==='object'?raw as Partial<TaskDisplay>:{};
 return {grouped:typeof value.grouped==='boolean'?value.grouped:true,
  collapsed:Array.isArray(value.collapsed)?[...new Set(value.collapsed.filter(id=>stages.some(([stage])=>stage===id)))]:[],
  sort:normalizeSort(value.sort,taskSortFields,defaultTaskDisplay.sort)};
}
