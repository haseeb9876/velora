"""Exercise the real API with a public video you have permission to download.

Usage: .venv/bin/python scripts/smoke-live.py 'https://...'
Saves only to a temporary directory and removes worker files when finished.
"""
import argparse, json, subprocess, sys, tempfile, time
from pathlib import Path
import httpx

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('url')
    parser.add_argument('--base-url',default='http://127.0.0.1:8787')
    parser.add_argument('--origin',default='')
    args=parser.parse_args()
    url=args.url
    with httpx.Client(base_url=args.base_url,timeout=100,headers={'Origin':args.origin} if args.origin else {}) as client:
        token=client.post('/api/session').json()['token']
        client.headers['Authorization']='Bearer '+token
        response=client.post('/api/inspect',json={'url':url})
        data=response.json()
        if response.status_code!=200:
            print(json.dumps({'status':response.status_code,'error':data},indent=2));return 1
        print('Analyzed:',data['title'])
        print('Available:',[(x['label'],x['ext'],x.get('size')) for x in data['options']])
        videos=[x for x in data['options'] if x['kind']=='video']
        audios=[x for x in data['options'] if x['kind']=='audio' and x['ext']=='mp3']
        choices=([videos[-1]] if videos else [])+audios[:1]
        ids=[]
        try:
            for choice in choices:
                response=client.post('/api/jobs',json={'analysis_id':data['id'],'option_id':choice['id']})
                response.raise_for_status();ids.extend(x['id'] for x in response.json()['jobs'])
            deadline=time.monotonic()+240
            while time.monotonic()<deadline:
                jobs=[j for j in client.get('/api/jobs').json()['jobs'] if j['id'] in ids]
                if all(j['status'] in ('ready','failed','cancelled','expired') for j in jobs):break
                time.sleep(2)
            success=True
            for job in jobs:
                print('Job:',job['label'],job['status'],job.get('error',''))
                if job['status']!='ready':success=False;continue
                ticket=client.post('/api/jobs/'+job['id']+'/ticket').json()['url']
                with tempfile.TemporaryDirectory(prefix='velora-smoke-') as folder:
                    path=Path(folder)/'download.bin'
                    with client.stream('GET',ticket) as download:
                        download.raise_for_status()
                        with path.open('wb') as file:
                            for chunk in download.iter_bytes():file.write(chunk)
                    probe=subprocess.run(['ffprobe','-v','error','-show_streams','-of','json',str(path)],capture_output=True,text=True,check=True)
                    codecs=[s['codec_type']+':'+s['codec_name'] for s in json.loads(probe.stdout)['streams']]
                    print('Verified saved file:',path.stat().st_size,'bytes,',codecs)
            return 0 if success and choices else 1
        finally:
            for id in ids:client.delete('/api/jobs/'+id)

if __name__=='__main__':sys.exit(main())
