import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const origin='http://127.0.0.1:8787';
const worker=spawn(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','dev','--config','dist/server/wrangler.json','--local','--persist-to','.wrangler/state','--ip','127.0.0.1','--port','8787','--inspector-port','0'],{stdio:['ignore','pipe','pipe'],env:{...process.env,XDG_CONFIG_HOME:process.cwd()+'/.sites-runtime/config'}});
let log='';worker.stdout.on('data',v=>log+=v);worker.stderr.on('data',v=>log+=v);
const jars={owner:'',a:'',b:''};
async function request(path,{method='GET',jar='owner',body}={}){let r=await fetch(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:jars[jar]},body:body?JSON.stringify(body):undefined});let cookies=r.headers.getSetCookie();for(let cookie of cookies){let pair=cookie.split(';')[0],name=pair.split('=')[0];jars[jar]=jars[jar].split('; ').filter(c=>!c.startsWith(name+'=')).concat(pair).filter(Boolean).join('; ')}return r}
const data=()=>({scores:Array(33).fill(10),areas:Array(33).fill(1/33),edited:Array(33).fill(true),qualities:Array.from({length:33},()=>Array(4).fill(15)),qedited:Array.from({length:33},()=>Array(4).fill(true))});
try{
 let deadline=Date.now()+30000;while(!log.includes('Ready on')){if(Date.now()>deadline)throw Error('Local server did not start: '+log.slice(-1800));await new Promise(r=>setTimeout(r,200))}
 assert.equal((await request('/')).status,200);assert.equal((await request('/app.js')).status,200);
 let login='local-smoke-'+crypto.randomUUID(),password='Local-smoke-password-123',register=await request('/api/auth/register',{method:'POST',body:{login,password}});assert.equal(register.status,200,await register.clone().text());
 let created=await request('/api/collections',{method:'POST',body:{catalogVersion:'examples-v1',ownerName:'Виктория Тестовая',data:data()}});assert.equal(created.status,201,await created.clone().text());let {id}=await created.json();
 const path='/api/collections/'+id;
 let first=await request(path,{jar:'a'});assert.equal(first.status,200);let invited=await first.json();assert.deepEqual(invited.baseline.scores,data().scores);assert.equal(invited.ownerName,'Виктория Тестовая');
 let firstData=data();firstData.scores[0]=20;for(let i=1;i<33;i++)firstData.scores[i]=310/32;firstData.qualities[0][0]=25;
 assert.equal((await request(path+'/reviews',{jar:'a',method:'POST',body:{catalogVersion:'examples-v1',firstName:'Анна',lastName:'Тестовая',data:firstData}})).status,201);
 let one=await request(path+'/summary');assert.equal(one.status,200,await one.clone().text());let summary=await one.json();assert.equal(summary.count,1);assert.equal(summary.aggregate,null);
 await request(path,{jar:'b'});let secondData=data();secondData.qualities[0][0]=5;assert.equal((await request(path+'/reviews',{jar:'b',method:'POST',body:{catalogVersion:'examples-v1',firstName:'Михаил',lastName:'Тестовый',data:secondData}})).status,201);
 let two=await (await request(path+'/summary')).json();assert.equal(two.count,2);assert.equal(two.aggregate.scores[0],15);assert.equal(two.aggregate.qualities[0][0],15);assert.equal(two.reviewers.length,2);
 assert.equal((await request(path+'/summary',{jar:'a'})).status,401);
 await request('/api/auth/logout',{method:'POST',body:{}});assert.equal((await (await request('/api/session')).json()).signedIn,false);
 assert.equal((await request('/api/auth/login',{method:'POST',body:{login,password}})).status,200);
 let collections=await (await request('/api/owner/collections')).json();assert.ok(collections.collections.some(c=>c.id===id));
 console.log('HTTP checks passed: account, persisted sign-in, editable shared baseline, two-review threshold, aggregate and access boundaries.');
}finally{worker.kill('SIGTERM')}
