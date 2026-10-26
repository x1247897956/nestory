import {test,expect} from '@playwright/test';
test('project form uses neutral colors and preserves creation',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'新建项目',exact:true}).click();
 const form=page.getByRole('dialog',{name:'新建项目',exact:true});
 for(const width of [1261,390]){
  await page.setViewportSize({width,height:932});
  expect(await form.evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(255, 255, 255)');
  expect(await form.getByText('项目名称',{exact:true}).evaluate(e=>getComputedStyle(e).color)).toBe('rgb(98, 104, 116)');
  expect(await page.locator('.project-form-backdrop').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgba(23, 32, 51, 0.333)');
  await page.screenshot({path:`/tmp/noteapp-project-form-neutral-${width}.png`});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 }
 await form.getByLabel('项目名称').fill('统一项目表单');
 await expect(form.getByRole('button',{name:'保存项目'})).toBeEnabled();
 await form.getByRole('button',{name:'保存项目'}).click();
 await expect(form).toHaveCount(0);await expect(page).toHaveURL(/\/projects\/[^/]+$/);
});
test('empty and populated overview rows have matching height across object types',async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'行高一致'}})).json();
 await page.goto(`/projects/${p.id}`);
 await expect(page.locator('.overview-empty')).toHaveCount(3);
 const empty=await page.locator('.overview-empty').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));
 expect(empty).toEqual([64,64,64]);
 for(const type of ['tasks','pages','events'])await request.post(`/api/v1/projects/${p.id}/${type}`,{data:{title:'一项内容',...(type==='events'?{start_at:'2026-10-26T01:00:00Z',end_at:'2026-10-26T02:00:00Z'}:{})}});
 await page.reload();await expect(page.locator('.overview-card ul')).toHaveCount(3);
 for(const width of [1261,773,390]){
  await page.setViewportSize({width,height:932});
  const heights=await page.locator('.overview-card ul').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().height));
  expect(heights).toEqual(empty);
  await page.screenshot({path:`/tmp/noteapp-overview-row-height-${width}.png`});
 }
});
