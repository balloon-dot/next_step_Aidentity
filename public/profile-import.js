import {TAXONOMY} from './profile-taxonomy.js';
export const MAX_IMPORT_BYTES=5*1024*1024;
export class ImportError extends Error{constructor(errors){super(errors[0]||'Некорректный файл');this.errors=errors;this.name='ImportError'}}
export function normalizeDataset(raw){
 const errors=[];const error=m=>{if(errors.length<100)errors.push(m)};
 const text=(v,label,max=5000,required=false)=>{if(v===undefined||v===null){if(required)error(label+': поле обязательно');return ''}if(typeof v!=='string'){error(label+': ожидается строка');return ''}const s=v.normalize('NFC').trim();if((required&&!s)||s.length>max)error(label+': допустимо '+(required?'1':'0')+'–'+max+' символов');return s.slice(0,max)};
 const weight=(v,label)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1e9){error(label+': вес должен быть числом от 0 до 1 000 000 000');return 0}return v};
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new ImportError(['В корне JSON ожидается объект с полями metadata и profiles']);
 if(!Array.isArray(raw.profiles)||raw.profiles.length<1||raw.profiles.length>100)throw new ImportError(['profiles: нужен массив от 1 до 100 профилей']);
 const metadata={};for(const k of ['dataset','validation','taxonomy_warning','interpretation'])if(raw.metadata?.[k]!==undefined)metadata[k]=text(raw.metadata[k],'metadata.'+k);
 metadata.synthetic=raw.metadata?.synthetic===true;
 const seen=new Set();const profiles=raw.profiles.map((p,pi)=>{
  const prefix='Профиль '+(pi+1);if(!p||typeof p!=='object'||Array.isArray(p)){error(prefix+': ожидается объект');return null}
  const candidate_id=text(p.candidate_id,prefix+' / candidate_id',120,true);const who=candidate_id||prefix;
  if(seen.has(candidate_id))error(who+': candidate_id повторяется в файле');seen.add(candidate_id);
  const result={candidate_id,is_synthetic:p.is_synthetic===true||metadata.synthetic,profile_type:text(p.profile_type,who+' / profile_type',100),status:text(p.status,who+' / status',300),profession:{}};
  if(p.name!==undefined)result.name=text(p.name,who+' / name',200);
  for(const k of ['id','name','category'])result.profession[k]=text(p.profession?.[k],who+' / profession.'+k,300,k==='name');
  if(p.specialty){result.specialty={};for(const k of ['uuid','name','faculty','level'])result.specialty[k]=text(p.specialty[k],who+' / specialty.'+k,500)}
  if(p.previous_professions!==undefined){if(!Array.isArray(p.previous_professions)||p.previous_professions.length>100)error(who+': previous_professions должен быть массивом до 100 записей');else result.previous_professions=p.previous_professions.map((v,i)=>({id:text(v?.id,who+' / previous_professions['+i+'].id',100),name:text(v?.name,who+' / previous_professions['+i+'].name',300)}))}
  for(const k of ['professional_experience_years','career_satisfaction'])if(p[k]!==undefined){const max=k==='career_satisfaction'?10:100;if(typeof p[k]!=='number'||!Number.isFinite(p[k])||p[k]<0||p[k]>max)error(who+' / '+k+': ожидается число от 0 до '+max);else result[k]=p[k]}
  for(const k of ['expertise_description','typical_tasks','salient_qualities','challenges_and_compensations','mapping_note','taxonomy_source'])if(p[k]!==undefined)result[k]=text(p[k],who+' / '+k);
  const v=p.voronoi;if(!v||!Array.isArray(v.clusters)||v.clusters.length!==33){error(who+': voronoi.clusters должен содержать ровно 33 кластера');return result}
  if(v.cluster_count!==33)error(who+': cluster_count должен быть равен 33');if(v.quality_count!==353)error(who+': quality_count должен быть равен 353');
  const numbers=new Map();v.clusters.forEach(c=>{if(!c||!Number.isInteger(c.cluster_number)||c.cluster_number<1||c.cluster_number>33){error(who+': у каждого кластера нужен cluster_number от 1 до 33');return}if(numbers.has(c.cluster_number))error(who+': повторяется cluster_number '+c.cluster_number);numbers.set(c.cluster_number,c)});
  const clusters=TAXONOMY.map(t=>{
   const c=numbers.get(t.number),label=who+' / кластер '+t.number;
   if(!c){error(label+': кластер отсутствует');return {cluster_number:t.number,name:t.name,weight:0,qualities:[]}}
   if(text(c.name,label+' / name',300,true)!==t.name)error(label+': ожидается название «'+t.name+'»');
   if(!Array.isArray(c.qualities)||c.qualities.length!==t.qualities.length){error(label+': ожидается '+t.qualities.length+' качеств');return {cluster_number:t.number,name:t.name,weight:weight(c.weight,label),qualities:[]}}
   const qualityMap=new Map();c.qualities.forEach(q=>{const name=text(q?.name,label+' / quality.name',300,true);if(qualityMap.has(name))error(label+': повторяется качество «'+name+'»');qualityMap.set(name,q);if(!t.qualities.includes(name))error(label+': неизвестное качество «'+name+'»')});
   return {cluster_number:t.number,name:t.name,weight:weight(c.weight,label),qualities:t.qualities.map(name=>{const q=qualityMap.get(name);if(!q)error(label+': отсутствует качество «'+name+'»');const out={name,weight:weight(q?.weight,label+' / '+name)};if(q?.definition!==undefined)out.definition=text(q.definition,label+' / definition',2000);return out})};
  });
  const total=clusters.reduce((s,c)=>s+c.weight,0);if(total<=0)error(who+': сумма весов кластеров должна быть больше нуля');if(typeof v.total_cluster_weight!=='number'||Math.abs(v.total_cluster_weight-total)>1e-6)error(who+': total_cluster_weight не совпадает с суммой весов кластеров ('+total+')');
  result.voronoi={total_cluster_weight:total,cluster_count:33,quality_count:353,clusters};return result;
 });
 if(errors.length)throw new ImportError(errors);return {metadata,profiles};
}
export const profileTitle=p=>p.name||p.profession.name||p.candidate_id;
