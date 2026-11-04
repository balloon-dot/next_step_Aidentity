import {MIN_WEIGHT,qualityBudget,distribute} from './test-catalog.js?v=13';
// Chains: pairs of opposite qualities (the user's list «Цепочки противоположных качеств», 71 pairs).
// The quality edited by hand first leads its pair: each of its edits divides the other quality by the same
// factor (50 → 120 is ×2.4, so the partner goes 50 → 21). Edits of the partner never move the leader.
// A chain never moves the partner more than CHAIN_LIMIT times away from its value before the first chain change.
export const CHAIN_LIMIT=5;
export const CHAIN_PAIRS=[
 ['упрямство','гибкость'],['злопамятность','способность забывать обиды'],['скрупулезность','небрежность'],['гнев','спокойствие'],['грубость','вежливость'],
 ['алчность','непритязательность'],['альтруизм','эгоизм'],['подавленность','жизнерадостность'],['постоянность','непостоянство'],['интеллигентность','хамство'],
 ['самодостаточность','потребность в признании'],['бестактность','тактичность'],['иррациональность','рациональность'],['неосмотрительность','осмотрительность'],['несдержанность','сдержанность'],
 ['жадность','щедрость'],['неуверенность','уверенность'],['нерешительность','решительность'],['беспомощность','чувство контроля'],['беспринципность','принципиальность'],
 ['лживость','честность'],['предвзятость','непредвзятость'],['безынициативность','инициативность'],['пассивность','активность'],['слабоволие','воля'],
 ['недоброжелательность','доброжелательность'],['необучаемость','обучаемость'],['неприятие реальности','принятие реальности'],['безответственность','ответственность'],['непунктуальность','пунктуальность'],
 ['рассеянность','внимательность'],['зажатость','раскованность'],['пессимизм','оптимистичность'],['трусость','смелость'],['непредсказуемость','предсказуемость'],
 ['неадекватность','адекватность'],['непрофессионализм','компетентность'],['невежественность','эрудиция'],['закрытость','открытость'],['замкнутость','коммуникабельность'],
 ['наглость','уважительность'],['лицемерие','искренность'],['коварность','порядочность'],['высокомерие','скромность'],['черствость','чуткость'],
 ['эмоциональная холодность','эмпатия'],['равнодушие','отзывчивость'],['жестокость','доброта'],['агрессивность','миролюбие'],['раздражительность','терпимость'],
 ['недоверие к людям','доверчивость'],['инфантильность','самостоятельность'],['угодничество','независимость'],['покорность','свободолюбие'],['лень','трудолюбие'],
 ['склонность бросать начатое','настойчивость'],['импульсивность','самоконтроль'],['вспыльчивость','хладнокровие'],['невротичность','стрессоустойчивость'],['тревожность','способность расслабляться'],
 ['депрессивность','способность радоваться мелочам'],['авантюризм','избегание риска'],['азартность','осторожность'],['меркантильность','бескорыстность'],['хаотичность','самоорганизация'],
 ['халатность','исполнительность'],['заторможенность','быстрота мышления'],['боязнь критики','открытость к критике'],['боязнь нового','экспериментаторство'],['нежелание меняться','готовность к саморазвитию'],
 ['склонность пускать процессы на самотек','потребность в контроле']
];
const chainName=s=>String(s).toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
export const chainKey=(c,q)=>c+':'+q;
const linkCache=new WeakMap();
// For a catalog: "cluster:quality" → {pair, side, partner:[cluster, quality]}. Pairs whose names are missing are skipped.
export function chainLinks(catalog){
 if(linkCache.has(catalog))return linkCache.get(catalog);
 const at=new Map(),links=new Map();catalog.clusters.forEach((c,ci)=>c.qualities.forEach((q,qi)=>at.set(chainName(q.name),[ci,qi])));
 CHAIN_PAIRS.forEach((names,pair)=>{const ends=names.map(n=>at.get(chainName(n)));if(ends.every(Boolean))ends.forEach((e,side)=>links.set(chainKey(...e),{pair,side,partner:ends[1-side]}))});
 linkCache.set(catalog,links);return links;
}
export const freshChains=()=>({leaders:{},base:{},marks:{}});
// Chain state comes from browser storage, so only well-formed entries survive.
export function readChains(raw){
 const out=freshChains(),obj=v=>v&&typeof v==='object'&&!Array.isArray(v);if(!obj(raw))return out;
 const pair=k=>/^\d+$/.test(k)&&Number(k)<CHAIN_PAIRS.length;
 if(obj(raw.leaders))for(const [k,v] of Object.entries(raw.leaders))if(pair(k)&&(v===0||v===1))out.leaders[k]=v;
 if(obj(raw.base))for(const [k,v] of Object.entries(raw.base))if(pair(k)&&Number.isFinite(v)&&v>0)out.base[k]=v;
 if(obj(raw.marks))for(const k of Object.keys(raw.marks))if(/^\d+:\d+$/.test(k))out.marks[k]=true;
 return out;
}
// Sets quality j of cluster i to v. The other qualities of the cluster share the rest of its budget,
// except those listed in `hold`, which keep their values (used when both ends of a pair share a cluster).
export function placeQuality(d,i,j,v,hold=[]){
 const q=d.qualities[i],budget=qualityBudget(d,i),free=q.map((_,k)=>k).filter(k=>k!==j&&!hold.includes(k)),held=hold.reduce((s,k)=>s+q[k],0);
 v=free.length?Math.max(MIN_WEIGHT,Math.min(budget-held-free.length*MIN_WEIGHT,v)):budget-held;
 const other=distribute(free.map(k=>q[k]),budget-held-v,MIN_WEIGHT);
 q[j]=v;free.forEach((k,n)=>q[k]=other[n]);return v;
}
// The partner's new value when the leader moved by `factor` since the partner was `start`, in whole points.
// It stays within CHAIN_LIMIT× of `base`; a value set outside that range by hand may only move back toward it.
export function chainTarget(start,factor,base){
 if(Math.abs(factor-1)<1e-9)return start;
 const lo=Math.min(base/CHAIN_LIMIT,start),hi=Math.max(base*CHAIN_LIMIT,start);
 return Math.max(lo,Math.min(hi,Math.round(start/factor)));
}
