// Exports the profession reference profiles in the /admin import format (at most 100 profiles per file).
// Usage: node scripts/professions/export-admin.cjs   (needs O*NET in .onet/ or ONET_DIR)
const fs=require('fs'),path=require('path');
const {profile,scheme}=require('./build-profiles.cjs');
const root=path.join(__dirname,'../../data/professions/');
const mapping=JSON.parse(fs.readFileSync(root+'onet-mapping.json','utf8')).professions;
const names=require('./cluster-names.json');
const qualityNames=JSON.parse(fs.readFileSync(path.join(__dirname,'quality-names.json'),'utf8'));
const id=n=>'PROF-'+String(n).padStart(3,'0');
const TYPE={exact:'точное соответствие',close:'близкое соответствие',blend:'смесь профессий'};
const round=v=>Math.round(v*10)/10;
const profiles=mapping.map(m=>{
 const w=profile(m.codes).weights.map(round),order=w.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]);
 const p={candidate_id:id(m.n),is_synthetic:true,profile_type:'profession_reference',status:'Синтетический профиль: O*NET 31.0 + схема кластеров v1',
  profession:{id:'prof-'+m.n,name:m.name,category:''},
  expertise_description:'Типичный образ профессии по данным O*NET 31.0: '+m.onet.join(' + ')+'.',
  salient_qualities:'Сильнее всего выражены: '+order.slice(0,5).map(([v,i])=>names[i]+' ('+Math.round(v)+')').join(', ')+'.',
  mapping_note:'O*NET: '+m.codes.join(', ')+' — '+TYPE[m.type]+(m.note?'. '+m.note:''),
  taxonomy_source:'O*NET 31.0 Database (USDOL/ETA), CC BY 4.0; переведено в 33 кластера по схеме v1, качества внутри кластеров нейтральны',
  specialties:m.specialties,onet_codes:m.codes,
  voronoi:{total_cluster_weight:0,cluster_count:33,quality_count:qualityNames.flat().length,clusters:names.map((name,i)=>({name,cluster_number:i+1,weight:w[i],qualities:qualityNames[i].map(q=>({name:q,weight:50}))}))}};
 if(m.group)p.recommendation_group='GROUP-'+m.group.map(n=>String(n).padStart(3,'0')).join('-');
 if(m.subjects)p.subject_hints=m.subjects.map(s=>({subject:s.subject,candidate_id:id(s.hintProfession)}));
 p.voronoi.total_cluster_weight=p.voronoi.clusters.reduce((s,c)=>s+c.weight,0);
 return p;
});
const metadata={dataset:'Профили профессий — O*NET 31.0, схема кластеров v1',synthetic:true,validation:'Синтетические профили: показатели O*NET переведены в 33 кластера; качества внутри кластеров нейтральны (по 50).',interpretation:'Типичный образ профессии, а не измерение реальных работников. Используется для рекомендаций профессий.'};
const files=[];for(let i=0;i<profiles.length;i+=100){const f=root+'admin-import-'+(files.length+1)+'.json';fs.writeFileSync(f,JSON.stringify({metadata,profiles:profiles.slice(i,i+100)}));files.push(path.basename(f))}
console.log(profiles.length,'profiles →',files.join(', '));
