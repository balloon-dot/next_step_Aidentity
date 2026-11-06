import {getSessionUser,authenticate,endSession,sessionCookie} from './auth.mjs';
import {CURRENT_CATALOG_VERSION,getCatalog,validScoreData,upgradeData,currentVersionOf,budgetOf} from '../public/test-catalog.js';
import {normalizeDataset,upgradeProfile,MAX_IMPORT_BYTES,profileTitle} from '../public/profile-import.js';
export const CATALOG_VERSION = CURRENT_CATALOG_VERSION;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHARE = /^[0-9a-f]{32}$/;
const MAX_PROFILE_BYTES = 1500000, MAX_PROFILES = 1000;
const json = (data, status=200, extra={}) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',...extra}});
class ApiError extends Error {constructor(message,status=400,errors){super(message);this.status=status;this.errors=errors}}
const fail=(message,status=400,errors)=>{throw new ApiError(message,status,errors)};
export function validateData(raw,version=CATALOG_VERSION){
 if(!getCatalog(version)||!validScoreData(raw,version))fail('Некорректные значения карты. Обновите страницу и попробуйте еще раз.');
 const scores=[...raw.scores];
 return {scores,areas:scores.map(x=>x/budgetOf(raw)),edited:[...raw.edited],qualities:raw.qualities.map(q=>[...q]),qedited:raw.qedited.map(q=>[...q])};
}
export function aggregate(reviews){
 if(reviews.length<2)return null;
 const n=reviews.length,data=structuredClone(reviews[0]);
 data.scores=data.scores.map((_,i)=>reviews.reduce((s,d)=>s+d.scores[i],0)/n);
 data.areas=data.scores.map(x=>x/budgetOf(data));
 data.edited=data.edited.map((_,i)=>reviews.some(d=>d.edited[i]));
 data.qualities=data.qualities.map((q,i)=>q.map((_,j)=>reviews.reduce((s,d)=>s+d.qualities[i][j],0)/n));
 data.qedited=data.qedited.map((q,i)=>q.map((_,j)=>reviews.some(d=>d.qedited[i][j])));
 return data;
}
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
function firstLast(raw){
 const clean=value=>{if(typeof value!=='string')fail('Укажите имя и фамилию.');let v=value.normalize('NFKC').trim().replace(/\s+/g,' ');if(!/^[\p{L}\p{M}][\p{L}\p{M} .’'\-]{0,59}$/u.test(v))fail('Укажите имя и фамилию буквами, до 60 символов.');return v};
 return {first:clean(raw.firstName),last:clean(raw.lastName)};
}
function owner(user){if(!user)fail('Войдите по логину и паролю, чтобы сохранить приглашение и видеть ответы.',401);return user.id}
function device(request){let m=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)profi_reviewer=([^;]+)/);return m&&ID.test(m[1])?m[1]:null}
function cookie(value,request){return `profi_reviewer=${value}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${new URL(request.url).protocol==='https:'?'; Secure':''}`}
async function body(request,max=24576){if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')fail('Откройте форму на сайте и попробуйте снова.',403);if(!(request.headers.get('content-type')||'').startsWith('application/json'))fail('Ожидается JSON.',415);if(Number(request.headers.get('content-length'))>max)fail('Слишком большой запрос.',413);let text=await request.text();if(text.length>max)fail('Слишком большой запрос.',413);try{let parsed=JSON.parse(text);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))fail('Некорректный запрос.');return parsed}catch{fail('Некорректный запрос.')}}
async function collection(db,id){if(!ID.test(id))fail('Приглашение не найдено.',404);let row=await db.prepare('SELECT * FROM profi_collections WHERE id = ?').bind(id).first();if(!row)fail('Приглашение не найдено.',404);return row}
const baseline=row=>({id:row.id,ownerName:row.owner_name||'',baseline:upgradeData(JSON.parse(row.baseline_json)),catalogVersion:currentVersionOf(row.catalog_version),createdAt:row.created_at});
function ownerDisplayName(value){
 if(value===undefined||value==='')return '';
 if(typeof value!=='string')fail('Укажите имя владельца профиля.');
 let name=value.normalize('NFKC').trim().replace(/\s+/g,' ');
 if(name.length<2||name.length>120||!/^\p{L}[\p{L}\p{M} .’'\-]*$/u.test(name))fail('Имя владельца профиля: 2–120 символов, буквы, пробелы и дефисы.');
 return name;
}
function admin(user){owner(user);if(user.role!=='admin')fail('Кабинет профилей доступен только администратору.',403);return user.id}
const shareToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
const profileRow=row=>({id:row.id,candidateId:row.candidate_id,title:row.title,profession:row.profession,synthetic:!!row.synthetic,shareId:row.share_id||null,createdAt:row.created_at,updatedAt:row.updated_at});
const profileDetail=row=>({...profileRow(row),profile:upgradeProfile(JSON.parse(row.profile_json)),metadata:JSON.parse(row.metadata_json)});
async function ownProfile(db,userId,id){if(!ID.test(id))fail('Профиль не найден.',404);let row=await db.prepare('SELECT * FROM profi_profiles WHERE id = ? AND owner_id = ?').bind(id,userId).first();if(!row)fail('Профиль не найден.',404);return row}
async function importProfiles(db,userId,input){
 let dataset;try{dataset=normalizeDataset(input.dataset)}catch(error){if(error.errors)fail(error.message,400,error.errors);throw error}
 const metadata=JSON.stringify(dataset.metadata),rows=dataset.profiles.map(p=>({p,serialized:JSON.stringify(p)}));
 const large=rows.find(r=>new TextEncoder().encode(r.serialized).length>MAX_PROFILE_BYTES);if(large)fail(`Профиль ${large.p.candidate_id} слишком большой. Сократите описания и определения качеств.`,413);
 const existing=new Set((await db.prepare('SELECT candidate_id FROM profi_profiles WHERE owner_id = ?').bind(userId).all()).results.map(r=>r.candidate_id));
 const created=rows.filter(r=>!existing.has(r.p.candidate_id)).length;if(existing.size+created>MAX_PROFILES)fail(`В кабинете может быть не больше ${MAX_PROFILES} профилей.`,429);
 const now=Date.now();
 await db.batch(rows.map(({p,serialized})=>db.prepare('INSERT INTO profi_profiles (id, owner_id, candidate_id, title, profession, synthetic, profile_json, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(owner_id, candidate_id) DO UPDATE SET title = excluded.title, profession = excluded.profession, synthetic = excluded.synthetic, profile_json = excluded.profile_json, metadata_json = excluded.metadata_json, updated_at = excluded.updated_at').bind(crypto.randomUUID(),userId,p.candidate_id,profileTitle(p),p.profession.name,p.is_synthetic?1:0,serialized,metadata,now,now)));
 return {imported:rows.length,created,updated:rows.length-created};
}
// Profession reference profiles for recommendations: profiles of type "profession_reference" imported by an admin,
// sent as cluster weights only (the newest copy wins when several admins imported the same candidate_id).
export const PROFESSION_TYPE='profession_reference';
export async function professionReferences(db){
 // Only the needed fields are pulled out by SQLite, so the worker never parses whole profiles (283 qualities each).
 const rows=(await db.prepare(`SELECT p.candidate_id AS id, json_extract(p.profile_json,'$.profession.name') AS name,
  (SELECT json_group_array(json_extract(c.value,'$.weight')) FROM json_each(p.profile_json,'$.voronoi.clusters') c) AS weights,
  json_extract(p.profile_json,'$.recommendation_group') AS grp, json_extract(p.profile_json,'$.subject_hints') AS subjects,
  json_extract(p.profile_json,'$.specialties') AS specialties, p.synthetic AS synthetic
  FROM profi_profiles p JOIN profi_accounts a ON a.id = p.owner_id
  WHERE a.role = 'admin' AND json_extract(p.profile_json,'$.profile_type') = ? ORDER BY p.updated_at DESC`).bind(PROFESSION_TYPE).all()).results;
 const seen=new Set(),out=[],list=v=>{try{const x=JSON.parse(v||'[]');return Array.isArray(x)?x:[]}catch{return []}};
 for(const r of rows){if(seen.has(r.id))continue;const weights=list(r.weights);if(weights.length!==33||!weights.every(w=>Number.isFinite(w)&&w>0))continue;seen.add(r.id);
  out.push({id:r.id,name:r.name||r.id,weights,group:r.grp||'',subjects:list(r.subjects),specialties:list(r.specialties),synthetic:!!r.synthetic})}
 return out.sort((a,b)=>a.id.localeCompare(b.id));
}
export async function handleApi(request,db){
 try{
  const path=new URL(request.url).pathname,method=request.method;
  if(!db)fail('Хранилище ответов временно недоступно. Попробуйте позже.',503);
  if((path==='/api/auth/login'||path==='/api/auth/register')&&method==='POST'){let input=await body(request),auth=await authenticate(request,db,input,path.endsWith('register'),fail);return json({signedIn:true,user:auth.user},200,{'Set-Cookie':auth.cookie})}
  if(path==='/api/auth/logout'&&method==='POST'){await body(request);await endSession(request,db);return json({signedIn:false},200,{'Set-Cookie':sessionCookie(request,'',true)})}
  const user=await getSessionUser(request,db);
  if(path==='/api/session'&&method==='GET')return json({signedIn:!!user,user:user?{id:user.id,login:user.login,role:user.role||'user'}:null});
  if(path==='/api/professions'&&method==='GET')return json({professions:await professionReferences(db)},200,{'Cache-Control':'public, max-age=300'});
  let view=path.match(/^\/api\/profile-views\/([^/]+)$/);
  if(view&&method==='GET'){
   let row=SHARE.test(view[1])?await db.prepare('SELECT profile_json, metadata_json, updated_at FROM profi_profiles WHERE share_id = ?').bind(view[1]).first():null;
   if(!row)fail('Ссылка недействительна или отключена.',404);
   return json({profile:upgradeProfile(JSON.parse(row.profile_json)),metadata:JSON.parse(row.metadata_json),updatedAt:row.updated_at});
  }
  if(path==='/api/admin/profiles'&&method==='GET'){
   const userId=admin(user);let rows=await db.prepare('SELECT id, candidate_id, title, profession, synthetic, share_id, created_at, updated_at FROM profi_profiles WHERE owner_id = ? ORDER BY updated_at DESC, title').bind(userId).all();return json({profiles:rows.results.map(profileRow)});
  }
  if(path==='/api/admin/import'&&method==='POST'){const userId=admin(user);return json(await importProfiles(db,userId,await body(request,MAX_IMPORT_BYTES+65536)))}
  let profile=path.match(/^\/api\/admin\/profiles\/([^/]+)(\/link)?$/);
  if(profile){const userId=admin(user);let row=await ownProfile(db,userId,profile[1]),link=!!profile[2];
   if(!link&&method==='GET')return json(profileDetail(row));
   if(link&&method==='POST'){
    await body(request);
    if(!row.share_id){await db.prepare('UPDATE profi_profiles SET share_id = ? WHERE id = ? AND owner_id = ? AND share_id IS NULL').bind(shareToken(),row.id,userId).run();row=await ownProfile(db,userId,row.id)}
    return json({shareId:row.share_id});
   }
   if(link&&method==='DELETE'){await body(request);await db.prepare('UPDATE profi_profiles SET share_id = NULL WHERE id = ? AND owner_id = ?').bind(row.id,userId).run();return json({shareId:null})}
  }
  if(path==='/api/collections'&&method==='POST'){
   let userId=owner(user),input=await body(request);if(input.catalogVersion!==CATALOG_VERSION)fail('Обновите страницу: перечень качеств изменился.',409);
   let ownerName=ownerDisplayName(input.ownerName),data=validateData(input.data),serialized=JSON.stringify(data),hash=await digest(serialized),existing=await db.prepare('SELECT * FROM profi_collections WHERE owner_id = ? AND baseline_hash = ?').bind(userId,hash).first();
   if(existing){
    if(ownerName&&ownerName!==existing.owner_name){await db.prepare('UPDATE profi_collections SET owner_name = ? WHERE id = ? AND owner_id = ?').bind(ownerName,existing.id,userId).run();existing.owner_name=ownerName}
    return json(baseline(existing));
   }
   let limits=await db.prepare('SELECT COUNT(*) AS count FROM profi_collections WHERE owner_id = ?').bind(userId).first();if(limits.count>=100)fail('Лимит версий профиля достигнут.',429);
   let id=crypto.randomUUID(),createdAt=Date.now();
   await db.prepare('INSERT OR IGNORE INTO profi_collections (id, owner_id, owner_name, baseline_hash, baseline_json, catalog_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id,userId,ownerName,hash,serialized,CATALOG_VERSION,createdAt).run();
   let row=await db.prepare('SELECT * FROM profi_collections WHERE owner_id = ? AND baseline_hash = ?').bind(userId,hash).first();return json(baseline(row),201);
  }
  if(path==='/api/owner/collections'&&method==='GET'){
   const userId=owner(user);let rows=await db.prepare('SELECT * FROM profi_collections WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100').bind(userId).all();return json({collections:rows.results.map(baseline)});
  }
  let match=path.match(/^\/api\/collections\/([^/]+)(?:\/(summary|reviews))?$/);
  if(match){let row=await collection(db,match[1]),action=match[2];
   if(!action&&method==='GET'){
    let dev=device(request)||crypto.randomUUID();
    let existing=await db.prepare('SELECT id FROM profi_reviews WHERE collection_id = ? AND device_key = ?').bind(row.id,await digest(user?'user:'+user.id:'device:'+dev)).first();
    return json({...baseline(row),alreadySubmitted:!!existing,isOwner:!!user&&user.id===row.owner_id},200,{'Set-Cookie':cookie(dev,request)});
   }
   if(action==='summary'&&method==='GET'){
    if(owner(user)!==row.owner_id)fail('Профиль не найден.',404);
    let result=await db.prepare('SELECT first_name, last_name, data_json, submitted_at FROM profi_reviews WHERE collection_id = ? ORDER BY submitted_at').bind(row.id).all(),rows=result.results;
    return json({id:row.id,count:rows.length,reviewers:rows.map(r=>({firstName:r.first_name,lastName:r.last_name,submittedAt:r.submitted_at})),aggregate:aggregate(rows.map(r=>upgradeData(JSON.parse(r.data_json))))});
   }
   if(action==='reviews'&&method==='POST'){
    let input=await body(request);if(user&&user.id===row.owner_id)fail('Это ваш профиль. Отправьте ссылку знакомому: он сможет оставить оценку.',409);
    let dev=device(request);if(!dev)fail('Обновите приглашение перед отправкой.',403);
    let version=currentVersionOf(row.catalog_version);if(input.catalogVersion!==version)fail('Перечень качеств изменился. Откройте новое приглашение.',409);
    let name=firstLast(input),data=validateData(input.data,version);
    let key=await digest(user?'user:'+user.id:'device:'+dev),nameKey=await digest((name.first+' '+name.last).toLocaleLowerCase('ru-RU'));
    let count=await db.prepare('SELECT COUNT(*) AS count FROM profi_reviews WHERE collection_id = ?').bind(row.id).first();if(count.count>=1000)fail('Прием оценок по этому приглашению завершен.',429);
    try{await db.prepare('INSERT INTO profi_reviews (id, collection_id, first_name, last_name, name_key, device_key, data_json, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(),row.id,name.first,name.last,nameKey,key,JSON.stringify(data),Date.now()).run()}
    catch(error){if(/UNIQUE constraint/i.test(error.message))fail('Вы уже отправили оценку по этому приглашению. Повторный ответ не учитывается.',409);throw error}
    return json({submitted:true},201);
   }
  }
  return json({error:'Страница не найдена.'},404);
 }catch(error){if(error instanceof ApiError)return json(error.errors?{error:error.message,errors:error.errors}:{error:error.message},error.status);console.error('Profi API failed:',error.message);return json({error:'Не удалось сохранить или загрузить данные. Попробуйте еще раз.'},500)}
}
