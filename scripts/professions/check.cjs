// Validates every mapped code: exists in Occupation Data, and has Work Styles / Abilities data.
const fs=require('fs'),dir=(process.env.ONET_DIR||__dirname+'/../../.onet/db_31_0_text')+'/';
const read=f=>fs.readFileSync(dir+f,'utf8').split(/\r?\n/).slice(1).filter(Boolean).map(l=>l.split('\t'));
const titles=new Map(read('Occupation Data.txt').map(r=>[r[0],r[1]]));
const ws=new Set(read('Work Styles.txt').map(r=>r[0])),ab=new Set(read('Abilities.txt').map(r=>r[0]));
const map=require('./mapping.cjs');let bad=0;
if(map.length!==187)console.log('COUNT',map.length);
map.forEach(([n,codes])=>codes.forEach(c=>{if(!titles.has(c)){bad++;console.log('MISSING',n,c)}else if(!ws.has(c)||!ab.has(c)){bad++;console.log('NODATA',n,c,titles.get(c),'ws',ws.has(c),'ab',ab.has(c))}}));
console.log('problems',bad);
