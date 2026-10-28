import {test,expect} from '@playwright/test';
import {setSort} from './sort-actions';

test('tasks notes and events share header and toolbar geometry at desktop and mobile widths',async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'Consistent collections'}})).json();
 const metrics:Record<string,{x:number;y:number;height:number}>={};
 for(const type of ['tasks','pages','events']){
  await page.goto(`/projects/${p.id}/${type}`);await expect(page.locator('.collection-header')).toBeVisible();
  const header=(await page.locator('.collection-header').boundingBox())!,toolbar=(await page.locator('.collection-toolbar').boundingBox())!;
  metrics[type]={x:header.x,y:toolbar.y,height:header.height};
  await expect(page.locator('.collection-header h2')).toHaveCSS('font-size','20px');
  if(type!=='events')await expect(page.locator('.collection-tools > .view-sort-control')).toBeVisible();
 }
 for(const type of ['pages','events']){expect(metrics[type].x).toBe(metrics.tasks.x);expect(metrics[type].y).toBe(metrics.tasks.y);expect(metrics[type].height).toBe(metrics.tasks.height);}
 await page.setViewportSize({width:390,height:844});
 for(const type of ['tasks','pages','events']){
  await page.goto(`/projects/${p.id}/${type}`);await expect(page.locator('.collection-header')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.screenshot({path:'/tmp/noteapp-collection-mobile.png'});
});

test('sorter edits drafts, applies a chip, dismisses unchanged, and clears to default',async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'Sorter'}})).json();
 await request.post(`/api/v1/projects/${p.id}/tasks`,{data:{title:'Z task'}});await request.post(`/api/v1/projects/${p.id}/tasks`,{data:{title:'A task'}});
 await page.goto(`/projects/${p.id}/tasks`);
 await expect(page.locator('.task-row .task-title')).toHaveCount(2);
 const before=await page.locator('.task-row .task-title').allTextContents();
 await page.getByRole('button',{name:'任务排序器',exact:true}).click();
 const panel=page.getByRole('dialog',{name:'排序条件',exact:true});
 await panel.getByLabel('任务排序字段',{exact:true}).selectOption('title');
 await expect(page.locator('.task-row .task-title')).toHaveText(before);
 await page.keyboard.press('Escape');await expect(panel).toBeHidden();
 await setSort(page,'任务排序','title','asc');await expect(page.locator('.task-row .task-title')).toHaveText(['A task','Z task']);
 await expect(page.getByRole('button',{name:'编辑排序 标题 · 升序',exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('button',{name:'编辑排序 标题 · 升序',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'编辑排序 标题 · 升序',exact:true}).click();await panel.getByLabel('任务排序方向',{exact:true}).selectOption('desc');
 await page.locator('.collection-header h2').click();await expect(panel).toBeHidden();await expect(page.locator('.task-row .task-title')).toHaveText(['A task','Z task']);
 await page.getByRole('button',{name:'移除排序 标题 · 升序',exact:true}).click();await expect(page.getByRole('button',{name:/编辑排序/})).toHaveCount(0);await expect(page.locator('.task-row .task-title')).toHaveText(before);
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'任务排序器',exact:true}).click();await expect(panel).toBeVisible();
 const box=(await panel.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);
 await page.screenshot({path:'/tmp/noteapp-sorter-mobile.png'});
});

test('browser history discards an open sorting draft when switching project scope',async({page,request})=>{
 const a=await(await request.post('/api/v1/projects',{data:{title:'Sort scope A'}})).json();
 const b=await(await request.post('/api/v1/projects',{data:{title:'Sort scope B'}})).json();
 await page.goto(`/projects/${a.id}/tasks`);
 // Add a same-type SPA history entry, without visiting an overview that unmounts the sorter.
 await page.evaluate(url=>{history.pushState({...history.state,key:'sort-scope-b',idx:(history.state?.idx??0)+1},'',url);dispatchEvent(new PopStateEvent('popstate',{state:history.state}));},`/projects/${b.id}/tasks`);
 await expect(page.locator('.topbar')).toContainText('Sort scope B');
 await page.getByRole('button',{name:'任务排序器',exact:true}).click();
 let panel=page.getByRole('dialog',{name:'排序条件',exact:true});await panel.getByLabel('任务排序字段',{exact:true}).selectOption('title');
 await page.goBack();await expect(page).toHaveURL(`/projects/${a.id}/tasks`);
 await expect(page.getByRole('dialog',{name:'排序条件',exact:true})).toBeHidden();
 await page.getByRole('button',{name:'任务排序器',exact:true}).click();panel=page.getByRole('dialog',{name:'排序条件',exact:true});await expect(panel.getByLabel('任务排序字段',{exact:true})).toHaveValue('position');
 await panel.getByRole('button',{name:'取消',exact:true}).click();
 expect(await page.evaluate(pid=>JSON.parse(localStorage.getItem(`noteapp:view:${pid}:tasks`)??'{"sort":{"field":"position"}}').sort.field,a.id)).toBe('position');
});
