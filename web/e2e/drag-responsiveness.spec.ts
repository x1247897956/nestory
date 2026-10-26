import { test, expect } from '@playwright/test';

for (const view of ['列表', '看板']) {
  test(`${view}: drop moves immediately while the save is pending without shifting the workspace`, async ({page, request}) => {
    const p = await (await request.post('/api/v1/projects', {data:{title:`Drag feedback ${view}`}})).json();
    const item = await (await request.post(`/api/v1/projects/${p.id}/tasks`, {data:{title:'Immediate move'}})).json();
    await page.goto(`/projects/${p.id}/tasks`);
    await page.getByRole('group',{name:'任务视图',exact:true}).getByRole('button',{name:view,exact:true}).click();
    const board = view === '看板';
    const target = page.getByRole('region',{name:board?'Done看板列':'Done阶段',exact:true});
    const source = board ? page.locator(`article[data-task-id="${item.id}"]`) : page.getByRole('button',{name:'拖动任务 Immediate move',exact:true});
    await expect(source).toBeVisible();
    const surface = page.locator(board?'.task-board':'.task-group').first();
    const before = (await surface.boundingBox())!.y;
    let release!: () => void;
    const gate = new Promise<void>(resolve=>{release=resolve;});
    let listReads = 0;
    page.on('request', r=>{if(r.method()==='GET' && new URL(r.url()).pathname===`/api/v1/projects/${p.id}/tasks`) listReads++;});
    await page.route(`**/api/v1/tasks/${item.id}`, async route=>{
      if(route.request().method()==='PATCH') { await gate; await route.continue(); }
      else await route.continue();
    });
    try {
      await source.dragTo(target);
      await expect(target.getByText('Immediate move',{exact:true})).toBeVisible({timeout:1000});
      expect((await surface.boundingBox())!.y).toBe(before);
    } finally { release(); }
    await expect.poll(async()=> (await (await request.get(`/api/v1/tasks/${item.id}`)).json()).stage).toBe('done');
    await expect(page.getByText('正在更新阶段…',{exact:true})).toHaveCount(0);
    expect(listReads).toBe(0);
  });
}

test('lost stage response reconciles the committed server version', async ({page, request}) => {
  const p = await (await request.post('/api/v1/projects',{data:{title:'Lost stage response'}})).json();
  const item = await (await request.post(`/api/v1/projects/${p.id}/tasks`,{data:{title:'Lost acknowledgement'}})).json();
  await page.goto(`/projects/${p.id}/tasks`);
  await page.getByRole('group',{name:'任务视图',exact:true}).getByRole('button',{name:'看板',exact:true}).click();
  await page.route(`**/api/v1/tasks/${item.id}`,async route=>{
    if(route.request().method()==='PATCH') { await route.fetch(); await route.abort(); }
    else await route.continue();
  });
  const control = page.getByLabel('更改看板阶段 Lost acknowledgement',{exact:true});
  await control.selectOption('done');
  await expect(control).toBeEnabled();
  await expect(control).toHaveValue('done');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.unroute(`**/api/v1/tasks/${item.id}`);
  await control.selectOption('in_plan');
  await expect(control).toBeEnabled();
  await expect.poll(async()=> (await (await request.get(`/api/v1/tasks/${item.id}`)).json()).stage).toBe('in_plan');
});
