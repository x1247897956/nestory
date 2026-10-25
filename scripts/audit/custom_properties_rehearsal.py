#!/usr/bin/env python3
"""Read a source backup; upgrade only disposable copies and verify clean restore."""
import argparse,json,pathlib,subprocess,tempfile,sqlite3,sys,time,uuid,urllib.request
from collections import Counter

def main():
 ROOT=pathlib.Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts'))
 from operations import extract,validate_bundle
 parser=argparse.ArgumentParser(description='Upgrade a backup copy and restore four custom property types; only owns temporary containers/volumes.')
 parser.add_argument('--image',required=True);parser.add_argument('--source-image',required=True);parser.add_argument('--backup',required=True)
 args=parser.parse_args();old=args.source_image;new=args.image;source=pathlib.Path(args.backup).resolve()
 stamp=time.strftime('%Y-%m-%d');tag=uuid.uuid4().hex[:10];first='noteapp-custom-upgrade-'+tag;second='noteapp-custom-restore-'+tag
 upgraded=ROOT/'backups'/(stamp+'-custom-upgrade-'+tag);valued=ROOT/'backups'/(stamp+'-custom-values-'+tag)
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
 def run(*args):return subprocess.run(args,check=True,capture_output=True,text=True).stdout.strip()
 def request(base,path,data=None,method=None):
  req=urllib.request.Request(base+'/api/v1'+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'},method=method)
  with opener.open(req,timeout=10) as res:return json.load(res)
 def address(name):
  port=json.loads(run('docker','inspect',name))[0]['NetworkSettings']['Ports']['8080/tcp'][0]['HostPort'];base='http://127.0.0.1:'+port
  for _ in range(100):
   try:request(base,'/readyz');return base
   except OSError:time.sleep(.1)
  raise RuntimeError('Readiness timeout')
 def start(name):
  run('docker','run','-d','--name',name,'-p','127.0.0.1::8080','-v',name+':/data',new)
  return address(name)
 def backup(name,out):run(str(ROOT/'scripts/backup.sh'),'--container',name,'--volume',name,'--image',new,'--app-version','custom-properties-rehearsal','--output',str(out))
 try:
  for name in [first,second]:run('docker','volume','create',name)
  run(str(ROOT/'scripts/restore.sh'),'--volume',first,'--image',old,'--backup',str(source))
  base=start(first);backup(first,upgraded);base=address(first)
  ma,mb=validate_bundle(source),validate_bundle(upgraded)
  assert ma['schema_versions']==list(range(1,9));assert ma['assets']==mb['assets'];assert mb['schema_versions']==list(range(1,10))
  with tempfile.TemporaryDirectory(prefix='noteapp-custom-upgrade-compare-') as tmp:
   roots=[]
   for i,bundle in enumerate([source,upgraded]):
    root=pathlib.Path(tmp)/str(i);root.mkdir();extract(bundle/'data.tar.gz',root);roots.append(root)
   with sqlite3.connect(roots[0]/'noteapp.db') as a,sqlite3.connect(roots[1]/'noteapp.db') as b:
    tables=[r[0] for r in a.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
    for table in tables:
     q='SELECT * FROM "'+table.replace('"','""')+'"'
     if table=='schema_migrations':q+=' WHERE version<=8'
     assert Counter(a.execute(q).fetchall())==Counter(b.execute(q).fetchall()),table
  print('PASS actual schema8 backup upgraded to9:',len(tables),'original tables unchanged except added migration9; attachments unchanged',flush=True)
  p=request(base,'/projects',{'title':'Isolated custom property restore test'})
  n=request(base,'/projects/'+p['id']+'/pages',{'title':'Restored properties'})
  for kind,value in [('text','实际恢复演练中文'),('url','https://example.com/restore'),('single_select','x1'),('multi_select',['x1','x2'])]:
   d=request(base,'/projects/'+p['id']+'/property-definitions/pages',{'kind':kind})
   if 'select' in kind:d=request(base,'/property-definitions/'+d['id'],{'version':1,'options':[{'id':'x1','name':'第一项'},{'id':'x2','name':'第二项'}]},'PATCH')
   request(base,'/objects/pages/'+n['id']+'/custom-properties/'+d['id'],{'version':0,'definition_version':d['version'],'value':value},'PUT')
  expected=request(base,'/objects/pages/'+n['id']+'/custom-properties');backup(first,valued)
  run(str(ROOT/'scripts/restore.sh'),'--volume',second,'--image',new,'--backup',str(valued))
  restored=start(second)
  assert request(restored,'/objects/pages/'+n['id']+'/custom-properties')==expected
  assert request(restored,'/pages/'+n['id'])['body_document']==n['body_document']
  print('PASS clean-volume restore: all four definitions/options/values/versions and native body preserved',flush=True)
  print('Verified rehearsal backup directories:',upgraded.name,valued.name,flush=True)
 finally:
  for name in [first,second]:
   subprocess.run(['docker','rm','-f',name],capture_output=True)
   subprocess.run(['docker','volume','rm',name],capture_output=True)

if __name__=="__main__":main()
