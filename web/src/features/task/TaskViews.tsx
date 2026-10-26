import {useState} from 'react';
import './task-views.css';
export type TaskView='list'|'board';
function storedView(projectId:string):TaskView {
 try{return window.localStorage.getItem(`noteapp:task-view:${projectId}`)==='board'?'board':'list';}catch{return 'list';}
}
export function useProjectTaskView(projectId?:string):[TaskView,(view:TaskView)=>void] {
 const [choices,setChoices]=useState<Record<string,TaskView>>({});
 const key=projectId??'';
 const view=choices[key]??storedView(key);
 return [view,next=>{
  setChoices(previous=>({...previous,[key]:next}));
  if(key)try{window.localStorage.setItem(`noteapp:task-view:${key}`,next);}catch{/* The current view still works if preference storage is unavailable. */}
 }];
}
export function TaskViewSwitcher({view,onChange}:{view:TaskView;onChange:(view:TaskView)=>void}) {
 return <div className="task-view-switcher" role="group" aria-label="任务视图">
  <button type="button" aria-pressed={view==='list'} onClick={()=>onChange('list')}><svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M7 5h10M7 10h10M7 15h10M3 5h1M3 10h1M3 15h1"/></svg>列表</button>
  <button type="button" aria-pressed={view==='board'} onClick={()=>onChange('board')}><svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M3 4h4v12H3ZM9 4h3v8H9ZM14 4h3v10h-3Z"/></svg>看板</button>
 </div>;
}
