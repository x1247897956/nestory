import {test,expect} from '@playwright/test';

test('all settings dropdowns use the shared picker, including keyboard commit and cancel',async({page},info)=>{
 await page.goto('/settings');
 const selects=page.locator('.settings-page select');
 await expect(selects).toHaveCount(11);
 const language=page.getByLabel('语言',{exact:true});
 await expect(language).toHaveValue('zh-CN');
 await expect(language.locator('option')).toHaveText(['简体中文','English']);
 for(const select of await selects.all()){
  await expect(select).toHaveCSS('appearance','base-select');
  const style=await select.evaluate(element=>{const picker=getComputedStyle(element,'::picker(select)');return {radius:picker.borderRadius,font:picker.fontFamily};});
  expect(style.radius).toBe('8px');
  expect(style.font).toContain('Avenir');
 }
 const startup=page.getByLabel('启动时打开',{exact:true});
 await startup.focus();await startup.press('Space');
 await expect.poll(()=>startup.evaluate(el=>el.matches(':open'))).toBe(true);
 await page.screenshot({path:info.outputPath('settings-dropdown-light.png')});
 await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 await expect(startup).toHaveValue('last');
 await startup.press('Space');await page.keyboard.press('ArrowUp');await page.keyboard.press('Escape');
 await expect(startup).toHaveValue('last');
 await expect(startup).toBeFocused();
 await page.getByLabel('主题',{exact:true}).selectOption('dark');
 await startup.click();
 await expect.poll(()=>startup.evaluate(el=>el.matches(':open'))).toBe(true);
 const palette=await startup.evaluate(el=>({background:getComputedStyle(el,'::picker(select)').backgroundColor,selected:getComputedStyle(el.querySelector('option:checked')!).backgroundColor}));
 expect(palette.background).not.toBe('rgb(255, 255, 255)');
 await page.screenshot({path:info.outputPath('settings-dropdown-dark.png')});
 await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});
 await page.getByLabel('主题',{exact:true}).click();
 await page.screenshot({path:info.outputPath('settings-dropdown-mobile.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('native menus in dialogs, sorting and filters use the same top layer picker',async({page,request},info)=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'下拉检查 '+Date.now()}})).json();
 const task=await(await request.post(`/api/v1/projects/${p.id}/tasks`,{data:{title:'验证下拉任务'}})).json();
 await page.goto(`/projects/${p.id}/tasks/${task.id}`);
 await page.getByRole('button',{name:'展开属性',exact:true}).click();
 const priority=page.getByLabel('优先级',{exact:true});
 await expect(priority).toHaveCSS('appearance','base-select');
 await priority.click();
 await expect.poll(()=>priority.evaluate(el=>el.matches(':open'))).toBe(true);
 await page.screenshot({path:info.outputPath('task-priority-dropdown.png')});
 await page.keyboard.press('Escape');
 await priority.selectOption('high');
 await expect(priority).toHaveValue('high');
 await expect(page.locator('.object-editor-footer [role="status"]')).toHaveText('已保存');
 await page.goto(`/projects/${p.id}/tasks`);
 const listStage=page.getByLabel('更改阶段 验证下拉任务',{exact:true});
 await listStage.click();
 await expect.poll(()=>listStage.evaluate(el=>el.matches(':open'))).toBe(true);
 await page.screenshot({path:info.outputPath('list-stage-dropdown.png')});
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'任务排序器',exact:true}).click();
 const sort=page.getByLabel('任务排序字段',{exact:true});await sort.click();
 await expect.poll(()=>sort.evaluate(el=>el.matches(':open'))).toBe(true);
 await expect(page.getByRole('dialog',{name:'排序条件',exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath('nested-sort-dropdown.png')});
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog',{name:'排序条件',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'筛选任务',exact:true}).click();
 const field=page.getByLabel('筛选属性',{exact:true});await field.click();
 await expect.poll(()=>field.evaluate(el=>el.matches(':open'))).toBe(true);
 await page.screenshot({path:info.outputPath('nested-filter-dropdown.png')});
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog',{name:'添加筛选条件',exact:true})).toBeVisible();
});

test('long project options wrap within a narrow touch viewport and remain selectable',async({browser,request},info)=>{
 const title='长项目名称用于验证下拉面板边界和自动换行'.repeat(8)+Date.now();
 await request.post('/api/v1/projects',{data:{title}});
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 try{
  const page=await context.newPage();await page.goto('/');
  await page.locator('.workbench-calendar .fc-daygrid-day .fc-daygrid-day-number').first().click();
  const project=page.getByRole('dialog',{name:'新建日程',exact:true}).getByLabel('所属项目',{exact:true});
  await project.click();
  await expect.poll(()=>project.evaluate(el=>el.matches(':open'))).toBe(true);
  const option=project.getByRole('option',{name:title,exact:true});
  const box=await option.boundingBox();
  expect(box).not.toBeNull();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(390);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({path:info.outputPath('long-project-touch-dropdown.png')});
  await option.click();
  await expect(project).toHaveValue(/.+/);
  const closed=await project.boundingBox();
  expect(closed!.x+closed!.width).toBeLessThanOrEqual(390);
  expect(closed!.height).toBeLessThan(60);
  await page.screenshot({path:info.outputPath('long-project-closed.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{await context.close();}
});
