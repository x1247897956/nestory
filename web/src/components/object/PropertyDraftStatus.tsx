import { useState } from "react";
type DraftState = {draft:unknown;dirty:boolean;busy:boolean;error:string;canRecover:boolean;recover:()=>void;save:()=>void;discardRecovery:()=>void};
export function PropertyDraftStatus({state,onReload,waiting=false,noun="属性"}:{state:DraftState;onReload:(discard:()=>void)=>Promise<void>;waiting?:boolean;noun?:string}) {
 const [error,setError]=useState("");
 return <div className="custom-property-status" aria-live="polite">
  {(state.error||error) ? <div role="alert">{error||state.error}
   <div className="property-recovery-actions">
    {state.canRecover&&<button disabled={state.busy||waiting} onClick={state.recover}>恢复本机草稿</button>}
    <button disabled={state.busy||waiting} onClick={()=>state.save()}>重试保存</button>
    <button onClick={()=>navigator.clipboard.writeText(JSON.stringify(state.draft,null,2)).catch(()=>setError("复制失败，请保留此页面"))}>复制输入</button>
    <button disabled={state.busy||waiting} onClick={async()=>{
     if(!window.confirm(`重新载入会放弃此${noun}的本机输入，是否继续？`))return;
     try {await onReload(state.discardRecovery);}catch(e){setError((e as Error).message);}
    }}>{`重新载入${noun}`}</button>
   </div>
  </div> : state.busy ? "保存中…" : state.dirty ? waiting ? "等待属性设置保存…" : "未保存" : null}
 </div>;
}
