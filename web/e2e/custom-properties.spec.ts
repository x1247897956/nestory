import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { archiveCurrentProject } from './project-actions';
const post=async(request:APIRequestContext,path:string,data:object)=>{
 const response=await request.post('/api/v1'+path,{data});expect(response.status()).toBe(201);return response.json();
};
const fields=async(request:APIRequestContext,kind:string,id:string)=>(await(await request.get(`/api/v1/objects/${kind}/${id}/custom-properties`)).json()).fields;
async function add(page:Page,type:string,name:string) {
 await page.getByRole('button',{name:'添加属性',exact:true}).click();
 await page.getByRole('group',{name:'选择属性类型',exact:true}).getByRole('button',{name:type,exact:true}).click();
 const settings=page.getByRole('group',{name:'属性设置',exact:true});
 await expect(settings).toBeVisible();
 await settings.getByRole('textbox',{name:'属性名称',exact:true}).fill(name);
 const field=page.getByRole('group',{name:`自定义属性 ${name}`,exact:true});
 await expect(field).toBeVisible();
 await settings.getByRole('textbox',{name:'属性名称',exact:true}).press('Escape');
 return field;
}
async function options(page:Page,name:string,values:string[]) {
 await page.getByRole('button',{name:`设置属性 ${name}`,exact:true}).click();
 const settings=page.getByRole('group',{name:'属性设置',exact:true});
 for(const value of values) {
  await settings.getByLabel('新选项名称',{exact:true}).fill(value);
  await settings.getByRole('button',{name:'添加选项',exact:true}).click();
 }
 await expect(settings.getByLabel(`选项名称 ${values.length}`,{exact:true})).toHaveValue(values.at(-1)!);
 await expect(settings.getByText('未保存',{exact:true})).toHaveCount(0);
 await settings.getByLabel('新选项名称',{exact:true}).press('Escape');
}

test('type-first shared definitions, all four values, independent notes and stable option IDs',async({page,request})=>{
 test.setTimeout(90000);
 const project=await post(request,'/projects',{title:'自定义属性'});
 const a=await post(request,`/projects/${project.id}/pages`,{title:'笔记甲'});
 const b=await post(request,`/projects/${project.id}/pages`,{title:'笔记乙'});
 const task=await post(request,`/projects/${project.id}/tasks`,{title:'不继承笔记字段'});
 await page.goto(`/projects/${project.id}/pages/${a.id}`);
 const text=await add(page,'文本','备注');
 await text.getByLabel('属性值 备注',{exact:true}).fill('仅属于笔记甲\n保留换行');
 await expect.poll(async()=>(await fields(request,'pages',a.id))[0].value).toBe('仅属于笔记甲\n保留换行');
 const single=await add(page,'单选','分类');await options(page,'分类',['研究','生活']);
 const multi=await add(page,'多选','标签');await options(page,'标签',['论文','待阅读']);
 const url=await add(page,'网址','参考网址');
 await url.getByLabel('属性值 参考网址').fill('javascript:alert(1)');
 await expect(url.getByText(/请输入完整HTTP/)).toBeVisible();
 await expect(url.getByRole('link')).toHaveCount(0);
 await url.getByLabel('属性值 参考网址').fill('https://example.com/reference');
 const defs=await fields(request,'pages',a.id);
 const classification=defs.find((f:any)=>f.definition.name==='分类').definition;
 const tags=defs.find((f:any)=>f.definition.name==='标签').definition;
 await single.getByLabel('属性值 分类').selectOption(classification.options[0].id);
 await multi.getByLabel('属性值 标签').click();
 await multi.getByRole('checkbox',{name:'论文',exact:true}).check();
 await multi.getByRole('checkbox',{name:'待阅读',exact:true}).check();
 await expect.poll(async()=>{
  const values=await fields(request,'pages',a.id);return values.filter((f:any)=>f.value!==null).length;
 }).toBe(4);
 const native=await(await request.get(`/api/v1/pages/${a.id}`)).json();expect(native.version).toBe(a.version);
 expect((await fields(request,'pages',b.id)).map((f:any)=>f.value)).toEqual([null,null,null,null]);
 expect(await fields(request,'tasks',task.id)).toEqual([]);
 const c=await post(request,`/projects/${project.id}/pages`,{title:'新建也继承'});
 expect((await fields(request,'pages',c.id)).length).toBe(4);
 await page.getByRole('button',{name:'设置属性 分类',exact:true}).click();
 const settings=page.getByRole('group',{name:'属性设置',exact:true});
 await settings.getByLabel('选项名称 1',{exact:true}).fill('研究资料');
 await expect.poll(async()=>{
  const value=(await fields(request,'pages',a.id)).find((f:any)=>f.definition.id===classification.id);return value.definition.options[0].name;
 }).toBe('研究资料');
 await settings.getByLabel('选项名称 1',{exact:true}).press('Escape');
 expect((await fields(request,'pages',a.id)).find((f:any)=>f.definition.id===classification.id).value).toBe(classification.options[0].id);
 await page.reload();
 await expect(page.getByLabel('属性值 备注')).toHaveValue('仅属于笔记甲\n保留换行');
 await expect(page.getByLabel('属性值 分类')).toHaveValue(classification.options[0].id);
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.screenshot({animations:'disabled',fullPage:true,path:'/tmp/noteapp-custom-properties-mobile.png'});
 await page.setViewportSize({width:1261,height:932});
 await page.screenshot({animations:'disabled',fullPage:true,path:'/tmp/noteapp-custom-properties-desktop.png'});
 await page.goto(`/projects/${project.id}/pages/${b.id}`);
 await page.getByLabel('属性值 备注').fill('笔记乙独立值');
 await expect.poll(async()=>(await fields(request,'pages',b.id))[0].value).toBe('笔记乙独立值');
 expect((await fields(request,'pages',a.id))[0].value).toBe('仅属于笔记甲\n保留换行');
});

test('value conflicts preserve input, forced-close recovery saves, archive stays read-only',async({page,context,request})=>{
 const p=await post(request,'/projects',{title:'属性草稿'});
 const n=await post(request,`/projects/${p.id}/pages`,{title:'独立属性草稿'});
 const d=await post(request,`/projects/${p.id}/property-definitions/pages`,{kind:'text',name:'备注'});
 const endpoint=`/api/v1/objects/pages/${n.id}/custom-properties/${d.id}`;
 const path=`/projects/${p.id}/pages/${n.id}`;
 await page.goto(path);await expect(page.getByLabel('属性值 备注')).toBeVisible();
 expect((await request.put(endpoint,{data:{version:0,definition_version:1,value:'他人保存'}})).status()).toBe(200);
 await page.getByLabel('属性值 备注').fill('本机输入');
 const field=page.getByRole('group',{name:'自定义属性 备注',exact:true});
 await expect(field.getByRole('alert')).toContainText('属性值已更新');
 await expect(page.getByLabel('属性值 备注')).toHaveValue('本机输入');
 page.once('dialog',dialog=>dialog.accept());
 await field.getByRole('button',{name:'重新载入属性',exact:true}).click();
 await expect(page.getByLabel('属性值 备注')).toHaveValue('他人保存');
 await page.route('**'+endpoint,async route=>route.request().method()==='PUT'?route.abort('failed'):route.continue());
 await page.getByLabel('属性值 备注').fill('强制关页后保留');
 await expect(field.getByRole('alert')).toBeVisible();
 await page.close({runBeforeUnload:false});
 const restored=await context.newPage();await restored.goto(path);
 const recovered=restored.getByRole('group',{name:'自定义属性 备注',exact:true});
 await expect(restored.getByLabel('属性值 备注')).toHaveValue('强制关页后保留');
 await recovered.getByRole('button',{name:'恢复本机草稿',exact:true}).click();
 await expect.poll(async()=>(await fields(request,'pages',n.id))[0].value).toBe('强制关页后保留');
 await expect(recovered.getByText('未保存',{exact:true})).toHaveCount(0);
 await archiveCurrentProject(restored);
 await expect(restored.getByRole('button',{name:'添加属性',exact:true})).toHaveCount(0);
 await expect(restored.getByLabel('属性值 备注')).toBeDisabled();
});

test('lost definition response retries the same creation, task and event fields use the same UI',async({page,request})=>{
 const p=await post(request,'/projects',{title:'幂等属性'});
 const n=await post(request,`/projects/${p.id}/tasks`,{title:'任务属性'});
 let lose=true;
 await page.route(`**/api/v1/projects/${p.id}/property-definitions/tasks`,async route=>{
  if(route.request().method()==='POST'&&lose){lose=false;await route.fetch();await route.abort('failed');}else await route.continue();
 });
 await page.goto(`/projects/${p.id}/tasks/${n.id}`);
 await page.getByRole('button',{name:'添加属性',exact:true}).click();
 await page.getByRole('group',{name:'选择属性类型',exact:true}).getByRole('button',{name:'文本',exact:true}).click();
 await page.getByRole('button',{name:'重试添加属性',exact:true}).click();
 await expect(page.getByRole('group',{name:'属性设置',exact:true})).toBeVisible();
 expect((await fields(request,'tasks',n.id)).length).toBe(1);
 await page.getByRole('group',{name:'属性设置',exact:true}).getByLabel('属性名称',{exact:true}).press('Escape');
 await page.getByLabel('属性值 文本').fill('任务值');
 await expect.poll(async()=>(await fields(request,'tasks',n.id))[0].value).toBe('任务值');
 const e=await post(request,`/projects/${p.id}/events`,{title:'日程属性',start_at:'2026-10-26T01:00:00Z',end_at:'2026-10-26T02:00:00Z'});
 await page.goto(`/projects/${p.id}/events/${e.id}`);
 const field=await add(page,'文本','备注');await field.getByLabel('属性值 备注').fill('日程值');
 await expect.poll(async()=>(await fields(request,'events',e.id))[0].value).toBe('日程值');
});


test('another note can save its own value after a shared definition is edited in a different tab',async({page,context,request})=>{
 const p=await post(request,'/projects',{title:'跨笔记定义更新'});
 const a=await post(request,`/projects/${p.id}/pages`,{title:'定义编辑页'});
 const b=await post(request,`/projects/${p.id}/pages`,{title:'值编辑页'});
 const d=await post(request,`/projects/${p.id}/property-definitions/pages`,{kind:'text',name:'备注'});
 await page.goto(`/projects/${p.id}/pages/${a.id}`);
 const other=await context.newPage();await other.goto(`/projects/${p.id}/pages/${b.id}`);
 await expect(other.getByLabel('属性值 备注')).toBeVisible();
 await page.getByRole('button',{name:'设置属性 备注',exact:true}).click();
 await page.getByRole('group',{name:'属性设置',exact:true}).getByLabel('属性名称',{exact:true}).fill('补充说明');
 await expect.poll(async()=>(await fields(request,'pages',a.id))[0].definition.name).toBe('补充说明');
 const field=other.locator(`[data-custom-property="${d.id}"]`);
 await field.getByRole('textbox').fill('此笔记自己的内容');
 await expect.poll(async()=>(await fields(request,'pages',b.id))[0].value).toBe('此笔记自己的内容');
 await expect(field.getByRole('textbox')).toHaveValue('此笔记自己的内容');
 expect((await fields(request,'pages',a.id))[0].value).toBeNull();
});


test('an unopened shared settings draft in another tab never blocks this note value or navigation',async({page,context,request})=>{
 const p=await post(request,'/projects',{title:'未打开的共享设置'});
 const a=await post(request,`/projects/${p.id}/pages`,{title:'设置草稿'});
 const b=await post(request,`/projects/${p.id}/pages`,{title:'独立填写'});
 const d=await post(request,`/projects/${p.id}/property-definitions/pages`,{kind:'text',name:'备注'});
 await page.goto(`/projects/${p.id}/pages/${a.id}`);
 await page.route(`**/api/v1/property-definitions/${d.id}`,async route=>route.abort('failed'));
 await page.getByRole('button',{name:'设置属性 备注',exact:true}).click();
 const settings=page.getByRole('group',{name:'属性设置',exact:true});
 await settings.getByLabel('属性名称',{exact:true}).fill('未提交的新名称');
 await expect(settings.getByRole('alert')).toBeVisible();
 const other=await context.newPage();await other.goto(`/projects/${p.id}/pages/${b.id}`);
 await other.getByLabel('属性值 备注').fill('不受设置草稿影响');
 await expect.poll(async()=>(await fields(request,'pages',b.id))[0].value).toBe('不受设置草稿影响');
 let prompted=false;other.on('dialog',async dialog=>{prompted=true;await dialog.dismiss();});
 await other.getByRole('link',{name:'工作台',exact:true}).click();
 await expect(other).toHaveURL('/');expect(prompted).toBe(false);
});
