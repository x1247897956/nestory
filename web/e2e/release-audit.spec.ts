// Independent release audit probes. Use only the disposable audit container.
import { test, expect } from '@playwright/test';
import {execFileSync} from 'node:child_process';
test.skip(process.env.NOTEAPP_RELEASE_AUDIT !== '1','Opt-in defect reproductions; use scripts/audit/run_browser.sh');
test.beforeEach(async ({baseURL}) => {
 expect(new URL(baseURL!).port).toBe('18187');
 const name=process.env.NOTEAPP_AUDIT_CONTAINER;
 expect(name?.startsWith('noteapp-release-audit-')).toBe(true);
 const info=JSON.parse(execFileSync('docker',['inspect',name!],{encoding:'utf8'}))[0];
 expect(info.NetworkSettings.Ports['8080/tcp'][0].HostPort).toBe('18187');
 expect(info.Mounts.some((mount:any)=>mount.Name===name && mount.Destination==='/data')).toBe(true);
});
for (const [name,block] of Object.entries({
  style:{id:'bad-style',type:'paragraph',content:[{type:'text',text:'safe text',styles:{unknown:true}}]},
  table:{id:'bad-table',type:'table',content:{type:'tableContent',headerRows:4294967296,rows:[{cells:[[]]}]}},
})) {
 test(`reproduce accepted ${name} document that cannot reopen`,async({page,request})=>{
  const p=await(await request.post('/api/v1/projects',{data:{title:'Audit schema '+name}})).json();
  const response=await request.post(`/api/v1/projects/${p.id}/pages`,{data:{title:name,body_document:{version:1,blocks:[block]}}});
  expect(response.status()).toBe(201);const note=await response.json();
  await page.goto(`/projects/${p.id}/pages/${note.id}`);
  await expect(page.getByRole('alert').filter({hasText:'正文加载失败'})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Markdown 正文'})).toHaveCount(0);
 });
}
test('quota failure preserves input and manual server retry works',async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'Audit quota'}})).json();
 const note=await(await request.post(`/api/v1/projects/${p.id}/pages`,{data:{title:'Quota note'}})).json();
 await page.goto(`/projects/${p.id}/pages/${note.id}`);await page.getByRole('textbox',{name:'Markdown 正文'}).waitFor();
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('audit quota','QuotaExceededError');};});
 await page.getByRole('textbox',{name:'Markdown 正文'}).fill('quota unsaved draft');
 await expect(page.getByRole('alert').filter({hasText:'本地草稿保存失败'})).toBeVisible();
 expect(JSON.stringify((await(await request.get(`/api/v1/pages/${note.id}`)).json()).body_document)).not.toContain('quota unsaved draft');
 await page.getByRole('button',{name:'重试保存'}).click();
 await expect.poll(async()=>JSON.stringify((await(await request.get(`/api/v1/pages/${note.id}`)).json()).body_document)).toContain('quota unsaved draft');
});
test('reproduce pending page upload discarded by reload recovery',async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'Audit pending reload'}})).json();
 const note=await(await request.post(`/api/v1/projects/${p.id}/pages`,{data:{title:'Reload note'}})).json();
 await page.goto(`/projects/${p.id}/pages/${note.id}`);await page.getByRole('textbox',{name:'Markdown 正文'}).waitFor();
 // A failed save leaves the recovery controls visible.
 await page.route(`**/api/v1/pages/${note.id}`,async route=>{if(route.request().method()==='PATCH')await route.abort();else await route.continue();});
 await page.getByLabel('笔记标题',{exact:true}).fill('unsaved title');
 await expect(page.getByRole('button',{name:'重新载入',exact:true})).toBeVisible();
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);let asset:any;
 await page.route('**/api/v1/projects/*/assets',async route=>{const response=await route.fetch();asset=await response.json();await gate;await route.fulfill({response});});
 await page.getByLabel('上传附件',{exact:true}).setInputFiles({name:'pending.txt',mimeType:'text/plain',buffer:Buffer.from('audit attachment')});
 await expect(page.getByText('正在处理文件…',{exact:true})).toBeVisible();
 // Actual behavior: unlike TaskEditor, the Page reload control remains enabled.
 await expect(page.getByRole('button',{name:'重新载入',exact:true})).toBeEnabled();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'重新载入',exact:true}).click();
 await expect(page.getByLabel('笔记标题',{exact:true})).toHaveValue('Reload note');
 release();await expect.poll(()=>!!asset).toBe(true);
 await page.waitForTimeout(1200);
 expect(JSON.stringify((await(await request.get(`/api/v1/pages/${note.id}`)).json()).body_document)).not.toContain(asset.id);
 expect((await request.get('/api/v1/assets/'+asset.id)).status()).toBe(200);
});
test('reproduce trusted LAN HTTP secure-context failure and foreign Host acceptance',async({playwright,request})=>{
 const browser=await playwright.chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--host-resolver-rules=MAP audit.invalid 127.0.0.1','--no-proxy-server']});
 try {
  const p=await(await request.post('/api/v1/projects',{data:{title:'Audit LAN HTTP'}})).json();
  const note=await(await request.post(`/api/v1/projects/${p.id}/pages`,{data:{title:'LAN note'}})).json();
  const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://audit.invalid:18187/');await expect(page.getByRole('link',{name:'工作台',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>isSecureContext)).toBe(false);
  expect(await page.evaluate(()=>typeof crypto.randomUUID)).toBe('undefined');
  // A matching arbitrary Host/Origin can still perform writes at HTTP layer.
  expect(await page.evaluate(async()=> (await fetch('/api/v1/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Audit foreign Host accepted'})})).status)).toBe(201);
  await page.goto(`http://audit.invalid:18187/projects/${p.id}/pages/${note.id}`);
  await expect(page.locator('body')).toContainText('randomUUID');
  await expect(page.getByRole('textbox',{name:'Markdown 正文'})).toHaveCount(0);
  console.log('LAN HTTP evidence',JSON.stringify({secure:false,errors,body:await page.locator('body').innerText()}));
 }finally{await browser.close();}
});
test('limited hostile link and raw HTML vectors do not execute',async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'Audit XSS vectors'}})).json();
 const note=await(await request.post(`/api/v1/projects/${p.id}/pages`,{data:{title:'<img src=x onerror=window.__auditXSS=1>',body_document:{version:1,blocks:[{id:'link',type:'paragraph',content:[{type:'link',href:'javascript:window.__auditXSS=1',content:[{type:'text',text:'malicious link',styles:{}}]},{type:'text',text:'<script>window.__auditXSS=1</script>',styles:{}}]}]}}})).json();
 await page.goto(`/projects/${p.id}/pages/${note.id}`);await page.getByRole('textbox',{name:'Markdown 正文'}).waitFor();
 const hrefs=await page.locator('.block-editor a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));
 expect(hrefs.some(href=>href?.toLowerCase().startsWith('javascript:'))).toBe(false);
 expect(await page.evaluate(()=>(window as any).__auditXSS)).toBeUndefined();
});
