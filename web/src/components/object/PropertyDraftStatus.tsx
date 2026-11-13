import {useI18n,translateError} from "../../i18n";
import { useState } from "react";
type DraftState = {draft:unknown;dirty:boolean;busy:boolean;error:string;canRecover:boolean;recover:()=>void;save:()=>void;discardRecovery:()=>void};
export function PropertyDraftStatus({state,onReload,waiting=false,noun="属性"}:{state:DraftState;onReload:(discard:()=>void)=>Promise<void>;waiting?:boolean;noun?:string}) {
 const {t}=useI18n();
 const [error,setError]=useState("");
 return <div className="custom-property-status" aria-live="polite">
  {(state.error||error) ? <div role="alert">{translateError(error||state.error)}
   <div className="property-recovery-actions">
    {state.canRecover&&<button disabled={state.busy||waiting} onClick={state.recover}>{t("恢复本机草稿")}</button>}
    <button disabled={state.busy||waiting} onClick={()=>state.save()}>{t("重试保存")}</button>
    <button onClick={()=>navigator.clipboard.writeText(JSON.stringify(state.draft,null,2)).catch(()=>setError("复制失败，请保留此页面"))}>{t("复制输入")}</button>
    <button disabled={state.busy||waiting} onClick={async()=>{
     if(!window.confirm(t(noun==="选项"?"重新载入会放弃此选项的本机输入，是否继续？":"重新载入会放弃此属性的本机输入，是否继续？")))return;
     try {await onReload(state.discardRecovery);}catch(e){setError((e as Error).message);}
    }}>{t(noun==="选项"?"重新载入选项":"重新载入属性")}</button>
   </div>
  </div> : state.busy ? t("保存中…") : state.dirty ? waiting ? t("等待属性设置保存…") : t("未保存") : null}
 </div>;
}
