import {closeObject} from "./object-actions";
import {test,expect} from '@playwright/test';
import {DateTime} from 'luxon';
test('workspace emphasizes overdue work and removes status navigation and creation CTA',async({page,request})=>{
 const day=(await(await request.get('/api/v1/workspace/today')).json()).date;
 const project=await(await request.post('/api/v1/projects',{data:{title:'工作台层次 '+Date.now()}})).json();
 const overdue=await(await request.post(`/api/v1/projects/${project.id}/tasks`,{data:{title:'优先处理阻塞',due_date:DateTime.fromISO(day).minus({days:1}).toISODate()}})).json();
 const review=await(await request.post(`/api/v1/projects/${project.id}/events`,{data:{title:'今日评审',start_at:day+'T09:00:00+08:00',end_at:day+'T10:00:00+08:00'}})).json();
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'工作台',exact:true})).toBeVisible();
 await expect(page.getByRole('complementary').getByRole('button',{name:'活跃项目',exact:true})).toHaveCount(0);
 await expect(page.getByRole('complementary').getByRole('button',{name:'已归档项目',exact:true})).toHaveCount(0);
 const main=page.getByRole('main');
 await expect(main.getByRole('button',{name:/创建.*项目/})).toHaveCount(0);
 await expect(main).not.toContainText('Asia/Shanghai');
 const focus=page.getByRole('region',{name:'任务列表'});
 await expect(focus.locator(`a[href="/projects/${project.id}/tasks/${overdue.id}"]`)).toBeVisible();
 const calendar=page.getByRole('region',{name:'日程日历'});
 const reviewLink=calendar.locator(`a[href="/projects/${project.id}/events/${review.id}"]:visible`);
 // FullCalendar collapses a crowded day after three events.
 if(await reviewLink.count()===0) await calendar.locator(`.fc-daygrid-day[data-date="${day}"] .fc-daygrid-more-link`).click();
 await expect(reviewLink.first()).toBeVisible();
 await expect(page.getByRole('link',{name:'工作台',exact:true})).toHaveAttribute('aria-current','page');
 await closeObject(page);
 await page.getByRole('link',{name:'搜索',exact:true}).click();
 await expect(page.getByRole('link',{name:'搜索',exact:true})).toHaveAttribute('aria-current','page');
 await expect(page.getByRole('link',{name:'工作台',exact:true})).not.toHaveAttribute('aria-current','page');
 await expect(page.getByRole('main').getByRole('button',{name:/创建.*项目/})).toHaveCount(0);
 await page.getByLabel('项目选项',{exact:true}).click();
 await page.getByRole('button',{name:'查看已归档项目',exact:true}).click();
 await page.getByLabel('项目选项',{exact:true}).click();
 await expect(page.getByRole('button',{name:'返回项目列表',exact:true})).toBeVisible();
});

test('archived projects remain reachable on a phone',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await page.getByLabel('项目选项',{exact:true}).click();
 await expect(page.getByRole('button',{name:'查看已归档项目',exact:true})).toBeVisible();
});

test('workbench navigates future calendar ranges and includes undated and future tasks',async({page,request})=>{
 const today=await(await request.get('/api/v1/workspace/today')).json();
 const next=DateTime.fromISO(today.date).plus({months:1}).startOf('month').plus({days:10});
 const p=await(await request.post('/api/v1/projects',{data:{title:'跨项目工作台 '+Date.now()}})).json();
 const future=await(await request.post(`/api/v1/projects/${p.id}/tasks`,{data:{title:'未来待办',due_date:next.toISODate()}})).json();
 const undated=await(await request.post(`/api/v1/projects/${p.id}/tasks`,{data:{title:'未设日期待办'}})).json();
 const e=await(await request.post(`/api/v1/projects/${p.id}/events`,{data:{title:'下月规划会议',start_at:next.toISODate()+'T09:00:00+08:00',end_at:next.toISODate()+'T10:00:00+08:00'}})).json();
 await page.goto('/');
 const tasks=page.getByRole('region',{name:'任务列表'});
 await expect(tasks.locator(`a[href="/projects/${p.id}/tasks/${future.id}"]`)).toBeVisible();
 await expect(tasks.locator(`a[href="/projects/${p.id}/tasks/${undated.id}"]`)).toBeVisible();
 await tasks.getByRole('button',{name:'今日到期',exact:true}).click();
 await expect(tasks.locator(`a[href="/projects/${p.id}/tasks/${future.id}"]`)).toHaveCount(0);
 await tasks.getByRole('button',{name:'全部未完成',exact:true}).click();
 const calendar=page.getByRole('region',{name:'日程日历'});
 await calendar.locator('.fc-next-button').click();
 await expect(calendar.locator(`a[href="/projects/${p.id}/events/${e.id}"]`).first()).toBeVisible();
 await calendar.locator(`a[href="/projects/${p.id}/events/${e.id}"]`).first().click();
 await expect(page.getByLabel('日程标题',{exact:true})).toHaveValue('下月规划会议');
 await page.goto('/');
 await page.setViewportSize({width:390,height:844});
 await expect(page.getByRole('region',{name:'日程日历'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
