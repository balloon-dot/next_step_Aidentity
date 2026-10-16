import {getSessionUser,authenticate,endSession,sessionCookie} from './auth.mjs';
export const CATALOG_VERSION = 'examples-v1';
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (data, status=200, extra={}) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',...extra}});
class ApiError extends Error {constructor(message,status=400){super(message);this.status=status}}
const fail=(message,status=400)=>{throw new ApiError(message,status)};
export function validateData(raw){
 const nums=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isFinite(x)&&x>=1-1e-7&&x<=30+1e-7);
 const flags=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(x=>typeof x==='boolean');
 if(!raw||!nums(raw.scores,33)||Math.abs(raw.scores.reduce((a,b)=>a+b,0)-330)>.001||!flags(raw.edited,33)||!Array.isArray(raw.qualities)||raw.qualities.length!==33||!raw.qualities.every(q=>nums(q,4))||!Array.isArray(raw.qedited)||raw.qedited.length!==33||!raw.qedited.every(q=>flags(q,4)))fail('Некорректные значения карты. Обновите страницу и попробуйте еще раз.');
 const scores=raw.scores.map(x=>Math.max(1,Math.min(30,x)));
 return {scores,areas:scores.map(x=>x/330),edited:[...raw.edited],qualities:raw.qualities.map(q=>[...q]),qedited:raw.qedited.map(q=>[...q])};
}
export function aggregate(reviews){
 if(reviews.length<2)return null;
 const n=reviews.length,data=structuredClone(reviews[0]);
 data.scores=data.scores.map((_,i)=>reviews.reduce((s,d)=>s+d.scores[i],0)/n);
 data.areas=data.scores.map(x=>x/330);
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
async function body(request){if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')fail('Откройте форму на сайте и попробуйте снова.',403);if(!(request.headers.get('content-type')||'').startsWith('application/json'))fail('Ожидается JSON.',415);if(Number(request.headers.get('content-length'))>24576)fail('Слишком большой запрос.',413);let text=await request.text();if(text.length>24576)fail('Слишком большой запрос.',413);try{let parsed=JSON.parse(text);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))fail('Некорректный запрос.');return parsed}catch{fail('Некорректный запрос.')}}
async function collection(db,id){if(!ID.test(id))fail('Приглашение не найдено.',404);let row=await db.prepare('SELECT * FROM profi_collections WHERE id = ?').bind(id).first();if(!row)fail('Приглашение не найдено.',404);return row}
const baseline=row=>({id:row.id,ownerName:row.owner_name||'',baseline:JSON.parse(row.baseline_json),catalogVersion:row.catalog_version,createdAt:row.created_at});
function ownerDisplayName(value){
 if(value===undefined||value==='')return '';
 if(typeof value!=='string')fail('Укажите имя владельца профиля.');
 let name=value.normalize('NFKC').trim().replace(/\s+/g,' ');
 if(name.length<2||name.length>120||!/^\p{L}[\p{L}\p{M} .’'\-]*$/u.test(name))fail('Имя владельца профиля: 2–120 символов, буквы, пробелы и дефисы.');
 return name;
}
export async function handleApi(request,db){
 try{
  const path=new URL(request.url).pathname,method=request.method;
  if(!db)fail('Хранилище ответов временно недоступно. Попробуйте позже.',503);
  if((path==='/api/auth/login'||path==='/api/auth/register')&&method==='POST'){let input=await body(request),auth=await authenticate(request,db,input,path.endsWith('register'),fail);return json({signedIn:true,user:auth.user},200,{'Set-Cookie':auth.cookie})}
  if(path==='/api/auth/logout'&&method==='POST'){await body(request);await endSession(request,db);return json({signedIn:false},200,{'Set-Cookie':sessionCookie(request,'',true)})}
  const user=await getSessionUser(request,db);
  if(path==='/api/session'&&method==='GET')return json({signedIn:!!user,user:user?{id:user.id,login:user.login}:null});
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
    return json({id:row.id,count:rows.length,reviewers:rows.map(r=>({firstName:r.first_name,lastName:r.last_name,submittedAt:r.submitted_at})),aggregate:aggregate(rows.map(r=>JSON.parse(r.data_json)))});
   }
   if(action==='reviews'&&method==='POST'){
    let input=await body(request);if(user&&user.id===row.owner_id)fail('Это ваш профиль. Отправьте ссылку знакомому: он сможет оставить оценку.',409);
    let dev=device(request);if(!dev)fail('Обновите приглашение перед отправкой.',403);
    let name=firstLast(input),data=validateData(input.data);
    if(input.catalogVersion!==row.catalog_version)fail('Перечень качеств изменился. Откройте новое приглашение.',409);
    let key=await digest(user?'user:'+user.id:'device:'+dev),nameKey=await digest((name.first+' '+name.last).toLocaleLowerCase('ru-RU'));
    let count=await db.prepare('SELECT COUNT(*) AS count FROM profi_reviews WHERE collection_id = ?').bind(row.id).first();if(count.count>=1000)fail('Прием оценок по этому приглашению завершен.',429);
    try{await db.prepare('INSERT INTO profi_reviews (id, collection_id, first_name, last_name, name_key, device_key, data_json, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(),row.id,name.first,name.last,nameKey,key,JSON.stringify(data),Date.now()).run()}
    catch(error){if(/UNIQUE constraint/i.test(error.message))fail('Вы уже отправили оценку по этому приглашению. Повторный ответ не учитывается.',409);throw error}
    return json({submitted:true},201);
   }
  }
  return json({error:'Страница не найдена.'},404);
 }catch(error){if(error instanceof ApiError)return json({error:error.message},error.status);console.error('Profi API failed:',error.message);return json({error:'Не удалось сохранить или загрузить данные. Попробуйте еще раз.'},500)}
}
