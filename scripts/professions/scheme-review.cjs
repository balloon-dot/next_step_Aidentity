// Builds "Схема кластеров O-NET.xlsx": the scheme in Russian, the rules, pilot profiles and top-5 clusters for all professions.
const fs=require('fs'),XLSX=require('xlsx');
const {profile,scheme}=require('./build-profiles.cjs'),P=scheme.params;
const root='C:/Users/User/Downloads/Telegram Desktop/profi-source/profi-source/data/professions/';
const j=JSON.parse(fs.readFileSync(root+'onet-mapping.json','utf8'));
const RU={'WS:Intellectual Curiosity':'любознательность к знаниям','WS:Innovation':'изобретательность','WS:Attention to Detail':'внимание к деталям','WS:Dependability':'надёжность','WS:Integrity':'честность','WS:Achievement Orientation':'ориентация на достижения','WS:Perseverance':'настойчивость','WS:Leadership Orientation':'склонность руководить','WS:Initiative':'инициативность','WS:Social Orientation':'тяга к общению','WS:Cooperation':'готовность сотрудничать','WS:Empathy':'эмпатия','WS:Stress Tolerance':'стрессоустойчивость','WS:Self-Control':'самообладание','WS:Tolerance for Ambiguity':'терпимость к неопределённости','WS:Adaptability':'адаптивность','WS:Humility':'скромность','WS:Sincerity':'искренность','WS:Cautiousness':'осторожность','WS:Self-Confidence':'уверенность в себе','WS:Optimism':'оптимизм',
'AB:Deductive Reasoning':'дедуктивное мышление','AB:Inductive Reasoning':'индуктивное мышление','AB:Originality':'оригинальность идей','AB:Fluency of Ideas':'беглость идей','AB:Information Ordering':'упорядочивание информации','AB:Oral Expression':'устная речь','AB:Stamina':'выносливость','AB:Time Sharing':'многозадачность','AB:Visual Color Discrimination':'различение цветов',
'SK:Critical Thinking':'критическое мышление','SK:Complex Problem Solving':'решение сложных задач','SK:Systems Analysis':'системный анализ','SK:Time Management':'управление временем','SK:Persuasion':'убеждение','SK:Management of Personnel Resources':'управление людьми','SK:Active Listening':'активное слушание','SK:Social Perceptiveness':'понимание людей','SK:Negotiation':'переговоры','SK:Service Orientation':'ориентация на помощь людям','SK:Active Learning':'активное обучение','SK:Judgment and Decision Making':'принятие решений','SK:Monitoring':'контроль','SK:Quality Control Analysis':'контроль качества',
'IN:Artistic':'интересы: артистический тип','IN:Conventional':'интересы: порядок и правила','IN:Enterprising':'интересы: предпринимательский тип','IN:Social':'интересы: социальный тип',
'SIA:Religious Activities':'интерес: религиозная деятельность','SIA:Social Service':'интерес: социальная служба','SIA:Creative Writing':'интерес: литературное творчество','SIA:Performing Arts':'интерес: сценические искусства','SIA:Public Speaking':'интерес: публичные выступления','SIA:Applied Arts and Design':'интерес: прикладное искусство и дизайн','SIA:Visual Arts':'интерес: изобразительное искусство'};
const TYPE={WS:'стиль',AB:'способность',SK:'навык',IN:'интересы',SIA:'интересы'};
for(const s of scheme)for(const k of Object.keys(s.src))if(!RU[k])throw Error('No translation '+k);
const clusters=(()=>{const src=fs.readFileSync('C:/Users/User/Downloads/Telegram Desktop/profi-source/profi-source/public/profile-taxonomy.js','utf8');return null})();
// Cluster names come from the catalog via a small ESM bridge written by the caller.
const names=JSON.parse(fs.readFileSync(__dirname+'/cluster-names.json','utf8'));
const part=(k,w)=>{const sign=w<0?'обратно: ':'';const m=Math.abs(w)===1?'':' (×'+String(Math.abs(w)).replace('.',',')+')';return sign+RU[k]+m};
const schemeRows=[['№','Кластер','Тип','Из чего складывается (в скобках — половинный вес; «обратно» — чем больше, тем меньше кластер)','Опора в O*NET','Ваша правка / замечание']];
for(const s of scheme){const src=Object.entries(s.src);schemeRows.push([s.c,names[s.c-1],s.kind==='pos'?'основной':'теневой',src.map(([k,w])=>part(k,w)).join('; '),s.confidence,''])}
const rules=[['Как из данных O*NET получается профиль профессии'],[''],
['1. Каждый показатель O*NET (стиль, способность, навык, интерес) сравнивается со всеми ~900 профессиями базы: насколько он у этой профессии выше или ниже среднего.'],
['2. Если профессия — смесь двух профессий O*NET, их показатели сначала усредняются.'],
['3. Кластер = взвешенное среднее своих показателей (см. лист «Схема»). Итог снова сравнивается со всеми профессиями: «у юриста лидерство заметно выше среднего».'],
['4. Вес кластера = база × e^(0,5 × отклонение). База основных кластеров 1, теневых 0,5 — у «идеального» профиля тени меньше. Потом 33 веса масштабируются до суммы 1650, как на карте.'],
['5. Предохранители: отклонение ограничено 2,5 — один кластер не может забрать пол-карты; кластеры со средней опорой меняются на 75%, со слабой — на 50%; теневые кластеры могут только уменьшаться, но не расти (тень никогда не плюс для профессии).'],
['6. Качества внутри кластеров в первой версии нейтральны (по 50) — сравнение идёт по кластерам. Качества добавим второй версией.'],[''],
['Важно: в O*NET 31.0 рабочие стили оценены экспертами с помощью ИИ, а не опросом работников. Поэтому это «типичный образ профессии», а не замер реальных людей.'],
['Источник: O*NET 31.0 Database, U.S. Department of Labor/Employment and Training Administration, лицензия CC BY 4.0.']];
const pilotNs=[1,81,104,153,170,56,122,132];
const pilot=[['Кластер',...pilotNs.map(n=>j.professions.find(p=>p.n===n).name)]];
const profs=Object.fromEntries(j.professions.map(p=>[p.n,profile(p.codes).weights]));
names.forEach((nm,i)=>pilot.push([nm,...pilotNs.map(n=>Math.round(profs[n][i]))]));
pilot.push(['Сумма',...pilotNs.map(n=>Math.round(profs[n].reduce((a,b)=>a+b,0)))]);
const top=[['№','Профессия','Топ-5 кластеров (баллы из 1650)','Самые слабые 3']];
for(const p of j.professions){const o=profs[p.n].map((w,i)=>[w,i]).sort((a,b)=>b[0]-a[0]);top.push([p.n,p.name,o.slice(0,5).map(([w,i])=>names[i]+' '+Math.round(w)).join('; '),o.slice(-3).map(([w,i])=>names[i]+' '+Math.round(w)).join('; ')])}
const wb=XLSX.utils.book_new(),add=(rows,name,cols)=>{const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=cols.map(w=>({wch:w}));XLSX.utils.book_append_sheet(wb,ws,name)};
add(rules,'Как считается',[140]);add(schemeRows,'Схема',[5,38,11,110,12,40]);add(pilot,'Пробные профили',[38,...pilotNs.map(()=>18)]);add(top,'Все профессии',[5,42,110,70]);
XLSX.writeFile(wb,root+'Схема кластеров O-NET.xlsx');
fs.writeFileSync(root+'profession-profiles.draft.json',JSON.stringify({status:'draft — схема на утверждении',params:P,clusters:names,profiles:j.professions.map(p=>({n:p.n,name:p.name,weights:profs[p.n].map(w=>Math.round(w*10)/10)}))},null,1));
console.log('ok',j.professions.length,'max weight',Math.max(...Object.values(profs).flat()).toFixed(0),'min',Math.min(...Object.values(profs).flat()).toFixed(1));
