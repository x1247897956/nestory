import {test,expect} from '@playwright/test';

for (const type of ['tasks','pages','events'] as const) {
 test(`${type}: collection fetches only attributes and details preserve the complete block document`,async({page,request})=>{
  const p=await(await request.post('/api/v1/projects',{data:{title:`Properties ${type}`}})).json();
  const text=`Preserved native body ${type}`;
  const doc={version:1,blocks:[{id:'body',type:'paragraph',content:[{type:'text',text,styles:{}}]}]};
  const date=new Date().toISOString().slice(0,10);
  const obj=await(await request.post(`/api/v1/projects/${p.id}/${type}`,{data:{title:`Object ${type}`,body_document:doc,...(type==='events'?{start_at:`${date}T09:00:00Z`,end_at:`${date}T10:00:00Z`}:{})}})).json();
  const response=page.waitForResponse(r=>new URL(r.url()).pathname===`/api/v1/projects/${p.id}/${type}`&&r.request().method()==='GET');
  await page.goto(`/projects/${p.id}/${type}`);
  const collection=await response;
  expect(new URL(collection.url()).searchParams.get('include_body')).toBe('false');
  const items=await collection.json();
  expect(items.find((item:{id:string})=>item.id===obj.id)).not.toHaveProperty('body_document');
  await page.goto(`/projects/${p.id}/${type}/${obj.id}`);
  const editor=page.getByRole('textbox',{name:'Markdown 正文',exact:true});
  await expect(editor).toContainText(text);
  await editor.fill(`Edited ${text}`);
  await expect.poll(async()=>JSON.stringify((await(await request.get(`/api/v1/${type}/${obj.id}`)).json()).body_document)).toContain(`Edited ${text}`);
  await page.reload();await expect(editor).toContainText(`Edited ${text}`);
 });
}
