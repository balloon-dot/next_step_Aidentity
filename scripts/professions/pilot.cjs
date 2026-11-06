// Prints top/bottom clusters for a few pilot professions.
const {profile}=require('./build-profiles.cjs'),fs=require('fs');
const j=JSON.parse(fs.readFileSync('C:/Users/User/Downloads/Telegram Desktop/profi-source/profi-source/data/professions/onet-mapping.json','utf8'));
const names=['Когнитивные','Креативность','Организованность','Ответственность','Целеустремлённость','Лидерство','Коммуникабельность','Эмпатия','Спокойствие','Смелость/активность','Гибкость','Терпимость','Честность','Альтруизм','Практичность','Уверенность','Эм. глубина','Отстранённость','Консерватизм','Закрытость','Пассивность','Тревожность','Раздражительность','Манипуляции','Эгоцентризм','Материальность','Обаяние','Хаос','Некомпетентность','Подавленность','Импульсивность','Перфекционизм','Вкус и эстетика'];
for(const n of (process.argv[2]||'1,81,104,153,170,56,122,132').split(',').map(Number)){const p=j.professions.find(x=>x.n===n),r=profile(p.codes),o=r.weights.map((w,i)=>[w,i]).sort((a,b)=>b[0]-a[0]);
 console.log('\n'+p.name+':\n  top: '+o.slice(0,7).map(([w,i])=>names[i]+' '+w.toFixed(0)).join(', ')+'\n  low: '+o.slice(-5).map(([w,i])=>names[i]+' '+w.toFixed(0)).join(', '))}
