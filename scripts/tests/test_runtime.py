"""Delivery checks on the final image. Never touches existing application volumes."""
import json, os, pathlib, sqlite3, subprocess, tempfile, time, unittest, urllib.request, urllib.error, uuid
IMAGE=os.environ.get('NOTEAPP_TEST_IMAGE','noteapp:local')
def run(*args,**kwargs):return subprocess.run(args,check=True,capture_output=True,**kwargs)
class Runtime(unittest.TestCase):
 def setUp(self):self.name='noteapp-runtime-test-'+uuid.uuid4().hex[:8];run('docker','volume','create',self.name)
 def tearDown(self):subprocess.run(['docker','rm','-f',self.name],capture_output=True);subprocess.run(['docker','volume','rm',self.name],capture_output=True)
 def start(self,*args):run('docker','run','-d','--name',self.name,'-p','127.0.0.1::8080','-v',self.name+':/data',*args,IMAGE)
 def wait_exit(self):
  for _ in range(100):
   state=json.loads(run('docker','inspect',self.name).stdout)[0]['State']
   if not state['Running']:return state
   time.sleep(.1)
  self.fail('Startup failure did not exit')
 def test_runtime_version_matches_build_revision(self):
  self.start('-e','APP_VERSION=runtime-override-ignored')
  container=json.loads(run('docker','inspect',self.name).stdout)[0]
  port=container['NetworkSettings']['Ports']['8080/tcp'][0]['HostPort'];base='http://127.0.0.1:'+port+'/api/v1'
  for _ in range(100):
   try:
    with urllib.request.urlopen(base+'/readyz',timeout=2):break
   except OSError:time.sleep(.1)
  image=json.loads(run('docker','image','inspect',IMAGE).stdout)[0]
  expected=image['Config']['Labels']['org.opencontainers.image.revision']
  self.assertTrue(expected)
  with urllib.request.urlopen(base+'/config',timeout=5) as response:config=json.load(response)
  self.assertEqual(config['version'],expected)
 def test_migration_failure_exits_without_listening(self):
  with tempfile.TemporaryDirectory() as tmp:
   file=pathlib.Path(tmp)/'bad.db'
   with sqlite3.connect(file) as db:db.execute('CREATE TABLE tasks(deliberately_conflicting TEXT)')
   with file.open('rb') as stream:subprocess.run(['docker','run','--rm','-i','--user','0:0','--entrypoint','/bin/sh','-v',self.name+':/data',IMAGE,'-ec','cat > /data/noteapp.db; chown -R 10001:10001 /data'],stdin=stream,check=True,capture_output=True)
  self.start();self.assertEqual(self.wait_exit()['ExitCode'],1);logs=run('docker','logs',self.name).stderr.decode();self.assertIn('migrate:',logs);self.assertNotIn('listening',logs)
 def test_nonroot_unwritable_volume_exits(self):
  run('docker','run','--rm','--user','0:0','--entrypoint','/bin/sh','-v',self.name+':/data',IMAGE,'-ec','chown 0:0 /data; chmod 700 /data')
  self.start();self.assertEqual(self.wait_exit()['ExitCode'],1);self.assertIn('unable to open database',run('docker','logs',self.name).stderr.decode().lower())
 def test_upload_limit_json_and_graceful_nonroot_shutdown(self):
  self.start('-e','APP_UPLOAD_LIMIT=32');p=json.loads(run('docker','inspect',self.name).stdout)[0]['NetworkSettings']['Ports']['8080/tcp'][0]['HostPort'];base='http://127.0.0.1:'+p+'/api/v1'
  for _ in range(100):
   try:urllib.request.urlopen(base+'/readyz',timeout=2);break
   except Exception:time.sleep(.1)
  self.assertEqual(run('docker','exec',self.name,'id','-u').stdout.strip(),b'10001')
  def call(path,data,ctype='application/json'):
   req=urllib.request.Request(base+path,data=data,headers={'Content-Type':ctype})
   try:
    with urllib.request.urlopen(req) as res:return res.status,json.load(res)
   except urllib.error.HTTPError as err:
    with err:return err.code,json.load(err)
  for malformed in [b'{',b'{"title":"x"} {"title":"y"}',b'{"title":"x","unknown":1}',b'null']:
   status,body=call('/projects',malformed);self.assertEqual(status,400);self.assertIn('error',body)
  status,project=call('/projects',b'{"title":"limit"}');self.assertEqual(status,201)
  boundary='noteapp-test';data=('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="large.txt"\r\nContent-Type: text/plain\r\n\r\n'+'x'*33+'\r\n--'+boundary+'--\r\n').encode();status,body=call('/projects/'+project['id']+'/assets',data,'multipart/form-data; boundary='+boundary);self.assertEqual(status,413);self.assertEqual(body['error']['code'],'too_large')
  start=time.monotonic();run('docker','stop','--time','15',self.name);self.assertLess(time.monotonic()-start,15);self.assertEqual(self.wait_exit()['ExitCode'],0)
if __name__=='__main__':unittest.main(verbosity=2)
