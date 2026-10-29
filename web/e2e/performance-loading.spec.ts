import {test,expect} from '@playwright/test';
test('note collection avoids unrelated tasks and loads the editor only for a detail',async({page,request})=>{
 const project=await(await request.post('/api/v1/projects',{data:{title:'Performance loading'}})).json();
 const note=await(await request.post(`/api/v1/projects/${project.id}/pages`,{data:{title:'Lazy editor note'}})).json();
 const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
 await page.goto(`/projects/${project.id}/pages`);await expect(page.getByRole('link',{name:'Lazy editor note',exact:true})).toBeVisible();
 expect(requests.filter(url=>new URL(url).pathname===`/api/v1/projects/${project.id}/tasks`)).toEqual([]);
 const scriptBytes=await page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>e.name.endsWith('.js')).reduce((n,e)=>n+(e as PerformanceResourceTiming).encodedBodySize,0));
 expect(scriptBytes).toBeLessThan(1024*1024);
 expect(requests.some(url=>/\/BlockEditor-[^/]+\.js/.test(url))).toBe(false);
 await page.getByRole('link',{name:'Lazy editor note',exact:true}).click();await expect(page.getByRole('textbox',{name:'Markdown 正文',exact:true})).toBeVisible();
 expect(requests.some(url=>/\/BlockEditor-[^/]+\.js/.test(url))).toBe(true);
 await page.getByRole('textbox',{name:'Markdown 正文',exact:true}).fill('Still saves after lazy loading');await expect(page.getByRole('status').filter({hasText:'已保存'})).toBeVisible();
 await expect.poll(async()=>JSON.stringify((await(await request.get(`/api/v1/pages/${note.id}`)).json()).body_document)).toContain('Still saves after lazy loading');
});

test('editor download failure leaves the note intact and offers reload recovery',async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'Editor recovery'}})).json();
 const note=await(await request.post(`/api/v1/projects/${p.id}/pages`,{data:{title:'Preserved note'}})).json();
 await page.route('**/assets/BlockEditor-*.js',route=>route.abort());
 await page.goto(`/projects/${p.id}/pages/${note.id}`);await expect(page.getByRole('alert').filter({hasText:'编辑器加载失败'})).toBeVisible();
 expect((await(await request.get(`/api/v1/pages/${note.id}`)).json()).body_document).toEqual(note.body_document);
 await page.unroute('**/assets/BlockEditor-*.js');await page.getByRole('button',{name:'重新加载页面',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'Markdown 正文',exact:true})).toBeVisible();
});

test('compressed object collections decode to the same complete records',async({request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'Compression'}})).json();
 await request.post(`/api/v1/projects/${p.id}/tasks`,{data:{title:'中文压缩保留'}});
 const path=`/api/v1/projects/${p.id}/tasks`;
 const identity=await request.get(path,{headers:{'Accept-Encoding':'identity'}});
 const compressed=await request.get(path,{headers:{'Accept-Encoding':'gzip'}});
 expect(compressed.headers()['content-encoding']).toBe('gzip');expect(compressed.headers()['vary']).toContain('Accept-Encoding');
 expect(await compressed.json()).toEqual(await identity.json());expect((await compressed.json())[0]).toHaveProperty('body_document');
});
