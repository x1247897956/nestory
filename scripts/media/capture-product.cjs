// Reproducible product captures. Mutates ONLY its own disposable container/volume.
const usage='Usage: node scripts/media/capture-product.cjs [backend-image] [frontend-image] [zh-CN|en]';
const args=process.argv.slice(2);
if(args.length===1&&['--help','-h'].includes(args[0])){console.log(usage);process.exit(0);}
const [image='noteapp:test',frontendImage='noteapp-web:test',language='zh-CN']=args;
if(args.length>3||!['zh-CN','en'].includes(language)){console.error(usage);process.exit(2);}
const {chromium}=require('../../web/node_modules/@playwright/test');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const name='noteapp-media-'+Date.now();
const output=path.resolve(__dirname,'../../docs/assets',language==='en'?'en':'.');
const docker=(...values)=>execFileSync('docker',values,{encoding:'utf8'}).trim();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const text=value=>[{type:'text',text:value,styles:{}}];
const block=(id,type,value,props={})=>({id,type,props,content:text(value),children:[]});
const demos={
 'zh-CN':{
  projects:[['设计一次更好的分享','从灵感到讲稿，让准备有条不紊。'],['阅读与思考','记录值得反复阅读的内容。'],['个人计划','给长期目标留出时间。']],
  tasks:['收集优秀案例与参考资料','确定分享主题与听众','整理故事线与讲稿大纲','设计关键页面与演示素材','邀请朋友进行第一次彩排','根据反馈打磨表达','整理问答与延伸阅读','发布讲稿与复盘笔记'],
  notes:['让好想法，更容易被理解','参考案例与灵感收集','彩排反馈与复盘'],
  body:[
   '一次好的分享，不是把所有资料都讲完，而是让听众带走一个清晰的想法。',
   '从一个真实问题开始',
   '用一个具体的场景说明：我们为什么需要把笔记、行动和时间放在一起？',
   '先讲遇到的问题，再展示解决问题的过程。',
   '用演示代替抽象解释，让操作本身讲故事。',
   '准备清单','明确听众最关心的三个问题','准备一个完整、可复现的演示','留出讨论和提问的时间',
  ],
  events:['第一次分享彩排','讲稿与视觉检查','正式分享'],
  property:'内容类型',options:['分享大纲','参考资料'],
  ui:{taskView:'任务视图',board:'看板',taskBoard:'任务看板',showProperties:'展开属性',propertyValue:'属性值 内容类型',allTasks:'查看全部任务'},
 },
 en:{
  projects:[['Prepare a better talk','Turn ideas into a clear story, one step at a time.'],['Reading and reflection','Keep ideas worth coming back to.'],['Personal plans','Make time for long-term goals.']],
  tasks:['Collect examples and references','Choose the topic and audience','Shape the story and talk outline','Design key slides and demo materials','Invite friends to the first rehearsal','Refine the talk with feedback','Prepare Q&A and further reading','Publish slides and reflection notes'],
  notes:['Make good ideas easy to understand','References and inspiration','Rehearsal feedback and reflection'],
  body:[
   'A good talk does not cover every reference. It gives the audience one clear idea to take away.',
   'Start with a real problem',
   'Use a concrete example: why should notes, actions, and time live together?',
   'Explain the problem first, then show how to solve it.',
   'Replace abstract explanations with a demo. Let the actions tell the story.',
   'Preparation checklist','Identify the audience\'s three main questions','Prepare a complete, reproducible demo','Leave time for discussion and questions',
  ],
  events:['First rehearsal','Slide review','The main talk'],
  property:'Content type',options:['Talk outline','References'],
  ui:{taskView:'Task view',board:'Board',taskBoard:'Task board',showProperties:'Show properties',propertyValue:'Property value Content type',allTasks:'View all tasks'},
 },
};
const demo=demos[language];
(async()=>{
 let browser,context,frames,capture,recording=false;
 try{
  docker('volume','create',name);
  docker('network','create',name);
  docker('run','-d','--name',name,'--network',name,'--network-alias','noteapp','-v',name+':/data',image);
  docker('run','-d','--name',name+'-frontend','--network',name,'-p','127.0.0.1::8080',frontendImage);
  const inspect=JSON.parse(docker('inspect',name+'-frontend'))[0];
  const port=inspect.NetworkSettings.Ports['8080/tcp'][0].HostPort;const base='http://127.0.0.1:'+port;
  let ready=false;
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/v1/readyz')).ok){ready=true;break;}}catch{}await pause(100);}
  if(!ready)throw Error('Disposable media instance did not become ready');
  const api=async(url,data,method='POST')=>{const r=await fetch(base+'/api/v1'+url,{method,headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});if(!r.ok)throw Error(url+': '+r.status+' '+await r.text());return r.status===204?null:r.json()};
  const project=await api('/projects',{title:demo.projects[0][0],description:demo.projects[0][1]});
  for(const [title,description]of demo.projects.slice(1))await api('/projects',{title,description});
  const pid=project.id;const tasks=[];
  const taskMetadata=[
   ['done','medium','2026-11-03'],['done','high','2026-11-04'],
   ['in_process','high','2026-11-06'],['in_process','medium','2026-11-07'],
   ['in_plan','medium','2026-11-09'],['in_plan','high','2026-11-10'],
   ['todo','low','2026-11-11'],['todo','none','2026-11-12'],
  ];
  for(const [index,[stage,priority,due_date]]of taskMetadata.entries())tasks.push(await api(`/projects/${pid}/tasks`,{title:demo.tasks[index],stage,priority,due_date}));
  const note=await api(`/projects/${pid}/pages`,{title:demo.notes[0],body_document:{version:1,blocks:[
   block('intro','paragraph',demo.body[0]),block('h1','heading',demo.body[1],{level:2}),
   block('p1','paragraph',demo.body[2]),block('b1','bulletListItem',demo.body[3]),block('b2','bulletListItem',demo.body[4]),
   block('h2','heading',demo.body[5],{level:2}),block('c1','checkListItem',demo.body[6],{checked:true}),
   block('c2','checkListItem',demo.body[7],{checked:false}),block('c3','checkListItem',demo.body[8],{checked:false}),
  ]}});
  for(const title of demo.notes.slice(1))await api(`/projects/${pid}/pages`,{title});
  const event=await api(`/projects/${pid}/events`,{title:demo.events[0],start_at:'2026-11-09T14:00:00+08:00',end_at:'2026-11-09T15:00:00+08:00'});
  await api(`/projects/${pid}/events`,{title:demo.events[1],start_at:'2026-11-06T10:00:00+08:00',end_at:'2026-11-06T11:00:00+08:00'});
  await api(`/projects/${pid}/events`,{title:demo.events[2],start_at:'2026-11-12T15:00:00+08:00',end_at:'2026-11-12T16:00:00+08:00'});
  await api(`/relations/task-page/${tasks[2].id}/${note.id}`,null,'PUT');await api(`/relations/page-event/${note.id}/${event.id}`,null,'PUT');
  const d=await api(`/projects/${pid}/property-definitions/pages`,{kind:'single_select',name:demo.property});
  const definition=await api(`/property-definitions/${d.id}`,{version:d.version,options:[{id:'outline',name:demo.options[0],color:'blue'},{id:'reference',name:demo.options[1],color:'green'}]},'PATCH');
  await api(`/objects/pages/${note.id}/custom-properties/${d.id}`,{version:0,definition_version:definition.version,value:'outline'},'PUT');
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
  fs.mkdirSync(output,{recursive:true});
  const options={viewport:{width:1680,height:1120},deviceScaleFactor:1,locale:language==='en'?'en-US':'zh-CN',timezoneId:'Asia/Shanghai',colorScheme:'light',reducedMotion:'reduce'};
  const createContext=async()=>{
   const next=await browser.newContext(options);
   await next.addInitScript(({language})=>{
    localStorage.setItem('noteapp:settings:v1',JSON.stringify({language,theme:'light',calendarView:'dayGridMonth',hourCycle:'24',firstDay:1}));
   },{language});
   return next;
  };
  const createPage=async()=>{
   context=await createContext();const page=await context.newPage();
   // Keep the sample calendar month reproducible without changing timers.
   await page.clock.setFixedTime(new Date('2026-11-06T09:00:00+08:00'));
   return page;
  };
  const waitForNote=async page=>{
   await page.locator('[contenteditable="true"][role="textbox"]').waitFor();
  };
  const page=await createPage();
  await page.goto(base+`/projects/${pid}`);await page.getByRole('link',{name:demo.notes[0],exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);await pause(300);
  await page.screenshot({path:path.join(output,'project-overview.png')});
  await page.goto(base+`/projects/${pid}/tasks`);await page.getByRole('button',{name:demo.tasks[2],exact:true}).waitFor();await page.locator('body').click({position:{x:230,y:70}});await pause(200);await page.screenshot({path:path.join(output,'task-list.png')});
  await page.getByRole('group',{name:demo.ui.taskView,exact:true}).getByRole('button',{name:demo.ui.board,exact:true}).click();await page.getByRole('region',{name:demo.ui.taskBoard,exact:true}).waitFor();await page.locator('body').click({position:{x:230,y:70}});await pause(200);await page.screenshot({path:path.join(output,'task-board.png')});
  await page.goto(base+`/projects/${pid}/pages/${note.id}`);await waitForNote(page);await page.getByRole('button',{name:demo.ui.showProperties,exact:true}).click();await page.getByRole('button',{name:demo.ui.propertyValue,exact:true}).waitFor();await pause(250);await page.screenshot({path:path.join(output,'block-note.png')});
  await page.goto(base+`/projects/${pid}/events`);await page.locator('.fc-dayGridMonth-button').click();await page.getByText(demo.events[2],{exact:true}).first().waitFor();await page.locator('body').click({position:{x:230,y:70}});await pause(200);await page.screenshot({path:path.join(output,'calendar.png')});
  await context.close();context=null;
  const tour=await createPage();
  frames=fs.mkdtempSync(path.join(os.tmpdir(),name+'-frames-'));recording=true;let frame=0;
  capture=(async()=>{while(recording){const start=Date.now();try{await tour.screenshot({path:path.join(frames,String(frame++).padStart(5,'0')+'.png')});}catch{}await pause(Math.max(0,200-(Date.now()-start)));}})();
  await tour.goto(base+`/projects/${pid}`);await tour.getByRole('link',{name:demo.notes[0],exact:true}).waitFor();await pause(1600);
  await tour.getByRole('link',{name:demo.ui.allTasks,exact:false}).click();await tour.getByRole('button',{name:demo.tasks[2],exact:true}).waitFor();await pause(1600);
  await tour.getByRole('group',{name:demo.ui.taskView,exact:true}).getByRole('button',{name:demo.ui.board,exact:true}).click();await pause(1800);
  const board=tour.getByRole('region',{name:demo.ui.taskBoard,exact:true});await board.locator(`article[data-task-id="${tasks[2].id}"]`).dragTo(board.locator('[data-stage="done"]'));await pause(1800);
  await tour.goto(base+`/projects/${pid}/pages/${note.id}`);await waitForNote(tour);await pause(1500);await tour.getByRole('button',{name:demo.ui.showProperties,exact:true}).click();await pause(1800);
  await tour.goto(base+`/projects/${pid}/events`);await tour.locator('.fc-dayGridMonth-button').click();await tour.getByText(demo.events[2],{exact:true}).first().waitFor();await pause(1800);
  recording=false;await capture;await context.close();context=null;
  execFileSync('ffmpeg',['-y','-framerate','5','-i',path.join(frames,'%05d.png'),'-vf','scale=1440:-2','-c:v','libx264','-preset','slow','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-an',path.join(output,'product-tour.mp4')],{stdio:'ignore'});
  console.log(JSON.stringify({image,frontendImage,language,project:pid,output,captures:5,video:'product-tour.mp4'},null,2));
 }finally{
  recording=false;if(capture)await capture;
  if(context)await context.close();if(browser)await browser.close();if(frames)fs.rmSync(frames,{recursive:true,force:true});
  try{docker('rm','-f',name+'-frontend',name)}catch{}try{docker('network','rm',name)}catch{}try{docker('volume','rm',name)}catch{}
 }
})().catch(e=>{console.error(e);process.exitCode=1});
