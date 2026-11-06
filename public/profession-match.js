// Profession recommendations: compare the accents of a person's map with the accents of profession reference profiles.
//  a_i = ln(score_i / even share)  — how far the person moved cluster i from the even start (50 of 1650);
//  b_i = ln(weight_i) − mean ln(weight_i) over all professions — how the profession differs from an average profession.
// Match = cosine of a and b over all clusters, where clusters the person did not rate count as neutral (a_i = 0):
// they carry no evidence, yet a profession whose accents lie there still loses match. Shown as %, negatives as 0%.
export const MIN_RATED_CLUSTERS=3;
// Shadow clusters (0-based): 18–26 and 28–32 of the catalog. A shadow is never a plus for a profession, so its accent
// can only say "needs less than average" — a profession that merely tolerates more of it reads as neutral there.
export const SHADOW_CLUSTERS=new Set([17,18,19,20,21,22,23,24,25,27,28,29,30,31]);
export function prepareReferences(list){
 if(!list.length)return [];
 const n=list[0].weights.length,mean=Array.from({length:n},(_,i)=>list.reduce((s,p)=>s+Math.log(p.weights[i]),0)/list.length);
 return list.map(p=>({...p,accent:p.weights.map((w,i)=>{const d=Math.log(w)-mean[i];return SHADOW_CLUSTERS.has(i)?Math.min(0,d):d})}));
}
// Rated clusters: edited in any of the given maps. With fewer than MIN_RATED_CLUSTERS every cluster counts as rated.
export function basisOf(...maps){
 const n=maps.find(Boolean)?.scores.length||0,picked=[];
 for(let i=0;i<n;i++)if(maps.some(d=>d?.edited?.[i]))picked.push(i);
 return {clusters:picked.length>=MIN_RATED_CLUSTERS?picked:Array.from({length:n},(_,i)=>i),rated:picked.length};
}
export function accentOf(data,basis=null){
 const even=data.scores.reduce((a,b)=>a+b,0)/data.scores.length,keep=basis&&new Set(basis.clusters);
 return data.scores.map((s,i)=>keep&&!keep.has(i)?0:Math.log(Math.max(s,1e-9)/even));
}
export function matchProfession(accent,ref){
 let ab=0,aa=0,bb=0;for(let i=0;i<accent.length;i++){ab+=accent[i]*ref.accent[i];aa+=accent[i]**2;bb+=ref.accent[i]**2}
 const cos=aa&&bb?ab/Math.sqrt(aa*bb):0;return {ref,cos,percent:Math.max(0,Math.round(cos*100))};
}
export function matchAll(data,refs,basis=basisOf(data)){
 const accent=accentOf(data,basis);
 return refs.map(r=>matchProfession(accent,r)).sort((x,y)=>y.cos-x.cos||x.ref.name.localeCompare(y.ref.name,'ru'));
}
// Near-identical profiles (same recommendation_group) become one line: names joined, best match kept.
export function groupMatches(matches){
 const out=[],byGroup=new Map();
 for(const m of matches){
  if(!m.ref.group){out.push({...m,members:[m.ref]});continue}
  const g=byGroup.get(m.ref.group);if(g){g.members.push(m.ref);continue}
  const row={...m,members:[m.ref]};byGroup.set(m.ref.group,row);out.push(row);
 }
 return out.map(r=>({...r,name:[...r.members].sort((a,b)=>String(a.id).localeCompare(String(b.id))).map(p=>p.name).join(' / '),specialties:[...new Set(r.members.flatMap(p=>p.specialties||[]))]}));
}
// Why it fits: clusters strong in both; where it differs: what the profession needs more, and what the person has more of;
// lowShadows: shadows the person marked as weak where the profession needs little of them; unrated: what matters for
// the profession but the person has not rated yet.
export function explainMatch(data,ref,basis=basisOf(data),limit=3){
 const a=accentOf(data,basis),rated=new Set(basis.clusters),all=ref.accent.map((_,i)=>i);
 const pick=(from,test,score)=>from.filter(test).sort((x,y)=>score(y)-score(x)).slice(0,limit);
 return {
  strengths:pick(basis.clusters,i=>a[i]>0.05&&ref.accent[i]>0.05,i=>a[i]*ref.accent[i]),
  needMore:pick(basis.clusters,i=>!SHADOW_CLUSTERS.has(i)&&ref.accent[i]>0.1&&a[i]<-0.05,i=>-a[i]*ref.accent[i]),
  lowShadows:pick(basis.clusters,i=>SHADOW_CLUSTERS.has(i)&&ref.accent[i]<-0.1&&a[i]<-0.05,i=>a[i]*ref.accent[i]),
  haveMore:pick(basis.clusters,i=>ref.accent[i]<-0.1&&a[i]>0.05,i=>-a[i]*ref.accent[i]),
  unrated:pick(all,i=>!rated.has(i)&&ref.accent[i]>0.2,i=>ref.accent[i]),
 };
}
