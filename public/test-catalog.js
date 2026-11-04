import {TAXONOMY} from './profile-taxonomy.js';
import {PREVIOUS_TAXONOMY} from './profile-taxonomy-353.js';
export const CURRENT_CATALOG_VERSION='professional-33-283-v1';
export const PREVIOUS_CATALOG_VERSION='professional-33-353-v1';
export const LEGACY_CATALOG_VERSION='examples-v1';
// Two independent levels, the same shape as admin profile files: clusters start at 50 and share 50 points
// per cluster; inside a cluster its qualities start at 50 and share 50 points per quality. A quality's
// weight on the whole map is its cluster's share times its share of the cluster. Nothing drops below 1.
export const INITIAL_WEIGHT=50,MIN_WEIGHT=1;
const legacyNames=['Коммуникация','Лидерство','Аналитическое мышление','Креативность','Эмоциональный интеллект','Стратегическое мышление','Работа в команде','Адаптивность','Ответственность','Самоорганизация','Критическое мышление','Инициативность','Обучаемость','Решение проблем','Переговоры','Эмпатия','Управление проектами','Принятие решений','Системное мышление','Внимание к деталям','Настойчивость','Гибкость','Клиентоориентированность','Публичные выступления','Планирование','Управление конфликтами','Цифровая грамотность','Исследование','Предприимчивость','Работа с данными','Управление временем','Надежность','Развитие других'];
const legacyQualities=[['Умение слушать','Способность внимательно воспринимать информацию, понимать собеседника и учитывать его позицию.'],['Убеждение','Способность ясно аргументировать позицию и помогать собеседнику увидеть ее ценность.'],['Ведение переговоров','Способность находить взаимоприемлемые решения и согласовывать интересы.'],['Публичные выступления','Способность уверенно и понятно доносить идеи до аудитории.']];
const legacyCustom={1:[['Постановка целей','Умение формулировать понятные цели для команды.'],['Мотивация','Умение поддерживать вовлеченность и инициативу.'],['Делегирование','Умение передавать задачи и ответственность.'],['Обратная связь','Умение помогать другим развиваться через конкретные наблюдения.']],2:[['Анализ информации','Умение выделять значимые факты и закономерности.'],['Логика','Умение выстраивать последовательные рассуждения.'],['Проверка гипотез','Умение проверять предположения на данных.'],['Интерпретация','Умение объяснять смысл полученных результатов.']],3:[['Генерация идей','Умение предлагать новые варианты решения.'],['Воображение','Умение представлять возможные сценарии.'],['Экспериментирование','Готовность пробовать новые подходы.'],['Оригинальность','Умение находить нестандартные решения.']]};
function legacyQs(i){return legacyCustom[i]||(i===0?legacyQualities:[['Применение на практике',`Способность применять качество «${legacyNames[i].toLowerCase()}» в рабочих задачах.`],['Самостоятельность','Способность действовать без постоянной поддержки и подсказок.'],['Последовательность','Способность проявлять качество регулярно в разных ситуациях.'],['Развитие навыка','Способность замечать зоны роста и осваивать новые подходы.']])}

const current={version:CURRENT_CATALOG_VERSION,title:'Профессиональные качества',clusters:TAXONOMY.map(c=>({number:c.number,name:c.name,qualities:c.qualities.map(name=>({name,definition:''}))})),qualityCount:TAXONOMY.reduce((n,c)=>n+c.qualities.length,0)};
const legacy={version:LEGACY_CATALOG_VERSION,title:'Предыдущая демонстрационная версия',clusters:legacyNames.map((name,i)=>({number:i+1,name,qualities:legacyQs(i).map(([name,definition])=>({name,definition}))})),qualityCount:132};
export const CATALOGS={[CURRENT_CATALOG_VERSION]:current,[LEGACY_CATALOG_VERSION]:legacy};
export const TOTAL_WEIGHT=INITIAL_WEIGHT*current.clusters.length;
const sum=v=>v.reduce((a,b)=>a+b,0);
export const budgetOf=data=>INITIAL_WEIGHT*data.scores.length,qualityBudget=(data,i)=>INITIAL_WEIGHT*data.qualities[i].length;
// A part grows until every other part of its level sits at the minimum.
export function clusterBounds(data){return [MIN_WEIGHT,budgetOf(data)-(data.scores.length-1)*MIN_WEIGHT]}
export function qualityBounds(data,i){return [MIN_WEIGHT,qualityBudget(data,i)-(data.qualities[i].length-1)*MIN_WEIGHT]}
// Splits total in proportion to weights, holding each part within its bounds (a number or one per part).
export function distribute(weights,total,min=0,max=Infinity){
 const lo=i=>Array.isArray(min)?min[i]:min,hi=i=>Array.isArray(max)?max[i]:max;let out=Array(weights.length).fill(0),active=weights.map((_,i)=>i),rest=total;
 while(active.length){let whole=active.reduce((v,i)=>v+weights[i],0),part=i=>whole>0?rest*weights[i]/whole:rest/active.length,fixed=active.filter(i=>part(i)<lo(i)||part(i)>hi(i));if(!fixed.length){active.forEach(i=>out[i]=part(i));break}fixed.forEach(i=>out[i]=part(i)<lo(i)?lo(i):hi(i));fixed.forEach(i=>rest-=out[i]);active=active.filter(i=>!fixed.includes(i))}
 return out;
}
export const getCatalog=(version=CURRENT_CATALOG_VERSION)=>typeof version==='string'&&Object.hasOwn(CATALOGS,version)?CATALOGS[version]:null;
export function matchesQualityShape(data,version){const c=getCatalog(version);return !!c&&Array.isArray(data?.qualities)&&data.qualities.length===c.clusters.length&&data.qualities.every((q,i)=>Array.isArray(q)&&q.length===c.clusters[i].qualities.length)}
export function dataCatalogVersion(data){return [CURRENT_CATALOG_VERSION,LEGACY_CATALOG_VERSION].find(version=>matchesQualityShape(data,version))||null}
export function validScoreData(data,version=CURRENT_CATALOG_VERSION){
 const c=getCatalog(version);if(!c||!matchesQualityShape(data,version))return false;
 const n=c.clusters.length,numbers=v=>Array.isArray(v)&&v.every(Number.isFinite),flags=(v,k)=>Array.isArray(v)&&v.length===k&&v.every(x=>typeof x==='boolean');
 if(!numbers(data.scores)||data.scores.length!==n||!data.qualities.every(numbers)||!flags(data.edited,n)||!Array.isArray(data.qedited)||data.qedited.length!==n||!data.qedited.every((q,i)=>flags(q,c.clusters[i].qualities.length)))return false;
 const eps=1e-7*budgetOf(data),[lo,hi]=clusterBounds(data),within=(v,[a,b],e)=>v>=a-e&&v<=b+e;
 return balanced(data)&&data.scores.every(v=>within(v,[lo,hi],eps))&&data.qualities.every((q,i)=>{const b=qualityBounds(data,i);return q.every(v=>within(v,b,1e-7*qualityBudget(data,i)))});
}
const balanced=data=>Math.abs(sum(data.scores)-budgetOf(data))<=1e-7*budgetOf(data),qualitiesBalanced=(data,i)=>Math.abs(sum(data.qualities[i])-qualityBudget(data,i))<=1e-7*qualityBudget(data,i);
// Older maps used other budgets (clusters on 330, qualities on a 1–30 scale, or clusters as sums of qualities):
// every level keeps its shares and is rescaled onto its current budget.
export function upgradeBudget(data){
 const positive=v=>Array.isArray(v)&&v.every(x=>Number.isFinite(x)&&x>0);
 if(!positive(data?.scores)||!Array.isArray(data.qualities)||data.qualities.length!==data.scores.length||!data.qualities.every(positive))return data;
 const budget=budgetOf(data),[lo,hi]=clusterBounds(data),scores=balanced(data)?data.scores:distribute(data.scores,budget,lo,hi);
 const qualities=data.qualities.map((q,i)=>qualitiesBalanced(data,i)?q:distribute(q,qualityBudget(data,i),...qualityBounds(data,i)));
 if(scores===data.scores&&qualities.every((q,i)=>q===data.qualities[i]))return data;
 return {...data,scores,areas:scores.map(v=>v/budget),qualities};
}
export function freshScoreData(version=CURRENT_CATALOG_VERSION){
 const c=getCatalog(version);if(!c)throw new Error('Unknown catalog version');
 const n=c.clusters.length;
 return {scores:Array(n).fill(INITIAL_WEIGHT),areas:Array(n).fill(INITIAL_WEIGHT/(INITIAL_WEIGHT*n)),edited:Array(n).fill(false),qualities:c.clusters.map(c=>c.qualities.map(()=>INITIAL_WEIGHT)),qedited:c.clusters.map(c=>c.qualities.map(()=>false))};
}
// The 353-quality list was trimmed to 283: each kept quality points at its old [cluster, index], removed ones are dropped.
const qualityKey=name=>name.toLowerCase().replace(/\*/g,'').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
const RENAMED={'непринятие реальности':'неприятие реальности'};
const previousAt=new Map(PREVIOUS_TAXONOMY.flatMap((c,ci)=>c.qualities.map((q,qi)=>{const k=qualityKey(q);return [RENAMED[k]||k,[ci,qi]]})));
export const QUALITY_SOURCE=TAXONOMY.map(c=>c.qualities.map(q=>{const at=previousAt.get(qualityKey(q));if(!at)throw new Error('No source for quality '+q);return at}));
const previousShape=data=>Array.isArray(data?.qualities)&&data.qualities.length===PREVIOUS_TAXONOMY.length&&data.qualities.every((q,i)=>Array.isArray(q)&&q.length===PREVIOUS_TAXONOMY[i].qualities.length);
export function upgradeCatalog(data){if(!previousShape(data))return data;const pick=v=>QUALITY_SOURCE.map(c=>c.map(([ci,qi])=>v?.[ci]?.[qi]));return {...data,qualities:pick(data.qualities),qedited:pick(data.qedited)}}
export const upgradeData=data=>upgradeBudget(upgradeCatalog(data));
export const currentVersionOf=version=>version===PREVIOUS_CATALOG_VERSION?CURRENT_CATALOG_VERSION:version;
