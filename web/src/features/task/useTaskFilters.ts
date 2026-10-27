import {DateTime} from 'luxon';
import {useMemo,useState,useEffect} from 'react';
import {useQuery} from '@tanstack/react-query';
import {api,type Task} from '../../app/api';
import {filterFields,matchesFilters,readFilters,validFilters,type TaskFilter,type PropertySnapshot} from './filterEngine';
const storageKey=(id:string)=>`noteapp:task-filters:v1:${id}`;
export function useTaskFilters(projectId:string|undefined,tasks:Task[],enabled:boolean){
 const [choices,setChoices]=useState<Record<string,TaskFilter[]>>({});
 const key=projectId??'';
 const saved=useMemo(()=>{try{return readFilters(localStorage.getItem(storageKey(key)));}catch{return [];}},[key]);
 const filters=choices[key]??saved;
 const setFilters=(next:TaskFilter[])=>{setChoices(old=>({...old,[key]:next}));try{if(key)localStorage.setItem(storageKey(key),JSON.stringify(next));}catch{/* Session-only preferences remain usable. */}};
 const properties=useQuery({queryKey:['object','task-filter-properties',projectId],queryFn:()=>api<PropertySnapshot>(`/projects/${projectId}/property-snapshot/tasks`),enabled:!!projectId&&enabled});
 const config=useQuery({queryKey:['config'],queryFn:()=>api<{timezone:string}>('/config'),enabled:enabled});
 const [clock,setClock]=useState(Date.now());
 useEffect(()=>{if(enabled)setClock(Date.now());},[enabled]);
 useEffect(()=>{
  if(!enabled)return;
  const zone=config.data?.timezone??'UTC';
  const tick=()=>setClock(Date.now());
  const next=DateTime.now().setZone(zone).plus({days:1}).startOf('day').toMillis();
  const timer=window.setTimeout(tick,Math.max(50,next-Date.now()+50));
  window.addEventListener('focus',tick);
  return ()=>{clearTimeout(timer);window.removeEventListener('focus',tick);};
 },[enabled,config.data?.timezone,clock]);
 const fields=useMemo(()=>filterFields(properties.data?.definitions??[]),[properties.data]);
 const custom=filters.some(f=>!['title','stage','priority','due_date'].includes(f.field));
 const relative=filters.some(f=>['today','week'].includes(f.op));
 const pending=(custom&&properties.isPending)||(relative&&config.isPending);
 const failed=(custom&&properties.isError)||(relative&&config.isError);
 const invalid=!pending&&!failed&&!validFilters(filters,fields);
 const blocked=pending||failed||invalid;
 const ids=useMemo(()=>new Set(blocked?[]:tasks.filter(t=>matchesFilters(t,filters,properties.data?.values??{},config.data?.timezone??'UTC',new Date(clock).toISOString())).map(t=>t.id)),[tasks,filters,properties.data,config.data,blocked,clock]);
 return {filters,setFilters,fields,ids,blocked,pending,failed,invalid,properties,config};
}
export type TaskFilterState=ReturnType<typeof useTaskFilters>;
