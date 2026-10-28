import {useId,useRef,useState} from 'react';
import {stages} from '../../app/api';
import type {TaskDisplay} from './taskDisplay';
import './task-display.css';
export function TaskDisplaySettings({value,onChange}:{value:TaskDisplay;onChange:(value:TaskDisplay)=>void}){
 const id=useId();const panel=useRef<HTMLDivElement>(null);const [open,setOpen]=useState(false);
 return <div className="task-display-settings">
  <button type="button" aria-label="任务显示设置" aria-controls={id} aria-expanded={open} onClick={event=>{
   const box=event.currentTarget.getBoundingClientRect();const node=panel.current;if(!node)return;
   node.style.left=Math.max(12,Math.min(box.right-240,window.innerWidth-252))+'px';node.style.top=Math.min(box.bottom+8,window.innerHeight-200)+'px';
   node.showPopover();
  }}><svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14M7 3v4M13 8v4M8 13v4"/></svg>显示设置</button>
  <div id={id} ref={panel} popover="auto" className="task-display-popover" role="group" aria-label="任务显示设置" onToggle={event=>setOpen(event.newState==='open')}>
   <label><input type="checkbox" checked={value.grouped} onChange={e=>onChange({...value,grouped:e.target.checked})}/>按阶段分组</label>
   <div className="task-stage-fold-actions"><button type="button" disabled={!value.grouped} onClick={()=>onChange({...value,collapsed:[]})}>全部展开</button><button type="button" disabled={!value.grouped} onClick={()=>onChange({...value,collapsed:stages.map(([id])=>id)})}>全部收起</button></div>
  </div>
 </div>;
}
