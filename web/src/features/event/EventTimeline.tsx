import {t, useI18n} from "../../i18n";
import { DateTime } from 'luxon';
import type { CSSProperties } from 'react';
import type { EventProperties } from './Events';
import { barGeometry, dayPosition, timelineRange, type TimelineSpan } from './timeline';
import './timeline.css';
import {useSettings} from '../settings/preferences';
export function EventTimeline({events,date,span,zone,onDateChange,onSpanChange,onOpen,loading,error,onRetry}:{events:EventProperties[];date:string;span:TimelineSpan;zone:string;onDateChange:(date:string)=>void;onSpanChange:(span:TimelineSpan)=>void;onOpen:(id:string)=>void;loading:boolean;error:boolean;onRetry:()=>void}) {
 const {language}=useI18n();
 const settings=useSettings();
 const range=timelineRange(date,span,zone,settings.firstDay);
 const timeFormat=(language === 'zh-CN' ? 'M月d日 ' : 'MMM d, ') + (settings.hourCycle === '12' ? 'a hh:mm' : 'HH:mm');
 const dateFormat=language === 'zh-CN' ? 'yyyy年M月d日' : 'MMM d, yyyy';
 const endDateFormat=language === 'zh-CN' ? 'M月d日' : 'MMM d';
 const now=DateTime.now().setZone(zone);
 const today=dayPosition(now.startOf('day'),range.start);
 const visible=events.map(event=>({event,geometry:barGeometry(event.start_at,event.end_at,range)})).filter(item=>item.geometry);
 const move=(amount:number)=>onDateChange(range.start.plus(span==='week'?{weeks:amount}:{months:amount}).toISODate()!);
 return <div className="event-timeline" aria-label={t("日程时间轴")}>
  <div className="timeline-toolbar">
   <div className="timeline-navigation"><button aria-label={t("上一区间")} onClick={()=>move(-1)}>{t(span === 'week' ? '上一周' : '上一月')}</button><button onClick={()=>onDateChange(now.toISODate()!)}>{t("今天")}</button><button aria-label={t("下一区间")} onClick={()=>move(1)}>{t(span === 'week' ? '下一周' : '下一月')}</button></div>
   <h2>{range.start.setLocale(language).toFormat(dateFormat)} – {range.end.minus({days:1}).setLocale(language).toFormat(endDateFormat)}</h2>
   <div className="timeline-zoom" aria-label={t("时间轴跨度")}><button aria-pressed={span==='week'} onClick={()=>onSpanChange('week')}>{t("周")}</button><button aria-pressed={span==='month'} onClick={()=>onSpanChange('month')}>{t("月")}</button></div>
  </div>
  {loading ? <p role="status">{t("加载日程…")}</p> : error ? <p role="alert">{t("日程加载失败")} <button onClick={onRetry}>{t("重试")}</button></p> : <>
   <div className="timeline-scroll" tabIndex={0} aria-label={t("横向滚动日程时间轴")}>
    <div className="timeline-grid" style={{'--timeline-days':range.days.length} as CSSProperties}>
     <div className="timeline-row timeline-header"><div className="timeline-label">{t("日程")}</div><div className="timeline-track timeline-days">{range.days.map(day=><div key={day.toISODate()} className={day.hasSame(now,'day')?'is-today':''}><span>{day.toFormat('M/d')}</span><small>{day.setLocale(language).toFormat('ccc')}</small></div>)}</div></div>
     {visible.map(({event,geometry})=><div className="timeline-row" key={event.id}><button className="timeline-label timeline-event-label" onClick={()=>onOpen(event.id)} title={event.title}>{event.title}</button><div className="timeline-track">
      {today>=0 && today<range.days.length && <div className="timeline-today" aria-hidden="true" style={{left:`${(today+.5)/range.days.length*100}%`}}/>}
      <button className="timeline-bar" onClick={()=>onOpen(event.id)} style={{left:`${geometry!.left}%`,width:`${geometry!.width}%`}} aria-label={t('{title}，{start} 至 {end}', {title: event.title, start: DateTime.fromISO(event.start_at).setZone(zone).setLocale(language).toFormat(timeFormat), end: DateTime.fromISO(event.end_at).setZone(zone).setLocale(language).toFormat(timeFormat)})} title={event.title}><span>{event.title}</span></button>
     </div></div>)}
    </div>
   </div>
   {!visible.length && <p className="timeline-empty">{t("此区间暂无日程")}</p>}
  </>}
 </div>;
}
