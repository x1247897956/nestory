import {test,expect} from '@playwright/test';
import {expandProperties} from './property-actions';
test('properties flow in two equal columns with a shared value inset and adapt to one column',async({page,request})=>{
 const post=async(path:string,data:object)=>(await(await request.post('/api/v1'+path,{data})).json());
 const p=await post('/projects',{title:'两列属性排版'});
 const t=await post(`/projects/${p.id}/tasks`,{title:'属性面板'});
 for(const [kind,name] of [['text','备注'],['url','网址'],['multi_select','标签'],['single_select','分类']])await post(`/projects/${p.id}/property-definitions/tasks`,{kind,name});
 await page.goto(`/projects/${p.id}/tasks/${t.id}`);await expandProperties(page);
 await expect(page.locator('.custom-property-entry')).toHaveCount(4);
 for(const width of [1261,773,390]){
  await page.setViewportSize({width,height:932});
  const native=await page.locator('.object-property-cell').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width};}));
  const custom=await page.locator('.custom-property-entry').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width};}));
  const rows=[...native,...custom];
  if(width===1261){expect(Math.abs(rows[0].y-rows[1].y)).toBeLessThan(2);expect(rows[1].x-rows[0].x).toBeGreaterThan(350);expect(Math.abs(rows[0].width-rows[1].width)).toBeLessThan(2);expect(custom[0].x).toBeCloseTo(rows[1].x,0);}
  else expect(new Set(rows.map(r=>Math.round(r.x))).size).toBe(1);
  const offsets=await page.locator('.object-property-cell:not([data-property="relations"]),.custom-property-entry').evaluateAll(es=>es.map(e=>{const v=e.querySelector('.task-property,.custom-property-value')!;return v.getBoundingClientRect().x-e.getBoundingClientRect().x;}));
  expect(Math.max(...offsets)-Math.min(...offsets)).toBeLessThan(1);
  const relation=await page.locator('.relation-property-value').boundingBox();
  const relationRow=await page.locator('[data-property="relations"]').boundingBox();
  expect(Math.abs(relation!.x-relationRow!.x-offsets[0])).toBeLessThan(1);
  const count=await page.locator('.relation-count').boundingBox();
  expect(Math.abs(count!.x-relation!.x)).toBeLessThan(1);
  const textarea=page.getByLabel('属性值 备注',{exact:true});await textarea.fill('多行备注\n第二行\n第三行');
  await expect(page.locator('.object-dialog')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({path:`/tmp/noteapp-property-grid-${width}.png`});
 }
});
test('workspace project and detail headers share one compact navigation rhythm',async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'统一顶部'}})).json();
 for(const path of ['/','/search','/trash',`/projects/${p.id}`,`/projects/${p.id}/tasks`,`/projects/${p.id}/pages`,`/projects/${p.id}/events`]){
  await page.goto(path);const bar=page.locator('.topbar');await expect(bar).toBeVisible();
  expect((await bar.boundingBox())!.height).toBe(56);
  expect(await bar.locator('nav').evaluate(e=>getComputedStyle(e).fontSize)).toBe('13px');
  await expect(bar.getByRole('navigation',{name:'面包屑'})).toBeVisible();
  const typography=await bar.locator('nav a,nav span,nav h1').evaluateAll(es=>es.map(e=>{const s=getComputedStyle(e);return [s.fontSize,s.fontWeight,s.lineHeight].join('/');}));
  expect(new Set(typography)).toEqual(new Set(['13px/400/24px']));
 }
 await page.goto(`/projects/${p.id}`);await page.screenshot({path:'/tmp/noteapp-unified-header.png'});
});

test('every detail breadcrumb level uses identical typography on desktop and mobile',async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'导航字号一致'}})).json();
 for(const type of ['tasks','pages','events']){
  const object=await(await request.post(`/api/v1/projects/${p.id}/${type}`,{data:{title:'当前对象',...(type==='events'?{start_at:'2026-10-26T01:00:00Z',end_at:'2026-10-26T02:00:00Z'}:{})}})).json();
  await page.goto(`/projects/${p.id}/${type}/${object.id}`);
  const nav=page.getByRole('dialog',{name:type==='tasks'?'任务详情':type==='pages'?'笔记详情':'日程详情',exact:true}).getByRole('navigation',{name:'面包屑'});
  await expect(nav.locator('[aria-current="page"]')).toHaveText('当前对象');
  for(const width of [1261,390]){
   await page.setViewportSize({width,height:932});
   const styles=await nav.locator('a,span').evaluateAll(es=>es.map(e=>{const s=getComputedStyle(e);return [s.fontSize,s.fontWeight,s.lineHeight].join('/');}));
   expect(new Set(styles)).toEqual(new Set(['13px/400/24px']));
   await page.screenshot({path:`/tmp/noteapp-breadcrumb-${type}-${width}.png`});
  }
 }
});
