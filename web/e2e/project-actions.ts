import {expect,type Page} from '@playwright/test';
import {expandProperties} from './property-actions';
async function changeArchive(page:Page,name:string){
 const original=new URL(page.url()).pathname;
 const projectId=original.split('/')[2];
 const dialog=page.locator('dialog.object-dialog[open]');
 const hadDialog=await dialog.count()>0;
 if(hadDialog){
  // A readonly editor may contain a durable foreign recovery draft. Explicitly
  // accept leaving that readonly view to reach project controls; the draft stays stored.
  const accept=(d:import('@playwright/test').Dialog)=>d.accept();
  if(name==='取消归档')page.on('dialog',accept);
  try {await dialog.getByRole('button',{name:/^关闭(任务|笔记|日程)详情$/}).click();await expect(dialog).toHaveCount(0);}
  finally {page.off('dialog',accept);}
 }
 await page.locator(`button[popovertarget="project-menu-${projectId}"]`).click();
 await page.locator(`#project-menu-${projectId}`).getByRole('button',{name,exact:true}).click();
 if(hadDialog){await page.goto(original);await expandProperties(page);}
}
export async function archiveCurrentProject(page:Page){await changeArchive(page,'归档');}
export async function unarchiveCurrentProject(page:Page){await changeArchive(page,'取消归档');}
