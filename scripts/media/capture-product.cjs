// Reproducible product captures. Mutates ONLY its own disposable container/volume.
const {chromium}=require('../../web/node_modules/@playwright/test');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');
const image=process.argv[2]||'noteapp:nestory-20261106';
const name='noteapp-media-'+Date.now();const output=path.resolve('docs/assets');
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8'}).trim();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const text=(value)=>[{type:'text',text:value,styles:{}}];
const block=(id,type,value,props={})=>({id,type,props,content:text(value),children:[]});
(async()=>{
 let browser,context;
 try{
  docker('volume','create',name);
  docker('run','-d','--name',name,'-p','127.0.0.1::8080','-v',name+':/data',image);
  const inspect=JSON.parse(docker('inspect',name))[0];const port=inspect.NetworkSettings.Ports['8080/tcp'][0].HostPort;const base='http://127.0.0.1:'+port;
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/v1/readyz')).ok)break;}catch{}await pause(100);}
  const api=async(url,data,method='POST')=>{const r=await fetch(base+'/api/v1'+url,{method,headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});if(!r.ok)throw Error(url+': '+r.status+' '+await r.text());return r.status===204?null:r.json()};
  const project=await api('/projects',{title:'设计一次更好的分享',description:'从灵感到讲稿，让准备有条不紊。'});
  await api('/projects',{title:'阅读与思考',description:'记录值得反复阅读的内容。'});
  await api('/projects',{title:'个人计划',description:'给长期目标留出时间。'});
  const pid=project.id;const tasks=[];
  for(const [title,stage,priority,due_date] of [
   ['收集优秀案例与参考资料','done','medium','2026-11-03'],
   ['确定分享主题与听众','done','high','2026-11-04'],
   ['整理故事线与讲稿大纲','in_process','high','2026-11-06'],
   ['设计关键页面与演示素材','in_process','medium','2026-11-07'],
   ['邀请朋友进行第一次彩排','in_plan','medium','2026-11-09'],
   ['根据反馈打磨表达','in_plan','high','2026-11-10'],
   ['整理问答与延伸阅读','todo','low','2026-11-11'],
   ['发布讲稿与复盘笔记','todo','none','2026-11-12'],
  ])tasks.push(await api(`/projects/${pid}/tasks`,{title,stage,priority,due_date}));
  const note=await api(`/projects/${pid}/pages`,{title:'让好想法，更容易被理解',body_document:{version:1,blocks:[
   block('intro','paragraph','一次好的分享，不是把所有资料都讲完，而是让听众带走一个清晰的想法。'),
   block('h1','heading','从一个真实问题开始',{level:2}),
   block('p1','paragraph','用一个具体的场景说明：我们为什么需要把笔记、行动和时间放在一起？'),
   block('b1','bulletListItem','先讲遇到的问题，再展示解决问题的过程。'),
   block('b2','bulletListItem','用演示代替抽象解释，让操作本身讲故事。'),
   block('h2','heading','准备清单',{level:2}),
   block('c1','checkListItem','明确听众最关心的三个问题',{checked:true}),
   block('c2','checkListItem','准备一个完整、可复现的演示',{checked:false}),
   block('c3','checkListItem','留出讨论和提问的时间',{checked:false}),
  ]}});
  await api(`/projects/${pid}/pages`,{title:'参考案例与灵感收集'});
  await api(`/projects/${pid}/pages`,{title:'彩排反馈与复盘'});
  const event=await api(`/projects/${pid}/events`,{title:'第一次分享彩排',start_at:'2026-11-09T14:00:00+08:00',end_at:'2026-11-09T15:00:00+08:00'});
  await api(`/projects/${pid}/events`,{title:'讲稿与视觉检查',start_at:'2026-11-06T10:00:00+08:00',end_at:'2026-11-06T11:00:00+08:00'});
  await api(`/projects/${pid}/events`,{title:'正式分享',start_at:'2026-11-12T15:00:00+08:00',end_at:'2026-11-12T16:00:00+08:00'});
  await api(`/relations/task-page/${tasks[2].id}/${note.id}`,null,'PUT');await api(`/relations/page-event/${note.id}/${event.id}`,null,'PUT');
  const d=await api(`/projects/${pid}/property-definitions/pages`,{kind:'single_select',name:'内容类型'});
  const definition=await api(`/property-definitions/${d.id}`,{version:d.version,options:[{id:'outline',name:'分享大纲',color:'blue'},{id:'reference',name:'参考资料',color:'green'}]},'PATCH');
  await api(`/objects/pages/${note.id}/custom-properties/${d.id}`,{version:0,definition_version:definition.version,value:'outline'},'PUT');
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'});
  fs.mkdirSync(output,{recursive:true});
  const options={viewport:{width:1680,height:1120},deviceScaleFactor:1,locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce'};
  context=await browser.newContext(options);const page=await context.newPage();
  await page.goto(base+`/projects/${pid}`);await page.getByRole('link',{name:'让好想法，更容易被理解',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);await pause(300);
  await page.screenshot({path:path.join(output,'project-overview.png')});
  await page.goto(base+`/projects/${pid}/tasks`);await page.getByRole('button',{name:'整理故事线与讲稿大纲',exact:true}).waitFor();await page.locator('body').click({position:{x:230,y:70}});await pause(200);await page.screenshot({path:path.join(output,'task-list.png')});
  await page.getByRole('group',{name:'任务视图',exact:true}).getByRole('button',{name:'看板',exact:true}).click();await page.getByRole('region',{name:'任务看板',exact:true}).waitFor();await page.locator('body').click({position:{x:230,y:70}});await pause(200);await page.screenshot({path:path.join(output,'task-board.png')});
  await page.goto(base+`/projects/${pid}/pages/${note.id}`);await page.getByRole('textbox',{name:'Markdown 正文',exact:true}).waitFor();await page.getByRole('button',{name:'展开属性',exact:true}).click();await page.getByRole('button',{name:'属性值 内容类型',exact:true}).waitFor();await pause(250);await page.screenshot({path:path.join(output,'block-note.png')});
  await page.goto(base+`/projects/${pid}/events`);await page.locator('.fc-dayGridMonth-button').click();await page.getByText('正式分享',{exact:true}).first().waitFor();await page.locator('body').click({position:{x:230,y:70}});await pause(200);await page.screenshot({path:path.join(output,'calendar.png')});
  await context.close();
  context=await browser.newContext(options);const tour=await context.newPage();
  const frames=path.join(output,'.frames');fs.mkdirSync(frames,{recursive:true});let recording=true,frame=0;
  const capture=(async()=>{while(recording){const start=Date.now();try{await tour.screenshot({path:path.join(frames,String(frame++).padStart(5,'0')+'.png')});}catch{}await pause(Math.max(0,200-(Date.now()-start)));}})();
  await tour.goto(base+`/projects/${pid}`);await tour.getByRole('link',{name:'让好想法，更容易被理解',exact:true}).waitFor();await pause(1600);
  await tour.getByRole('link',{name:/查看全部任务/}).click();await tour.getByRole('button',{name:'整理故事线与讲稿大纲',exact:true}).waitFor();await pause(1600);
  await tour.getByRole('group',{name:'任务视图',exact:true}).getByRole('button',{name:'看板',exact:true}).click();await pause(1800);
  const board=tour.getByRole('region',{name:'任务看板',exact:true});await board.locator(`article[data-task-id="${tasks[2].id}"]`).dragTo(board.locator('[data-stage="done"]'));await pause(1800);
  await tour.goto(base+`/projects/${pid}/pages/${note.id}`);await tour.getByRole('textbox',{name:'Markdown 正文',exact:true}).waitFor();await pause(1500);await tour.getByRole('button',{name:'展开属性',exact:true}).click();await pause(1800);
  await tour.goto(base+`/projects/${pid}/events`);await tour.locator('.fc-dayGridMonth-button').click();await tour.getByText('正式分享',{exact:true}).first().waitFor();await pause(1800);
  recording=false;await capture;await context.close();context=null;
  execFileSync('ffmpeg',['-y','-framerate','5','-i',path.join(frames,'%05d.png'),'-vf','scale=1440:-2','-c:v','libx264','-preset','slow','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-an',path.join(output,'product-tour.mp4')],{stdio:'ignore'});fs.rmSync(frames,{recursive:true,force:true});
  console.log(JSON.stringify({image,project:pid,output,captures:5,video:'product-tour.mp4'},null,2));
 }finally{if(context)await context.close();if(browser)await browser.close();try{docker('rm','-f',name)}catch{}try{docker('volume','rm',name)}catch{}}
})().catch(e=>{console.error(e);process.exitCode=1});
