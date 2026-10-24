#!/usr/bin/env python3
"""Match installed Alpine package origins to official branch secfixes using apk comparator.
Version matches are advisory candidates, not confirmed application exploits.
"""
import argparse,hashlib,json,re,shlex,subprocess,urllib.request

def run(*args,**kw):return subprocess.check_output(args,text=True,**kw)
def main():
 p=argparse.ArgumentParser();p.add_argument('--image',required=True);a=p.parse_args()
 release=run('docker','run','--rm','--entrypoint','cat',a.image,'/etc/alpine-release').strip()
 branch='v'+'.'.join(release.split('.')[:2]);source='https://secdb.alpinelinux.org/'+branch+'/main.json'
 with urllib.request.urlopen(source,timeout=30) as f:raw=f.read()
 db=json.loads(raw);installed={}
 for line in run('docker','run','--rm','--entrypoint','apk',a.image,'list','--installed').splitlines():
  origin=re.search(r'\{([^}]+)\}',line)
  if origin:installed[origin[1]]='-'.join(line.split()[0].rsplit('-',2)[-2:])
 checks=[]
 for item in db['packages']:
  pkg=item['pkg'];name=pkg['name']
  if name in installed:
   for fixed,cves in pkg['secfixes'].items():
    if fixed!='0':checks.append({'origin':name,'installed':installed[name],'fixed':fixed,'advisories':cves})
 commands='\n'.join('apk version -t '+shlex.quote(row['installed'])+' '+shlex.quote(row['fixed']) for row in checks)+'\n'
 compared=run('docker','run','--rm','-i','--entrypoint','sh',a.image,'-s',input=commands).splitlines()
 assert len(compared)==len(checks)
 candidates=[row for row,sign in zip(checks,compared) if sign=='<']
 print(json.dumps({'source':source,'source_sha256':hashlib.sha256(raw).hexdigest(),'image':run('docker','image','inspect',a.image,'--format','{{.Id}}').strip(),'release':release,'origins':installed,'version_candidates':candidates,'scope':'official main secdb version comparison; reachability/exploitation not tested'},indent=2))
if __name__=='__main__':main()
