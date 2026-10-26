import {expandProperties} from "./property-actions";
import { test, expect } from '@playwright/test';
import { archiveCurrentProject } from './project-actions';
test('all object types use title-level more actions without a redundant relation label', async ({page,request}) => {
 const p = await (await request.post('/api/v1/projects',{data:{title:'Object menus'}})).json();
 const objects: {kind:string,id:string}[]=[];
 for(const kind of ['tasks','pages','events']) {
  const object=await (await request.post(`/api/v1/projects/${p.id}/${kind}`,{data:{title:'长标题 '.repeat(12),...(kind==='events'?{start_at:'2026-10-26T01:00:00Z',end_at:'2026-10-26T02:00:00Z'}:{})}})).json();
  objects.push({kind,id:object.id});
 }
 for(const width of [1261,390]) for(const object of objects) {
  await page.setViewportSize({width,height:932});
  await page.goto(`/projects/${p.id}/${object.kind}/${object.id}`);await expandProperties(page);
  const properties=page.getByRole('group',{name:'对象属性'});
  await expect(properties.locator('[data-property="relations"] .object-property-label')).toHaveCount(0);
  const trigger=page.getByRole('button',{name:'对象菜单',exact:true});
  await expect(trigger).toBeVisible();
  await expect(page.getByRole('button',{name:'移入回收站',exact:true})).toHaveCount(0);
  await trigger.click();
  const menu=page.getByRole('group',{name:'对象操作',exact:true});
  await expect(menu).toBeVisible();
  const bounds=await menu.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);
  await trigger.press('Escape');await expect(menu).toBeHidden();
  await trigger.click();
  if(object.kind==='pages') await page.screenshot({animations:'disabled',fullPage:true,path:`/tmp/noteapp-object-menu-${width}.png`});
  await menu.getByRole('button',{name:'移入回收站',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'确认删除'});
  await expect(dialog).toBeVisible();await expect(menu).toBeHidden();
  await dialog.getByRole('button',{name:'取消',exact:true}).click();
  await expect(trigger).toBeFocused();
  expect((await request.get(`/api/v1/${object.kind}/${object.id}`)).status()).toBe(200);
 }
 await archiveCurrentProject(page);
 await expect(page.getByRole('button',{name:'对象菜单',exact:true})).toHaveCount(0);
});
