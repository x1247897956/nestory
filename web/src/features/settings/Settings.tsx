import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../app/api';
import { defaultSettings, normalizeSettings, readSettings, resetPreferences, saveSettings, updateSettings, useSettings, useSettingsStorageError, type Settings } from './preferences';
import './settings.css';

const groups = [['general','通用'],['appearance','外观'],['calendar','日历与时间'],['editor','编辑器'],['data','数据与维护'],['about','关于']] as const;
const repository = 'https://github.com/x1247897956/nestory';
const transferLimit = 512 * 1024 * 1024;

function Row({title,description,children}:{title:string;description?:string;children:ReactNode}) {
 return <div className="setting-row"><div className="setting-copy"><span className="setting-title">{title}</span>{description && <p>{description}</p>}</div><div className="setting-control">{children}</div></div>;
}

function Choice<K extends keyof Settings>({name,setting,options}:{name:string;setting:K;options:readonly (readonly [Settings[K],string])[]}) {
 const settings = useSettings();
 return <select aria-label={name} value={String(settings[setting])} onChange={event => {
  const value = options.find(([value]) => String(value) === event.target.value)?.[0];
  if (value !== undefined) updateSettings({[setting]:value});
 }}>{options.map(([value,label]) => <option key={String(value)} value={String(value)}>{label}</option>)}</select>;
}

function download(blob:Blob,name:string) {
 const url=URL.createObjectURL(blob);
 const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
 window.setTimeout(() => URL.revokeObjectURL(url),1000);
}

async function failure(response:Response):Promise<never> {
 let message='操作失败，请检查连接后重试。';
 try { const body=await response.json();if(body.error?.message)message=body.error.message; } catch { /* A proxy may return HTML. */ }
 throw new Error(message);
}

function WorkspaceTransfer() {
 const client=useQueryClient();
 const [file,setFile]=useState<File>();
 const [busy,setBusy]=useState<'export'|'import'|null>(null);
 const [error,setError]=useState('');
 const [status,setStatus]=useState('');
 const input=useRef<HTMLInputElement>(null);
 useEffect(() => {
  if(!busy)return;
  const guard=(event:BeforeUnloadEvent) => {event.preventDefault();event.returnValue='';};
  window.addEventListener('beforeunload',guard);return () => window.removeEventListener('beforeunload',guard);
 },[busy]);
 const run=async(action:'export'|'import') => {
  if(busy || (action==='import' && !file))return;
  setBusy(action);setError('');setStatus('');
  try {
   const response=await fetch('/api/v1/transfer/'+action,{method:action==='export'?'GET':'POST',...(action==='import'?{body:file,headers:{'Content-Type':'application/zip'}}:{})});
   if(!response.ok)await failure(response);
   if(action==='export'){
    download(await response.blob(),`nestory-workspace-${new Date().toISOString().slice(0,10)}.zip`);
    setStatus('工作空间备份已下载，包含全部项目、正文、关联和附件。');
   }else{
    await client.invalidateQueries();setFile(undefined);if(input.current)input.current.value='';
    setStatus('工作空间已恢复，可以从侧栏打开项目。');
   }
  }catch(error){setError((error as Error).message);}finally{setBusy(null);}
 };
 return <div className="workspace-transfer" data-dirty={busy==='import'}>
  <Row title="手动迁移工作空间" description="换电脑或迁移实例时，手动导出项目、笔记、任务、日程、自定义属性和附件，包含归档与回收站。日常误删请从回收站恢复。">
   <button disabled={!!busy} onClick={() => void run('export')}>{busy==='export'?'正在生成备份…':'导出工作空间'}</button>
  </Row>
  <div className="setting-row restore-row"><div className="setting-copy"><span className="setting-title">从备份恢复</span><p>选择 Nestory 导出的 ZIP。仅可恢复到空工作空间，已有内容不会被覆盖。在线备份上限 512 MiB、10,000 个附件；更大的工作空间请使用部署备份。</p></div>
   <div className="restore-controls"><input ref={input} aria-label="工作空间备份文件" type="file" accept=".zip,application/zip" disabled={!!busy} onChange={event => {
    const next=event.target.files?.[0];setError('');setStatus('');setFile(undefined);
    if(next && (next.size>transferLimit || !next.name.toLowerCase().endsWith('.zip'))){setError('请选择不超过 512 MiB 的 Nestory ZIP 备份。');event.target.value='';return;}setFile(next);
   }}/><button disabled={!file || !!busy} onClick={() => void run('import')}>{busy==='import'?'正在校验并恢复…':'恢复工作空间'}</button></div>
  </div>
  {busy && <p role="status" className="settings-feedback">{busy==='export'?'正在打包数据和附件，请稍候。':'正在校验备份并恢复，请保持页面打开。'}</p>}
  {status && <p role="status" className="settings-feedback">{status}</p>}
  {error && <p role="alert" className="settings-error">{error}</p>}
 </div>;
}

export function SettingsPage() {
 const settings=useSettings();
 const storageError=useSettingsStorageError();
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const preferenceInput=useRef<HTMLInputElement>(null);
 const config=useQuery({queryKey:['config'],queryFn:()=>api<{timezone:string;version:string}>('/config')});
 return <section className="settings-page" aria-label="设置">
  <header className="settings-heading"><div><h1>设置</h1><p>让 Nestory 更贴合你的工作习惯。</p></div><span className="settings-save-state" role="status">{storageError?'仅本次会话有效':'偏好自动保存于此浏览器'}</span></header>
  {storageError && <p className="settings-error" role="alert">{storageError} <button onClick={() => saveSettings(readSettings())}>重试保存</button></p>}
  <div className="settings-layout">
   <nav className="settings-nav" aria-label="设置分类">{groups.map(([id,label]) => <a key={id} href={'#settings-'+id}>{label}</a>)}</nav>
   <div className="settings-sections">
    <section id="settings-general" className="settings-section" aria-labelledby="general-title"><h2 id="general-title">通用</h2>
     <Row title="启动时打开" description="重新打开应用时，从你习惯的位置开始；直接访问链接不受影响。"><Choice name="启动时打开" setting="startup" options={[[ 'workspace','工作台'],['last','上次访问的位置']]}/></Row>
    </section>
    <section id="settings-appearance" className="settings-section" aria-labelledby="appearance-title"><h2 id="appearance-title">外观</h2>
     <Row title="主题" description="跟随系统时，自动适应设备的浅色与深色外观。"><Choice name="主题" setting="theme" options={[[ 'system','跟随系统'],['light','浅色'],['dark','深色']]}/></Row>
     <div className="settings-theme-preview" aria-hidden="true"><div className="preview-sidebar"><i/><i/><i/></div><div className="preview-content"><strong>Nestory</strong><span>给想法一个安放的地方。</span><div><i/><i/><i/></div></div></div>
     <Row title="界面字号" description="调整导航、列表与控件的文字大小。"><Choice name="界面字号" setting="fontSize" options={[[13,'小'],[14,'标准'],[16,'大']]}/></Row>
     <Row title="布局密度" description="舒适布局保留更多留白；紧凑布局让列表容纳更多内容。"><Choice name="布局密度" setting="density" options={[[ 'comfortable','舒适'],['compact','紧凑']]}/></Row>
    </section>
    <section id="settings-calendar" className="settings-section" aria-labelledby="calendar-title"><h2 id="calendar-title">日历与时间</h2>
     <Row title="每周起始日"><Choice name="每周起始日" setting="firstDay" options={[[1,'星期一'],[0,'星期日']]}/></Row>
     <Row title="时间格式"><Choice name="时间格式" setting="hourCycle" options={[[ '24','24 小时制'],['12','12 小时制']]}/></Row>
     <Row title="默认日历视图" description="用于工作台和尚未设置视图的项目，保留各项目已选的视图。"><Choice name="默认日历视图" setting="calendarView" options={[[ 'dayGridMonth','月视图'],['timeGridWeek','周视图']]}/></Row>
     <Row title="新日程默认时长" description="点击日期或新建日程时使用；拖选时保留你选择的时间范围。"><Choice name="新日程默认时长" setting="eventDuration" options={[[15,'15 分钟'],[30,'30 分钟'],[60,'1 小时'],[90,'1.5 小时'],[120,'2 小时']]}/></Row>
     <Row title="工作空间时区" description="使用部署电脑的系统时区，统一用于日历、日程和日期筛选。"><span className="settings-value">{config.data?.timezone ?? '正在读取…'}</span></Row>
     <details className="settings-help"><summary>如何同步时区</summary><p>应用在启动或部署时读取部署电脑的系统时区。修改系统时区后，在部署目录手动运行 <code>python3 scripts/local_deploy.py up</code>，再刷新应用使其生效。</p></details>
    </section>
    <section id="settings-editor" className="settings-section" aria-labelledby="editor-title"><h2 id="editor-title">编辑器</h2>
     <Row title="正文字号" description="用于笔记、任务和日程的正文。"><Choice name="正文字号" setting="editorFontSize" options={[[14,'14 px'],[15,'15 px · 标准'],[17,'17 px'],[19,'19 px']]}/></Row>
     <Row title="正文宽度" description="标准宽度适合长文阅读；宽版为表格和代码留出更多空间。"><Choice name="正文宽度" setting="editorWidth" options={[[ 'standard','标准'],['wide','宽版']]}/></Row>
     <div className="setting-row"><label className="setting-copy" htmlFor="spell-check"><span className="setting-title">拼写检查</span><span className="setting-description">使用浏览器的拼写检查，支持的语言由浏览器决定。</span></label><input id="spell-check" type="checkbox" role="switch" checked={settings.spellCheck} onChange={event=>updateSettings({spellCheck:event.target.checked})}/></div>
     <div className="settings-writing-preview" style={{fontSize:settings.editorFontSize}}><span>正文预览</span><p>把零散的想法写下来，<br/>让下一步行动自然发生。</p></div>
    </section>
    <section id="settings-data" className="settings-section" aria-labelledby="data-title"><h2 id="data-title">数据与维护</h2>
     <WorkspaceTransfer/>
     <Row title="个人设置" description="单独保存或迁移本页偏好；项目视图和工作空间数据不包含在内。"><div className="setting-actions"><button onClick={()=>{
      download(new Blob([JSON.stringify({format:'nestory-preferences',version:1,settings:readSettings()},null,2)],{type:'application/json'}),'nestory-preferences.json');setNotice('个人设置已下载。');
     }}>导出设置</button><button onClick={()=>preferenceInput.current?.click()}>导入设置</button></div></Row>
     <input ref={preferenceInput} aria-label="个人设置文件" hidden type="file" accept=".json,application/json" onChange={async event=>{
      const file=event.target.files?.[0];event.target.value='';if(!file)return;setError('');setNotice('');
      try{
       if(file.size>65536)throw Error('设置文件过大，请选择 Nestory 导出的设置 JSON。');
       const data=JSON.parse(await file.text());
       if(data.format!=='nestory-preferences'||data.version!==1||!data.settings||typeof data.settings!=='object'||Array.isArray(data.settings))throw Error('这不是受支持的 Nestory 设置文件。');
       const normalized=normalizeSettings(data.settings);
       if(Object.keys(defaultSettings).some(key=>data.settings[key]!==normalized[key as keyof Settings]))throw Error('设置文件包含无效或缺失的选项，请重新导出。');
       if(saveSettings(normalized))setNotice('个人设置已导入并生效。');
      }catch(error){setError((error as Error).message);}
     }}/>
     <Row title="恢复默认偏好" description="重置本页设置和各项目的视图、排序与筛选，保留内容、附件和未保存草稿。"><button onClick={()=>{
      if(!window.confirm('恢复所有默认偏好？各项目的视图、排序和筛选也会重置，内容和未保存草稿会保留。'))return;
      setError('');setNotice('');if(resetPreferences())setNotice('已恢复默认偏好。');else setError('部分偏好未能重置，请检查浏览器存储权限后重试。');
     }}>恢复默认偏好</button></Row>
     {notice && <p role="status" className="settings-feedback">{notice}</p>}
     {error && <p role="alert" className="settings-error">{error}</p>}
     <details className="settings-help"><summary>工作空间迁移说明</summary><p>由你主动导出 ZIP，在空 Nestory 实例中恢复内容。超过在线上限的数据可手动使用仓库提供的离线迁移工具；这些操作没有定时任务。</p><a href={repository+'/blob/main/docs/operations.md'} target="_blank" rel="noreferrer">查看数据迁移指南 <span aria-hidden="true">↗</span></a></details>
    </section>
    <section id="settings-about" className="settings-section" aria-labelledby="about-title"><h2 id="about-title">关于</h2>
     <div className="settings-about"><img src="/icon.svg" width="42" height="42" alt=""/><div><strong>Nestory</strong><p>让想法、行动和时间，在同一个项目里相遇。</p></div></div>
     <Row title="应用版本"><span className="settings-value">{config.data?.version ?? '正在读取…'}</span></Row>
     <Row title="开源许可"><span className="settings-value">MIT License</span></Row>
     <div className="settings-links"><a href={repository+'/blob/main/README.zh-CN.md'} target="_blank" rel="noreferrer">使用说明 ↗</a><a href={repository} target="_blank" rel="noreferrer">开源地址 ↗</a></div>
    </section>
    {config.isError && <p role="alert" className="settings-error">工作空间信息读取失败。<button onClick={()=>void config.refetch()}>重试</button></p>}
   </div>
  </div>
 </section>;
}
