#!/usr/bin/env python3
"""Independent release probes. ONLY starts and mutates its own disposable Docker volume.
Usage: python3 scripts/audit/release_probe.py --image noteapp:release-audit-20261025
"""
import argparse, concurrent.futures, hashlib, json, statistics, subprocess, time, urllib.request, urllib.error, uuid, os, pathlib

def run(*args):
    return subprocess.check_output(args, text=True).strip()

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--image',required=True); parser.add_argument('--count',type=int,default=1000); parser.add_argument('--browser',action='store_true'); args=parser.parse_args()
    name='noteapp-audit-probe-'+uuid.uuid4().hex[:10]
    run('docker','volume','create',name)
    result={'image':run('docker','image','inspect',args.image,'--format','{{.Id}}'),'container':name,'count_per_type':args.count}
    try:
        run('docker','run','-d','--name',name,'-p','127.0.0.1::8080','-v',name+':/data',args.image)
        port=json.loads(run('docker','inspect',name))[0]['NetworkSettings']['Ports']['8080/tcp'][0]['HostPort']
        base='http://127.0.0.1:'+port+'/api/v1'
        def req(path,body=None,method=None,headers=None):
            r=urllib.request.Request(base+path,data=None if body is None else json.dumps(body,ensure_ascii=False).encode(),method=method,headers={'Content-Type':'application/json',**(headers or {})})
            start=time.perf_counter()
            try:
                with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(r,timeout=60) as res: raw=res.read(); return res.status,json.loads(raw),len(raw),(time.perf_counter()-start)*1000
            except urllib.error.HTTPError as e:return e.code,json.loads(e.read()),0,(time.perf_counter()-start)*1000
        for _ in range(100):
            try: req('/readyz');break
            except (OSError,json.JSONDecodeError):time.sleep(.1)
        p=req('/projects',{'title':'Independent audit'})[1]; pid=p['id']
        result['cross_origin']=req('/projects',{'title':'must reject'},headers={'Origin':'http://evil.example'})[0]
        result['foreign_host']=req('/projects',{'title':'foreign host'},headers={'Host':'audit.invalid','Origin':'http://audit.invalid'})[0]
        # malformed native documents accepted by server, browser reopen checked separately.
        fixtures=[{'id':'bad-style','type':'paragraph','content':[{'type':'text','text':'untrusted','styles':{'unknown':True}}]}, {'id':'bad-table','type':'table','content':{'type':'tableContent','headerRows':4294967296,'rows':[{'cells':[[]]}]}}]
        result['malformed_documents']=[]
        for block in fixtures:
            status,obj,_,_=req('/projects/'+pid+'/pages',{'title':'malformed-'+block['id'],'body_document':{'version':1,'blocks':[block]}})
            result['malformed_documents'].append({'status':status,'id':obj.get('id'),'block':block})
        # Eight simultaneous retries must commit one result.
        payload={'title':'retry','request_id':uuid.uuid4().hex}
        with concurrent.futures.ThreadPoolExecutor(8) as pool: replay=list(pool.map(lambda _:req('/projects/'+pid+'/tasks',payload),range(8)))
        result['idempotency']={'statuses':[x[0] for x in replay],'unique_ids':len({x[1]['id'] for x in replay})}
        doc={'version':1,'blocks':[{'id':'paragraph','type':'paragraph','content':[{'type':'text','text':'中文正文容量-'+('representative text '*400),'styles':{}}]}]}
        start=time.perf_counter()
        for typ in ('pages','tasks','events'):
            for i in range(args.count):
                body={'title':f'{typ}-{i}','body_document':doc}
                if typ=='events':body.update(start_at='2026-10-25T09:00:00+08:00',end_at='2026-10-25T10:00:00+08:00')
                if typ=='tasks':body['due_date']='2026-10-25'
                status,created,_,_=req('/projects/'+pid+'/'+typ,body)
                if typ=='pages' and i==0:firstnote=created['id']
                assert status==201,(typ,status)
                result['last_seed']=[typ,i]
        result['attachments']=[]
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
        for i in range(10):
            content=os.urandom(1<<20)
            raw=b'--audit\r\nContent-Disposition: form-data; name="file"; filename="capacity.bin"\r\nContent-Type: application/octet-stream\r\n\r\n'+content+b'\r\n--audit--\r\n'
            request=urllib.request.Request(base+'/projects/'+pid+'/assets',data=raw,headers={'Content-Type':'multipart/form-data; boundary=audit'})
            with opener.open(request,timeout=60) as response:asset=json.load(response)
            with opener.open(base+'/assets/'+asset['id'],timeout=60) as response:downloaded=response.read()
            digest=hashlib.sha256(content).hexdigest();assert hashlib.sha256(downloaded).hexdigest()==digest
            result['attachments'].append({'id':asset['id'],'bytes':len(content),'sha256':digest})
        result['seed_seconds']=round(time.perf_counter()-start,3)
        result['measurements']={}
        paths={'pages':'/projects/'+pid+'/pages','tasks':'/projects/'+pid+'/tasks','events':'/projects/'+pid+'/events?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z','search_miss':'/search?q=absent-audit-token','search_body':'/search?q=representative','dashboard':'/workspace?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z'}
        for key,path in paths.items():
            samples=[req(path) for _ in range(7)]
            assert all(x[0]==200 for x in samples)
            durations=sorted(x[3] for x in samples)
            result['measurements'][key]={'bytes':samples[-1][2],'median_ms':round(statistics.median(durations),2),'max_ms':round(max(durations),2)}
        # Single-connection queuing visible to an edit during eight concurrent searches.
        current_note=req('/pages/'+firstnote)[1]
        with concurrent.futures.ThreadPoolExecutor(9) as pool:
            pending=[pool.submit(req,'/search?q=absent-audit-token') for _ in range(8)]
            editing=pool.submit(req,'/pages/'+firstnote,{'version':current_note['version'],'title':'queued edit'},'PATCH')
            concurrent_results=[f.result() for f in pending];edit_result=editing.result()
        result['concurrent_search']={'statuses':[x[0] for x in concurrent_results],'max_ms':round(max(x[3] for x in concurrent_results),2),'edit_status':edit_result[0],'edit_ms':round(edit_result[3],2)}
        assert edit_result[0]==200
        # Negotiate the same complete JSON records; verify decompression is byte-identical.
        import gzip
        result['transport']={}
        for key in ('tasks','pages','events'):
            responses=[]
            for encoding in ('identity','gzip'):
                r=urllib.request.Request(base+paths[key],headers={'Accept-Encoding':encoding})
                with opener.open(r,timeout=60) as response:
                    wire=response.read();actual=response.headers.get('Content-Encoding','identity')
                    decoded=gzip.decompress(wire) if actual=='gzip' else wire
                    responses.append((wire,decoded,actual))
            assert responses[0][1]==responses[1][1],key+' compression changed JSON'
            result['transport'][key]={'identity_bytes':len(responses[0][0]),'negotiated_bytes':len(responses[1][0]),'encoding':responses[1][2],'decoded_equal':True}
        if args.browser:
            browser_script=pathlib.Path(__file__).with_name('capacity_browser.mjs')
            result['browser']=json.loads(run('node',str(browser_script),name,base.removesuffix('/api/v1'),pid,firstnote))
        result['memory']=run('docker','stats','--no-stream','--format','{{.MemUsage}}',name)
        # Kill only this temporary process; committed rows must survive crash/restart.
        before=req('/projects/'+pid+'/tasks')[1]
        run('docker','kill','--signal','KILL',name); run('docker','start',name)
        port=json.loads(run('docker','inspect',name))[0]['NetworkSettings']['Ports']['8080/tcp'][0]['HostPort']
        base='http://127.0.0.1:'+port+'/api/v1'
        for _ in range(100):
            try:
                after=req('/projects/'+pid+'/tasks')[1];break
            except (OSError,json.JSONDecodeError):time.sleep(.1)
        result['kill_restart_equal']=before==after
        result['logs']=run('docker','logs',name)
        print(json.dumps(result,ensure_ascii=False,indent=2))
    except Exception as error:
        result['exception']=repr(error)
        result['container_state']=json.loads(run('docker','inspect',name))[0]['State']
        result['failure_logs']=subprocess.run(['docker','logs',name],capture_output=True,text=True).stderr
        print(json.dumps(result,ensure_ascii=False,indent=2))
        raise
    finally:
        subprocess.run(['docker','rm','-f',name],stdout=subprocess.DEVNULL)
        subprocess.run(['docker','volume','rm',name],stdout=subprocess.DEVNULL)
if __name__=='__main__':main()
