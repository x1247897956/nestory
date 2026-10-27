import {test,expect} from '@playwright/test';
import {addTaskFilter} from './task-filter-actions';
test('reentering task view after midnight refreshes relative filters',async({page,request})=>{
 await page.clock.install({time:new Date('2026-10-27T15:00:00Z')});
 const p=await(await request.post('/api/v1/projects',{data:{title:'Overnight navigation'}})).json();
 for(const [title,due_date] of [['Yesterday task','2026-10-27'],['Today task','2026-10-28']])await request.post(`/api/v1/projects/${p.id}/tasks`,{data:{title,due_date}});
 await page.goto(`/projects/${p.id}/tasks`);await addTaskFilter(page,'due_date','today');
 await expect(page.getByRole('button',{name:'Yesterday task',exact:true})).toBeVisible();
 await page.locator(`a.project-link[href="/projects/${p.id}"]`).click();
 await page.clock.setSystemTime(new Date('2026-10-27T16:01:00Z'));
 await page.getByRole('link',{name:/查看全部任务/}).click();
 await expect(page.getByRole('button',{name:'Today task',exact:true})).toBeVisible({timeout:1500});
 await expect(page.getByRole('button',{name:'Yesterday task',exact:true})).toHaveCount(0);
});
