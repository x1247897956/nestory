import {test,expect} from '@playwright/test';
import {DateTime} from 'luxon';
test('workspace emphasizes overdue work and removes status navigation and creation CTA',async({page,request})=>{
 const day=(await(await request.get('/api/v1/workspace/today')).json()).date;
 const project=await(await request.post('/api/v1/projects',{data:{title:'工作台层次 '+Date.now()}})).json();
 const overdue=await(await request.post(`/api/v1/projects/${project.id}/tasks`,{data:{title:'优先处理阻塞',due_date:DateTime.fromISO(day).minus({days:1}).toISODate()}})).json();
 await request.post(`/api/v1/projects/${project.id}/events`,{data:{title:'今日评审',start_at:day+'T09:00:00+08:00',end_at:day+'T10:00:00+08:00'}});
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'今日工作台',exact:true})).toBeVisible();
 await expect(page.getByRole('complementary').getByRole('button',{name:'活跃项目',exact:true})).toHaveCount(0);
 await expect(page.getByRole('complementary').getByRole('button',{name:'已归档项目',exact:true})).toHaveCount(0);
 const main=page.getByRole('main');
 await expect(main.getByRole('button',{name:/创建.*项目/})).toHaveCount(0);
 await expect(main).not.toContainText('Asia/Shanghai');
 const focus=page.getByRole('region',{name:'优先处理'});
 await expect(focus.locator(`a[href="/projects/${project.id}/tasks/${overdue.id}"]`)).toBeVisible();
 await expect(page.getByRole('region',{name:'今日日程'}).getByRole('link',{name:/今日评审/})).toBeVisible();
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
