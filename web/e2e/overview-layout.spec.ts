import {expandProperties} from "./property-actions";
import {test,expect} from '@playwright/test';

test('overview has one project identity and balanced create actions on narrow and wide screens',async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'项目排版验收',description:'项目说明保留'}})).json();
 await page.goto(`/projects/${p.id}`);await expandProperties(page);
 const main=page.getByRole('main');
 await expect(main.getByText(p.title,{exact:true})).toHaveCount(1);
 await expect(main.getByRole('heading',{name:p.title,exact:true})).toBeVisible();
 await expect(main.getByText(/项待推进/)).toHaveCount(0);
 await expect(main.getByText('项目说明保留',{exact:true})).toBeVisible();
 for(const width of [1261,773,390]){
  await page.setViewportSize({width,height:932});
  for(const name of ['创建任务','创建笔记','创建日程']){
   const button=main.getByRole(name==='创建任务'?'button':'link',{name,exact:true});
   expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(36);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({path:`/tmp/noteapp-overview-layout-${width}.png`,fullPage:true});
 }
});

test('notes are flat and legacy child notes remain reachable without child creation controls',async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'平铺笔记'}})).json();
 const parent=await(await request.post(`/api/v1/projects/${p.id}/pages`,{data:{title:'原父笔记'}})).json();
 const child=await(await request.post(`/api/v1/projects/${p.id}/pages`,{data:{title:'已有子笔记',parent_id:parent.id}})).json();
 await page.goto(`/projects/${p.id}/pages`);await expandProperties(page);
 await expect(page.getByRole('button',{name:/新建子笔记/})).toHaveCount(0);
 const rows=page.locator('.page-list-row');await expect(rows).toHaveCount(2);
 const pads=await rows.evaluateAll(items=>items.map(item=>getComputedStyle(item).paddingLeft));expect(new Set(pads).size).toBe(1);
 await page.getByRole('link',{name:'已有子笔记',exact:true}).click();
 await expect(page).toHaveURL(`/projects/${p.id}/pages/${child.id}`);
 await expect(page.getByLabel('笔记标题',{exact:true})).toHaveValue('已有子笔记');
});

test('intrinsic and custom property values use the same aligned column',async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'属性对齐'}})).json();
 const t=await(await request.post(`/api/v1/projects/${p.id}/tasks`,{data:{title:'属性排版任务'}})).json();
 await request.post(`/api/v1/projects/${p.id}/property-definitions/tasks`,{data:{kind:'text',name:'补充说明'}});
 await page.goto(`/projects/${p.id}/tasks/${t.id}`);await expandProperties(page);
 for(const width of [1261,773,390]){
  await page.setViewportSize({width,height:932});
  const stage=await page.locator('.object-property-cell[data-property="stage"] > .task-property').boundingBox();
  const priority=await page.locator('.object-property-cell[data-property="priority"] > .task-property').boundingBox();
  await expandProperties(page);
  const custom=await page.getByLabel('属性值 补充说明',{exact:true}).boundingBox();
  expect(Math.abs(stage!.x-priority!.x)).toBeLessThan(2);
  expect(Math.abs(stage!.x-custom!.x)).toBeLessThan(8);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({path:`/tmp/noteapp-properties-layout-${width}.png`,fullPage:true});
 }
});
