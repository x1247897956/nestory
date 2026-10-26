import {expect,type Page} from '@playwright/test';
/** Existing editor workflows explicitly open the properties they exercise. */
export async function expandProperties(page:Page) {
 if(!/\/projects\/[^/]+\/(tasks|pages|events)\/[^/?]+/.test(new URL(page.url()).pathname))return;
 const toggle=page.getByRole('button',{name:/^(展开属性|收起属性)$/});
 await expect(toggle).toBeVisible();
 if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
}
