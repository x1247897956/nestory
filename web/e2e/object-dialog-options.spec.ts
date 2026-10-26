import {test,expect} from '@playwright/test';
import {expandProperties} from './property-actions';
import {openOption,closeOptions} from './option-actions';
const post=async(request:any,path:string,data:object)=>{const r=await request.post('/api/v1'+path,{data});expect(r.status()).toBe(201);return r.json();};
const fields=async(request:any,type:string,id:string)=>(await(await request.get(`/api/v1/objects/${type}/${id}/custom-properties`)).json()).fields;

test('all object types open centered dialogs with three-level navigation and guarded closing',async({page,request,context})=>{
 const p=await post(request,'/projects',{title:'浮层项目'});
 for(const [type,label] of [['tasks','任务'],['pages','笔记'],['events','日程']]){
  const o=await post(request,`/projects/${p.id}/${type}`,{title:`当前${label}`,...(type==='events'?{start_at:'2026-10-26T01:00:00Z',end_at:'2026-10-26T02:00:00Z'}:{})});
  await page.goto(`/projects/${p.id}`);
  await page.getByRole('link',{name:new RegExp(`当前${label}`)}).click();
  const dialog=page.getByRole('dialog',{name:`${label}详情`,exact:true});await expect(dialog).toBeVisible();
  expect(context.pages().length).toBe(1);
  await expect(dialog.getByRole('navigation',{name:'面包屑',exact:true})).toHaveText(`浮层项目/${label}/当前${label}`);
  await expect(dialog.getByRole('link',{name:/返回/})).toHaveCount(0);
  const box=await dialog.boundingBox();const viewport=page.viewportSize()!;expect(Math.abs(box!.x*2+box!.width-viewport.width)).toBeLessThan(3);
  await expandProperties(page);
  await expect(dialog.locator('.object-property-label .property-icon,.relation-property-name .property-icon').first()).toBeVisible();
  await page.screenshot({path:`/tmp/noteapp-object-dialog-${type}.png`});
  if(type==='pages'){
   await dialog.getByLabel('笔记标题',{exact:true}).fill('');
   page.once('dialog',d=>d.dismiss());await dialog.getByRole('button',{name:'关闭笔记详情',exact:true}).click();
   await expect(dialog).toBeVisible();await expect(dialog.getByLabel('笔记标题',{exact:true})).toHaveValue('');
   await dialog.getByLabel('笔记标题',{exact:true}).fill('当前笔记');await expect(dialog.getByRole('status')).toHaveText('已保存');
  }
  await dialog.getByRole('link',{name:label,exact:true}).click();await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(`/projects/${p.id}/${type}`);
 }
 await expect(page.getByText('本地 · 私有',{exact:true})).toHaveCount(0);
 await expect(page.getByText('本地空间',{exact:true})).toHaveCount(0);
});

test('option menus own colors, names and deletion; property settings delete only the custom property',async({page,request})=>{
 const p=await post(request,'/projects',{title:'设置职责'});
 const t=await post(request,`/projects/${p.id}/tasks`,{title:'编辑选项'});
 const other=await post(request,`/projects/${p.id}/tasks`,{title:'另一对象'});
 const d=await post(request,`/projects/${p.id}/property-definitions/tasks`,{kind:'multi_select',name:'标签'});
 await request.patch(`/api/v1/property-definitions/${d.id}`,{data:{version:1,options:[{id:'keep',name:'保留',color:'blue'},{id:'drop',name:'移除',color:'red'}]}});
 for(const id of [t.id,other.id])await request.put(`/api/v1/objects/tasks/${id}/custom-properties/${d.id}`,{data:{version:0,definition_version:2,value:['keep','drop']}});
 await page.goto(`/projects/${p.id}/tasks/${t.id}`);await expandProperties(page);
 const setting=await openOption(page,'标签','移除');
 await setting.getByLabel('选项名称',{exact:true}).fill('待删除');
 await setting.getByRole('button',{name:'颜色 紫色',exact:true}).click();
 await expect.poll(async()=>(await fields(request,'tasks',t.id))[0].definition.options[1].name).toBe('待删除');
 page.once('dialog',d=>d.dismiss());await setting.getByRole('button',{name:'删除选项',exact:true}).click();
 expect((await fields(request,'tasks',t.id))[0].definition.options.length).toBe(2);
 page.once('dialog',d=>d.accept());await setting.getByRole('button',{name:'删除选项',exact:true}).click();
 await expect.poll(async()=>(await fields(request,'tasks',t.id))[0].value).toEqual(['keep']);
 expect((await fields(request,'tasks',other.id))[0].value).toEqual(['keep']);
 await expect(page.getByLabel('属性值 标签',{exact:true})).toHaveText('保留');
 expect((await(await request.get(`/api/v1/tasks/${t.id}`)).json()).version).toBe(t.version);
 await page.getByRole('button',{name:'设置属性 标签',exact:true}).click();
 const property=page.getByRole('group',{name:'属性设置',exact:true});
 await expect(property.getByLabel('选项名称')).toHaveCount(0);await expect(property.getByText(/共用/)).toHaveCount(0);
 await expect(property.getByRole('button',{name:/颜色/})).toHaveCount(0);
 page.once('dialog',d=>d.accept());await property.getByRole('button',{name:'删除属性',exact:true}).click();
 await expect(page.getByRole('group',{name:'自定义属性 标签',exact:true})).toHaveCount(0);
 expect(await fields(request,'tasks',other.id)).toEqual([]);
 expect((await request.delete('/api/v1/property-definitions/stage',{data:{version:1}})).status()).toBe(404);
});

test('lost delete responses synchronize option and property removal without repeating data changes',async({page,request})=>{
 const p=await post(request,'/projects',{title:'删除确认同步'});
 const t=await post(request,`/projects/${p.id}/tasks`,{title:'删除响应丢失'});
 const d=await post(request,`/projects/${p.id}/property-definitions/tasks`,{kind:'single_select',name:'分类'});
 await request.patch(`/api/v1/property-definitions/${d.id}`,{data:{version:1,options:[{id:'a',name:'选项',color:'green'}]}});
 await request.put(`/api/v1/objects/tasks/${t.id}/custom-properties/${d.id}`,{data:{version:0,definition_version:2,value:'a'}});
 await page.goto(`/projects/${p.id}/tasks/${t.id}`);await expandProperties(page);
 await page.route(`**/api/v1/property-definitions/${d.id}/options/a`,async route=>{await route.fetch();await route.abort('failed');});
 const menu=await openOption(page,'分类','选项');page.once('dialog',d=>d.accept());await menu.getByRole('button',{name:'删除选项',exact:true}).click();
 await expect.poll(async()=>(await fields(request,'tasks',t.id))[0].value).toBeNull();
 await expect(page.getByLabel('属性值 分类',{exact:true})).toHaveText('未选择');
 await page.route(`**/api/v1/property-definitions/${d.id}`,async route=>{if(route.request().method()==='DELETE'){await route.fetch();await route.abort('failed');}else await route.continue();});
 await page.getByRole('button',{name:'设置属性 分类',exact:true}).click();page.once('dialog',d=>d.accept());
 await page.getByRole('group',{name:'属性设置',exact:true}).getByRole('button',{name:'删除属性',exact:true}).click();
 await expect(page.getByRole('group',{name:'自定义属性 分类',exact:true})).toHaveCount(0);
});

test('all selection mutation paths are disabled during an option delete',async({page,request})=>{
 const p=await post(request,'/projects',{title:'选项删除中'});
 const t=await post(request,`/projects/${p.id}/tasks`,{title:'禁止覆盖未保存选择'});
 const d=await post(request,`/projects/${p.id}/property-definitions/tasks`,{kind:'multi_select',name:'标签'});
 await request.patch(`/api/v1/property-definitions/${d.id}`,{data:{version:1,options:[{id:'a',name:'甲'},{id:'b',name:'乙'}]}});
 await request.put(`/api/v1/objects/tasks/${t.id}/custom-properties/${d.id}`,{data:{version:0,definition_version:2,value:['a']}});
 await page.goto(`/projects/${p.id}/tasks/${t.id}`);await expandProperties(page);
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 await page.route(`**/api/v1/property-definitions/${d.id}/options/a`,async route=>{const response=await route.fetch();await gate;await route.fulfill({response});});
 const menu=await openOption(page,'标签','甲');page.once('dialog',d=>d.accept());await menu.getByRole('button',{name:'删除选项',exact:true}).click();
 await expect(page.getByLabel('搜索或创建选项',{exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'清空选择',exact:true})).toBeDisabled();
 await expect(page.getByRole('option',{name:'乙',exact:true})).toBeDisabled();
 release();await expect.poll(async()=>(await fields(request,'tasks',t.id))[0].value).toBeNull();
 await expect(page.getByLabel('属性值 标签',{exact:true})).toHaveText('未选择');
});

test('reloading an option uses its fresh name before a subsequent color edit',async({page,request})=>{
 const p=await post(request,'/projects',{title:'选项并发恢复'});
 const t=await post(request,`/projects/${p.id}/tasks`,{title:'保持服务器的新名称'});
 const d=await post(request,`/projects/${p.id}/property-definitions/tasks`,{kind:'single_select',name:'分类'});
 await request.patch(`/api/v1/property-definitions/${d.id}`,{data:{version:1,options:[{id:'a',name:'旧名称',color:'blue'}]}});
 await page.goto(`/projects/${p.id}/tasks/${t.id}`);await expandProperties(page);
 const menu=await openOption(page,'分类','旧名称');
 await request.patch(`/api/v1/property-definitions/${d.id}`,{data:{version:2,options:[{id:'a',name:'服务器新名称',color:'blue'}]}});
 await menu.getByRole('button',{name:'颜色 紫色',exact:true}).click();await expect(menu.getByRole('alert')).toBeVisible();
 page.once('dialog',d=>d.accept());await menu.getByRole('button',{name:'重新载入选项',exact:true}).click();
 await expect(menu.getByLabel('选项名称',{exact:true})).toHaveValue('服务器新名称');
 await menu.getByRole('button',{name:'颜色 粉色',exact:true}).click();
 await expect.poll(async()=>(await fields(request,'tasks',t.id))[0].definition.options[0]).toMatchObject({id:'a',name:'服务器新名称',color:'pink'});
});

test('an applied option deletion stays locked until its values can be synchronized',async({page,request})=>{
 const p=await post(request,'/projects',{title:'删除后同步失败'});
 const t=await post(request,`/projects/${p.id}/tasks`,{title:'等待同步再编辑'});
 const d=await post(request,`/projects/${p.id}/property-definitions/tasks`,{kind:'multi_select',name:'标签'});
 await request.patch(`/api/v1/property-definitions/${d.id}`,{data:{version:1,options:[{id:'a',name:'待删'},{id:'b',name:'另一项'}]}});
 await request.put(`/api/v1/objects/tasks/${t.id}/custom-properties/${d.id}`,{data:{version:0,definition_version:2,value:['a']}});
 await page.goto(`/projects/${p.id}/tasks/${t.id}`);await expandProperties(page);
 const menu=await openOption(page,'标签','待删');
 const path=`**/api/v1/objects/tasks/${t.id}/custom-properties`;
 await page.route(path,route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:{message:'同步失败'}})}));
 page.once('dialog',d=>d.accept());await menu.getByRole('button',{name:'删除选项',exact:true}).click();
 await expect(menu.getByRole('alert')).toContainText('选项已删除');
 await expect(page.getByLabel('搜索或创建选项',{exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'清空选择',exact:true})).toBeDisabled();
 await page.unroute(path);await menu.getByRole('button',{name:'重新载入选项',exact:true}).click();
 await expect(page.getByLabel('属性值 标签',{exact:true})).toHaveText('未选择');
});
