import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { paragraphs } from './block-fixtures';
import { archiveCurrentProject } from './project-actions';

async function project(request: APIRequestContext, title: string) {
  const response = await request.post('/api/v1/projects', { data: { title } });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function task(request: APIRequestContext, projectId: string, data: object) {
  const response = await request.post(`/api/v1/projects/${projectId}/tasks`, { data });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
const views = (page: Page) => page.getByRole('group', { name: '任务视图', exact: true });
const board = (page: Page) => page.getByRole('region', { name: '任务看板', exact: true });
const column = (page: Page, stage: string) => board(page).getByRole('region', { name: `${stage}看板列`, exact: true });
const card = (page: Page, id: string) => board(page).locator(`article[data-task-id="${id}"]`);
async function openBoard(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}/tasks`);
  await views(page).getByRole('button', { name: '看板', exact: true }).click();
  await expect(board(page)).toBeVisible();
}

test('view preference survives details and refresh and is scoped to each project', async ({ page, request }) => {
  const first = await project(request, 'View preference A');
  const second = await project(request, 'View preference B');
  const item = await task(request, first.id, { title: 'Open from board' });
  await page.goto(`/projects/${first.id}/tasks`);
  await expect(views(page).getByRole('button', { name: '列表', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await views(page).getByRole('button', { name: '看板', exact: true }).click();
  await card(page, item.id).getByRole('button', { name: '打开任务 Open from board', exact: true }).click();
  await page.getByRole('button', { name: '关闭任务详情', exact: true }).click();
  await expect(board(page)).toBeVisible();
  await page.reload();
  await expect(views(page).getByRole('button', { name: '看板', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.goto(`/projects/${second.id}/tasks`);
  await expect(views(page).getByRole('button', { name: '列表', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.goto(`/projects/${first.id}/tasks`);
  await expect(board(page)).toBeVisible();
});

test('board moves independent parent and child through native drag and select and shares the priority filter', async ({ page, request }) => {
  const p = await project(request, 'Independent board stages');
  const parent = await task(request, p.id, { title: 'Board parent', priority: 'high', body_document: paragraphs('Preserve body'), due_date: '2026-12-31' });
  const child = await task(request, p.id, { title: 'Board child', parent_id: parent.id, priority: 'low' });
  await openBoard(page, p.id);
  for (const [label, stage] of [['Todo', 'todo'], ['InPlan', 'in_plan'], ['InProcess', 'in_process'], ['Done', 'done'], ['Cancelled', 'cancelled']]) {
    await expect(column(page, label)).toHaveAttribute('data-stage', stage);
  }
  await page.screenshot({path:'/tmp/noteapp-task-board-desktop.png'});
  await card(page, parent.id).dragTo(column(page, 'InProcess'));
  await expect(column(page, 'InProcess').locator(`article[data-task-id="${parent.id}"]`)).toBeVisible();
  expect(await (await request.get(`/api/v1/tasks/${parent.id}`)).json()).toMatchObject({ stage: 'in_process', priority: 'high', due_date: '2026-12-31', body_document: parent.body_document });
  expect(await (await request.get(`/api/v1/tasks/${child.id}`)).json()).toMatchObject({ stage: 'todo', version: child.version, parent_id: parent.id });
  await card(page, child.id).getByLabel('更改看板阶段 Board child', { exact: true }).selectOption('done');
  await expect(column(page, 'Done').locator(`article[data-task-id="${child.id}"]`)).toBeVisible();
  await expect(card(page, parent.id)).toHaveCount(1);
  await expect(card(page, child.id)).toHaveCount(1);
  expect((await (await request.get(`/api/v1/tasks/${child.id}`)).json()).stage).toBe('done');
  await page.reload();
  await expect(column(page, 'InProcess').locator(`article[data-task-id="${parent.id}"]`)).toBeVisible();
  await expect(column(page, 'Done').locator(`article[data-task-id="${child.id}"]`)).toBeVisible();
  await page.getByRole('combobox', {name:'筛选优先级', exact:true}).selectOption('high');
  await expect(card(page, child.id)).toHaveCount(0);
  await expect(card(page, parent.id)).toBeVisible();
  await views(page).getByRole('button', { name: '列表', exact: true }).click();
  await expect(page.getByRole('combobox', {name:'筛选优先级', exact:true})).toHaveValue('high');
  await views(page).getByRole('button', { name: '看板', exact: true }).click();
  await expect(card(page, child.id)).toHaveCount(0);
});

test('failed and stale board patches keep server stages and show a recovery error', async ({ page, request }) => {
  const p = await project(request, 'Board patch recovery');
  const item = await task(request, p.id, { title: 'Recover board move' });
  await openBoard(page, p.id);
  const endpoint = `**/api/v1/tasks/${item.id}`;
  await page.route(endpoint, async route => {
    if (route.request().method() === 'PATCH') await route.fulfill({ status: 500, json: { error: { code: 'internal', message: '暂时无法保存' } } });
    else await route.continue();
  });
  await card(page, item.id).getByLabel('更改看板阶段 Recover board move', { exact: true }).selectOption('done');
  await expect(page.getByRole('alert')).toContainText('阶段更新失败');
  await expect(column(page, 'Todo').locator(`article[data-task-id="${item.id}"]`)).toBeVisible();
  expect((await (await request.get(`/api/v1/tasks/${item.id}`)).json()).stage).toBe('todo');
  await page.unroute(endpoint);
  await page.reload();
  await expect(card(page, item.id)).toBeVisible();
  // Update the real server after the UI loaded its version, then let the stale CAS reach it.
  const concurrent = await request.patch(`/api/v1/tasks/${item.id}`, { data: { version: item.version, priority: 'high' } });
  expect(concurrent.ok()).toBeTruthy();
  const response = page.waitForResponse(r => r.url().endsWith(`/api/v1/tasks/${item.id}`) && r.request().method() === 'PATCH');
  await card(page, item.id).getByLabel('更改看板阶段 Recover board move', { exact: true }).selectOption('done');
  expect((await response).status()).toBe(409);
  await expect(page.getByRole('alert')).toContainText('阶段更新失败');
  await expect(column(page, 'Todo').locator(`article[data-task-id="${item.id}"]`)).toBeVisible();
  expect(await (await request.get(`/api/v1/tasks/${item.id}`)).json()).toMatchObject({ stage: 'todo', priority: 'high' });
});

test('archived board permits reading but disables stage changes and creation', async ({ page, request }) => {
  const p = await project(request, 'Archived board');
  const item = await task(request, p.id, { title: 'Read archived task' });
  await openBoard(page, p.id);
  await archiveCurrentProject(page);
  await expect(card(page, item.id).getByLabel('更改看板阶段 Read archived task', { exact: true })).toBeDisabled();
  await expect(card(page, item.id)).not.toHaveAttribute('draggable', 'true');
  for (const label of ['Todo', 'InPlan', 'InProcess', 'Done', 'Cancelled']) {
    const create = column(page, label).getByRole('button', { name: `在${label}新增任务`, exact: true });
    if (await create.count()) await expect(create).toBeDisabled();
  }
  await card(page, item.id).getByRole('button', { name: '打开任务 Read archived task', exact: true }).click();
  await expect(page.getByLabel('任务标题', { exact: true })).toHaveValue('Read archived task');
  expect((await (await request.get(`/api/v1/tasks/${item.id}`)).json()).stage).toBe('todo');
});

test('column creation preselects stage and long cards remain operable at 390px', async ({ page, request }) => {
  const p = await project(request, 'Mobile board creation');
  const longTitle = '很长的父任务名称与英文LongUnbrokenTitle'.repeat(8);
  const parent = await task(request, p.id, { title: longTitle });
  const child = await task(request, p.id, { title: 'ChildWithALongUnbrokenName'.repeat(8), parent_id: parent.id });
  await page.setViewportSize({ width: 390, height: 844 });
  await openBoard(page, p.id);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const bounds = await board(page).boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await card(page, child.id).getByLabel(`更改看板阶段 ${child.title}`, { exact: true }).selectOption('cancelled');
  await expect(column(page, 'Cancelled').locator(`article[data-task-id="${child.id}"]`)).toHaveCount(1);
  await column(page, 'InPlan').getByRole('button', { name: '在InPlan新增任务', exact: true }).click();
  await expect(page.getByLabel('新任务阶段', { exact: true })).toHaveValue('in_plan');
  await page.screenshot({path:'/tmp/noteapp-task-board-create.png'});
  await page.getByLabel('新任务标题', { exact: true }).fill('Created in planning');
  await page.getByRole('button', { name: '创建任务', exact: true }).click();
  await expect(page.getByLabel('任务标题', { exact: true })).toHaveValue('Created in planning');
  const createdId = new URL(page.url()).pathname.split('/').at(-1)!;
  expect((await (await request.get(`/api/v1/tasks/${createdId}`)).json()).stage).toBe('in_plan');
  await page.getByRole('button', { name: '关闭任务详情', exact: true }).click();
  await expect(column(page, 'InPlan').locator(`article[data-task-id="${createdId}"]`)).toHaveCount(1);
  await page.screenshot({path:'/tmp/noteapp-task-board-mobile.png'});
  await page.getByRole('button', { name: '添加任务', exact: true }).click();
  await expect(page.getByLabel('新任务阶段', { exact: true })).toHaveValue('todo');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('unavailable view storage does not break switching and foreign drag data cannot change a task',async({page,request})=>{
 const p=await project(request,'Storage and foreign drag');
 const item=await task(request,p.id,{title:'Protected board task'});
 await page.addInitScript(()=>{
  const read=Storage.prototype.getItem,write=Storage.prototype.setItem;
  Storage.prototype.getItem=function(key){if(key.startsWith('noteapp:task-view:'))throw new Error('preference storage blocked');return read.call(this,key);};
  Storage.prototype.setItem=function(key,value){if(key.startsWith('noteapp:task-view:'))throw new Error('preference storage blocked');return write.call(this,key,value);};
 });
 await openBoard(page,p.id);
 const transfer=await page.evaluateHandle(()=>new DataTransfer());
 await card(page,item.id).dispatchEvent('dragstart',{dataTransfer:transfer});
 await transfer.evaluate(dt=>dt.setData('application/x-noteapp-task',JSON.stringify({id:'foreign-task',projectId:'another-project'})));
 await column(page,'Done').dispatchEvent('drop',{dataTransfer:transfer});
 await card(page,item.id).dispatchEvent('dragend',{dataTransfer:transfer});
 expect(await(await request.get(`/api/v1/tasks/${item.id}`)).json()).toMatchObject({stage:'todo',version:item.version});
 await expect(column(page,'Todo').locator(`article[data-task-id="${item.id}"]`)).toBeVisible();
 await views(page).getByRole('button',{name:'列表',exact:true}).click();
 await views(page).getByRole('button',{name:'看板',exact:true}).click();await expect(board(page)).toBeVisible();
 await transfer.dispose();
});
