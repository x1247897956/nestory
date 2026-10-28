import type {ReactNode} from 'react';
import './collection.css';
export function CollectionHeader({title,count,status,actions,views,tools,filters}:{title:string;count?:number|string;status?:ReactNode;actions?:ReactNode;views:ReactNode;tools?:ReactNode;filters?:ReactNode}){
 return <div className="collection-heading">
  <header className="collection-header"><div className="collection-title"><h2>{title}</h2>{count!==undefined&&<span className="collection-count">{count}</span>}<span className="collection-status" aria-live="polite">{status}</span></div><div className="collection-actions">{actions}</div></header>
  <div className="collection-toolbar"><div className="collection-views">{views}</div><div className="collection-tools">{tools}</div></div>
  {filters&&<div className="collection-conditions">{filters}</div>}
 </div>;
}
