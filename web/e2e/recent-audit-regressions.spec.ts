import {test,expect} from '@playwright/test';
import {expandProperties} from './property-actions';
import {openOption} from './option-actions';
const post=async(request:any,path:string,data:object)=>(await(await request.post('/api/v1'+path,{data})).json());
test('removing an option also refreshes previously visited objects before another selection',async({page,request})=>{
 const p=await post(request,'/projects',{title:'属性缓存回归'});
 const a=await post(request,`/projects/${p.id}/tasks`,{title:'删除选项对象'}),b=await post(request,`/projects/${p.id}/tasks`,{title:'已缓存对象'});
 const d=await post(request,`/projects/${p.id}/property-definitions/tasks`,{kind:'multi_select',name:'标签'});
 await request.patch(`/api/v1/property-definitions/${d.id}`,{data:{version:1,options:[{id:'old',name:'原选项'},{id:'keep',name:'保留选项'}]}});
 await request.put(`/api/v1/objects/tasks/${b.id}/custom-properties/${d.id}`,{data:{version:0,definition_version:2,value:['old']}});
 await page.goto(`/projects/${p.id}/tasks/${b.id}`);await expandProperties(page);
 await expect(page.getByLabel('属性值 标签',{exact:true})).toContainText('原选项');
 await page.getByRole('dialog').getByRole('link',{name:'任务',exact:true}).click();
 await page.getByRole('button',{name:'删除选项对象',exact:true}).click();
 const settings=await openOption(page,'标签','原选项');
 page.once('dialog',d=>d.accept());await settings.getByRole('button',{name:'删除选项',exact:true}).click();
 await expect(page.locator('.option-settings-popover:popover-open')).toHaveCount(0);
 await page.getByRole('button',{name:'关闭任务详情'}).click();
 await page.route(`**/api/v1/objects/tasks/${b.id}/custom-properties`,async route=>{await new Promise(r=>setTimeout(r,250));await route.continue();});
 await page.getByRole('button',{name:'已缓存对象',exact:true}).click();await expandProperties(page);
 await page.getByLabel('属性值 标签',{exact:true}).click();await page.getByRole('option',{name:'保留选项',exact:true}).click();
 await expect.poll(async()=>(await(await request.get(`/api/v1/objects/tasks/${b.id}/custom-properties`)).json()).fields[0].value).toEqual(['keep']);
});
test('relations stay anchored beside the trigger with many custom properties',async({page,request})=>{
 const p=await post(request,'/projects',{title:'关联定位'}),t=await post(request,`/projects/${p.id}/tasks`,{title:'关联属性'});
 await post(request,`/projects/${p.id}/pages`,{title:'可关联笔记'});
 for(let i=0;i<16;i++)await post(request,`/projects/${p.id}/property-definitions/tasks`,{kind:'text',name:'备注'+i});
 await page.goto(`/projects/${p.id}/tasks/${t.id}`);await expandProperties(page);
 const summary=page.locator('.relation-property > summary');await summary.click();
 const panel=page.getByRole('region',{name:'关联对象列表'});await expect(panel).toBeVisible();
 const s=(await summary.boundingBox())!,b=(await panel.boundingBox())!;
 expect(Math.abs(b.y-(s.y+s.height))).toBeLessThanOrEqual(12);
});
test('a relation request failure after folding reveals its actual error',async({page,request})=>{
 const p=await post(request,'/projects',{title:'关联失败恢复'}),t=await post(request,`/projects/${p.id}/tasks`,{title:'关联失败任务'});
 await post(request,`/projects/${p.id}/pages`,{title:'关联目标'});
 await page.goto(`/projects/${p.id}/tasks/${t.id}`);await expandProperties(page);
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/v1/relations/**',async route=>{if(route.request().method()==='PUT'){await gate;await route.fulfill({status:500,json:{error:{message:'关联保存失败测试'}}});}else await route.continue();});
 await page.locator('.relation-property > summary').click();await page.getByRole('button',{name:'关联 关联目标',exact:true}).click();
 await page.getByRole('button',{name:'收起属性',exact:true}).click();release();
 await expect(page.locator('.relation-popover [role="alert"]')).toBeVisible();
});
test('long project and object names keep detail breadcrumbs and close inside the dialog',async({page,request})=>{
 const p=await post(request,'/projects',{title:'很长的项目名称'.repeat(14)}),t=await post(request,`/projects/${p.id}/tasks`,{title:'很长的对象名称'.repeat(14)});
 await page.goto(`/projects/${p.id}/tasks/${t.id}`);const dialog=page.getByRole('dialog',{name:'任务详情',exact:true});await expect(dialog).toBeVisible();
 for(const width of [1261,773,390]){
  await page.setViewportSize({width,height:932});
  const box=(await dialog.boundingBox())!,close=(await page.getByRole('button',{name:'关闭任务详情'}).boundingBox())!;
  const links=await dialog.locator('header nav a,header nav [aria-current]').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return {left:b.left,right:b.right};}));
  for(const link of links){expect(link.left).toBeGreaterThanOrEqual(box.x);expect(link.right).toBeLessThanOrEqual(close.x);}
 }
});
