// Computes cluster weights for every mapped profession from O*NET using scheme.cjs.
// 1) every indicator is standardized across all O*NET occupations (z-score);
// 2) a blend profession averages the raw indicator values of its O*NET codes first;
// 3) cluster score = weighted mean of indicator z (negative weight = inverse), re-standardized across occupations;
// 4) weight = base(kind) * exp(k * capped, trust-scaled z) (shadow clusters: z<=0 only), then scaled so the 33 clusters sum to 1650 (each within 1..1618).
const fs=require('fs'),dir=(process.env.ONET_DIR||__dirname+'/../../.onet/db_31_0_text')+'/';
const read=f=>fs.readFileSync(dir+f,'utf8').split(/\r?\n/).slice(1).filter(Boolean).map(l=>l.split('\t'));
const ind=new Map(),put=(code,key,v)=>{if(!ind.has(code))ind.set(code,{});ind.get(code)[key]=+v};
for(const r of read('Work Styles.txt'))if(r[3]==='WI')put(r[0],'WS:'+r[2],r[4]);
for(const r of read('Abilities.txt'))if(r[3]==='IM')put(r[0],'AB:'+r[2],r[4]);
for(const f of ['Essential Skills.txt','Transferable Skills.txt'])for(const r of read(f))if(r[3]==='IM')put(r[0],'SK:'+r[2],r[4]);
for(const r of read('Career Interest Types.txt'))if(r[3]==='OI')put(r[0],'IN:'+r[2],r[4]);
for(const r of read('Specific Interest Areas.txt'))if(r[3]==='OI')put(r[0],'SIA:'+r[2],r[4]);
const scheme=require('./scheme.cjs'),P=scheme.params;
const keys=[...new Set(scheme.flatMap(s=>Object.keys(s.src)))];
for(const k of keys)if(![...ind.values()].some(o=>k in o))throw Error('Unknown indicator '+k);
const stats=Object.fromEntries(keys.map(k=>{const v=[...ind.values()].map(o=>o[k]).filter(Number.isFinite),m=v.reduce((a,b)=>a+b,0)/v.length,sd=Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/v.length);return [k,{m,sd}]}));
const blend=codes=>Object.fromEntries(keys.map(k=>{const v=codes.map(c=>ind.get(c)?.[k]).filter(Number.isFinite);return [k,v.length?v.reduce((a,b)=>a+b,0)/v.length:null]}));
const rawScores=vals=>scheme.map(s=>{let sum=0,w=0;for(const [k,wt] of Object.entries(s.src)){const v=vals[k];if(v==null)continue;sum+=wt*(v-stats[k].m)/stats[k].sd;w+=Math.abs(wt)}return w?sum/w:0});
// Re-standardize cluster scores across all O*NET occupations that have work styles.
const all=[...ind.entries()].filter(([,o])=>'WS:Dependability' in o).map(([c])=>rawScores(blend([c])));
const cs=scheme.map((_,i)=>{const v=all.map(r=>r[i]),m=v.reduce((a,b)=>a+b,0)/v.length,sd=Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/v.length);return {m,sd}});
function profile(codes){
 const z=rawScores(blend(codes)).map((v,i)=>(v-cs[i].m)/cs[i].sd);
 // Agreed safeguards: |z| capped, weakly covered clusters move half as much, shadow clusters can only go below their base.
 let w=scheme.map((s,i)=>{let t=Math.max(-P.zCap,Math.min(P.zCap,z[i]))*P.trust[s.confidence];if(s.kind==='neg')t=Math.min(0,t);return P.base[s.kind]*Math.exp(P.k*t)});const f=P.total/w.reduce((a,b)=>a+b,0);w=w.map(v=>Math.min(P.max,Math.max(P.min,v*f)));
 const g=P.total/w.reduce((a,b)=>a+b,0);return {z,weights:w.map(v=>v*g)};
}
module.exports={profile,scheme};
