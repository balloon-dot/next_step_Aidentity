import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleApi,CATALOG_VERSION} from '../lib/reviews.mjs';
import {freshScoreData,getCatalog,TOTAL_WEIGHT,LEGACY_CATALOG_VERSION,PREVIOUS_CATALOG_VERSION} from '../public/test-catalog.js';
import {normalizeDataset} from '../public/profile-import.js';
import {PREVIOUS_TAXONOMY} from '../public/profile-taxonomy-353.js';
const data=()=>freshScoreData();
// Moves x points from the first quality of cluster 2 to the first quality of cluster 1, keeping every sum intact.
const moved=x=>{const d=data();d.qualities[0][0]+=x;d.qualities[1][0]-=x;d.scores[0]+=x;d.scores[1]-=x;d.areas=d.scores.map(v=>v/TOTAL_WEIGHT);return d};
const template=()=>JSON.parse(readFileSync(new URL('../public/profile-import-template.json',import.meta.url),'utf8'));
function database(){let sqlite=new DatabaseSync(':memory:');for(let file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));return {prepare(sql){let stmt=sqlite.prepare(sql),args=[];const result={bind(...v){args=v;return result},async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}},async run(){return stmt.run(...args)}};return result},async batch(list){sqlite.exec('BEGIN');try{let out=[];for(let s of list)out.push(await s.run());sqlite.exec('COMMIT');return out}catch(e){sqlite.exec('ROLLBACK');throw e}}}}
const userCookies=new WeakMap();
async function call(db,path,{method='GET',user,cookie,payload,origin='https://profi.test'}={}){let headers={'Content-Type':'application/json',Origin:origin};if(user){let map=userCookies.get(db);if(!map){map=new Map();userCookies.set(db,map)}if(!map.has(user)){let auth=await handleApi(new Request('https://profi.test/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://profi.test'},body:JSON.stringify({login:user,password:'Testing-password-123'})}),db);assert.equal(auth.status,200);map.set(user,auth.headers.get('Set-Cookie').split(';')[0])}headers.Cookie=map.get(user)+(cookie?'; '+cookie:'')}else if(cookie)headers.Cookie=cookie;return handleApi(new Request('https://profi.test'+path,{method,headers,body:payload?JSON.stringify(payload):undefined}),db)}
async function json(res){let d=await res.json();assert.ok(res.ok,JSON.stringify(d));return d}
test('Two independent reviewers, private threshold, mean and immutable baseline',async()=>{
 const db=database(),original=moved(40);original.edited[0]=true;original.qedited[0][0]=true;
 let create=await json(await call(db,'/api/collections',{method:'POST',user:'owner',payload:{catalogVersion:CATALOG_VERSION,data:original}}));let path='/api/collections/'+create.id;
 assert.deepEqual(create.baseline.scores,original.scores);
 let duplicate=await json(await call(db,'/api/collections',{method:'POST',user:'owner',payload:{catalogVersion:CATALOG_VERSION,data:original}}));assert.equal(duplicate.id,create.id);
 let initA=await call(db,path),cookieA=initA.headers.get('Set-Cookie').split(';')[0],publicData=await json(initA);assert.deepEqual(publicData.baseline.scores,original.scores);assert.equal(publicData.reviewers,undefined);assert.equal(publicData.owner_id,undefined);
 let first=moved(30);
 assert.equal((await call(db,path+'/reviews',{method:'POST',cookie:cookieA,payload:{catalogVersion:CATALOG_VERSION,firstName:'Анна',lastName:'Смирнова',data:first}})).status,201);
 let one=await json(await call(db,path+'/summary',{user:'owner'}));assert.equal(one.count,1);assert.equal(one.aggregate,null);assert.equal(one.reviewers[0].firstName,'Анна');assert.equal((await call(db,path+'/summary')).status,401);assert.equal((await call(db,path+'/summary',{user:'stranger'})).status,404);
 let initB=await call(db,path),cookieB=initB.headers.get('Set-Cookie').split(';')[0],second=moved(-10);
 assert.equal((await call(db,path+'/reviews',{method:'POST',cookie:cookieB,payload:{catalogVersion:CATALOG_VERSION,firstName:'Михаил',lastName:'Волков',data:second}})).status,201);
 let two=await json(await call(db,path+'/summary',{user:'owner'}));assert.equal(two.count,2);assert.equal(two.aggregate.scores[0],610);assert.equal(two.aggregate.qualities[0][0],60);assert.equal(two.aggregate.areas[0],610/TOTAL_WEIGHT);assert.equal(two.reviewers.length,2);
 let baselineAgain=await json(await call(db,path));assert.deepEqual(baselineAgain.baseline,create.baseline);
 let thirdCookie=(await call(db,path)).headers.get('Set-Cookie').split(';')[0];assert.equal((await call(db,path+'/reviews',{method:'POST',cookie:cookieA,payload:{catalogVersion:CATALOG_VERSION,firstName:'Другое',lastName:'Имя',data:first}})).status,409);assert.equal((await call(db,path+'/reviews',{method:'POST',cookie:thirdCookie,payload:{catalogVersion:CATALOG_VERSION,firstName:'анна',lastName:'смирнова',data:first}})).status,409);
 let revisited=await json(await call(db,path,{cookie:cookieA}));assert.equal(revisited.alreadySubmitted,true);
 assert.equal((await call(db,path+'/reviews',{method:'POST',cookie:thirdCookie,payload:{catalogVersion:CATALOG_VERSION,firstName:'Елена',lastName:'Кузнецова',data:original}})).status,201);let three=await json(await call(db,path+'/summary',{user:'owner'}));assert.equal(three.count,3);assert.equal(three.aggregate.scores[0],620);assert.equal(three.aggregate.qualities[0][0],70);
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
test('Invitation carries only the explicit owner display name and updates the same collection',async()=>{
 let db=database(),payload={catalogVersion:CATALOG_VERSION,ownerName:'  Ирина   Петрова  ',data:data()};let created=await json(await call(db,'/api/collections',{method:'POST',user:'owner',payload}));assert.equal(created.ownerName,'Ирина Петрова');
 let publicData=await json(await call(db,'/api/collections/'+created.id));assert.equal(publicData.ownerName,'Ирина Петрова');assert.equal(publicData.login,undefined);assert.equal(publicData.email,undefined);assert.equal(publicData.owner_id,undefined);
 payload.ownerName='Ирина Сидорова';let updated=await json(await call(db,'/api/collections',{method:'POST',user:'owner',payload}));assert.equal(updated.id,created.id);assert.equal(updated.ownerName,'Ирина Сидорова');assert.deepEqual(updated.baseline,created.baseline);
 let again=await json(await call(db,'/api/collections/'+created.id));assert.equal(again.ownerName,'Ирина Сидорова');payload.ownerName='<script>alert(1)</script>';assert.equal((await call(db,'/api/collections',{method:'POST',user:'owner',payload})).status,400);
});
test('New maps use the 33/283 catalog while legacy invitations keep accepting their own shape',async()=>{
 const db=database(),current=data();assert.equal(current.qualities.flat().length,283);
 assert.equal((await call(db,'/api/collections',{method:'POST',user:'owner',payload:{catalogVersion:CATALOG_VERSION,data:current}})).status,201);
 assert.equal((await call(db,'/api/collections',{method:'POST',user:'owner',payload:{catalogVersion:LEGACY_CATALOG_VERSION,data:freshScoreData(LEGACY_CATALOG_VERSION)}})).status,409);
 assert.equal((await call(db,'/api/collections',{method:'POST',user:'owner',payload:{catalogVersion:CATALOG_VERSION,data:freshScoreData(LEGACY_CATALOG_VERSION)}})).status,400);
 const ownerId=(await json(await call(db,'/api/session',{user:'owner'}))).user.id,legacy=freshScoreData(LEGACY_CATALOG_VERSION),id=crypto.randomUUID();
 await db.prepare('INSERT INTO profi_collections (id, owner_id, owner_name, baseline_hash, baseline_json, catalog_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id,ownerId,'',  'legacy',JSON.stringify(legacy),LEGACY_CATALOG_VERSION,Date.now()).run();
 let invite=await call(db,'/api/collections/'+id),cookie=invite.headers.get('Set-Cookie').split(';')[0];assert.equal((await invite.json()).catalogVersion,LEGACY_CATALOG_VERSION);
 assert.equal((await call(db,'/api/collections/'+id+'/reviews',{method:'POST',cookie,payload:{catalogVersion:CATALOG_VERSION,firstName:'Анна',lastName:'Смирнова',data:current}})).status,409);
 assert.equal((await call(db,'/api/collections/'+id+'/reviews',{method:'POST',cookie,payload:{catalogVersion:LEGACY_CATALOG_VERSION,firstName:'Анна',lastName:'Смирнова',data:legacy}})).status,201);
});
test('Profile cabinet: admin-only import, upsert by candidate_id, stable share link and public view',async()=>{
 const db=database(),raw=template(),dataset=normalizeDataset(raw);
 assert.equal((await call(db,'/api/admin/profiles')).status,401);
 assert.equal((await json(await call(db,'/api/session',{user:'regular'}))).user.role,'user');
 assert.equal((await call(db,'/api/admin/profiles',{user:'regular'})).status,403);
 assert.equal((await call(db,'/api/admin/import',{method:'POST',user:'regular',payload:{filename:'x.json',dataset}})).status,403);
 await call(db,'/api/session',{user:'boss'});await db.prepare("UPDATE profi_accounts SET role = 'admin' WHERE login = ?").bind('boss').run();
 assert.equal((await json(await call(db,'/api/session',{user:'boss'}))).user.role,'admin');
 let broken=structuredClone(raw);broken.profiles[0].voronoi.clusters.pop();let rejected=await call(db,'/api/admin/import',{method:'POST',user:'boss',payload:{filename:'bad.json',dataset:broken}});assert.equal(rejected.status,400);let rejection=await rejected.json();assert.ok(Array.isArray(rejection.errors)&&rejection.errors.length>0);
 let first=await json(await call(db,'/api/admin/import',{method:'POST',user:'boss',payload:{filename:'t.json',dataset}}));assert.deepEqual(first,{imported:1,created:1,updated:0});
 let list=(await json(await call(db,'/api/admin/profiles',{user:'boss'}))).profiles;assert.equal(list.length,1);assert.equal(list[0].candidateId,dataset.profiles[0].candidate_id);assert.equal(list[0].shareId,null);
 let link=await json(await call(db,'/api/admin/profiles/'+list[0].id+'/link',{method:'POST',user:'boss',payload:{}}));assert.match(link.shareId,/^[0-9a-f]{32}$/);
 assert.equal((await json(await call(db,'/api/admin/profiles/'+list[0].id+'/link',{method:'POST',user:'boss',payload:{}}))).shareId,link.shareId);
 let changed=structuredClone(dataset);changed.profiles[0].status='Обновлен';let second=await json(await call(db,'/api/admin/import',{method:'POST',user:'boss',payload:{filename:'t.json',dataset:changed}}));assert.deepEqual(second,{imported:1,created:0,updated:1});
 let detail=await json(await call(db,'/api/admin/profiles/'+list[0].id,{user:'boss'}));assert.equal(detail.id,list[0].id);assert.equal(detail.shareId,link.shareId);assert.equal(detail.profile.status,'Обновлен');assert.equal(detail.profile.voronoi.clusters.length,33);assert.equal(detail.metadata.dataset,dataset.metadata.dataset);
 let shown=await json(await call(db,'/api/profile-views/'+link.shareId));assert.equal(shown.profile.status,'Обновлен');assert.equal(shown.id,undefined);assert.ok(shown.metadata);
 await call(db,'/api/session',{user:'other'});await db.prepare("UPDATE profi_accounts SET role = 'admin' WHERE login = ?").bind('other').run();
 assert.equal((await call(db,'/api/admin/profiles/'+list[0].id,{user:'other'})).status,404);assert.equal((await json(await call(db,'/api/admin/profiles',{user:'other'}))).profiles.length,0);
 assert.equal((await call(db,'/api/admin/profiles/'+list[0].id+'/link',{method:'DELETE',user:'boss',payload:{},origin:'https://evil.test'})).status,403);
 assert.equal((await json(await call(db,'/api/admin/profiles/'+list[0].id+'/link',{method:'DELETE',user:'boss',payload:{}}))).shareId,null);
 assert.equal((await call(db,'/api/profile-views/'+link.shareId)).status,404);assert.equal((await call(db,'/api/profile-views/not-a-token')).status,404);
});
test('Untouched collections stored on the old 330-point budget open with the new starting weights',async()=>{
 const db=database(),ownerId=(await json(await call(db,'/api/session',{user:'owner'}))).user.id,old=data();old.scores=old.scores.map(()=>10);old.areas=old.scores.map(v=>v/330);const id=crypto.randomUUID();
 await db.prepare('INSERT INTO profi_collections (id, owner_id, owner_name, baseline_hash, baseline_json, catalog_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id,ownerId,'','old',JSON.stringify(old),CATALOG_VERSION,Date.now()).run();
 for(let n of ['a','b'])await db.prepare('INSERT INTO profi_reviews (id, collection_id, first_name, last_name, name_key, device_key, data_json, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(),id,'Имя','Фамилия',n,n,JSON.stringify(old),Date.now()).run();
 let invite=await json(await call(db,'/api/collections/'+id));assert.equal(invite.baseline.scores[0],600);assert.equal(invite.baseline.areas[0],600/TOTAL_WEIGHT);assert.ok(invite.baseline.qualities.flat().every(v=>v===50));
 let summary=await json(await call(db,'/api/collections/'+id+'/summary',{user:'owner'}));assert.equal(summary.aggregate.scores[0],600);
});
// Old 353-quality data whose every score is the quality's position, so the test can see where each value landed.
const previousMap=()=>({scores:Array(33).fill(50),areas:Array(33).fill(1/33),edited:Array(33).fill(true),qualities:PREVIOUS_TAXONOMY.map(c=>c.qualities.map((_,qi)=>qi+1)),qedited:PREVIOUS_TAXONOMY.map(c=>c.qualities.map(()=>false))});
const previousCluster=name=>PREVIOUS_TAXONOMY.find(c=>c.qualities.some(q=>q.replace(/\*/g,'').replace(/\s+/g,' ').trim().toLowerCase()===name.toLowerCase()));
const previousScore=name=>{for(const c of PREVIOUS_TAXONOMY){const i=c.qualities.findIndex(q=>q.replace(/\*/g,'').replace(/\s+/g,' ').trim().toLowerCase()===name.toLowerCase());if(i>=0)return i+1}return null};
test('Invitations saved on the 353-quality list are served, reviewed and averaged on the 283 list',async()=>{
 const db=database(),ownerId=(await json(await call(db,'/api/session',{user:'owner'}))).user.id,old=previousMap(),id=crypto.randomUUID(),catalog=getCatalog();
 await db.prepare('INSERT INTO profi_collections (id, owner_id, owner_name, baseline_hash, baseline_json, catalog_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id,ownerId,'','old',JSON.stringify(old),PREVIOUS_CATALOG_VERSION,Date.now()).run();
 await db.prepare('INSERT INTO profi_reviews (id, collection_id, first_name, last_name, name_key, device_key, data_json, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(),id,'Имя','Фамилия','a','a',JSON.stringify(old),Date.now()).run();
 let res=await call(db,'/api/collections/'+id),cookie=res.headers.get('Set-Cookie').split(';')[0],invite=await json(res);
 assert.equal(invite.catalogVersion,CATALOG_VERSION);assert.deepEqual(invite.baseline.qualities.map(q=>q.length),catalog.clusters.map(c=>c.qualities.length));
 // Each cluster keeps its old share, split between qualities by their old scores; loyalty moved from cluster 13 to 4 and the reality item was renamed.
 const was=name=>previousScore(name==='неприятие реальности'?'непринятие реальности':name);
 catalog.clusters.forEach((c,ci)=>{assert.ok(Math.abs(invite.baseline.scores[ci]-TOTAL_WEIGHT/33)<1e-6);const whole=c.qualities.reduce((n,q)=>n+was(q.name),0);c.qualities.forEach((q,qi)=>assert.ok(Math.abs(invite.baseline.qualities[ci][qi]/invite.baseline.scores[ci]-was(q.name)/whole)<1e-9,q.name))});
 assert.equal((await call(db,'/api/collections/'+id+'/reviews',{method:'POST',cookie,payload:{catalogVersion:CATALOG_VERSION,firstName:'Анна',lastName:'Смирнова',data:data()}})).status,201);
 let summary=await json(await call(db,'/api/collections/'+id+'/summary',{user:'owner'}));assert.equal(summary.count,2);assert.equal(summary.aggregate.qualities.flat().length,283);
 assert.ok(Math.abs(summary.aggregate.qualities[0][0]-(invite.baseline.qualities[0][0]+50)/2)<1e-9);
});
test('Profile files and saved profiles on the 353-quality list are trimmed to the 283 list',async()=>{
 const raw=template(),p=raw.profiles[0],weights=new Map();
 p.voronoi.quality_count=353;p.voronoi.clusters=PREVIOUS_TAXONOMY.map(c=>({name:c.name,cluster_number:c.number,weight:50,qualities:c.qualities.map((name,qi)=>{weights.set(name,qi+1);return {name,weight:qi+1}})}));
 const v=normalizeDataset(raw).profiles[0].voronoi,catalog=getCatalog();
 assert.equal(v.quality_count,283);assert.deepEqual(v.clusters.map(c=>c.qualities.map(q=>q.name)),catalog.clusters.map(c=>c.qualities.map(q=>q.name)));
 assert.equal(v.clusters[3].qualities.find(q=>q.name==='лояльность').weight,weights.get('лояльность'));
 const db=database(),ownerId=(await json(await call(db,'/api/session',{user:'boss'}))).user.id,id=crypto.randomUUID();
 await db.prepare("UPDATE profi_accounts SET role = 'admin' WHERE login = ?").bind('boss').run();
 await db.prepare('INSERT INTO profi_profiles (id, owner_id, candidate_id, title, profession, synthetic, profile_json, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id,ownerId,'old','Старый','',1,JSON.stringify(p),'{}',Date.now(),Date.now()).run();
 let detail=await json(await call(db,'/api/admin/profiles/'+id,{user:'boss'}));assert.equal(detail.profile.voronoi.quality_count,283);assert.equal(detail.profile.voronoi.clusters.flatMap(c=>c.qualities).length,283);
});
