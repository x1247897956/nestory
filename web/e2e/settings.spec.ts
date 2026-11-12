import { test, expect } from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('settings persist, track system appearance and fit desktop and narrow screens',async({page},testInfo)=>{
 await page.emulateMedia({colorScheme:'light'});
 await page.goto('/');
 await page.getByRole('link',{name:'设置',exact:true}).click();
 await expect(page.getByRole('heading',{name:'设置',exact:true})).toBeVisible();
 for(const name of ['通用','外观','日历与时间','编辑器','数据与维护','关于']) await expect(page.getByRole('heading',{name,exact:true})).toBeAttached();
 await page.screenshot({path:testInfo.outputPath('settings-light.png'),fullPage:true});
 await page.getByLabel('主题',{exact:true}).selectOption('dark');
 await page.getByLabel('界面字号',{exact:true}).selectOption('16');
 await page.getByLabel('布局密度',{exact:true}).selectOption('compact');
 await page.reload();
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await expect(page.getByLabel('界面字号',{exact:true})).toHaveValue('16');
 await expect(page.locator('html')).toHaveAttribute('data-density','compact');
 await page.screenshot({path:testInfo.outputPath('settings-dark.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:testInfo.outputPath('settings-mobile-dark.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.getByLabel('主题',{exact:true}).selectOption('system');
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.emulateMedia({colorScheme:'dark'});
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
});

test('calendar defaults, editor preferences and startup location affect actual screens',async({page,request},testInfo)=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'设置验收 '+Date.now()}})).json();
 const note=await(await request.post(`/api/v1/projects/${p.id}/pages`,{data:{title:'偏好正文'}})).json();
 await page.goto('/settings');
 await page.getByLabel('主题',{exact:true}).selectOption('dark');
 await page.getByLabel('默认日历视图').selectOption('timeGridWeek');
 await page.getByLabel('每周起始日').selectOption('0');
 await page.getByLabel('时间格式').selectOption('12');
 await page.getByLabel('新日程默认时长').selectOption('30');
 await page.getByLabel('正文字号',{exact:true}).selectOption('19');
 await page.getByLabel('正文宽度').selectOption('wide');
 await page.getByRole('switch',{name:'拼写检查'}).uncheck();
 await page.getByLabel('启动时打开').selectOption('last');
 await page.goto(`/projects/${p.id}/events`);
 await expect(page.locator('.fc-timeGridWeek-view')).toBeVisible();
 await expect(page.locator('.fc-col-header-cell').first()).toContainText('周日');
 const calendarColors=await page.locator('.calendar-workspace').evaluate(root=>{
  const luminance=(color:string)=>{
   const channels=(color.match(/[\d.]+/g)??[]).slice(0,3).map(value=>{const v=Number(value)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
   return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
  };
  const today=getComputedStyle(root.querySelector('.fc-timegrid-col.fc-day-today')!);
  const contrasts=Array.from(root.querySelectorAll('.fc-button:not(:disabled)')).map(button=>{const style=getComputedStyle(button);const a=luminance(style.color),b=luminance(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
  return {today:luminance(today.backgroundColor),contrasts};
 });
 expect(calendarColors.today).toBeLessThan(.3);
 for(const contrast of calendarColors.contrasts)expect(contrast).toBeGreaterThanOrEqual(4.5);
 await page.screenshot({path:testInfo.outputPath('calendar-dark.png'),fullPage:true});
 await page.getByRole('button',{name:'新建日程',exact:true}).click();
 await expect(page.getByLabel('新日程结束')).toHaveValue(/T09:30$/);
 await page.getByRole('button',{name:'关闭新建日程',exact:true}).click();
 await page.goto(`/projects/${p.id}/pages/${note.id}`);
 const body=page.getByLabel('Markdown 正文',{exact:true});
 await expect(body).toBeVisible();
 await expect(body).toHaveAttribute('spellcheck','false');
 await expect(body).toHaveCSS('font-size','19px');
 await expect(page.locator('.bn-container')).toHaveAttribute('data-color-scheme','dark');
 await page.screenshot({path:testInfo.outputPath('editor-dark.png'),fullPage:true});
 await page.goto(`/projects/${p.id}/tasks`);
 await expect(page.getByRole('button',{name:'列表',exact:true})).toBeVisible();
 await page.goto('/');
 await expect(page).toHaveURL(new RegExp(`/projects/${p.id}/tasks$`));
 await page.goto('/trash');
 await expect(page).toHaveURL(/\/trash$/);
});

test('reset updates previously mounted project view choices while preserving drafts',async({page,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'重置视图 '+Date.now()}})).json();
 await page.goto(`/projects/${p.id}/tasks`);
 await page.getByRole('button',{name:'看板',exact:true}).click();
 await page.evaluate(()=>localStorage.setItem('noteapp:draft:preserve','important text'));
 await page.getByRole('link',{name:'设置',exact:true}).click();
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'恢复默认偏好',exact:true}).click();
 await page.getByRole('link',{name:p.title,exact:true}).click();
 await page.getByRole('link',{name:'任务',exact:true}).click();
 await expect(page.getByRole('button',{name:'列表',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>localStorage.getItem('noteapp:draft:preserve'))).toBe('important text');
});

test('backup download contains ZIP and restore rejects a populated workspace in the UI',async({page})=>{
 await page.goto('/settings');
 const pending=page.waitForEvent('download');
 await page.getByRole('button',{name:'导出工作空间',exact:true}).click();
 const download=await pending;
 expect(download.suggestedFilename()).toMatch(/nestory-workspace.*\.zip/);
 const path=await download.path();
 await page.getByLabel('工作空间备份文件').setInputFiles({name:download.suggestedFilename(),mimeType:'application/zip',buffer:await readFile(path!)});
 await page.getByRole('button',{name:'恢复工作空间',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('只能恢复到空工作空间');
 await expect(page.getByRole('button',{name:'恢复工作空间',exact:true})).toBeEnabled();
});

test('reset notifies another tab with a cached project view',async({page,context,request})=>{
 const p=await(await request.post('/api/v1/projects',{data:{title:'跨标签页重置 '+Date.now()}})).json();
 await page.goto(`/projects/${p.id}/tasks`);
 await page.getByRole('button',{name:'看板',exact:true}).click();
 const second=await context.newPage();
 await second.goto('/settings');
 second.once('dialog',dialog=>dialog.accept());
 await second.getByRole('button',{name:'恢复默认偏好',exact:true}).click();
 await expect(page.getByRole('button',{name:'列表',exact:true})).toHaveAttribute('aria-pressed','true');
 await second.close();
});
