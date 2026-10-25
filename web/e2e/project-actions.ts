import type { Page } from '@playwright/test';
export async function archiveCurrentProject(page: Page) {
  const projectId = new URL(page.url()).pathname.split('/')[2];
  await page.locator(`button[popovertarget="project-menu-${projectId}"]`).click();
  await page.locator(`#project-menu-${projectId}`).getByRole('button', {name:'归档',exact:true}).click();
}

export async function unarchiveCurrentProject(page: Page) {
  const projectId = new URL(page.url()).pathname.split('/')[2];
  await page.locator(`button[popovertarget="project-menu-${projectId}"]`).click();
  await page.locator(`#project-menu-${projectId}`).getByRole('button', {name:'取消归档',exact:true}).click();
}
