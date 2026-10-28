import {DateTime} from 'luxon';
import {stages,priorities} from '../../app/api';
import type {PropertyDefinition,PropertyValue} from '../../components/object/propertyTypes';
export type FilterObject={id:string;title:string;stage?:string;priority?:string;due_date?:string|null;created_at?:number;updated_at?:number};
export type TaskFilter={id:string;field:string;op:string;value:string|string[]};
export type FilterField={id:string;name:string;kind:'text'|'url'|'single_select'|'multi_select'|'date';options?:{id:string;name:string}[]};
export type PropertySnapshot={definitions:PropertyDefinition[];values:Record<string,Record<string,PropertyValue>>};
export const operators:Record<FilterField['kind'],[string,string][]>= {
 text:[['contains','包含'],['not_contains','不包含'],['empty','为空'],['not_empty','不为空']],
 url:[['contains','包含'],['not_contains','不包含'],['empty','为空'],['not_empty','不为空']],
 single_select:[['is','是'],['is_not','不是'],['empty','为空'],['not_empty','不为空']],
 multi_select:[['any','包含任意'],['all','包含全部'],['none','不包含'],['empty','为空'],['not_empty','不为空']],
 date:[['before','早于'],['after','晚于'],['between','介于'],['today','今天'],['week','本周'],['empty','为空'],['not_empty','不为空']],
};
export const noValue=(op:string)=>['empty','not_empty','today','week'].includes(op);
export function filterFields(definitions:PropertyDefinition[],type:'tasks'|'pages'='tasks'):FilterField[] {return [
 {id:'title',name:'标题',kind:'text'},
 ...(type==='tasks'?[
  {id:'stage',name:'阶段',kind:'single_select',options:stages.map(([id,name])=>({id,name}))},
  {id:'priority',name:'优先级',kind:'single_select',options:priorities.map(([id,name])=>({id,name}))},
  {id:'due_date',name:'截止日期',kind:'date'},
 ]:[{id:'created_at',name:'创建时间',kind:'date'},{id:'updated_at',name:'更新时间',kind:'date'}]) as FilterField[],
 ...definitions.map(d=>({id:d.id,name:d.name,kind:d.kind,options:d.options})),
];}
const dateValid=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&DateTime.fromISO(value).isValid;
export function validFilters(filters:TaskFilter[],fields:FilterField[]):boolean {return filters.every(f=>{
 const field=fields.find(x=>x.id===f.field);
 if(!field||!operators[field.kind].some(([op])=>op===f.op))return false;
 if(noValue(f.op))return true;
 if(field.kind==='multi_select')return Array.isArray(f.value)&&f.value.length>0&&f.value.every(v=>field.options?.some(o=>o.id===v));
 if(field.kind==='date')return f.op==='between'?Array.isArray(f.value)&&f.value.length===2&&f.value.every(dateValid)&&f.value[0]<=f.value[1]:typeof f.value==='string'&&dateValid(f.value);
 if(typeof f.value!=='string'||!f.value.trim())return false;
 return field.kind!=='single_select'||!!field.options?.some(o=>o.id===f.value);
});}
export function matchesFilters(task:FilterObject,filters:TaskFilter[],values:PropertySnapshot['values'],zone:string,now?:string):boolean {
 return filters.every(f=>{
 const timestamp=f.field==='created_at'?task.created_at:f.field==='updated_at'?task.updated_at:undefined;
 const localDate=typeof timestamp==='number'&&Number.isFinite(timestamp)?DateTime.fromMillis(timestamp,{zone}).toISODate():null;
 const value:PropertyValue=['created_at','updated_at'].includes(f.field)?localDate:f.field==='title'?task.title:f.field==='stage'?task.stage??null:f.field==='priority'?task.priority??null:f.field==='due_date'?task.due_date??null:values[task.id]?.[f.field]??null;
 const empty=value==null||value===''||(Array.isArray(value)&&value.length===0);
 if(f.op==='empty')return empty;
 if(f.op==='not_empty')return !empty;
 const actual=typeof value==='string'?value:'';const wanted=typeof f.value==='string'?f.value:'';
 switch(f.op){
 case 'contains':return !empty&&actual.toLocaleLowerCase().includes(wanted.toLocaleLowerCase());
 case 'not_contains':return empty||!actual.toLocaleLowerCase().includes(wanted.toLocaleLowerCase());
 case 'is':return value===wanted;
 case 'is_not':return value!==wanted;
 case 'any':case 'all':case 'none':{
  const selected=Array.isArray(value)?value:[];const options=Array.isArray(f.value)?f.value:[];
  return f.op==='any'?options.some(v=>selected.includes(v)):f.op==='all'?options.every(v=>selected.includes(v)):!options.some(v=>selected.includes(v));
 }
 case 'before':return !empty&&actual<wanted;
 case 'after':return !empty&&actual>wanted;
 case 'between':return !empty&&Array.isArray(f.value)&&actual>=f.value[0]&&actual<=f.value[1];
 case 'today':case 'week':{
  const today=now?DateTime.fromISO(now,{zone}):DateTime.now().setZone(zone);
  return !empty&&(f.op==='today'?actual===today.toISODate():actual>=today.startOf('week').toISODate()!&&actual<=today.endOf('week').toISODate()!);
 }
 default:return false;
 }
 });
}
export function readFilters(raw:string|null):TaskFilter[]{
 try{const parsed:unknown=JSON.parse(raw??'[]');if(!Array.isArray(parsed)||parsed.length>30)return [];
 if(!parsed.every(f=>f&&typeof f==='object'&&typeof f.id==='string'&&f.id.length<=100&&typeof f.field==='string'&&f.field.length<=100&&typeof f.op==='string'&&(typeof f.value==='string'&&f.value.length<=4096||Array.isArray(f.value)&&f.value.length<=128&&f.value.every((v:unknown)=>typeof v==='string'&&v.length<=100))))return [];
 return parsed as TaskFilter[];}catch{return [];}
}
