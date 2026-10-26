import {expandProperties} from "./property-actions";
import {test,expect} from '@playwright/test';
import {DateTime} from 'luxon';
const post=async(request:any,path:string,data:unknown)=>(await request.post('/api/v1'+path,{data})).json();

test('upload and parent move cannot overlap, attachment survives move',async({page,request})=>{
 const p=await post(request,'/projects',{title:'上传保护 '+Date.now()});
 const parent=await post(request,`/projects/${p.id}/tasks`,{title:'父任务'});
 const child=await post(request,`/projects/${p.id}/tasks`,{title:'上传任务'});
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);let asset:any;
 await page.route('**/api/v1/projects/*/assets',async route=>{const response=await route.fetch();asset=await response.json();await gate;await route.fulfill({response});});
 await page.goto(`/projects/${p.id}/tasks/${child.id}`);await expandProperties(page);
 await page.getByRole('textbox',{name:'Markdown 正文'}).waitFor();
 await page.getByLabel('上传附件',{exact:true}).setInputFiles({name:'important.txt',mimeType:'text/plain',buffer:Buffer.from('附件不能丢')});
 await expect(page.getByText('正在处理文件…',{exact:true})).toBeVisible();
 await expandProperties(page);
 const parentSelect=page.getByLabel('父任务',{exact:true});await expect(parentSelect).toBeDisabled();
 release();await expect(page.getByRole('status')).toHaveText('已保存');await expect(parentSelect).toBeEnabled();
 await parentSelect.selectOption(parent.id);
 await expect.poll(async()=>(await(await request.get('/api/v1/tasks/'+child.id)).json()).parent_id).toBe(parent.id);
 const stored=await(await request.get('/api/v1/tasks/'+child.id)).json();
 expect(JSON.stringify(stored.body_document)).toContain('/api/v1/assets/'+asset.id);
 expect((await request.get('/api/v1/assets/'+asset.id)).status()).toBe(200);
});

test('lost creation response retries same intent across reload without duplicate, later explicit creation is new',async({page,request})=>{
 const p=await post(request,'/projects',{title:'创建幂等 '+Date.now()});let first=true;const ids:string[]=[];
 await page.route(`**/api/v1/projects/${p.id}/pages`,async route=>{
  if(route.request().method()!=='POST'){await route.continue();return;}
  ids.push(route.request().postDataJSON().request_id);
  if(first){first=false;await route.fetch();await route.abort('failed');}else await route.continue();
 });
 await page.goto(`/projects/${p.id}/pages`);await expandProperties(page);await page.getByRole('button',{name:'新建笔记',exact:true}).click();
 await expect(page.getByRole('button',{name:'重试新建',exact:true})).toBeVisible();
 await page.reload();await expandProperties(page);await page.getByRole('button',{name:'新建笔记',exact:true}).click();
 await expect(page.getByLabel('笔记标题',{exact:true})).toHaveValue('无标题笔记');
 expect(ids[0]).toBeTruthy();expect(ids[1]).toBe(ids[0]);
 expect(await(await request.get(`/api/v1/projects/${p.id}/pages`)).json()).toHaveLength(1);
 await page.getByRole('link',{name:'笔记',exact:true}).click();
 await page.getByRole('button',{name:'新建笔记',exact:true}).click();
 await expect(page.getByLabel('笔记标题',{exact:true})).toHaveValue('无标题笔记');
 expect(ids[2]).not.toBe(ids[0]);
 expect(await(await request.get(`/api/v1/projects/${p.id}/pages`)).json()).toHaveLength(2);
});

test('unsaved native draft survives forced tab close and can be explicitly recovered in a new tab',async({page,context,request})=>{
 const p=await post(request,'/projects',{title:'持久草稿 '+Date.now()});
 const note=await post(request,`/projects/${p.id}/pages`,{title:'待恢复笔记'});
 await page.route(`**/api/v1/pages/${note.id}`,async route=>{if(route.request().method()==='PATCH')await route.abort('failed');else await route.continue();});
 await page.goto(`/projects/${p.id}/pages/${note.id}`);await expandProperties(page);
 await page.getByRole('textbox',{name:'Markdown 正文'}).fill('强制关闭之前的中文草稿');
 await expect(page.getByRole('button',{name:'重试保存'})).toBeVisible();
 expect(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.startsWith('noteapp:draft:')))).toBe(true);
 await page.close({runBeforeUnload:false});
 const restored=await context.newPage();await restored.goto(`/projects/${p.id}/pages/${note.id}`);await expandProperties(restored);
 await expect(restored.getByRole('textbox',{name:'Markdown 正文'})).toContainText('强制关闭之前的中文草稿');
 await expect(restored.getByRole('button',{name:'恢复本机草稿'})).toBeVisible();
 await restored.getByRole('button',{name:'恢复本机草稿'}).click();
 await expect(restored.getByRole('status')).toHaveText('已保存');
 await expect.poll(async()=>JSON.stringify((await(await request.get('/api/v1/pages/'+note.id)).json()).body_document)).toContain('强制关闭之前的中文草稿');
});

test('stale deletion with same count rejects unseen replacement and requires a fresh snapshot',async({request})=>{
 const p=await post(request,'/projects',{title:'删除快照 '+Date.now()});const root='/api/v1/projects/'+p.id;
 const a=await post(request,`/projects/${p.id}/tasks`,{title:'预览中的A'});
 const preview=await(await request.get(root+'/delete-preview')).json();
 const pa=await(await request.get('/api/v1/tasks/'+a.id+'/delete-preview')).json();await request.delete('/api/v1/tasks/'+a.id,{data:pa});
 const c=await post(request,`/projects/${p.id}/tasks`,{title:'新加入的C'});
 const fresh=await(await request.get(root+'/delete-preview')).json();expect(fresh.count).toBe(preview.count);expect(fresh.version).toBe(preview.version);expect(fresh.fingerprint).not.toBe(preview.fingerprint);
 expect((await request.delete(root,{data:preview})).status()).toBe(409);
 expect((await request.get('/api/v1/tasks/'+c.id)).status()).toBe(200);
 expect((await request.delete(root,{data:fresh})).status()).toBe(200);
});

test('calendar lost save response reconciles to the committed time',async({page,request})=>{
 const p=await post(request,'/projects',{title:'改期确认 '+Date.now()});
 const start=DateTime.now().setZone('Asia/Shanghai').startOf('week').plus({days:2,hours:9});
 const event=await post(request,`/projects/${p.id}/events`,{title:'网络改期',start_at:start.toISO(),end_at:start.plus({hours:1}).toISO()});
 let committed:any;let patches=0;
 await page.route(`**/api/v1/events/${event.id}`,async route=>{
  if(route.request().method()==='PATCH'&&patches++===0){const res=await route.fetch();committed=await res.json();await route.abort('failed');}else await route.continue();
 });
 await page.goto(`/projects/${p.id}/events`);await expandProperties(page);
 const source=page.locator('.fc-event').filter({hasText:'网络改期'}).first();await expect(source).toBeVisible();
 const box=(await source.boundingBox())!;const cell=(await page.locator(`.fc-daygrid-day[data-date="${start.toISODate()}"]`).boundingBox())!;
 await page.mouse.move(box.x+20,box.y+8);await page.mouse.down();await page.waitForTimeout(250);
 await page.mouse.move(box.x+20+cell.width,box.y+8,{steps:20});await page.waitForTimeout(250);await page.mouse.up();
 await expect.poll(()=>patches).toBe(1);await expect.poll(()=>committed?.version).toBe(2);
 const day=DateTime.fromISO(committed.start_at).setZone('Asia/Shanghai').toISODate();
 await expect(page.locator(`.fc-daygrid-day[data-date="${day}"] .fc-event`).filter({hasText:'网络改期'})).toBeVisible();
 expect((await(await request.get('/api/v1/events/'+event.id)).json()).start_at).toBe(committed.start_at);
});

test('copied tabs isolate identical independent creations even with cloned window name',async({page,request})=>{
 await page.goto('/');await expandProperties(page);const title='独立窗口 '+Date.now();
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);let firstID:string|undefined;
 await page.route('**/api/v1/projects',async route=>{
  if(route.request().method()!=='POST'){await route.continue();return;}
  firstID=route.request().postDataJSON().request_id;const response=await route.fetch();await gate;await route.fulfill({response});
 });
 await page.getByRole('button',{name:'新建项目',exact:true}).click();
 await page.getByLabel('项目名称',{exact:true}).fill(title);
 await page.getByRole('button',{name:'保存项目',exact:true}).click();await expect.poll(()=>firstID).toBeTruthy();
 const opened=page.waitForEvent('popup');
 await page.evaluate(()=>{const popup=window.open('about:blank','_blank')!;popup.name=window.name;popup.location.href=location.origin+'/';});
 const other=await opened;await other.getByRole('button',{name:'新建项目',exact:true}).waitFor();
 expect(await other.evaluate(()=>sessionStorage.getItem('noteapp:tab-owner:v1'))).not.toBe(await page.evaluate(()=>sessionStorage.getItem('noteapp:tab-owner:v1')));
 await other.getByRole('button',{name:'新建项目',exact:true}).click();await other.getByLabel('项目名称',{exact:true}).fill(title);await other.getByRole('button',{name:'保存项目',exact:true}).click();
 await expect(other).toHaveURL(/\/projects\/[a-f0-9]+$/);release();await expect(page).toHaveURL(/\/projects\/[a-f0-9]+$/);
 expect(other.url()).not.toBe(page.url());
 expect((await(await request.get('/api/v1/projects')).json()).filter((p:any)=>p.title===title)).toHaveLength(2);
});
