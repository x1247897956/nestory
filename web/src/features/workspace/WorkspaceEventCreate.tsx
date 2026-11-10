import {useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {DateTime} from 'luxon';
import {api,ApiError,abandonCreateIntent,type Project} from '../../app/api';
import {SaveIndicator} from '../../components/editor/SaveIndicator';
import {fromInput,toInput} from '../event/time';
import type {CalendarEvent} from '../event/Events';
import '../event/events.css';
type Attempt={path:string;input:{title:string;start_at:string;end_at:string}};
export function WorkspaceEventCreate({selection,zone,onClose,onCreated}:{selection:{start:string;end:string};zone:string;onClose:()=>void;onCreated:(event:CalendarEvent)=>void}){
 const qc=useQueryClient();const dialog=useRef<HTMLDialogElement>(null);
 const [projectId,setProjectId]=useState(''),[title,setTitle]=useState('');
 const [start,setStart]=useState(()=>toInput(selection.start,zone)),[end,setEnd]=useState(()=>toInput(selection.end,zone));
 const [busy,setBusy]=useState(false),[error,setError]=useState('');const saving=useRef(false),retry=useRef<Attempt|null>(null);
 const projects=useQuery({queryKey:['projects',false],queryFn:()=>api<Project[]>('/projects?archived=false')});
 const active=(projects.data??[]).filter(p=>!p.archived_at);const owner=active.find(p=>p.id===projectId);
 const valid=DateTime.fromISO(start,{zone}).isValid&&DateTime.fromISO(end,{zone}).toMillis()>DateTime.fromISO(start,{zone}).toMillis();
 const dirty=!!title.trim()||!!projectId||start!==toInput(selection.start,zone)||end!==toInput(selection.end,zone);const locked=busy||!!retry.current;
 useEffect(()=>{dialog.current?.showModal();},[]);
 useEffect(()=>{if(!dirty&&!busy)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty,busy]);
 const close=()=>{
  if(saving.current)return;
  if(dirty&&!confirm(error?'保存结果可能尚未确认，关闭后请在日历中检查，是否关闭？':'日程尚未保存，是否关闭？'))return;
  try{if(retry.current)abandonCreateIntent(retry.current.path,retry.current.input);}catch(e){setError((e as Error).message);return;}
  void qc.invalidateQueries({queryKey:['workspace']});onClose();
 };
 const save=async()=>{
  if(saving.current||(!retry.current&&(!owner||!title.trim()||!valid)))return;
  saving.current=true;setBusy(true);setError('');
  try{
   const attempt=retry.current??{path:`/projects/${projectId}/events`,input:{title:title.trim(),start_at:fromInput(start,zone),end_at:fromInput(end,zone)}};
   retry.current=attempt;
   const event=await api<CalendarEvent>(attempt.path,'POST',attempt.input);
   retry.current=null;qc.setQueryData(['event',event.id],event);
   await Promise.all([qc.invalidateQueries({queryKey:['workspace']}),qc.invalidateQueries({queryKey:['events',event.project_id]}),qc.invalidateQueries({queryKey:['relation-options',event.project_id]})]);
   onCreated(event);
  }catch(e){
   if(e instanceof ApiError&&e.status>=400&&e.status<500&&![408,429].includes(e.status)){retry.current=null;void projects.refetch();}
   setError((e as Error).message);
  }finally{saving.current=false;setBusy(false);}
 };
 useEffect(()=>{if(!title.trim()||!owner||!valid||busy||error)return;const timer=setTimeout(()=>void save(),800);return()=>clearTimeout(timer);},[title,projectId,start,end,busy,error,owner,valid]);
 return <dialog ref={dialog} className="event-create-dialog workspace-event-create" aria-label="新建日程" onCancel={event=>{event.preventDefault();close();}}>
  <form aria-label="新建日程" data-dirty={dirty||busy} onSubmit={e=>e.preventDefault()}>
   <header><h2>新建日程</h2><button type="button" aria-label="关闭新建日程" disabled={busy} onClick={close}>×</button></header>
   <label className="workspace-project-field">所属项目<select aria-label="所属项目" value={projectId} disabled={locked||projects.isPending||projects.isError} onChange={e=>{setProjectId(e.target.value);setError('');}}><option value="">选择项目</option>{active.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
   {projects.isPending&&<p role="status">正在加载项目…</p>}
   {projects.isError&&<p role="alert">项目加载失败 <button type="button" onClick={()=>void projects.refetch()}>重试加载项目</button></p>}
   {!projects.isPending&&!projects.isError&&!active.length&&<p>暂无可用项目，请先创建项目。</p>}
   {!!projectId&&!owner&&!projects.isPending&&<p role="alert">{retry.current?'该项目已不可用，请先重试确认保存结果。':'该项目已不可用，请选择其他项目。'}</p>}
   <input autoFocus aria-label="新日程标题" placeholder="日程标题" value={title} disabled={locked} onChange={e=>{setTitle(e.target.value);setError('');}}/>
   <div className="event-create-times"><label>开始<input aria-label="新日程开始" type="datetime-local" value={start} disabled={locked} onChange={e=>{setStart(e.target.value);setError('');}}/></label><label>结束<input aria-label="新日程结束" type="datetime-local" value={end} disabled={locked} onChange={e=>{setEnd(e.target.value);setError('');}}/></label></div>
   {!valid&&<p role="alert">结束时间必须晚于开始时间</p>}
   {!dirty&&!busy&&!error?<div className="autosave-hint">选择项目并输入标题后自动保存</div>:<SaveIndicator busy={busy} dirty={dirty} error={error}/>}
   {error&&<div role="alert">{error}{retry.current&&<p>请重试以确认保存结果，当前输入已锁定。</p>}<button type="button" disabled={busy||(!retry.current&&(!owner||!valid||!title.trim()))} onClick={()=>void save()}>重试保存</button></div>}
  </form>
 </dialog>;
}
