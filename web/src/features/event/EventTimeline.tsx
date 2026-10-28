import { DateTime } from 'luxon';
import type { CSSProperties } from 'react';
import type { CalendarEvent } from './Events';
import { barGeometry, dayPosition, timelineRange, type TimelineSpan } from './timeline';
import './timeline.css';
export function EventTimeline({events,date,span,zone,onDateChange,onSpanChange,onOpen,loading,error,onRetry}:{events:CalendarEvent[];date:string;span:TimelineSpan;zone:string;onDateChange:(date:string)=>void;onSpanChange:(span:TimelineSpan)=>void;onOpen:(id:string)=>void;loading:boolean;error:boolean;onRetry:()=>void}) {
 const range=timelineRange(date,span,zone);
 const now=DateTime.now().setZone(zone);
 const today=dayPosition(now.startOf('day'),range.start);
 const visible=events.map(event=>({event,geometry:barGeometry(event.start_at,event.end_at,range)})).filter(item=>item.geometry);
 const move=(amount:number)=>onDateChange(range.start.plus(span==='week'?{weeks:amount}:{months:amount}).toISODate()!);
 return <div className="event-timeline" aria-label="日程时间轴">
  <div className="timeline-toolbar">
   <div className="timeline-navigation"><button aria-label="上一区间" onClick={()=>move(-1)}>上一{span==='week'?'周':'月'}</button><button onClick={()=>onDateChange(now.toISODate()!)}>今天</button><button aria-label="下一区间" onClick={()=>move(1)}>下一{span==='week'?'周':'月'}</button></div>
   <h2>{range.start.toFormat('yyyy年M月d日')} – {range.end.minus({days:1}).toFormat('M月d日')}</h2>
   <div className="timeline-zoom" aria-label="时间轴跨度"><button aria-pressed={span==='week'} onClick={()=>onSpanChange('week')}>周</button><button aria-pressed={span==='month'} onClick={()=>onSpanChange('month')}>月</button></div>
  </div>
  {loading ? <p role="status">加载日程…</p> : error ? <p role="alert">日程加载失败 <button onClick={onRetry}>重试</button></p> : <>
   <div className="timeline-scroll" tabIndex={0} aria-label="横向滚动日程时间轴">
    <div className="timeline-grid" style={{'--timeline-days':range.days.length} as CSSProperties}>
     <div className="timeline-row timeline-header"><div className="timeline-label">日程</div><div className="timeline-track timeline-days">{range.days.map(day=><div key={day.toISODate()} className={day.hasSame(now,'day')?'is-today':''}><span>{day.toFormat('M/d')}</span><small>{day.setLocale('zh-CN').toFormat('ccc')}</small></div>)}</div></div>
     {visible.map(({event,geometry})=><div className="timeline-row" key={event.id}><button className="timeline-label timeline-event-label" onClick={()=>onOpen(event.id)} title={event.title}>{event.title}</button><div className="timeline-track">
      {today>=0 && today<range.days.length && <div className="timeline-today" aria-hidden="true" style={{left:`${(today+.5)/range.days.length*100}%`}}/>}
      <button className="timeline-bar" onClick={()=>onOpen(event.id)} style={{left:`${geometry!.left}%`,width:`${geometry!.width}%`}} aria-label={`${event.title}，${DateTime.fromISO(event.start_at).setZone(zone).toFormat('M月d日 HH:mm')} 至 ${DateTime.fromISO(event.end_at).setZone(zone).toFormat('M月d日 HH:mm')}`} title={event.title}><span>{event.title}</span></button>
     </div></div>)}
    </div>
   </div>
   {!visible.length && <p className="timeline-empty">此区间暂无日程</p>}
  </>}
 </div>;
}
