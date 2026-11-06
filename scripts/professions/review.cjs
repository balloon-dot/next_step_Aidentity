// Builds the review workbook and the machine-readable mapping JSON in the project data folder.
const fs=require('fs'),XLSX=require('xlsx'),dir=(process.env.ONET_DIR||__dirname+'/../../.onet/db_31_0_text')+'/',out='C:/Users/User/Downloads/Telegram Desktop/profi-source/profi-source/data/professions/';
const read=f=>fs.readFileSync(dir+f,'utf8').split(/\r?\n/).slice(1).filter(Boolean).map(l=>l.split('\t'));
const titles=new Map(read('Occupation Data.txt').map(r=>[r[0],r[1]])),ab=new Set(read('Abilities.txt').map(r=>r[0]));
const wb0=XLSX.readFile(process.argv[2]),rows=XLSX.utils.sheet_to_json(wb0.Sheets[wb0.SheetNames[0]],{header:1,defval:''});
const names=rows[0].map(v=>String(v).replace(/\s+/g,' ').trim());
const specialties=names.map((_,c)=>rows.slice(1).map(r=>String(r[c]||'').replace(/\s+/g,' ').trim()).filter(Boolean));
const map=require('./mapping.cjs'),label={exact:'точное',close:'близкое',blend:'смесь'};
let data=map.map(([n,codes,type,note])=>({n,name:names[n-1],type,codes,onet:codes.map(c=>titles.get(c)),note,noAbilities:codes.filter(c=>!ab.has(c)),specialties:specialties[n-1]}));
// Agreed with the user: the nine subject teachers become one profession (their O*NET work styles differ ~0.12 on a 1–5 scale).
// The card hints the subject by the closest related profession; specialties of all nine are kept.
const SUBJECTS={153:['математика',21],154:['информатика',1],155:['физика',23],156:['химия',24],157:['биология',25],158:['география',31],159:['история и обществознание',146],160:['русский язык и литература',145],161:['иностранный язык',143]};
const subjectNs=Object.keys(SUBJECTS).map(Number);
const merged={n:153,name:'Учитель средней и старшей школы',type:'exact',codes:['25-2031.00'],onet:[titles.get('25-2031.00')],note:'Объединены 9 учителей-предметников (№153–161). Предмет подсказывается по ближайшей профессии: '+subjectNs.map(n=>SUBJECTS[n][0]+' → '+names[SUBJECTS[n][1]-1]).join('; '),noAbilities:ab.has('25-2031.00')?[]:['25-2031.00'],specialties:[...new Set(subjectNs.flatMap(n=>specialties[n-1]))],merged:subjectNs.map(n=>names[n-1]),subjects:subjectNs.map(n=>({subject:SUBJECTS[n][0],hintProfession:SUBJECTS[n][1]}))};
data=data.flatMap(d=>d.n===153?[merged]:subjectNs.includes(d.n)?[]:[d]);
// Near-identical profiles in O*NET: shown as one line in recommendations (e.g. «Юрист / адвокат — 84%»).
const GROUPS=[[91,92],[122,123],[181,182],[174,175,179]];
for(const g of GROUPS)for(const d of data)if(g.includes(d.n))d.group=g;
fs.writeFileSync(out+'onet-mapping.json',JSON.stringify({source:'O*NET 31.0 Database (U.S. Department of Labor/Employment and Training Administration), CC BY 4.0',list:'Топ-200_профессий-специальностей для клода.xlsx',status:'draft — на проверке',professions:data},null,1));
const groupLabel=d=>d.group?d.group.map(n=>names[n-1]).join(' / '):'';
const sheet=[['№','Наша профессия','Соответствие','Код O*NET','Профессия в O*NET (англ.)','Комментарий','Данные O*NET','В выдаче одной строкой с','Ваша правка / замечание']];
for(const d of data)sheet.push([d.n,d.name,label[d.type],d.codes.join('\n'),d.onet.join('\n'),d.note,d.noAbilities.length?'рабочие стили есть, способностей нет':'полные',groupLabel(d),'']);
const ws=XLSX.utils.aoa_to_sheet(sheet);ws['!cols']=[{wch:5},{wch:42},{wch:13},{wch:12},{wch:55},{wch:60},{wch:22},{wch:40},{wch:40}];ws['!autofilter']={ref:'A1:I'+sheet.length};
const count=t=>data.filter(d=>d.type===t).length;
const info=XLSX.utils.aoa_to_sheet([['Сопоставление профессий с O*NET — черновик на проверку'],[''],['Точное — в O*NET есть та же профессия',count('exact')],['Близкое — ближайшая профессия, с оговоркой',count('close')],['Смесь — профиль будет средним 2 профессий O*NET',count('blend')],['Всего',data.length],[''],['9 учителей-предметников объединены в «Учитель средней и старшей школы»; предмет подсказывается в карточке.'],['Почти одинаковые профили (бухгалтер/аудитор, юрист/адвокат, музыкант/вокалист, режиссёры/продюсер) показываются в выдаче одной строкой.'],[''],['Что проверить: подходит ли профессия O*NET по сути работы. Если нет — напишите в последнем столбце, на что заменить или что смешать.'],['Источник: O*NET 31.0 Database, U.S. Department of Labor, лицензия CC BY 4.0.']]);info['!cols']=[{wch:70},{wch:8}];
const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,info,'Пояснение');XLSX.utils.book_append_sheet(wb,ws,'Сопоставление');XLSX.writeFile(wb,out+'Сопоставление профессий с O-NET.xlsx');
console.log('exact',count('exact'),'close',count('close'),'blend',count('blend'));
