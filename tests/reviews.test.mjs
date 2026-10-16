import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleApi,CATALOG_VERSION} from '../lib/reviews.mjs';
const data=()=>({scores:Array(33).fill(10),areas:Array(33).fill(1/33),edited:Array(33).fill(false),qualities:Array.from({length:33},()=>Array(4).fill(15)),qedited:Array.from({length:33},()=>Array(4).fill(false))});
function database(){let sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../drizzle/0000_illegal_loners.sql',import.meta.url),'utf8'));sqlite.exec(readFileSync(new URL('../drizzle/0001_illegal_scarecrow.sql',import.meta.url),'utf8'));return {prepare(sql){let stmt=sqlite.prepare(sql),args=[];const result={bind(...v){args=v;return result},async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}},async run(){return stmt.run(...args)}};return result}}}
const userCookies=new WeakMap();
async function call(db,path,{method='GET',user,cookie,payload,origin='https://profi.test'}={}){let headers={'Content-Type':'application/json',Origin:origin};if(user){let map=userCookies.get(db);if(!map){map=new Map();userCookies.set(db,map)}if(!map.has(user)){let auth=await handleApi(new Request('https://profi.test/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://profi.test'},body:JSON.stringify({login:user,password:'Testing-password-123'})}),db);assert.equal(auth.status,200);map.set(user,auth.headers.get('Set-Cookie').split(';')[0])}headers.Cookie=map.get(user)+(cookie?'; '+cookie:'')}else if(cookie)headers.Cookie=cookie;return handleApi(new Request('https://profi.test'+path,{method,headers,body:payload?JSON.stringify(payload):undefined}),db)}
async function json(res){let d=await res.json();assert.ok(res.ok,JSON.stringify(d));return d}
test('Two independent reviewers, private threshold, mean and immutable baseline',async()=>{
 const db=database(),original=data();original.scores[0]=20;original.scores[1]=0+original.scores[1];for(let i=1;i<33;i++)original.scores[i]=310/32;original.edited[0]=true;original.qualities[0][0]=24;original.qedited[0][0]=true;
 let create=await json(await call(db,'/api/collections',{method:'POST',user:'owner',payload:{catalogVersion:CATALOG_VERSION,data:original}}));let path='/api/collections/'+create.id;
 assert.deepEqual(create.baseline.scores,original.scores);
 let duplicate=await json(await call(db,'/api/collections',{method:'POST',user:'owner',payload:{catalogVersion:CATALOG_VERSION,data:original}}));assert.equal(duplicate.id,create.id);
 let initA=await call(db,path),cookieA=initA.headers.get('Set-Cookie').split(';')[0],publicData=await json(initA);assert.deepEqual(publicData.baseline.scores,original.scores);assert.equal(publicData.reviewers,undefined);assert.equal(publicData.owner_id,undefined);
 let first=data();first.scores[0]=26;for(let i=1;i<33;i++)first.scores[i]=304/32;first.qualities[0][0]=30;
 assert.equal((await call(db,path+'/reviews',{method:'POST',cookie:cookieA,payload:{catalogVersion:CATALOG_VERSION,firstName:'Анна',lastName:'Смирнова',data:first}})).status,201);
 let one=await json(await call(db,path+'/summary',{user:'owner'}));assert.equal(one.count,1);assert.equal(one.aggregate,null);assert.equal(one.reviewers[0].firstName,'Анна');assert.equal((await call(db,path+'/summary')).status,401);assert.equal((await call(db,path+'/summary',{user:'stranger'})).status,404);
 let initB=await call(db,path),cookieB=initB.headers.get('Set-Cookie').split(';')[0],second=data();second.scores[0]=14;for(let i=1;i<33;i++)second.scores[i]=316/32;second.qualities[0][0]=10;
 assert.equal((await call(db,path+'/reviews',{method:'POST',cookie:cookieB,payload:{catalogVersion:CATALOG_VERSION,firstName:'Михаил',lastName:'Волков',data:second}})).status,201);
 let two=await json(await call(db,path+'/summary',{user:'owner'}));assert.equal(two.count,2);assert.equal(two.aggregate.scores[0],20);assert.equal(two.aggregate.qualities[0][0],20);assert.equal(two.aggregate.areas[0],20/330);assert.equal(two.reviewers.length,2);
 let baselineAgain=await json(await call(db,path));assert.deepEqual(baselineAgain.baseline,create.baseline);
 let thirdCookie=(await call(db,path)).headers.get('Set-Cookie').split(';')[0];assert.equal((await call(db,path+'/reviews',{method:'POST',cookie:cookieA,payload:{catalogVersion:CATALOG_VERSION,firstName:'Другое',lastName:'Имя',data:first}})).status,409);assert.equal((await call(db,path+'/reviews',{method:'POST',cookie:thirdCookie,payload:{catalogVersion:CATALOG_VERSION,firstName:'анна',lastName:'смирнова',data:first}})).status,409);
 let revisited=await json(await call(db,path,{cookie:cookieA}));assert.equal(revisited.alreadySubmitted,true);
 assert.equal((await call(db,path+'/reviews',{method:'POST',cookie:thirdCookie,payload:{catalogVersion:CATALOG_VERSION,firstName:'Елена',lastName:'Кузнецова',data:original}})).status,201);let three=await json(await call(db,path+'/summary',{user:'owner'}));assert.equal(three.count,3);assert.equal(three.aggregate.scores[0],20);assert.ok(Math.abs(three.aggregate.qualities[0][0]-64/3)<1e-9);
});
test('Server rejects missing identity, names, bad data, cross-origin and owner self-review',async()=>{
 let db=database(),payload={catalogVersion:CATALOG_VERSION,data:data()};assert.equal((await call(db,'/api/collections',{method:'POST',payload})).status,401);assert.equal((await call(db,'/api/collections',{method:'POST',user:'owner',payload,origin:'https://evil.test'})).status,403);
 let c=await json(await call(db,'/api/collections',{method:'POST',user:'owner',payload})),path='/api/collections/'+c.id,init=await call(db,path),cookie=init.headers.get('Set-Cookie').split(';')[0];
 assert.equal((await call(db,path+'/reviews',{method:'POST',cookie,payload})).status,400);let bad=data();bad.scores[0]=31;assert.equal((await call(db,path+'/reviews',{method:'POST',cookie,payload:{catalogVersion:CATALOG_VERSION,firstName:'Иван',lastName:'Петров',data:bad}})).status,400);
 assert.equal((await call(db,path+'/reviews',{method:'POST',cookie,user:'owner',payload:{catalogVersion:CATALOG_VERSION,firstName:'Иван',lastName:'Петров',data:data()}})).status,409);
 assert.equal((await call(db,'/api/owner/collections')).status,401);let other=await json(await call(db,'/api/owner/collections',{user:'another'}));assert.deepEqual(other.collections,[]);
});
test('Password accounts persist, isolate data, invalidate logout and reject forged platform headers',async()=>{
 const db=database(),password='Strong-test-password-123';
 let register=await call(db,'/api/auth/register',{method:'POST',payload:{login:'Boss@example.com',password}});assert.equal(register.status,200);let registered=await register.json(),authCookie=register.headers.get('Set-Cookie').split(';')[0];assert.equal(registered.user.login,'boss@example.com');assert.equal(registered.password,undefined);assert.ok(register.headers.get('Set-Cookie').includes('HttpOnly'));assert.ok(register.headers.get('Set-Cookie').includes('Secure'));
 let stored=await db.prepare('SELECT * FROM profi_accounts WHERE login = ?').bind('boss@example.com').first();assert.equal(stored.password_hash.length,64);assert.notEqual(stored.password_hash,password);assert.notEqual(stored.salt,password);
 let session=await json(await call(db,'/api/session',{cookie:authCookie}));assert.equal(session.user.id,registered.user.id);
 let payload={catalogVersion:CATALOG_VERSION,data:data()};let saved=await json(await call(db,'/api/collections',{method:'POST',cookie:authCookie,payload}));
 assert.equal((await call(db,'/api/auth/login',{method:'POST',payload:{login:'boss@example.com',password:'wrong-password'}})).status,401);
 let login=await call(db,'/api/auth/login',{method:'POST',payload:{login:'BOSS@EXAMPLE.COM',password}});assert.equal(login.status,200);let cookie2=login.headers.get('Set-Cookie').split(';')[0];let recovered=await json(await call(db,'/api/owner/collections',{cookie:cookie2}));assert.equal(recovered.collections[0].id,saved.id);
 assert.equal((await call(db,'/api/auth/register',{method:'POST',payload:{login:'boss@example.com',password}})).status,409);
 let logout=await call(db,'/api/auth/logout',{method:'POST',cookie:cookie2,payload:{}});assert.equal(logout.status,200);assert.equal((await json(await call(db,'/api/session',{cookie:cookie2}))).signedIn,false);
 let spoof=await handleApi(new Request('https://profi.test/api/owner/collections',{headers:{'oai-authenticated-user-id':registered.user.id}}),db);assert.equal(spoof.status,401);
 await db.prepare('UPDATE profi_sessions SET expires_at = ? WHERE account_id = ?').bind(0,registered.user.id).run();assert.equal((await json(await call(db,'/api/session',{cookie:authCookie}))).signedIn,false);
});
