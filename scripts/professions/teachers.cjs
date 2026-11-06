// Compares Work Styles (importance, WI) of the nine subject-teacher blends and a few reference professions.
const fs=require('fs'),dir=(process.env.ONET_DIR||__dirname+'/../../.onet/db_31_0_text')+'/';
const rows=fs.readFileSync(dir+'Work Styles.txt','utf8').split(/\r?\n/).slice(1).filter(Boolean).map(l=>l.split('\t')).filter(r=>r[3]==='WI');
const styles=[...new Set(rows.map(r=>r[2]))].sort(),by=new Map();for(const r of rows){if(!by.has(r[0]))by.set(r[0],{});by.get(r[0])[r[2]]=+r[4]}
const vec=codes=>styles.map(s=>codes.reduce((a,c)=>a+by.get(c)[s],0)/codes.length);
const map=require('./mapping.cjs'),names=JSON.parse(fs.readFileSync('C:/Users/User/Downloads/Telegram Desktop/profi-source/profi-source/data/professions/onet-mapping.json','utf8')).professions;
const pick=ns=>ns.map(n=>({n,name:names[n-1].name,v:vec(map[n-1][1])}));
const dist=(a,b)=>a.reduce((s,x,i)=>s+Math.abs(x-b[i]),0)/a.length; // mean abs gap on the 1–5 importance scale
const teachers=pick([153,154,155,156,157,158,159,160,161]),others=pick([152,162,163,21,23,141,104,1]);
let inside=[];for(let i=0;i<teachers.length;i++)for(let j=i+1;j<teachers.length;j++)inside.push(dist(teachers[i].v,teachers[j].v));
console.log('subject teachers among themselves: mean',(inside.reduce((a,b)=>a+b)/inside.length).toFixed(3),'max',Math.max(...inside).toFixed(3));
const avgT=styles.map((_,k)=>teachers.reduce((s,t)=>s+t.v[k],0)/teachers.length);
for(const o of others)console.log('merged teacher vs',o.name.padEnd(28),dist(avgT,o.v).toFixed(3));
