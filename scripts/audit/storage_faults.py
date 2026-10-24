#!/usr/bin/env python3
"""Disposable named tmpfs volume: real ENOSPC and file permission failure.
Never fills the host/production Docker disk. Requires --image.
"""
import argparse,json,subprocess,time,urllib.request,urllib.error,uuid

def cmd(*a,check=True):return subprocess.run(a,check=check,capture_output=True,text=True)
def main():
 p=argparse.ArgumentParser();p.add_argument('--image',required=True);args=p.parse_args();name='noteapp-audit-storage-'+uuid.uuid4().hex[:10];result={}
 cmd('docker','volume','create','--driver','local','--opt','type=tmpfs','--opt','device=tmpfs','--opt','o=size=2m,uid=10001,gid=10001',name)
 try:
  cmd('docker','run','-d','--name',name,'-p','127.0.0.1::8080','-v',name+':/data',args.image)
  port=json.loads(cmd('docker','inspect',name).stdout)[0]['NetworkSettings']['Ports']['8080/tcp'][0]['HostPort'];base='http://127.0.0.1:'+port+'/api/v1'
  def req(path,data=None,ctype='application/json'):
   raw=json.dumps(data).encode() if data is not None and not isinstance(data,bytes) else data
   r=urllib.request.Request(base+path,data=raw,headers={'Content-Type':ctype})
   try:
    with urllib.request.urlopen(r,timeout=10) as f:return f.status,json.load(f)
   except urllib.error.HTTPError as e:return e.code,json.load(e)
  for _ in range(100):
   try:req('/readyz');break
   except OSError:time.sleep(.1)
  status,project=req('/projects',{'title':'before full'});assert status==201;pid=project['id']
  body=b'--audit\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\n\r\naudit\r\n--audit--\r\n'
  cmd('docker','exec',name,'mkdir','-p','/data/assets');cmd('docker','exec',name,'chmod','500','/data/assets')
  result['unwritable_upload']=req('/projects/'+pid+'/assets',body,'multipart/form-data; boundary=audit');assert result['unwritable_upload'][0]==500
  cmd('docker','exec',name,'chmod','700','/data/assets')
  fill=cmd('docker','exec',name,'dd','if=/dev/zero','of=/data/audit-filler','bs=1024','count=4096',check=False);result['fill_exit']=fill.returncode;result['fill_error']=fill.stderr;assert fill.returncode!=0
  result['full_create']=req('/projects',{'title':'must not commit'});assert result['full_create'][0]==500
  result['full_upload']=req('/projects/'+pid+'/assets',body,'multipart/form-data; boundary=audit');assert result['full_upload'][0]==500
  result['baseline_read']=req('/projects/'+pid);assert result['baseline_read'][1]==project
  cmd('docker','exec',name,'rm','/data/audit-filler')
  result['after_free']=req('/projects',{'title':'after free'});assert result['after_free'][0]==201
  result['projects']=req('/projects');assert len(result['projects'][1])==2
  result['logs']=cmd('docker','logs',name).stderr
  print(json.dumps(result,ensure_ascii=False,indent=2))
 finally:
  cmd('docker','rm','-f',name,check=False);cmd('docker','volume','rm',name,check=False)
if __name__=='__main__':main()
