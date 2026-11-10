#!/usr/bin/env python3
"""Build synthetic schema6 fixtures; reject unsafe upgrade, then prepare and upgrade.
Only disposable Docker names and host temp files. --image required.
"""
import argparse,hashlib,json,pathlib,sqlite3,subprocess,tempfile,time,urllib.request,uuid
ROOT=pathlib.Path(__file__).resolve().parents[2]
def run(*a,check=True,**kw):return subprocess.run(a,check=check,capture_output=True,**kw)
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--image',required=True);a=ap.parse_args();out={}
 with tempfile.TemporaryDirectory(prefix='noteapp-audit-migration-') as work:
  dbfile=pathlib.Path(work)/'noteapp.db'
  with sqlite3.connect(dbfile) as db:
   db.execute('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)')
   for i in range(1,7):
    f=next((ROOT/'migrations').glob(f'{i:03}_*.sql'));db.executescript(f.read_text());db.execute('INSERT INTO schema_migrations VALUES(?,0)',(i,));db.commit()
   db.execute("INSERT INTO projects(id,title,created_at,updated_at) VALUES('p','legacy project',0,0)")
   db.execute("INSERT INTO tasks(id,project_id,title,body,created_at,updated_at) VALUES('t','p','task','**task正文**',0,0)")
   db.execute("INSERT INTO pages(id,project_id,title,body,created_at,updated_at) VALUES('n','p','note','# note正文',0,0)")
   db.execute("INSERT INTO events(id,project_id,title,body,start_at,end_at,created_at,updated_at) VALUES('e','p','event','- [x] event正文',1,2,0,0)")
   for table,cols,values in [('task_pages','task_id,page_id',"'t','n'"),('task_events','task_id,event_id',"'t','e'"),('page_events','page_id,event_id',"'n','e'")]:db.execute(f"INSERT INTO {table}(project_id,{cols}) VALUES('p',{values})")
   db.execute("INSERT INTO assets VALUES('a','p','audit.txt','abcdef','text/plain',5,0)")
  def install_and_start(label):
   name='noteapp-audit-migrate-'+uuid.uuid4().hex[:10];run('docker','volume','create',name)
   with dbfile.open('rb') as f:run('docker','run','--rm','-i','--user','0:0','--entrypoint','sh','-v',name+':/data',a.image,'-ec',"cat > /data/noteapp.db; mkdir -p /data/assets; printf audit > /data/assets/abcdef; chown -R 10001:10001 /data",stdin=f)
   run('docker','run','-d','--name',name,'-p','127.0.0.1::8080','-v',name+':/data',a.image)
   return name
  name=install_and_start('unprepared')
  try:
   for _ in range(100):
    state=json.loads(run('docker','inspect',name).stdout)[0]['State']
    if not state['Running']:break
    time.sleep(.1)
   assert state['ExitCode']==1
   out['unprepared_logs']=run('docker','logs',name).stderr.decode();assert 'legacy Markdown' in out['unprepared_logs']
   copied=pathlib.Path(work)/'rejected.db';run('docker','cp',name+':/data/noteapp.db',str(copied))
   with sqlite3.connect(copied) as db:
    out['rejected_schema']=db.execute('SELECT max(version) FROM schema_migrations').fetchone()[0];assert out['rejected_schema']==6
    assert db.execute("SELECT body FROM pages WHERE id='n'").fetchone()[0]=='# note正文'
  finally:run('docker','rm','-f',name);run('docker','volume','rm',name)
  for i in range(2):
   prep=run('node',str(ROOT/'scripts/prepare-block-migration.mjs'),'--database',str(dbfile),'--offline');out['prepare_'+str(i)]=prep.stdout.decode().strip()
  with sqlite3.connect(dbfile) as db:prepared={k:bytes(v) for k,v in db.execute('SELECT object_id,body_document FROM block_migration_prepared')}
  name=install_and_start('prepared')
  try:
   info=json.loads(run('docker','inspect',name).stdout)[0];port=info['NetworkSettings']['Ports']['8080/tcp'][0]['HostPort'];base='http://127.0.0.1:'+port+'/api/v1'
   def get(path):
    with urllib.request.urlopen(base+path,timeout=5) as r:return r.read()
   for _ in range(100):
    try:get('/readyz');break
    except OSError:time.sleep(.1)
   out['objects']={}
   for typ,key in [('tasks','t'),('pages','n'),('events','e')]:
    obj=json.loads(get('/'+typ+'/'+key));assert obj['body_document']==json.loads(prepared[key]);assert 'body' not in obj;assert len(json.loads(get('/'+typ+'/'+key+'/relations')))==2;out['objects'][typ]=obj
   out['asset_sha256']=hashlib.sha256(get('/assets/a')).hexdigest();assert out['asset_sha256']==hashlib.sha256(b'audit').hexdigest()
   run('docker','stop',name);copied=pathlib.Path(work)/'upgraded.db';run('docker','cp',name+':/data/noteapp.db',str(copied))
   with sqlite3.connect(copied) as db:
    out['schema']=db.execute('SELECT max(version) FROM schema_migrations').fetchone()[0];assert out['schema']==10
    out['integrity']=db.execute('PRAGMA integrity_check').fetchone()[0];assert out['integrity']=='ok';assert not db.execute('PRAGMA foreign_key_check').fetchall()
   print(json.dumps(out,ensure_ascii=False,indent=2))
  finally:run('docker','rm','-f',name);run('docker','volume','rm',name)
if __name__=='__main__':main()
