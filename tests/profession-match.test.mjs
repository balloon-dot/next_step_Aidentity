import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareReferences,basisOf,matchAll,groupMatches,explainMatch,MIN_RATED_CLUSTERS,SHADOW_CLUSTERS} from '../public/profession-match.js';
// Reference profiles exactly as the admin import files carry them.
const file=n=>JSON.parse(readFileSync(new URL(`../data/professions/admin-import-${n}.json`,import.meta.url),'utf8')).profiles;
const refs=prepareReferences([...file(1),...file(2)].map(p=>({id:p.candidate_id,name:p.profession.name,weights:p.voronoi.clusters.map(c=>c.weight),group:p.recommendation_group||'',subjects:p.subject_hints||[],specialties:p.specialties||[]})));
// A person who raised some clusters to 110 and lowered others to 15 (cluster numbers are 1-based).
const person=(up,down=[])=>{const s=Array(33).fill(50),e=Array(33).fill(false);for(const i of up){s[i-1]=110;e[i-1]=true}for(const i of down){s[i-1]=15;e[i-1]=true}const k=1650/s.reduce((a,b)=>a+b);return {scores:s.map(v=>v*k),edited:e}};
const top=(d,n=10)=>groupMatches(matchAll(d,refs)).slice(0,n).map(r=>r.name);
test('Recommendations follow the accents of the map',()=>{
 assert.equal(refs.length,179);
 assert.ok(top(person([2,33,17],[3])).includes('Художник-живописец'));
 assert.ok(top(person([9,3,4],[31,28])).includes('Пилот'));
 assert.ok(top(person([6,16,5])).includes('Предприниматель'));
 assert.ok(!top(person([2,33,17],[3]),20).includes('Бухгалтер / Аудитор'));
});
test('Untouched clusters are neutral, percentages stay within 0..100 and few ratings fall back to all clusters',()=>{
 const d=person([1,3]);assert.ok(basisOf(d).rated<MIN_RATED_CLUSTERS);assert.equal(basisOf(d).clusters.length,33);
 const all=matchAll(person([8,14,7],[1]),refs);assert.ok(all.every(m=>m.percent>=0&&m.percent<=100));assert.ok(all[0].percent>all.at(-1).percent);
 // Moving an untouched cluster (not marked edited) does not change the match.
 const a=person([8,14,7]),b=structuredClone(a);b.scores[20]+=30;b.scores[21]-=30;
 assert.deepEqual(matchAll(a,refs).map(m=>m.percent),matchAll(b,refs).map(m=>m.percent));
});
test('Near-identical professions are grouped into one line and the card explanation names shared strengths',()=>{
 const rows=groupMatches(matchAll(person([7,6,27]),refs)),law=rows.find(r=>r.members.some(m=>m.name==='Юрист'));
 assert.equal(law.name,'Юрист / Адвокат');assert.equal(rows.filter(r=>r.members.some(m=>m.name==='Адвокат')).length,1);
 const d=person([9,3,4],[31,28]),pilot=refs.find(r=>r.name==='Пилот'),e=explainMatch(d,pilot);
 assert.ok(e.strengths.includes(8));assert.ok(e.unrated.every(i=>!d.edited[i]));
 const teacher=refs.find(r=>r.name==='Учитель средней и старшей школы');assert.equal(teacher.subjects.length,9);assert.ok(teacher.subjects.every(s=>refs.some(r=>r.id===s.candidate_id)));
});
test('Shadow clusters are never something a profession needs more of',()=>{
 assert.ok(refs.every(r=>[...SHADOW_CLUSTERS].every(i=>r.accent[i]<=0)));
 const d=person([2,33,17,11,7],[3,15,28]);// lowered «Хаос и безответственность» among others
 for(const r of refs){const e=explainMatch(d,r);assert.ok(e.needMore.every(i=>!SHADOW_CLUSTERS.has(i)))}
 const pilot=explainMatch(d,refs.find(r=>r.name==='Пилот'));assert.ok(pilot.lowShadows.includes(27));
});
