import {openOption,closeOptions} from "./option-actions";
import {test,expect} from '@playwright/test';
import {expandProperties} from './property-actions';
const post=async(request:any,path:string,data:object)=>{const r=await request.post('/api/v1'+path,{data});expect(r.status()).toBe(201);return r.json();};
const fields=async(request:any,id:string)=>(await(await request.get(`/api/v1/objects/tasks/${id}/custom-properties`)).json()).fields;

test('properties start collapsed, have aligned gutters and preserve saving when collapsed',async({page,request})=>{
 const p=await post(request,'/projects',{title:'收起属性'});
 const t=await post(request,`/projects/${p.id}/tasks`,{title:'只编辑当前任务'});
 await post(request,`/projects/${p.id}/property-definitions/tasks`,{kind:'text',name:'备注'});
 await page.goto(`/projects/${p.id}/tasks/${t.id}`);
 await expect(page.getByRole('button',{name:'展开属性',exact:true})).toHaveAttribute('aria-expanded','false');
 await expect(page.getByRole('button',{name:'添加任务',exact:true})).toHaveCount(0);
 await expect(page.getByLabel('阶段',{exact:true})).toBeHidden();
 await expandProperties(page);
 await page.getByLabel('属性值 备注',{exact:true}).fill('收起期间也不丢失');
 await page.getByRole('button',{name:'收起属性',exact:true}).click();
 await expect.poll(async()=>(await fields(request,t.id))[0].value).toBe('收起期间也不丢失');
 await page.reload();await expect(page.getByRole('button',{name:'展开属性',exact:true})).toBeVisible();
 await expandProperties(page);
 for(const width of [1261,773,390]){
  await page.setViewportSize({width,height:932});
  const label=await page.locator('.object-property-cell[data-property="stage"] > .object-property-label').evaluate(el=>{const r=document.createRange();r.selectNodeContents(el.lastChild!);return r.getBoundingClientRect().x;});
  await expandProperties(page);
  const relation=await page.locator('.relation-property-name').evaluate(el=>{const r=document.createRange();r.selectNodeContents(el.lastChild!);return r.getBoundingClientRect().x;});
  const stage=await page.getByLabel('阶段',{exact:true}).boundingBox();
  const value=await page.getByLabel('属性值 备注',{exact:true}).boundingBox();
  expect(Math.abs(label-relation)).toBeLessThan(2);
  const nativeRow=await page.locator('.object-property-cell[data-property="stage"]').boundingBox();
  const customRow=await page.locator('.custom-property-entry').first().boundingBox();
  expect(Math.abs((stage!.x-nativeRow!.x)-(value!.x-customRow!.x))).toBeLessThan(2);
  await expect(page.locator('.object-property-label .property-icon').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({path:`/tmp/noteapp-property-controls-${width}.png`,fullPage:true});
 }
});

test('reuse note properties in tasks with independent values and editable option colors',async({page,request})=>{
 const p=await post(request,'/projects',{title:'复用属性'});
 const t=await post(request,`/projects/${p.id}/tasks`,{title:'接收属性'});
 const other=await post(request,`/projects/${p.id}/tasks`,{title:'自动获得定义'});
 const n=await post(request,`/projects/${p.id}/pages`,{title:'来源笔记'});
 const text=await post(request,`/projects/${p.id}/property-definitions/pages`,{kind:'text',name:'备注'});
 const multi=await post(request,`/projects/${p.id}/property-definitions/pages`,{kind:'multi_select',name:'标签'});
 const r=await request.patch(`/api/v1/property-definitions/${multi.id}`,{data:{version:1,options:[{id:'blue-option',name:'阅读',color:'blue'},{id:'green-option',name:'完成',color:'green'}]}});expect(r.status()).toBe(200);
 await request.put(`/api/v1/objects/pages/${n.id}/custom-properties/${text.id}`,{data:{version:0,definition_version:1,value:'仅来源笔记的值'}});
 await page.goto(`/projects/${p.id}/tasks/${t.id}`);await expandProperties(page);
 for(const name of ['备注','标签']){
  await page.getByRole('button',{name:'添加属性',exact:true}).click();
  await page.getByRole('button',{name:`复用 ${name}（笔记）`,exact:true}).click();
  await expect(page.getByRole('group',{name:`自定义属性 ${name}`,exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
 }
 const imported=await fields(request,t.id);expect(imported.map((f:any)=>f.value)).toEqual([null,null]);
 expect((await fields(request,other.id)).length).toBe(2);
 await page.getByLabel('属性值 标签',{exact:true}).click();
 await page.getByRole('option',{name:'阅读',exact:true}).click();await closeOptions(page);
 await expect(page.getByLabel('属性值 标签',{exact:true}).locator('.property-tag')).toHaveAttribute('data-color','blue');
 const settings=await openOption(page,'标签','阅读');
 await settings.getByRole('button',{name:'颜色 紫色',exact:true}).click();
 await expect.poll(async()=>(await fields(request,t.id)).find((f:any)=>f.definition.name==='标签').definition.options[0].color).toBe('purple');
 await page.keyboard.press('Escape');
 await expect(page.getByLabel('属性值 标签',{exact:true}).locator('.property-tag')).toHaveAttribute('data-color','purple');
 await page.reload();await expandProperties(page);
 await expect(page.getByLabel('属性值 标签',{exact:true}).locator('.property-tag')).toHaveAttribute('data-color','purple');
 const source=await(await request.get(`/api/v1/projects/${p.id}/property-definitions/pages`)).json();expect(source.definitions.find((d:any)=>d.id===multi.id).options[0].color).toBe('blue');
 await page.getByRole('button',{name:'添加属性',exact:true}).click();
 await expect(page.getByRole('button',{name:'复用 备注（笔记）',exact:true})).toHaveCount(0);
 await page.screenshot({path:'/tmp/noteapp-property-reuse.png'});
});

test('single-select colors and the default fold apply to notes and events too',async({page,request})=>{
 const p=await post(request,'/projects',{title:'所有对象属性'});
 const n=await post(request,`/projects/${p.id}/pages`,{title:'单选笔记'});
 const e=await post(request,`/projects/${p.id}/events`,{title:'默认折叠日程',start_at:'2026-10-26T01:00:00Z',end_at:'2026-10-26T02:00:00Z'});
 const d=await post(request,`/projects/${p.id}/property-definitions/pages`,{kind:'single_select',name:'分类'});
 expect((await request.patch(`/api/v1/property-definitions/${d.id}`,{data:{version:1,options:[{id:'review',name:'待审核',color:'red'}]}})).status()).toBe(200);
 await page.goto(`/projects/${p.id}/pages/${n.id}`);
 await expect(page.getByRole('button',{name:'展开属性',exact:true})).toHaveAttribute('aria-expanded','false');
 await expandProperties(page);
 await page.getByLabel('属性值 分类',{exact:true}).click();await page.getByRole('option',{name:'待审核',exact:true}).click();
 await expect(page.getByLabel('属性值 分类',{exact:true}).locator('.property-tag')).toHaveAttribute('data-color','red');
 const setting=await openOption(page,'分类','待审核');
 await setting.getByRole('button',{name:'颜色 绿色',exact:true}).click();
 await expect.poll(async()=>(await(await request.get(`/api/v1/projects/${p.id}/property-definitions/pages`)).json()).definitions[0].options[0].color).toBe('green');
 await closeOptions(page);await expect(page.getByLabel('属性值 分类',{exact:true}).locator('.property-tag')).toHaveAttribute('data-color','green');
 await page.goto(`/projects/${p.id}/events/${e.id}`);
 await expect(page.getByRole('button',{name:'展开属性',exact:true})).toHaveAttribute('aria-expanded','false');
 await expect(page.getByLabel('开始时间',{exact:true})).toBeHidden();
});

test('a definition save failure after folding reopens visible draft recovery controls',async({page,request})=>{
 const p=await post(request,'/projects',{title:'折叠后保存错误'});
 const t=await post(request,`/projects/${p.id}/tasks`,{title:'保留颜色草稿'});
 const d=await post(request,`/projects/${p.id}/property-definitions/tasks`,{kind:'multi_select',name:'标签'});
 await request.patch(`/api/v1/property-definitions/${d.id}`,{data:{version:1,options:[{id:'a',name:'选项',color:'blue'}]}});
 await page.goto(`/projects/${p.id}/tasks/${t.id}`);await expandProperties(page);
 await page.route(`**/api/v1/property-definitions/${d.id}`,route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:{message:'颜色保存失败'}})}));
 const settings=await openOption(page,'标签','选项');
 await settings.getByRole('button',{name:'颜色 粉色',exact:true}).click();
 await page.getByRole('button',{name:'收起属性',exact:true}).click();
 await expect(settings).toBeVisible();
 await expect(settings.getByRole('alert')).toContainText('颜色保存失败');
 await expect(settings.getByRole('button',{name:'颜色 粉色',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.unroute(`**/api/v1/property-definitions/${d.id}`);
 await settings.getByRole('button',{name:'重试保存',exact:true}).click();
 await expect.poll(async()=>(await fields(request,t.id))[0].definition.options[0].color).toBe('pink');
});
