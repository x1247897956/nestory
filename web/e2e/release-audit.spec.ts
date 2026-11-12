import { assertReleaseFixture } from './release-fixture';
// Independent release audit probes. Use only the disposable audit container.
import { test, expect } from '@playwright/test';
test.skip(process.env.NOTEAPP_RELEASE_AUDIT !== '1','Opt-in release regressions; use scripts/audit/run_browser.sh');
test.beforeEach(async ({baseURL}) => {
 assertReleaseFixture(baseURL);
});
for (const [name,block] of Object.entries({
  emptyRow:{id:'bad-emptyRow',type:'table',content:{type:'tableContent',rows:[{cells:[{type:'tableCell',props:{rowspan:2},content:[]}]},{cells:[]}]}},
  style:{id:'bad-style',type:'paragraph',content:[{type:'text',text:'safe text',styles:{unknown:true}}]},
  table:{id:'bad-table',type:'table',content:{type:'tableContent',headerRows:4294967296,rows:[{cells:[[]]}]}},
})) {
 test(`reject ${name} document before persistence`,async({page,request})=>{
  const p=await(await request.post('/api/v1/projects',{data:{title:'Audit schema '+name}})).json();
  const response=await request.post(`/api/v1/projects/${p.id}/pages`,{data:{title:name,body_document:{version:1,blocks:[block]}}});
  expect(response.status()).toBe(400);
  const list=await(await request.get(`/api/v1/projects/${p.id}/pages`)).json();
  expect(JSON.stringify(list)).not.toContain('bad-'+name);
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
test('unknown Host is rejected across routes even with matching Origin',async({request})=>{
 for(const path of ['/', '/api/v1/healthz', '/api/v1/readyz', '/assets/unknown.js']) {
  expect((await request.get(path,{headers:{Host:'audit.invalid:18187','X-Forwarded-Host':'localhost'}})).status()).toBe(403);
 }
 expect((await request.post('/api/v1/projects',{headers:{Host:'audit.invalid:18187',Origin:'http://audit.invalid:18187'},data:{title:'blocked'}})).status()).toBe(403);
});
test('configured LAN HTTP opens and autosaves all object types without secure context',async({playwright,request})=>{
 const browser=await playwright.chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--host-resolver-rules=MAP lan.noteapp.test 127.0.0.1','--proxy-server=direct://']});
 try {
  const p=await(await request.post('/api/v1/projects',{data:{title:'LAN HTTP'}})).json();
  const page=await browser.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://lan.noteapp.test:18187/');
  expect(await page.evaluate(()=>isSecureContext)).toBe(false);
  expect(await page.evaluate(()=>typeof crypto.randomUUID)).toBe('undefined');
  expect(await page.evaluate(async()=> (await fetch('/api/v1/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'LAN create'})})).status)).toBe(201);
  for(const kind of ['tasks','pages','events']) {
   const data:any={title:'LAN '+kind};if(kind==='events')Object.assign(data,{start_at:'2026-10-25T09:00:00+08:00',end_at:'2026-10-25T10:00:00+08:00'});
   const response=await request.post(`/api/v1/projects/${p.id}/${kind}`,{data});expect(response.status()).toBe(201);const obj=await response.json();
   await page.goto(`http://lan.noteapp.test:18187/projects/${p.id}/${kind}/${obj.id}`);
   const editor=page.getByRole('textbox',{name:'Markdown 正文'});await editor.waitFor();await editor.fill('LAN saved '+kind);
   await expect.poll(async()=>JSON.stringify((await(await request.get(`/api/v1/${kind}/${obj.id}`)).json()).body_document)).toContain('LAN saved '+kind);
   await page.reload();await expect(editor).toContainText('LAN saved '+kind);
  }
  expect(errors).toEqual([]);
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
