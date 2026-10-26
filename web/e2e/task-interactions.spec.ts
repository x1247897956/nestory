import {expandProperties} from "./property-actions";
import { test, expect } from '@playwright/test';
import { paragraphs } from './block-fixtures';
import { archiveCurrentProject } from './project-actions';

test('dragging changes only the selected task stage, persists and handles failed updates', async ({page, request}) => {
  const project = await (await request.post('/api/v1/projects', {data:{title:'Stage drag'}})).json();
  const task = await (await request.post(`/api/v1/projects/${project.id}/tasks`, {data:{title:'Parent',body_document:paragraphs('Keep my blocks'),priority:'high',due_date:'2026-12-31'}})).json();
  const child = await (await request.post(`/api/v1/projects/${project.id}/tasks`, {data:{title:'Child',parent_id:task.id}})).json();
  await page.goto(`/projects/${project.id}/tasks`);await expandProperties(page);
  await expect(page.getByText('筛选阶段',{exact:true})).toHaveCount(0);
  const target = page.getByRole('region',{name:'InProcess阶段',exact:true});
  await page.getByRole('button',{name:'拖动任务 Parent',exact:true}).dragTo(target);
  await expect(target.getByRole('button',{name:'Parent',exact:true})).toBeVisible();
  const stored = await (await request.get(`/api/v1/tasks/${task.id}`)).json();
  expect(stored).toMatchObject({stage:'in_process',priority:'high',due_date:'2026-12-31',body_document:task.body_document});
  expect(await (await request.get(`/api/v1/tasks/${child.id}`)).json()).toMatchObject({stage:'todo',version:child.version,parent_id:task.id});
  await page.reload();await expandProperties(page);
  await expect(target.getByRole('button',{name:'Parent',exact:true})).toBeVisible();
  await page.getByLabel('更改阶段 Child',{exact:true}).selectOption('done');
  await expect(page.getByRole('region',{name:'Done阶段',exact:true}).getByRole('button',{name:'Child',exact:true})).toBeVisible();
  // A child in another stage must not be duplicated under its expanded parent.
  if (await page.getByRole('button',{name:'展开 Parent',exact:true}).count())
    await page.getByRole('button',{name:'展开 Parent',exact:true}).click();
  await expect(page.getByRole('button',{name:'Child',exact:true})).toHaveCount(1);
  await page.screenshot({animations:'disabled',fullPage:true,path:'/tmp/noteapp-stage-drag-desktop.png'});
  await page.locator('.task-list').screenshot({animations:'disabled',path:'/tmp/noteapp-stage-list-detail.png'});
  expect((await (await request.get(`/api/v1/tasks/${task.id}`)).json()).stage).toBe('in_process');
  await page.setViewportSize({width:390,height:844});
  await page.getByLabel('更改阶段 Child',{exact:true}).selectOption('cancelled');
  await expect(page.getByRole('region',{name:'Cancelled阶段',exact:true}).getByRole('button',{name:'Child',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({animations:'disabled',fullPage:true,path:'/tmp/noteapp-stage-mobile.png'});
  await page.setViewportSize({width:1261,height:932});
  await page.route(`**/api/v1/tasks/${task.id}`, async route => {
    if(route.request().method()==='PATCH') await route.fulfill({status:409,json:{error:{code:'conflict',message:'版本冲突'}}});
    else await route.continue();
  });
  await page.getByRole('button',{name:'拖动任务 Parent',exact:true}).dragTo(page.getByRole('region',{name:'Done阶段',exact:true}));
  await expect(page.getByRole('alert')).toContainText('阶段更新失败');
  await expect(target.getByRole('button',{name:'Parent',exact:true})).toBeVisible();
  await page.unrouteAll();
  await archiveCurrentProject(page);
  await expect(page.getByRole('button',{name:/拖动任务/})).toHaveCount(0);
  await expect(page.getByLabel('更改阶段 Parent',{exact:true})).toBeDisabled();
});

test('object pages omit project actions and relations use a single searchable choice list', async ({page, request}) => {
  const project = await (await request.post('/api/v1/projects', {data:{title:'Compact objects'}})).json();
  const post = async (kind:string,data:object) => (await (await request.post(`/api/v1/projects/${project.id}/${kind}`,{data})).json());
  const task = await post('tasks',{title:'Action'});
  const note = await post('pages',{title:'Reference'});
  const event = await post('events',{title:'Discussion',start_at:'2026-10-26T09:00:00+08:00',end_at:'2026-10-26T10:00:00+08:00'});
  for(const [kind,id] of [['tasks',task.id],['pages',note.id],['events',event.id]]) {
    await page.goto(`/projects/${project.id}/${kind}/${id}`);await expandProperties(page);
    await expect(page.getByRole('button',{name:'修改项目',exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'归档项目',exact:true})).toHaveCount(0);
  }
  await page.goto(`/projects/${project.id}/tasks/${task.id}`);await expandProperties(page);
  await page.locator('.relation-property > summary').click();
  const panel = page.getByRole('region',{name:'关联对象列表'});
  await expect(panel.getByText('同项目 · 双向关联')).toHaveCount(0);
  await expect(panel.getByRole('combobox')).toHaveCount(0);
  await panel.getByLabel('搜索关联标题').fill('Ref');
  await expect(panel.getByRole('button',{name:/关联 Discussion/})).toHaveCount(0);
  await panel.getByRole('button',{name:'关联 Reference',exact:true}).click();
  await expect(panel.getByRole('link',{name:'Reference',exact:true})).toBeVisible();
  expect((await (await request.get(`/api/v1/pages/${note.id}/relations`)).json())[0].id).toBe(task.id);
  await panel.getByLabel('搜索关联标题').fill('No match');
  await expect(panel.getByText('没有匹配的对象')).toBeVisible();
  await panel.getByLabel('搜索关联标题').fill('');
  await page.setViewportSize({width:390,height:844});
  const bounds = await panel.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({animations:'disabled',fullPage:true,path:'/tmp/noteapp-compact-relations-mobile.png'});
  await page.setViewportSize({width:1261,height:932});
  await page.screenshot({animations:'disabled',fullPage:true,path:'/tmp/noteapp-compact-relations-desktop.png'});
  await panel.screenshot({animations:'disabled',path:'/tmp/noteapp-relations-detail.png'});
});
