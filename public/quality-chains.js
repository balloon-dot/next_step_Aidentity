import {MIN_WEIGHT,qualityBudget,distribute} from './test-catalog.js?v=13';
// Links between qualities. Nothing moves on its own: editing a quality changes only that quality (and the shares of its
// cluster). The links bar under an opened quality lets the person move everything linked to it, in one gesture.
// Right side: the quality and its adjacent qualities. Left side: the opposites of those. A pull multiplies one side by the
// factor and divides the other by it. The handle stays where it was left and always counts from the reference values:
// what the person had set by hand, or the neutral start if they never touched them. The middle returns to the reference.
// To change the links, edit the two lists below: opposites are pairs, adjacent qualities are groups of mutual neighbours.
export const LINK_RANGE=5;
// Opposite qualities (the user's list «Цепочки противоположных качеств», 71 pairs).
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
// Adjacent qualities: within a line all are neighbours of each other; a quality may appear in several lines.
export const ADJACENT_FAMILIES=[
 // Мышление
 ['аналитическое мышление','логическое мышление','критическое мышление','рациональность'],
 ['системное мышление','стратегическое мышление','масштабность мышления','визионерство'],
 ['абстрактное мышление','системное мышление'],
 ['сообразительность','быстрота мышления','находчивость'],
 ['эрудиция','широкий кругозор','культурный уровень','интеллигентность'],
 ['любознательность','широкий кругозор','экспериментаторство'],
 ['креативность','экспериментаторство','находчивость'],
 ['идейность','визионерство'],
 ['наблюдательность','внимательность'],
 // Развитие и гибкость
 ['обучаемость','готовность к саморазвитию','открытость к критике'],
 ['адаптивность','гибкость'],
 ['непредвзятость','открытость к критике'],
 // Порядок и надёжность
 ['дисциплина','самоорганизация','пунктуальность'],
 ['методичность','последовательность','скрупулезность'],
 ['внимательность','скрупулезность'],
 ['старательность','усидчивость','трудолюбие','работоспособность'],
 ['ответственность','надёжность','исполнительность'],
 ['преданность','лояльность','постоянность'],
 ['постоянность','предсказуемость'],
 // Воля и энергия
 ['целеустремленность','настойчивость','воля','сила духа','стойкость'],
 ['амбициозность','достигаторство','склонность к конкуренции'],
 ['работоспособность','выносливость','энергичность'],
 ['энергичность','активность','вовлеченность'],
 ['одержимость делом','вовлеченность','целеустремленность'],
 // Лидерство и влияние
 ['лидерство','умение вдохновлять','харизматичность'],
 ['харизматичность','обаяние'],
 ['убедительность','ораторское искусство'],
 ['проактивность','инициативность','предприимчивость'],
 ['умение отвечать на вызовы','смелость','решительность'],
 ['авторитарность','диктаторство','давление на людей','потребность в контроле','стремление к власти'],
 // Общение
 ['коммуникабельность','открытость','раскованность'],
 ['вежливость','тактичность','дипломатичность','уважительность'],
 ['способность слушать и слышать','способность понимать людей','чуткость','эмпатия'],
 ['командный дух','сотрудничество'],
 ['артистичность','экспрессивность'],
 ['остроумность','чувство юмора','ироничность','самоирония'],
 // Доброта и отдача
 ['доброта','доброжелательность','отзывчивость','милосердие','сострадательность'],
 ['эмпатия','чуткость','сострадательность'],
 ['альтруизм','самоотверженность','бескорыстность','щедрость'],
 ['доброта','альтруизм','щедрость'],
 // Спокойствие и принятие
 ['спокойствие','невозмутимость','хладнокровие','сдержанность','самоконтроль'],
 ['стрессоустойчивость','стойкость','хладнокровие'],
 ['осознанность','рефлексивность'],
 ['гармоничность','спокойствие','принятие реальности'],
 ['способность расслабляться','гармоничность'],
 ['терпимость','миролюбие','способность забывать обиды'],
 ['смирение','скромность','непритязательность'],
 ['духовность','вера'],
 // Честность и достоинство
 ['честность','искренность','порядочность','совесть'],
 ['принципиальность','чувство справедливости','порядочность'],
 ['достоинство','гордость'],
 // Благоразумие
 ['благоразумие','осмотрительность','осторожность','здравый смысл'],
 ['осторожность','избегание риска','потребность в безопасности'],
 ['адекватность','здравый смысл','чувство меры'],
 // Уверенность и независимость
 ['уверенность','вера в себя'],
 ['вера в себя','самоуверенность'],
 ['самостоятельность','независимость','самодостаточность','свободолюбие'],
 ['оптимистичность','жизнерадостность','способность радоваться мелочам'],
 // Чувствительность
 ['чувственность','эмоциональность','сентиментальность'],
 ['ранимость','обидчивость'],
 ['обидчивость','злопамятность','мстительность'],
 ['тревожность','невротичность','внутренняя конфликтность'],
 ['меланхоличность','депрессивность','подавленность','апатичность'],
 ['депрессивность','склонность к саморазрушению'],
 // Холодность и закрытость
 ['эмоциональная холодность','черствость','равнодушие','отрешённость'],
 ['негативный ум','пессимизм'],
 ['склонность к одиночеству','замкнутость','закрытость'],
 ['застенчивость','зажатость','неуверенность'],
 ['недоверие к людям','подозрительность'],
 ['недоброжелательность','враждебность'],
 // Косность
 ['консерватизм','нежелание меняться','косность мышления','боязнь нового'],
 ['упрямство','бескомпромиссность','категоричность'],
 ['предвзятость','косность мышления'],
 ['прямолинейность','категоричность'],
 // Пассивность
 ['лень','прокрастинация'],
 ['пассивность','инертность','безынициативность','склонность пускать процессы на самотек'],
 ['апатичность','пассивность','инертность'],
 ['безыдейность','безынициативность'],
 ['слабоволие','склонность бросать начатое'],
 ['покорность','угодничество'],
 ['инфантильность','беспомощность'],
 // Страхи и неуверенность
 ['боязнь критики','страх ошибки','страх отвержения'],
 ['неуверенность','нерешительность'],
 ['растерянность','беспомощность'],
 ['трусость','боязнь нового'],
 // Агрессия и грубость
 ['гнев','вспыльчивость','раздражительность'],
 ['агрессивность','враждебность','конфликтность'],
 ['хамство','грубость','наглость','бестактность'],
 ['жестокость','мстительность'],
 ['токсичность','энергетический вампир'],
 ['провокативность','конфликтность'],
 ['вспыльчивость','импульсивность','несдержанность'],
 // Манипуляции и эго
 ['манипулятивность','хитрость','коварность'],
 ['лицемерие','лживость'],
 ['эгоизм','эгоцентричность','самолюбие'],
 ['высокомерие','тщеславие','самолюбие'],
 ['тщеславие','потребность в признании'],
 // Деньги
 ['материализм','меркантильность'],
 ['алчность','жадность','скупость','мелочность'],
 // Хаос и некомпетентность
 ['хаотичность','рассеянность','непонимание времени','непунктуальность'],
 ['небрежность','халатность','безответственность'],
 ['дилетантство','непрофессионализм','невежественность'],
 ['неадекватность','иррациональность'],
 // Импульсивность
 ['импульсивность','нетерпеливость'],
 ['азартность','авантюризм','неосмотрительность'],
 ['непостоянство','непредсказуемость'],
 // Контроль и эстетика
 ['перфекционизм','придирчивость','критика'],
 ['вкус','чувство стиля','эстетика'],
];
const linkName=s=>String(s).toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
const linkKey=(c,q)=>c+':'+q;
const linkCache=new WeakMap();
function linkIndex(catalog){
 if(linkCache.has(catalog))return linkCache.get(catalog);
 const at=new Map(),opposite=new Map(),adjacent=new Map();
 catalog.clusters.forEach((c,ci)=>c.qualities.forEach((q,qi)=>at.set(linkName(q.name),linkKey(ci,qi))));
 for(const names of CHAIN_PAIRS){const ends=names.map(n=>at.get(linkName(n)));if(ends.every(Boolean)){opposite.set(ends[0],ends[1]);opposite.set(ends[1],ends[0])}}
 for(const names of ADJACENT_FAMILIES){const keys=names.map(n=>at.get(linkName(n))).filter(Boolean);for(const k of keys){if(!adjacent.has(k))adjacent.set(k,new Set());for(const o of keys)if(o!==k)adjacent.get(k).add(o)}}
 const index={opposite,adjacent};linkCache.set(catalog,index);return index;
}
// What the bar of quality q in cluster c moves: near = the quality and its adjacent ones, far = the opposites of those.
// Returns null when the quality has no links. Items are [cluster, quality]; the opened quality and its opposite come first.
export function linkGroup(catalog,c,q){
 const {opposite,adjacent}=linkIndex(catalog),self=linkKey(c,q),near=[self,...(adjacent.get(self)||[])],seen=new Set(near),far=[];
 for(const k of near){const o=opposite.get(k);if(o&&!seen.has(o)){seen.add(o);far.push(o)}}
 if(near.length===1&&!far.length)return null;
 const pos=k=>k.split(':').map(Number);return {near:near.map(pos),far:far.map(pos)};
}
// Sets the map to `base` (a copy of d.qualities) with near × factor and far ÷ factor. Each touched cluster keeps its budget:
// the qualities outside the bar absorb the difference; when the bar covers a whole cluster, only the ratio inside it can change.
export function applyLinks(d,base,group,factor){
 const touched=new Map(),add=(list,f)=>list.forEach(([c,q])=>{if(!touched.has(c))touched.set(c,new Map());touched.get(c).set(q,base[c][q]*f)});
 add(group.near,factor);add(group.far,1/factor);
 for(const [c,targets] of touched){
  const budget=qualityBudget(d,c),ids=[...targets.keys()],free=base[c].map((_,k)=>k).filter(k=>!targets.has(k)),room=budget-free.length*MIN_WEIGHT;
  const want=ids.map(q=>Math.max(MIN_WEIGHT,targets.get(q))),sum=want.reduce((s,v)=>s+v,0),placed=sum>room||!free.length?distribute(want,room,MIN_WEIGHT):want;
  const others=distribute(free.map(k=>base[c][k]),budget-placed.reduce((s,v)=>s+v,0),MIN_WEIGHT);
  ids.forEach((q,n)=>d.qualities[c][q]=placed[n]);free.forEach((k,n)=>d.qualities[c][k]=others[n]);
 }
}
// Bars live next to the map, never in its data: links.bars["cluster:quality"] = {p: position −100..100, base: reference values
// of the touched clusters, after: their values as the bar left them, marked/reviewed: flags the bar itself switched on}.
export const freshLinks=()=>({bars:{}});
const numbers=v=>Array.isArray(v)&&v.length>0&&v.every(x=>Number.isFinite(x)&&x>0);
const clusterMap=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length>0&&Object.entries(v).every(([k,a])=>/^\d+$/.test(k)&&numbers(a));
const keys=v=>Array.isArray(v)?v.filter(x=>typeof x==='string'&&/^\d+:\d+$/.test(x)):[];
// Bar state comes from browser storage, so only well-formed entries survive.
export function readLinks(raw){
 const out=freshLinks();if(!raw||typeof raw.bars!=='object'||raw.bars===null||Array.isArray(raw.bars))return out;
 for(const [k,b] of Object.entries(raw.bars))if(/^\d+:\d+$/.test(k)&&b&&Number.isFinite(b.p)&&Math.abs(b.p)<=100&&clusterMap(b.base)&&clusterMap(b.after))out.bars[k]={p:b.p,base:b.base,after:b.after,marked:keys(b.marked),reviewed:keys(b.reviewed)};
 return out;
}
const barClusters=g=>[...new Set([...g.near,...g.far].map(x=>x[0]))];
const snapshot=(d,list)=>Object.fromEntries(list.map(c=>[c,d.qualities[c].slice()]));
// The bar of an opened quality, if it has been moved. A value changed elsewhere since (by hand or by another bar) carries over
// into the reference, so moving this bar never undoes that change.
export function settledBar(links,d,key,group){
 const bar=links.bars[key];if(!bar)return null;
 const list=barClusters(group);
 if(!list.every(c=>bar.base[c]?.length===d.qualities[c].length&&bar.after[c]?.length===d.qualities[c].length)){delete links.bars[key];return null}
 for(const c of list)d.qualities[c].forEach((v,k)=>{if(Math.abs(v-bar.after[c][k])>1e-9){bar.base[c][k]*=v/bar.after[c][k];bar.after[c][k]=v}});
 return bar;
}
export function openBar(links,d,key,group){
 const found=settledBar(links,d,key,group);if(found)return found;
 const list=barClusters(group);return links.bars[key]={p:0,base:snapshot(d,list),after:snapshot(d,list),marked:[],reviewed:[]};
}
export function moveBar(d,bar,group,p){applyLinks(d,bar.base,group,LINK_RANGE**(p/100));bar.p=p;bar.after=snapshot(d,barClusters(group))}
// Sets quality j of cluster i to v; the other qualities of the cluster share the rest of its budget.
export function placeQuality(d,i,j,v){
 const q=d.qualities[i],budget=qualityBudget(d,i),free=q.map((_,k)=>k).filter(k=>k!==j);
 v=free.length?Math.max(MIN_WEIGHT,Math.min(budget-free.length*MIN_WEIGHT,v)):budget;
 const other=distribute(free.map(k=>q[k]),budget-v,MIN_WEIGHT);
 q[j]=v;free.forEach((k,n)=>q[k]=other[n]);return v;
}
