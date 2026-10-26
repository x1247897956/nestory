import {expandProperties} from "./property-actions";
import { archiveCurrentProject } from "./project-actions";
import { test, expect } from '@playwright/test';

test('project opens overview and links to tasks pages and events', async ({page, request}) => {
  const p = await (await request.post('/api/v1/projects', {data:{title:'项目汇总 '+Date.now()}})).json();
  const t = await (await request.post(`/api/v1/projects/${p.id}/tasks`, {data:{title:'推进实现'}})).json();
  const n = await (await request.post(`/api/v1/projects/${p.id}/pages`, {data:{title:'产品方案'}})).json();
  const e = await (await request.post(`/api/v1/projects/${p.id}/events`, {data:{title:'方案评审',start_at:'2026-10-24T09:00:00+08:00',end_at:'2026-10-24T10:00:00+08:00'}})).json();
  await page.goto(`/projects/${p.id}`);await expandProperties(page);
  await expect(page.getByRole('region',{name:'项目汇总'})).toBeVisible();
  await expect(page.getByRole('link',{name:'汇总',exact:true})).toHaveAttribute('aria-current','page');
  const taskLink = page.getByRole('link',{name:/推进实现/});
  await taskLink.click();
  await expect(page).toHaveURL(new RegExp(`/tasks/${t.id}$`));
  await page.getByRole('link',{name:'汇总',exact:true}).click();
  await page.getByRole('link',{name:/产品方案/}).click();
  await expect(page).toHaveURL(new RegExp(`/pages/${n.id}$`));
  await page.getByRole('link',{name:'汇总',exact:true}).click();
  await page.getByRole('link',{name:/方案评审/}).click();
  await expect(page).toHaveURL(new RegExp(`/events/${e.id}$`));
  await page.getByRole('link',{name:'汇总',exact:true}).click();
  await page.reload();await expandProperties(page);
  await expect(page.getByRole('region',{name:'项目汇总'})).toBeVisible();
  await expect(page.getByRole('button',{name:'添加任务',exact:true})).toHaveCount(0);
  await page.getByRole('link',{name:"任务",exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${p.id}/tasks$`));
  const filtersBox = await page.getByLabel('筛选优先级').boundingBox();
  expect((await page.getByRole('button',{name:'添加任务',exact:true}).boundingBox())!.y).toBeLessThan(filtersBox!.y);
  await page.getByRole('link',{name:'汇总',exact:true}).click();
  await archiveCurrentProject(page);
  await expect(page.getByRole('button',{name:'添加任务',exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:/推进实现/})).toBeVisible();
});

test('empty project overview offers clear entry points',async({page,request})=>{
  const p=await(await request.post('/api/v1/projects',{data:{title:'空项目 '+Date.now()}})).json();
  await page.goto(`/projects/${p.id}`);await expandProperties(page);
  await expect(page.getByRole('region',{name:'项目汇总'})).toBeVisible();
  await expect(page.getByText('暂无任务，添加第一项行动。')).toBeVisible();
  await expect(page.getByText('暂无笔记，记录第一份想法。')).toBeVisible();
  await expect(page.getByText('暂无日程，为项目安排时间。')).toBeVisible();
});
