import {test,expect} from '@playwright/test';
for(const type of ['tasks','pages','events'])test(`${type}: overview opens details without switching background and closes back to overview`,async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'保留汇总背景'}})).json();
 const o=await(await request.post(`/api/v1/projects/${p.id}/${type}`,{data:{title:'汇总直接打开',...(type==='events'?{start_at:'2026-10-26T01:00:00Z',end_at:'2026-10-26T02:00:00Z'}:{})}})).json();
 const base=`/projects/${p.id}`,detail=`${base}/${type}/${o.id}`;
 await page.goto(base);
 await page.locator('.project-overview').getByRole('link',{name:/汇总直接打开/}).click();
 await expect(page).toHaveURL(detail);
 await expect(page.locator('.project-overview')).toHaveCount(1);
 await expect(page.locator('.task-list,.page-tree,[aria-label="项目日历"]')).toHaveCount(0);
 const dialog=page.getByRole('dialog',{name:type==='tasks'?'任务详情':type==='pages'?'笔记详情':'日程详情',exact:true});
 await expect(dialog).toBeVisible();
 await expect(page.getByLabel(type==='tasks'?'任务标题':type==='pages'?'笔记标题':'日程标题',{exact:true})).toHaveValue(o.title);
 await page.reload();
 await expect(dialog).toBeVisible();
 await expect(page.locator('.project-overview')).toHaveCount(1);
 await page.getByRole('button',{name:/^关闭.*详情$/}).click();
 await expect(page).toHaveURL(base);
 await expect(page.getByRole('region',{name:'项目汇总'})).toBeVisible();
 await page.goBack();await expect(dialog).toBeVisible();
 await page.keyboard.press('Escape');await expect(page).toHaveURL(base);
 // A direct URL without overview navigation state keeps the normal list background.
 await page.goto(detail);await expect(dialog).toBeVisible();
 await expect(page.locator('.project-overview')).toHaveCount(0);
 await page.getByRole('button',{name:/^关闭.*详情$/}).click();
 await expect(page).toHaveURL(`${base}/${type}`);
});
