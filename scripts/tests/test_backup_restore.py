"""Real Docker acceptance for fail-safe offline backups. Uses only its own temporary names."""
import json, os, pathlib, subprocess, tempfile, time, unittest, urllib.request, uuid
ROOT = pathlib.Path(__file__).resolve().parents[2]
IMAGE = os.environ.get('NOTEAPP_TEST_IMAGE', 'noteapp:local')
def run(*args, check=True):
 result=subprocess.run(args,text=True,capture_output=True)
 if check and result.returncode: raise RuntimeError(str(args)+'\n'+result.stdout+'\n'+result.stderr)
 return result
class BackupRestore(unittest.TestCase):
 def setUp(self):
  self.name='noteapp-backup-test-'+uuid.uuid4().hex[:10]; self.target=self.name+'-restored';self.tmp=tempfile.TemporaryDirectory();self.out=pathlib.Path(self.tmp.name)/'backup'
  run('docker','volume','create',self.name);run('docker','volume','create',self.target)
  run('docker','run','-d','--name',self.name,'-p','127.0.0.1::8080','-v',self.name+':/data',IMAGE)
  binding=json.loads(run('docker','inspect',self.name).stdout)[0]['NetworkSettings']['Ports']['8080/tcp'][0];self.url='http://127.0.0.1:'+binding['HostPort']
  for _ in range(100):
   try:self.api('/readyz');break
   except Exception:time.sleep(.1)
  self.project=self.api('/projects',{'title':'Backup中文'});self.task=self.api('/projects/'+self.project['id']+'/tasks',{'title':'Task','body':'persisted正文'})
 def api(self,path,body=None):
  req=urllib.request.Request(self.url+'/api/v1'+path,data=json.dumps(body).encode() if body else None,headers={'Content-Type':'application/json'})
  with urllib.request.urlopen(req,timeout=5) as res:return json.load(res)
 def tearDown(self):
  for c in [self.name,self.target]:run('docker','rm','-f',c,check=False)
  for v in [self.name,self.target]:run('docker','volume','rm',v,check=False)
  self.tmp.cleanup()
 def backup(self,**kwargs):return run(str(ROOT/'scripts/backup.sh'),'--container',self.name,'--volume',self.name,'--image',IMAGE,'--app-version','test-version','--output',str(self.out),**kwargs)
 def restore(self,**kwargs):return run(str(ROOT/'scripts/restore.sh'),'--volume',self.target,'--image',IMAGE,'--backup',str(self.out),**kwargs)
 def running(self):return json.loads(run('docker','inspect',self.name).stdout)[0]['State']['Running']
 def test_round_trip_and_reject_nonempty_target(self):
  self.backup();self.assertTrue(self.running());manifest=json.loads((self.out/'manifest.json').read_text());self.assertEqual(manifest['counts']['tasks'],1);self.restore()
  self.assertNotEqual(self.restore(check=False).returncode,0)
  run('docker','run','-d','--name',self.target,'-p','127.0.0.1::8080','-v',self.target+':/data',IMAGE)
  port=json.loads(run('docker','inspect',self.target).stdout)[0]['NetworkSettings']['Ports']['8080/tcp'][0]['HostPort'];self.url='http://127.0.0.1:'+port
  for _ in range(100):
   try:got=self.api('/tasks/'+self.task['id']);break
   except Exception:time.sleep(.1)
  self.assertEqual(got['body'],'persisted正文')
 def test_failure_after_stop_restarts_original(self):
  # Corrupt the schema so manifest validation fails after tar, not before stopping.
  run('docker','exec',self.name,'sh','-c','mkdir /data/unexpected; ln -s /etc/passwd /data/unexpected/link')
  result=self.backup(check=False);self.assertNotEqual(result.returncode,0,result.stdout);self.assertTrue(self.running());self.assertFalse(self.out.exists())
 def test_originally_stopped_stays_stopped_and_tampering_rejected(self):
  run('docker','stop',self.name);self.backup();self.assertFalse(self.running());archive=self.out/'data.tar.gz';archive.write_bytes(archive.read_bytes()+b'tamper');self.assertNotEqual(self.restore(check=False).returncode,0)
 def test_wrong_volume_rejected_without_stopping(self):
  result=run(str(ROOT/'scripts/backup.sh'),'--container',self.name,'--volume',self.target,'--image',IMAGE,'--app-version','test','--output',str(self.out),check=False);self.assertNotEqual(result.returncode,0);self.assertTrue(self.running())
if __name__=='__main__':unittest.main(verbosity=2)
