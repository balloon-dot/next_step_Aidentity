'use strict';
import {CURRENT_CATALOG_VERSION,LEGACY_CATALOG_VERSION,getCatalog,dataCatalogVersion,validScoreData,freshScoreData,upgradeData,currentVersionOf,TOTAL_WEIGHT,INITIAL_WEIGHT,MIN_WEIGHT,budgetOf,qualityBudget,clusterBounds,qualityBounds,distribute} from './test-catalog.js?v=13';
import {synonymsOf,placeQuality} from './quality-chains.js?v=4';
import {MIN_RATED_CLUSTERS,prepareReferences,basisOf,accentOf,matchProfession,matchAll,groupMatches,explainMatch} from './profession-match.js?v=1';
let CATALOG_VERSION=CURRENT_CATALOG_VERSION,names=getCatalog().clusters.map(c=>c.name);
function useCatalog(version){const c=getCatalog(version);if(!c)throw Error('Перечень качеств не поддерживается. Обновите страницу.');CATALOG_VERSION=version;names=c.clusters.map(c=>c.name)}
function qs(i,data=null){const c=getCatalog(data?dataCatalogVersion(data):CATALOG_VERSION);return (c?.clusters[i]?.qualities||[]).map(q=>[q.name,q.definition||''])}
const fresh=(version=CATALOG_VERSION)=>freshScoreData(version);
function prepareState(raw){
 const next=raw&&typeof raw==='object'&&!Array.isArray(raw)?structuredClone(raw):{scale:30,self:freshScoreData(),profile:{},external:[],fixed:null,id:crypto.randomUUID()};
 next.profile=next.profile&&typeof next.profile==='object'?next.profile:{};next.external=Array.isArray(next.external)?next.external:[];
 if(next.scale!==30){[next.self,next.fixed,...next.external.map(x=>x?.data)].filter(Boolean).forEach(d=>{if(Array.isArray(d.areas)&&d.areas.length===33&&d.areas.every(v=>Number.isFinite(v)&&v>0))syncScores(d);if(Array.isArray(d.qualities))d.qualities=d.qualities.map(q=>Array.isArray(q)?q.map(v=>Math.max(1,Math.min(30,v*3))):[])});next.scale=30}
 for(const k of ['self','fixed'])next[k]=upgradeData(next[k]);next.external.forEach(x=>{if(x?.data)x.data=upgradeData(x.data)});if(next.previousTest)for(const k of ['self','fixed'])next.previousTest[k]=upgradeData(next.previousTest[k]);
 if(!validScoreData(next.self,CURRENT_CATALOG_VERSION)){
  if(dataCatalogVersion(next.self)||dataCatalogVersion(next.fixed))next.previousTest={catalogVersion:dataCatalogVersion(next.self)||dataCatalogVersion(next.fixed),self:next.self,fixed:next.fixed||null,fixedAt:next.fixedAt||null,external:next.external,collectionId:next.collectionId||null};
  next.self=freshScoreData();next.fixed=null;next.external=[];next.collectionId=null;next.pendingNew=false;
 }else if(next.fixed&&!validScoreData(next.fixed,CURRENT_CATALOG_VERSION)){next.fixed=null;next.collectionId=null;next.pendingNew=false}
 delete next.chains;delete next.links;next.catalogVersion=CURRENT_CATALOG_VERSION;return next;
}
let state;try{state=JSON.parse(localStorage.getItem('profi.v1'))}catch{}state=prepareState(state);
// Scores are a fixed budget: 1650 points, with each cell in [1, 1618].

function syncScores(d){d.scores=distribute(d.areas,TOTAL_WEIGHT);d.areas=d.scores.map(v=>v/TOTAL_WEIGHT)}
// The slider is quadratic so the common range around the starting 50 gets most of the track.
// Dragging keeps the old feel: 12px per 1/330 of the map is 2.4px per point of 1650.
// Dragging a cell by 120px moves it by one average cell of the level being edited.
const DRAG_CELL_PX=120;
const SLIDER_STEPS=1000,toSlider=(v,[lo,hi])=>hi>lo?Math.round(Math.sqrt(Math.max(0,(v-lo)/(hi-lo)))*SLIDER_STEPS):0,fromSlider=(p,[lo,hi])=>Math.round(lo+(hi-lo)*(p/SLIDER_STEPS)**2);
let shared=null,shareError=false;const snapshotParam=new URLSearchParams(location.hash.slice(1)).get('result');
if(snapshotParam){try{const p=JSON.parse(atob(snapshotParam)),data=upgradeData({scores:p.s,areas:p.s?.map(v=>v/TOTAL_WEIGHT),edited:p.e,qualities:p.q,qedited:p.z}),version=currentVersionOf(p.v)||dataCatalogVersion(data);if(!validScoreData(data,version))throw Error('invalid');shared=data;useCatalog(version)}catch{shareError=true}}
const fmt=v=>Number(v).toLocaleString('ru-RU',{maximumFractionDigits:1});
let page=new URLSearchParams(location.search).get('view')||'map',selected=null,method='manual',resultTab='self',rating=new URLSearchParams(location.hash.slice(1)).get('invite')||new URLSearchParams(location.hash.slice(1)).get('evaluate'),guest=fresh(),guestDone=false,polygons=[],drag=null,repaintDiagram=null,inside=null;
// The mode (own map, invitation, shared snapshot) is read from the hash only on load. Pasting an invite link into
// an open tab changes just the hash without a reload, so reload when the link points somewhere else.
globalThis.addEventListener?.('hashchange',()=>{const p=new URLSearchParams(location.hash.slice(1));if((p.get('invite')||p.get('evaluate')||null)!==(rating||null)||p.get('result')!==snapshotParam)location.reload()});
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const remote={user:null,signedIn:false,loading:true,error:'',collections:[],active:null,summary:null};
const invitation={ownerName:'',baseline:null,loading:!!rating,error:'',started:false,firstName:'',lastName:'',isOwner:false,alreadySubmitted:false};
const freshReviewChanges=()=>({clusters:Array(33).fill(false),qualities:getCatalog(CATALOG_VERSION).clusters.map(c=>c.qualities.map(()=>false))});
let reviewChanges=freshReviewChanges(),mapView='voronoi',tailOrder=null,tailData=null;
let summaryBusy=false,shareBusy=false;
let toastTimer=null;
async function api(path,options={}){const response=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});let result;try{result=await response.json()}catch{throw Error('Сервер временно недоступен. Попробуйте еще раз.')}if(!response.ok){let e=Error(result.error||'Не удалось выполнить запрос.');e.status=response.status;throw e}return result}
function signInLink(){return '<button class="primary" onclick="openAuth()">Войти или создать аккаунт →</button>'}
function blankState(){return prepareState(null)}
function activateAccount(user){
 if(state.accountId===user.id)return;
 let stored;try{stored=JSON.parse(localStorage.getItem('profi.account.'+user.id))}catch{}
 if(stored)state=prepareState(stored);
 else if(state.accountId)state=blankState();
 else {try{localStorage.removeItem('profi.v1')}catch{}}
 state.accountId=user.id;save();
}
function renderAccount(){let adminLink=$('.admin-cabinet-link');if(adminLink)adminLink.hidden=!!rating||remote.user?.role!=='admin';let box=$('#account-controls');if(!box)return;if(rating){box.innerHTML='';return}box.innerHTML=remote.signedIn?'<span class="account-login">'+esc(remote.user?.login||'Мой аккаунт')+'</span><button class="account-button" onclick="logout()">Выйти</button>':'<button class="account-button" onclick="openAuth()">Войти / Регистрация</button>'}
function openAuth(mode='login'){
 const register=mode==='register';$('#modal').hidden=false;
 $('#modal').innerHTML=`<form id="auth-form" class="dialog"><div class="dialog-head"><h2>${register?'Создать аккаунт':'Вход в Профи'}</h2><button type="button" onclick="closeModal()">×</button></div><div class="tabs"><button type="button" class="${!register?'active':''}" onclick="openAuth('login')">Вход</button><button type="button" class="${register?'active':''}" onclick="openAuth('register')">Регистрация</button></div><p>Ваши сохраненные карты и ответы знакомых будут доступны после входа с другого устройства.</p><label>Логин<input name="login" autocomplete="username" required minlength="3" maxlength="80" placeholder="Email или придуманный логин" autocapitalize="none" spellcheck="false"></label><label style="margin-top:18px">Пароль<input name="password" type="password" autocomplete="${register?'new-password':'current-password'}" required minlength="8" maxlength="128" placeholder="Не менее 8 символов"></label><p id="auth-error" class="error-text" role="alert"></p><button class="primary wide" id="auth-submit">${register?'Зарегистрироваться':'Войти'}</button></form>`;
 $('#auth-form').onsubmit=async e=>{e.preventDefault();let form=new FormData(e.target),button=$('#auth-submit');button.disabled=true;$('#auth-error').textContent='';try{let result=await api('/api/auth/'+(register?'register':'login'),{method:'POST',body:JSON.stringify({login:form.get('login'),password:form.get('password')})});remote.signedIn=true;remote.user=result.user;remote.active=null;remote.summary=null;remote.collections=[];activateAccount(result.user);try{await loadOwned(false);if(state.fixed&&!remote.active)await ensureCollection()}catch(syncError){remote.error=syncError.message}closeModal();render();toast(register?'Аккаунт создан. Вы вошли.':'Вы вошли в аккаунт')}catch(err){let error=$('#auth-error');if(error)error.textContent=err.message;button.disabled=false}};
}
async function logout(){try{await api('/api/auth/logout',{method:'POST',body:'{}'});save();state=blankState();remote.signedIn=false;remote.user=null;remote.active=null;remote.summary=null;remote.collections=[];remote.error='';page='map';render();toast('Вы вышли из аккаунта')}catch(e){toast(e.message)}}
async function ensureCollection(){let data=state.pendingNew?state.fixed:ownData();if(!data)return;let c=await api('/api/collections',{method:'POST',body:JSON.stringify({catalogVersion:dataCatalogVersion(data),ownerName:state.profile.name?.trim()||remote.active?.ownerName||'',data})});remote.active=c;state.collectionId=c.id;state.pendingNew=false;save();await loadOwned(false);return c}

function persistGuest(){if(!rating)return;try{sessionStorage.setItem('profi-draft-'+rating,JSON.stringify({catalogVersion:CATALOG_VERSION,data:guest,changes:reviewChanges,view:mapView,firstName:invitation.firstName,lastName:invitation.lastName}))}catch{}}
function ownData(){return remote.active?.baseline||state.fixed}
function editOwnMap(){const d=ownData();if(d&&dataCatalogVersion(d)===CURRENT_CATALOG_VERSION){state.self=structuredClone(d);save()}go('map')}
async function initialize(){try{let session=await api('/api/session');remote.signedIn=session.signedIn;remote.user=session.user;if(remote.signedIn&&!rating&&!shared&&!shareError)activateAccount(session.user);if(rating){let info=await api('/api/collections/'+encodeURIComponent(rating));useCatalog(info.catalogVersion);guest=structuredClone(info.baseline);reviewChanges=freshReviewChanges();invitation.ownerName=info.ownerName;invitation.baseline=structuredClone(info.baseline);invitation.isOwner=info.isOwner;invitation.alreadySubmitted=info.alreadySubmitted;try{let draft=JSON.parse(sessionStorage.getItem('profi-draft-'+rating));if(draft?.data&&draft.firstName&&draft.lastName&&(draft.catalogVersion||dataCatalogVersion(draft.data))===CATALOG_VERSION&&validScoreData(draft.data,CATALOG_VERSION)){guest={...draft.data,areas:draft.data.scores.map(v=>v/TOTAL_WEIGHT)};invitation.firstName=draft.firstName;invitation.lastName=draft.lastName;if(draft.changes?.clusters?.length===33&&draft.changes?.qualities?.length===33&&draft.changes.qualities.every((q,i)=>Array.isArray(q)&&q.length===getCatalog(CATALOG_VERSION).clusters[i].qualities.length&&q.every(v=>typeof v==='boolean'))){reviewChanges=draft.changes}mapView=draft.view==='tail'?'tail':'voronoi'}}catch{}invitation.loading=false}else if(remote.signedIn&&!shared&&!shareError){await loadOwned(false)}}catch(e){if(rating){invitation.error=e.message;invitation.loading=false}else remote.error=e.message}remote.loading=false;render()}
async function loadOwned(redraw=true){const data=await api('/api/owner/collections');remote.collections=data.collections.filter(c=>!!getCatalog(c.catalogVersion));if(!state.pendingNew){let active=remote.collections.find(c=>c.id===state.collectionId)||remote.collections.find(c=>c.catalogVersion===CURRENT_CATALOG_VERSION);if(active){remote.active=active;state.collectionId=active.id;if(!state.fixed&&active.catalogVersion===CURRENT_CATALOG_VERSION){state.fixed=structuredClone(active.baseline);state.fixedAt=new Date(active.createdAt).toISOString();state.self=structuredClone(active.baseline)}save();await refreshSummary(false)}}if(redraw)render()}
// redraw: true from the button, 'auto' from the 20-second poll (repaints only when the answers changed).
async function refreshSummary(redraw=true){if(!remote.active||summaryBusy)return;summaryBusy=true;try{const before=JSON.stringify(remote.summary);remote.summary=await api('/api/collections/'+remote.active.id+'/summary');remote.error='';if(redraw){if((page==='external'||page==='professions')&&(redraw!=='auto'||before!==JSON.stringify(remote.summary)))render();$('#badge').textContent=remote.summary.count}}catch(e){remote.error=e.message;if(redraw)toast(e.message)}finally{summaryBusy=false}}
async function chooseCollection(id){if(!id){remote.active=null;remote.summary=null;state.collectionId=null;save();render();return}const c=remote.collections.find(c=>c.id===id);if(!c)return;remote.active=c;remote.summary=null;state.pendingNew=false;state.collectionId=c.id;save();await refreshSummary(false);render()}
function collectionPicker(){return remote.collections.length?'<label class="collection-picker">Сохраненные результаты<select onchange="chooseCollection(this.value)"><option value="" '+(!remote.active?'selected':'')+'>Текущий тест · 33 кластера / '+getCatalog().qualityCount+' качества</option>'+remote.collections.map(c=>`<option value="${c.id}" ${c.id===remote.active?.id?'selected':''}>${new Date(c.createdAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})} · ${c.catalogVersion===LEGACY_CATALOG_VERSION?'Демонстрационный справочник':'33 кластера / '+getCatalog().qualityCount+' качества'}</option>`).join('')+'</select></label>':''}
function previousTestNotice(){return state.previousTest?'<div class="notice catalog-notice">Тест обновлен: 33 кластера и '+getCatalog().qualityCount+' качества. Прежняя демонстрационная карта сохранена отдельно. <button class="text-button" onclick="showPreviousTest()">Посмотреть прежний результат ↗</button></div>':''}
function showPreviousTest(){const d=state.previousTest?.fixed||state.previousTest?.self;if(!d||!validScoreData(d,dataCatalogVersion(d))){toast('Предыдущая карта недоступна для просмотра');return}$('#modal').hidden=false;$('#modal').innerHTML=`<div class="dialog previous-test"><div class="dialog-head"><h2>Предыдущая демонстрационная карта</h2><button onclick="closeModal()" aria-label="Закрыть">×</button></div><p>Сохраненные оценки относятся к прежнему справочнику. Новый тест начинается с нейтральной карты.</p><div class="map-wrap"><svg id="previous-map" viewBox="0 0 700 620"></svg></div>${ranking(d,'previous')}<button class="primary wide" onclick="closeModal()">Вернуться к новому тесту</button></div>`;draw(d,'#previous-map',false)}
const current=()=>rating?guest:state.self;function save(){try{localStorage.setItem(state.accountId?'profi.account.'+state.accountId:'profi.v1',JSON.stringify(state))}catch{toast('Не удалось сохранить: хранилище браузера заполнено.')}}function toast(t){$('#toast').textContent=t;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',3000)}
const pct=v=>(v*100).toFixed(1)+'%';
function intro(tag,title,sub){return `<div class="eyebrow">${tag}</div><div class="intro"><div><h1>${title}</h1><p>${sub}</p></div><span class="pill">✳ 33 кластера · ${getCatalog(CATALOG_VERSION).qualityCount} качества</span></div>`}
function render(){
 stopPointerDrag();
 document.body.classList.toggle('sheet-open',false);
 renderAccount();
 if(shared||shareError){sharedPage();return}
 document.body.classList.toggle('rating-mode',!!rating);
 document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
 $('#badge').textContent=remote.summary?.count||0;
 $('#crumb').textContent=rating?'Вы оцениваете: '+reviewerName():'Личное пространство / '+({map:'Карта качеств',profile:'Мой профиль',results:'Мои результаты',external:'Взгляд со стороны',professions:'Профессии'}[page]||'Карта качеств');
 $('.save').textContent=rating?'Ответ будет отправлен владельцу':remote.signedIn?'● Ответы знакомых сохраняются онлайн':'● Черновик сохраняется в браузере';
 if(rating){if(guestDone||invitation.alreadySubmitted){$('#app').innerHTML='<div class="completed panel"><div class="eyebrow">ОЦЕНКА ЗАВЕРШЕНА</div><h1>Спасибо за ваш взгляд</h1><p>Ваш ответ сохранен и отправлен владельцу профиля. После двух участников ему откроется усредненная карта. Повторная оценка с этого устройства не учитывается.</p><a class="secondary button-link" href="/">Создать свою карту →</a></div>';return}if(!invitation.started){invitationWelcome();return}mapPage();return}
 if(page==='profile')profilePage();else if(page==='results')resultsPage();else if(page==='external')externalPage();else if(page==='professions')professionsPage();else mapPage();
}
function invitationWelcome(){
 if(invitation.loading){$('#app').innerHTML='<div class="panel empty"><h2>Загружаем карту владельца…</h2></div>';return}
 if(invitation.error){$('#app').innerHTML='<div class="panel empty"><h2>Не удалось открыть приглашение</h2><p>'+esc(invitation.error)+'</p><button class="secondary" onclick="location.reload()">Попробовать снова</button></div>';return}
 $('#app').innerHTML=reviewContext()+intro('ОЦЕНИТЕ ЗНАКОМОГО','Профиль: '+esc(reviewerName()),'Карта уже заполнена этим человеком. Вы оцениваете его качества со своей стороны.')+`<div class="results-grid"><section class="panel"><h2>Исходная карта владельца</h2><div class="map-wrap"><svg id="invite-preview" viewBox="0 0 700 620"></svg></div></section><form class="panel" id="identity-form"><div class="eyebrow">ПЕРЕД НАЧАЛОМ</div><h2>Как вас зовут?</h2><p>Владелец увидит ваше имя и фамилию в списке участников.</p><label>Имя<input name="firstName" autocomplete="given-name" required maxlength="60" value="${esc(invitation.firstName)}"></label><label style="margin-top:18px">Фамилия<input name="lastName" autocomplete="family-name" required maxlength="60" value="${esc(invitation.lastName)}"></label><div class="notice">Вы сможете менять оценки кнопками +/− и ползунком. Кнопка «Внутрь» открывает отдельные качества. Собственная карта владельца останется прежней.</div>${invitation.isOwner?'<div class="hint">Это ваш профиль. Вы можете проверить интерфейс, а отправить оценку смогут ваши знакомые.</div>':''}<button class="primary wide" style="margin-top:20px">Начать оценку →</button></form></div>`;
 draw(invitation.baseline||guest,'#invite-preview',false);
 $('#identity-form').onsubmit=e=>{e.preventDefault();let f=new FormData(e.target);invitation.firstName=f.get('firstName').trim();invitation.lastName=f.get('lastName').trim();if(!invitation.firstName||!invitation.lastName)return;invitation.started=true;persistGuest();mapPage();window.scrollTo(0,0)};
}
function reviewerTouched(i){return reviewChanges.clusters[i]||reviewChanges.qualities[i].some(Boolean)}
function reviewerName(){return invitation.ownerName||'Владелец профиля'}
function reviewContext(){return rating?`<div class="review-context" role="note"><div><span>ВЫ ОЦЕНИВАЕТЕ ЭТОГО ЧЕЛОВЕКА</span><strong>${esc(reviewerName())}</strong></div><div class="reviewer-caption">Оценщик: ${esc(invitation.firstName)} ${esc(invitation.lastName)}<small>Это взгляд на другого человека</small></div></div>`:''}
function stopPointerDrag(){let active=drag;drag=null;if(!active)return;if(active.frame!==null)cancelAnimationFrame(active.frame);try{if(active.element?.hasPointerCapture?.(active.pointerId))active.element.releasePointerCapture(active.pointerId)}catch{}if(active.moved){if(rating)persistGuest();else save()}}
function clearClusterSelection(){stopPointerDrag();selected=null;closeSynonyms();mapPage()}
function updateSelectionControls(){let button=$('#clear-selection'),status=$('#selection-status'),l=level(current()),noun=l.at===null?['Выбран один кластер','Кластер не выбран']:['Выбрано качество','Качество не выбрано'];if(button)button.disabled=!Number.isInteger(selected);if(status)status.textContent=Number.isInteger(selected)?noun[0]+': '+l.names[selected]:noun[1]}
function sortedTailIndices(values){return values.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v||a.i-b.i).map(x=>x.i)}
function tailRows(d){let values=level(d).values;if(tailData!==d||!tailOrder){tailData=d;tailOrder=sortedTailIndices(values)}return tailOrder.map(i=>({v:values[i],i}))}
function tailMeta(l,i){return pct(l.shares()[i])+(l.at===null?' карты · ':' кластера · ')+(rating?(l.touched(i)?'Изменено вами':'Исходный результат'):(l.edited[i]?'Редактировалось':'Без прямого редактирования'))}
// panel=false while a slider moves: rebuilding the panel would replace the slider under the finger.
function updateTailValues(panel=true){
 const d=current(),l=level(d),max=Math.max(...l.values);$('#tail-editor')?.querySelectorAll('[data-tail-cell]').forEach(row=>{const i=Number(row.dataset.tailCell);row.classList.toggle('tail-selected',i===selected);row.classList.toggle('review-edited',l.touched(i));row.querySelector('.tail-bar i').style.width=l.values[i]/max*100+'%';row.querySelector('.tail-stepper strong').textContent=fmt(l.values[i]);row.querySelector('.tail-meta>span').textContent=tailMeta(l,i)});
 const n=rating?names.filter((_,i)=>reviewerTouched(i)).length:d.edited.filter((e,i)=>e||d.qedited[i].some(Boolean)).length;const count=$('.map-foot b'),progress=$('.progress>div');if(count)count.textContent=n;if(progress)progress.style.width=n/33*100+'%';if(panel){clusterPanel();updateSelectionControls()}
}
function refreshTailRanking(){stopPointerDrag();tailData=current();tailOrder=sortedTailIndices(level(tailData).values);mapPage()}
function setMapView(view){stopPointerDrag();if(view==='tail'&&mapView!=='tail'){tailOrder=null;tailSheet=false}mapView=view==='tail'?'tail':'voronoi';if(rating)persistGuest();mapPage()}
// In the tail the sheet opens when a row is selected; the +/− in another row only change that row.
let tailSheet=false;
function selectCell(i){stopPointerDrag();pick(i);if(mapView==='tail'){tailSheet=true;updateTailValues()}else mapPage()}
function tailRowTap(e,i){if(!e.target.closest('button:not(.tail-name)'))selectCell(i)}
function enterCluster(i){stopPointerDrag();inside=i;selected=null;closeSynonyms();tailOrder=null;mapPage()}
function leaveCluster(){stopPointerDrag();selected=inside;inside=null;tailOrder=null;mapPage()}
function adjustCell(i,delta){stopPointerDrag();if(i!==selected)tailSheet=false;pick(i);adjust(delta)}
function editableTail(d){
 const l=level(d),max=Math.max(...l.values),what=l.at===null?'кластеры':'качества';
 return `<div class="tail-heading"><div class="tail-heading-line"><h3>${l.at===null?'Хвост качеств':'Хвост качеств кластера'}</h3><button id="refresh-tail-ranking" class="secondary" onclick="refreshTailRanking()">Обновить рейтинг ↓</button></div><p>Порядок строк закреплен на время правок. Кнопка «Обновить рейтинг» расположит ${what} по новым баллам.</p></div><div class="tail-editor" id="tail-editor">${tailRows(d).map(({v,i},rank)=>`<article class="tail-row ${l.touched(i)?'review-edited':''} ${i===selected?'tail-selected':''}" data-tail-cell="${i}" onclick="tailRowTap(event,${i})"><span class="tail-position">${rank+1}</span><div class="tail-main"><button class="tail-name">${esc(l.names[i])}</button><div class="tail-bar"><i style="width:${v/max*100}%"></i></div><div class="tail-meta"><span>${tailMeta(l,i)}</span>${l.at===null?`<button onclick="enterCluster(${i})">Внутрь ↗</button>`:''}</div></div><div class="tail-stepper"><button aria-label="Уменьшить: ${esc(l.names[i])}" onclick="adjustCell(${i},-1)">−</button><strong>${fmt(v)}</strong><button aria-label="Увеличить: ${esc(l.names[i])}" onclick="adjustCell(${i},1)">+</button></div></article>`).join('')}</div>`;
}
function mapPage(){
 stopPointerDrag();
 let d=current(),n=rating?names.filter((_,i)=>reviewerTouched(i)).length:d.edited.filter((e,i)=>e||d.qedited[i].some(Boolean)).length,scroll=$('#tail-editor')?.scrollTop||0;
 const heading=rating?'Ваш взгляд на профиль: '+esc(reviewerName()):'У каждого таланта — своя форма';
 $('#app').innerHTML=(rating?'':previousTestNotice())+reviewContext()+intro(rating?'ВЗГЛЯД СО СТОРОНЫ':'ВАШ ПРОФЕССИОНАЛЬНЫЙ ПОРТРЕТ',heading,rating?'Перед вами готовый результат другого человека. Корректируйте его так, как вы видите этого человека.':'Исследуйте свои сильные стороны. Соберите карту, которая отражает именно вас.')+`<div class="layout"><section class="panel map-panel"><div class="map-editor-header">${Number.isInteger(inside)?`<div class="map-crumbs"><button class="text-button" onclick="leaveCluster()">← Все кластеры</button><strong>${esc(names[inside])}</strong></div>`:'<strong>Профессиональные качества</strong>'}<div class="view-switch" role="group" aria-label="Вид карты"><button aria-pressed="${mapView==='voronoi'}" class="${mapView==='voronoi'?'active':''}" onclick="setMapView('voronoi')">◈ Вороной</button><button aria-pressed="${mapView==='tail'}" class="${mapView==='tail'?'active':''}" onclick="setMapView('tail')">▤ Хвост</button></div></div><div class="selection-tools"><span id="selection-status" role="status" aria-live="polite"></span><button id="clear-selection" class="secondary" onclick="clearClusterSelection()">Снять выделение</button></div>${mapView==='tail'?editableTail(d):'<div class="map-wrap"><svg id="diagram" viewBox="0 0 700 620" role="img" aria-label="'+(Number.isInteger(inside)?'Интерактивная диаграмма качеств кластера «'+esc(names[inside])+'»':'Интерактивная диаграмма 33 кластеров профессиональных качеств')+'"></svg></div>'}<div id="synonym-row"></div><div class="legend">${rating?'<span><i class="dot"></i>Исходный результат владельца</span><span><i class="dot changed"></i>Изменено вами</span>':'<span><i class="dot"></i>Без прямого редактирования</span><span><i class="dot on"></i>Оцененные области</span>'}<span>${mapView==='voronoi'?'<span class="drag-hint">↕ Тяните область вверх/вниз · </span>':''}${Number.isInteger(inside)?'Площадь — доля качества в кластере':'«Внутрь» — диаграмма качеств кластера'}</span></div><div class="map-foot"><span>${rating?'Кластеры с вашими изменениями':'Ваш прогресс'}</span><span><b>${n}</b> из 33 кластеров</span></div><div class="progress"><div style="width:${n/33*100}%;${rating?'background:#d28a3c':''}"></div></div></section><section><div class="panel" id="cluster"></div><div class="hint" style="margin-top:15px"><b>Два вида — один результат</b>Вороной показывает соотношение площадей, хвост — рейтинг и числовые оценки. Переключайтесь в любое время: значения и ваши правки сохраняются. Каждый кластер и каждое качество начинают с ${INITIAL_WEIGHT} и не опускаются ниже ${MIN_WEIGHT}. Кластеры делят ${fmt(TOTAL_WEIGHT)} баллов, качества — баллы своего кластера (по ${INITIAL_WEIGHT} на качество).</div></section></div><div class="bottom-bar"><p>${rating?'Измененные вами области и качества выделяются оранжевым.<br>Можно подтвердить исходный результат без изменений.':'33 кластера и '+getCatalog().qualityCount+' качества профессионального профиля.'}</p><div class="bottom-actions"><button class="secondary" onclick="restartMap()">↺ ${rating?'Начать заново':'Пройти заново'}</button><button class="primary" onclick="fix()">${rating?'Отправить оценку владельцу':'Зафиксировать результат'} &nbsp; →</button></div></div>`;
 if(mapView==='voronoi')draw(d);else if($('#tail-editor'))$('#tail-editor').scrollTop=scroll;
 clusterPanel();updateSelectionControls();
}

function clusterPanel(){
 let d=current(),l=level(d),i=selected,inQ=l.at!==null,c=inQ?l.at:i,count=Number.isInteger(c)?d.qualities[c].length:0;
 // On phones an opened cell's controls become a sheet at the bottom of the screen.
 const sheet=Number.isInteger(i)&&(mapView==='voronoi'||tailSheet);$('#cluster').classList.toggle('sheet',sheet);$('#cluster').style.maxHeight='';document.body.classList.toggle('sheet-open',sheet);
 const back=inQ?'<button class="secondary wide" onclick="leaveCluster()">← Все кластеры</button>':'';
 $('#synonym-row').innerHTML=inQ&&Number.isInteger(i)?synonymRow(d,c,i):'';hugDiagram();
 if(!Number.isInteger(i)){$('#cluster').innerHTML=inQ?`<div class="category">КЛАСТЕР ${String(c+1).padStart(2,'0')} / 33 · ВНУТРИ</div><div class="cluster-title">${esc(l.cluster)}</div><p class="description">Кластер занимает ${pct(d.areas[c])} карты. Его ${count} качеств делят между собой ${fmt(l.total)} баллов — по ${INITIAL_WEIGHT} на старте. Нажмите на качество или строку, чтобы изменить его вес: оно заберет вес у соседей по кластеру, а доля кластера на карте не изменится.</p>${back}`:'<div class="category">ВЫБЕРИТЕ ОДИН КЛАСТЕР</div><h2 style="margin-top:16px">Нажмите на область или строку</h2><p class="description">Рамка показывает выбранный кластер. Цвет сохраняет отметки ваших прошлых правок.</p><div class="hint">Кнопка «Снять выделение» завершает выбор и сохраняет внесенные оценки. «Внутрь» открывает диаграмму качеств кластера.</div>';return}
 let [lo,hi]=l.bounds(i),v=l.values[i],noun=inQ?'качества':'кластера',status=rating?(l.touched(i)?'● Изменено вами':'○ Исходный результат владельца'):(l.edited[i]?(inQ?'● Вы оценили это качество':'● Вы оценили этот кластер'):'○ Пока не оценено');
 $('#cluster').innerHTML=`<button class="sheet-close" aria-label="Закрыть панель" onclick="clearClusterSelection()">×</button><div class="category">${inQ?`КАЧЕСТВО ${String(i+1).padStart(2,'0')} / ${count} · ${esc(l.cluster)}`:`КЛАСТЕР ${String(i+1).padStart(2,'0')} / 33`}</div><div class="cluster-title">${esc(l.names[i])}</div><p class="description">${inQ?`Качества кластера делят ${fmt(l.total)} баллов: прибавка забирает вес у остальных качеств этого кластера, доля кластера на карте не меняется.`:`Вес кластера — его доля карты. Внутри ${count} качеств делят эту долю между собой.`}</p><span class="status">${status}</span><label>${rating?'Ваш взгляд на качества: '+esc(reviewerName()):'Насколько это про вас?'}</label><div class="weight-tools"><div class="stepper"><button aria-label="Уменьшить вес" onclick="adjust(-1)">−</button><label><span>Вес ${noun}</span><input id="cluster-weight-input" type="number" inputmode="decimal" min="${lo}" max="${Number(hi.toFixed(1))}" step="any" value="${Number(v.toFixed(1))}" aria-label="Вес ${noun} от ${fmt(lo)} до ${fmt(hi)}" onchange="typeWeight(this.value)"></label><button aria-label="Увеличить вес" onclick="adjust(1)">+</button></div><input id="cluster-weight-range" type="range" min="0" max="${SLIDER_STEPS}" step="1" style="--fill:${toSlider(v,[lo,hi])/SLIDER_STEPS}" value="${toSlider(v,[lo,hi])}" aria-label="Вес ${noun}, ползунок" aria-valuetext="${fmt(v)}" oninput="slideWeight(this.value)" onchange="commitWeight()"><div class="scale"><span>${fmt(lo)} · слабо</span><span>сильно · ${fmt(hi)}</span></div></div>${inQ?back:`<button class="secondary wide detail-btn" onclick="enterCluster(${i})">Внутрь: ${count} качеств &nbsp; ↗</button>`}<div class="divider"></div><div class="panel-top"><span>${inQ?'Доля в кластере':'Доля на карте'}</span><strong id="cluster-share">${pct(v/l.total)}</strong></div><p style="font-size:10px;margin-bottom:0">${inQ?'Доля на всей карте — '+pct(l.mapShare(i))+': доля кластера × доля в кластере.':'Внутри — '+count+' качеств, у каждого своя доля кластера.'}</p>${inQ?synonymRow(d,c,i):''}`;
 settleSheet(l.at+':'+i);
}
function adjust(delta,value){stopPointerDrag();if(!Number.isInteger(selected))return;let d=current(),l=level(d);l.set(selected,value??l.values[selected]+delta);if(rating)persistGuest();else save();if(mapView==='tail')updateTailValues();else mapPage()}
// While the slider moves, only the map and readouts update; the panel is rebuilt on release.
function slideWeight(position){if(!Number.isInteger(selected))return;let d=current(),l=level(d),i=selected;l.set(i,fromSlider(Number(position),l.bounds(i)));let input=$('#cluster-weight-input'),share=$('#cluster-share');if(input)input.value=Number(l.values[i].toFixed(1));if(share)share.textContent=pct(l.values[i]/l.total);$('#cluster-weight-range')?.setAttribute('aria-valuetext',fmt(l.values[i]));$('#cluster-weight-range')?.style.setProperty?.('--fill',Number(position)/SLIDER_STEPS);if(mapView==='tail')updateTailValues(false);else repaintDiagram?.()}
function commitWeight(){if(rating)persistGuest();else save();mapPage();$('#cluster-weight-range')?.focus({preventScroll:true})}
function typeWeight(value){let v=Number(String(value).replace(',','.'));if(Number.isFinite(v))adjust(0,v);else clusterPanel()}
// Capacity-constrained power diagram: clipping each cell by all pairwise power bisectors.
// Seeds sit on a golden-angle spiral; with 33 cells this is the cluster map's original layout.
const seedCache={},seedsFor=n=>seedCache[n]||=Array.from({length:n},(_,i)=>{let a=i*2.39996323,r=45+235*Math.sqrt(i/Math.max(1,n-1));return [350+Math.cos(a)*r,310+Math.sin(a)*r]});
const outer=[[60,20],[640,20],[640,600],[60,600]];
function clip(poly,a,b,c){let out=[];for(let k=0;k<poly.length;k++){let p=poly[k],q=poly[(k+1)%poly.length],f=a*p[0]+b*p[1]-c,g=a*q[0]+b*q[1]-c;if(f<=0)out.push(p);if((f<0&&g>0)||(f>0&&g<0)){let t=f/(f-g);out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])])}}return out}
function area(p){let s=0;for(let i=0;i<p.length;i++){let q=p[(i+1)%p.length];s+=p[i][0]*q[1]-q[0]*p[i][1]}return Math.abs(s/2)}
function cells(w,seeds){return seeds.map((p,i)=>{let poly=outer;for(let j=0;j<seeds.length&&poly.length;j++){if(i===j)continue;let q=seeds[j];poly=clip(poly,2*(q[0]-p[0]),2*(q[1]-p[1]),q[0]**2+q[1]**2-p[0]**2-p[1]**2+w[i]-w[j])}return poly})}
function geometry(areas){let n=areas.length,seeds=seedsFor(n),w=Array(n).fill(0),total=area(outer),p;for(let k=0;k<1800;k++){p=cells(w,seeds);let error=0;for(let i=0;i<n;i++){let diff=total*areas[i]-area(p[i]);error=Math.max(error,Math.abs(diff)/total);w[i]+=diff*.12}if(error<.00015)break}return cells(w,seeds)}
function centroid(p){let a=0,x=0,y=0;for(let i=0;i<p.length;i++){let q=p[(i+1)%p.length],c=p[i][0]*q[1]-q[0]*p[i][1];a+=c;x+=(p[i][0]+q[0])*c;y+=(p[i][1]+q[1])*c}return [x/(3*a),y/(3*a)]}
// The map edits one level at a time: the 33 clusters, or the qualities of the cluster at index `at`.
function level(d,at=inside){
 const catalog=getCatalog(dataCatalogVersion(d))||getCatalog(),mine=rating&&d===guest;
 if(!Number.isInteger(at))return {at:null,names:catalog.clusters.map(c=>c.name),values:d.scores,shares:()=>d.areas,edited:d.edited,touched:i=>mine&&reviewerTouched(i),total:budgetOf(d),bounds:()=>clusterBounds(d),set:(i,v)=>setClusterScore(d,i,v)};
 const q=d.qualities[at],total=qualityBudget(d,at);
 return {at,cluster:catalog.clusters[at].name,names:catalog.clusters[at].qualities.map(x=>x.name),values:q,shares:()=>q.map(v=>v/total),mapShare:j=>d.areas[at]*q[j]/total,edited:d.qedited[at],touched:j=>mine&&reviewChanges.qualities[at][j],total,bounds:()=>qualityBounds(d,at),set:(j,v)=>setQualityScore(d,at,j,v)};
}
function setClusterScore(d,i,v){
 const [lo,hi]=clusterBounds(d);v=Math.max(lo,Math.min(hi,v));if(rating&&d===guest&&Math.abs(v-d.scores[i])>1e-9)reviewChanges.clusters[i]=true;
 let indices=d.scores.map((_,j)=>j).filter(j=>j!==i),other=distribute(indices.map(j=>d.scores[j]),budgetOf(d)-v,lo,hi);
 d.scores[i]=v;indices.forEach((j,k)=>d.scores[j]=other[k]);d.areas=d.scores.map(v=>v/budgetOf(d));d.edited[i]=true;
}
// A quality takes weight from the other qualities of its cluster; the cluster's share of the map stays the same.
function setQualityScore(d,i,j,v){
 const [lo,hi]=qualityBounds(d,i),old=d.qualities[i][j];v=Math.max(lo,Math.min(hi,v));
 if(rating&&d===guest&&Math.abs(v-old)>1e-9)reviewChanges.qualities[i][j]=true;
 const placed=placeQuality(d,i,j,v);d.qedited[i][j]=true;
 // Only hand edits of the opened quality make up the change its synonyms can copy.
 if(d===current()&&synonyms.cell===i+':'+j)synonyms.change+=placed-old;
}
const catalogOf=d=>getCatalog(dataCatalogVersion(d))||getCatalog();
function pick(i){selected=i;if(Number.isInteger(inside)&&Number.isInteger(i))openSynonyms(inside,i)}
// One tap or click selects a cell; a second one soon after on the same cluster enters it. Own timing rather than dblclick:
// the map is redrawn between the taps, and phones do not all report a double tap.
const DOUBLE_TAP_MS=350;let lastCellTap={i:null,at:0};
function cellClick(i,enter){const now=Date.now(),twice=enter&&lastCellTap.i===i&&now-lastCellTap.at<DOUBLE_TAP_MS;lastCellTap={i,at:twice?0:now};pick(i);if(twice)enterCluster(i);else mapPage()}
// Synonyms of the opened quality: pressing one gives it the same change (the difference, not the value) that the person made
// to the opened quality since opening it. A synonym takes each part of that change once; nothing moves without a press.
let synonyms={cell:null,change:0,applied:{}};
function openSynonyms(c,q){const cell=c+':'+q;if(synonyms.cell!==cell)synonyms={cell,change:0,applied:{}}}
function closeSynonyms(){synonyms={cell:null,change:0,applied:{}}}
const signed=v=>(v>0?'+':'−')+fmt(Math.abs(v));
function synonymRow(d,c,q){
 const catalog=catalogOf(d),list=synonymsOf(catalog,c,q);if(!list.length)return '';
 const name=catalog.clusters[c].qualities[q].name,change=synonyms.cell===c+':'+q?synonyms.change:0,moved=Math.abs(change)>=.05;
 const item=([a,b])=>{const left=change-(synonyms.applied[a+':'+b]||0),ready=moved&&Math.abs(left)>=.05,done=moved&&!ready,syn=catalog.clusters[a].qualities[b].name,weight=fmt(d.qualities[a][b]),from=a!==c?esc(catalog.clusters[a].name)+', ':'';
  return `<button class="syn${done?' done':''}" ${ready?'':'disabled'} onclick="applySynonym(${a},${b})" title="${ready?'Нажмите, чтобы изменить на '+signed(left)+', как «'+esc(name)+'»':done?'Уже изменено так же, как «'+esc(name)+'»':'Измените «'+esc(name)+'», и одним нажатием можно будет изменить это качество так же'}" aria-label="${esc(syn)}, ${weight}${ready?', изменить на '+signed(left):''}"><span class="syn-name">${esc(syn)}</span> (${from}<b>${weight}</b>)${ready?` <b>(${signed(left)})</b>`:done?' (✓)':''}</button>`};
 return `<div class="synonyms" role="group" aria-label="Синонимы качества «${esc(name)}»"><span class="synonym-chain">${list.map(item).join('<span class="sep" aria-hidden="true">•</span>')}</span></div>`;
}
// The diagram is fitted into a fixed-height box with empty bands above and below it; the chain moves up to its lower edge
// and takes the size of the quality names on it.
function hugDiagram(){const row=$('#synonym-row'),svg=$('#diagram');if(!row?.style)return;row.style.marginTop='';row.style.maxWidth='';const r=svg?.getBoundingClientRect?.();if(!r?.width)return;row.style.marginTop=-Math.max(0,(r.height-Math.min(r.height,r.width*620/700))/2)+'px';row.style.maxWidth=Math.min(r.width,r.height*700/620)+'px';
 // A touch larger (×1.15) than the names on the diagram's neutral cells, and scaling with them.
 row.style.setProperty?.('--chain-size',(11.5*Math.min(r.width/700,r.height/620)).toFixed(2)+'px')}
globalThis.addEventListener?.('resize',()=>hugDiagram());
function applySynonym(c,q){
 const d=current(),key=c+':'+q,left=synonyms.change-(synonyms.applied[key]||0);if(!synonyms.cell||Math.abs(left)<.05)return;
 setQualityScore(d,c,q,d.qualities[c][q]+left);synonyms.applied[key]=synonyms.change;
 if(rating)persistGuest();else save();if(mapView==='tail')updateTailValues();else mapPage();
}
// The panel is rebuilt after every change, so the sheet's scroll position is carried over while the same cell stays open.
let sheetCell=null,sheetTop=0;
function settleSheet(cell){const el=$('#cluster');if(sheetCell!==cell){sheetCell=cell;sheetTop=0}el.scrollTop=sheetTop;el.onscroll=()=>{sheetTop=el.scrollTop}}
function draw(d,selector='#diagram',interactive=true,at=interactive?inside:null){
 const l=level(d,at),svg=$(selector);if(!svg)return;
 const fills=['#94b59a','#a2bda0','#82aa93','#b0c7a4'],neutral=['#e2e8dc','#dce5d5','#e9ecdf','#d6e1d0','#e4e9dc'];
 const fill=i=>l.touched(i)?'#e7ac67':l.edited[i]?fills[i%4]:neutral[i%5],enter=l.at===null,perPx=l.total/l.values.length/DRAG_CELL_PX;
 const wrap=name=>{const lines=[];let line='';for(const word of name.split(' ')){if((line+' '+word).trim().length>18&&line){lines.push(line);line=word}else line=(line+' '+word).trim()}if(line)lines.push(line);const result=lines.slice(0,3).map(v=>v.length>21?v.slice(0,20)+'…':v);if(lines.length>3)result[2]=result[2].slice(0,18)+'…';return result};
 const label=(p,i)=>{const [x,y]=centroid(p),small=area(p)<5000,words=small?[]:wrap(l.names[i]),start=y-(words.length*12+(enter?28:14))/2;return {x,y,words,small,start,enterY:start+Math.max(0,words.length-1)*12+(small?24:40)}};
 const text=(l,p,i)=>(p.small?'':p.words.map((w,k)=>`<tspan x="${p.x}" dy="${k?12:0}">${esc(w)}</tspan>`).join(''))+`<tspan class="cell-score" x="${p.x}" dy="${p.small?0:19}">${fmt(l.values[i])}${l.edited[i]?'':' · ○'}</tspan>`;
 function paint(){polygons=geometry(l.shares());svg.querySelectorAll('g[data-cell]').forEach(g=>{let i=+g.dataset.cell,p=polygons[i];if(!p.length)return;let lb=label(p,i),path=g.querySelector('path'),t=g.querySelector('.cell-label'),entry=g.querySelector('.cell-enter');path.setAttribute('d','M'+p.map(v=>v.join(',')).join('L')+'Z');path.setAttribute('fill',fill(i));path.classList.toggle('selected',i===selected);t.setAttribute('x',lb.x);t.setAttribute('y',lb.start);t.innerHTML=text(l,lb,i);if(entry){entry.setAttribute('x',lb.x);entry.setAttribute('y',lb.enterY)}})}
 polygons=geometry(l.shares());
 const hint=interactive?'Потяните область вверх или вниз для изменения.':enter?'Нажмите «Внутрь» для просмотра качеств.':'';
 svg.innerHTML=polygons.map((p,i)=>{if(!p.length)return '';let lb=label(p,i);return `<g data-cell="${i}"><title>${esc(l.names[i])} · ${fmt(l.values[i])} из ${fmt(l.total)}. ${hint}</title><path data-i="${i}" tabindex="${interactive?0:-1}" role="${interactive?'button':'img'}" aria-label="${esc(l.names[i])}, ${fmt(l.values[i])} из ${fmt(l.total)}" d="M${p.map(v=>v.join(',')).join('L')}Z" fill="${fill(i)}" class="${interactive&&i===selected?'selected':''}"></path><text class="cell-label ${interactive&&i===selected?'selected-text':''}" x="${lb.x}" y="${lb.start}">${text(l,lb,i)}</text>${enter?`<text class="cell-enter" data-detail="${i}" x="${lb.x}" y="${lb.enterY}" role="button" tabindex="0" aria-label="Открыть качества: ${esc(l.names[i])}">Внутрь ↗</text>`:''}</g>`}).join('');
 svg.querySelectorAll('[data-detail]').forEach(el=>{const open=()=>{let i=+el.dataset.detail;if(interactive)enterCluster(i);else details(i,d)};el.onclick=e=>{e.stopPropagation();open()};el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}}});
 if(!interactive)return;
 repaintDiagram=paint;
 svg.querySelectorAll('path').forEach(el=>{
  el.onclick=()=>cellClick(+el.dataset.i,enter);
  el.onkeydown=e=>{if(e.key==='Enter'){pick(+el.dataset.i);mapPage()}else if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();pick(+el.dataset.i);adjust(e.key==='ArrowUp'?1:-1)}};
  el.onpointerdown=e=>{if(e.pointerType!=='mouse'||e.button!==0||e.isPrimary===false||drag)return;pick(+el.dataset.i);drag={pointerId:e.pointerId,index:selected,element:el,y:e.clientY,value:l.values[selected],moved:false,latest:e.clientY,frame:null};el.setPointerCapture(e.pointerId);svg.querySelectorAll('path').forEach(p=>p.classList.toggle('selected',+p.dataset.i===selected));clusterPanel();updateSelectionControls()};
  el.onpointermove=e=>{if(!drag||drag.element!==el||drag.pointerId!==e.pointerId)return;if(e.pointerType!=='touch'&&e.buttons===0){stopPointerDrag();mapPage();return}drag.latest=e.clientY;if(Math.abs(e.clientY-drag.y)<6&&!drag.moved)return;drag.moved=true;let active=drag;if(active.frame)return;active.frame=requestAnimationFrame(()=>{active.frame=null;if(drag!==active)return;l.set(active.index,Math.round(active.value+(active.y-active.latest)*perPx));paint();clusterPanel()})};
  const finish=e=>{if(!drag||drag.element!==el||drag.pointerId!==e.pointerId)return;let active=drag;if(active.frame)cancelAnimationFrame(active.frame);drag=null;if(active.moved){l.set(active.index,Math.round(active.value+(active.y-active.latest)*perPx));if(rating)persistGuest();else save()}mapPage()};
  el.onpointerup=finish;el.onpointercancel=finish;el.onlostpointercapture=()=>{if(drag?.element===el){stopPointerDrag();mapPage()}};
 });
}

function details(i,d){
 stopPointerDrag();
 const l=level(d,i),qualities=(getCatalog(dataCatalogVersion(d))||getCatalog()).clusters[i].qualities,order=l.values.map((_,j)=>j).sort((a,b)=>l.values[b]-l.values[a]);
 $('#modal').hidden=false;
 $('#modal').innerHTML=`<div class="dialog"><div class="dialog-head"><div class="category">КАРТА КАЧЕСТВ / ВНУТРИ КЛАСТЕРА</div><button onclick="closeModal()" aria-label="Закрыть">×</button></div><h1 style="font-size:28px">${esc(l.cluster)}</h1><p style="font-size:12px">Кластер занимает ${pct(d.areas[i])} карты. Площадь показывает долю качества в кластере.</p><div class="map-wrap"><svg id="detail-map" viewBox="0 0 700 620" role="img" aria-label="Диаграмма качеств кластера «${esc(l.cluster)}»"></svg></div>${order.map(j=>`<div class="quality"><h3>${esc(l.names[j])}</h3>${qualities[j].definition?`<p>${esc(qualities[j].definition)}</p>`:''}<b>${fmt(l.values[j])} · ${pct(l.values[j]/l.total)} кластера · ${pct(l.mapShare(j))} карты</b><small>${l.edited[j]?'Редактировалось':'Без прямого редактирования'}</small></div>`).join('')}<button class="primary wide" onclick="closeModal()">Вернуться к результатам</button></div>`;
 draw(d,'#detail-map',false,i);
}

function closeModal(){$('#modal').hidden=true;if(rating&&invitation.started&&!guestDone)mapPage()}

function restartMap(){stopPointerDrag();$('#modal').hidden=false;$('#modal').innerHTML=`<div class="dialog"><div class="dialog-head"><h2>${rating?'Начать оценку заново?':'Пройти заново?'}</h2><button onclick="closeModal()" aria-label="Закрыть">×</button></div><p>${rating?'Ваши правки сбросятся, карта вернется к исходному результату владельца.':'Все кластеры и качества вернутся к '+INITIAL_WEIGHT+'. Зафиксированный результат и ответы знакомых сохранятся.'}</p><button class="primary wide" onclick="confirmRestart()">${rating?'Сбросить мои правки':'Начать заново'}</button></div>`}
function confirmRestart(){if(rating){guest=structuredClone(invitation.baseline);reviewChanges=freshReviewChanges();persistGuest()}else{state.self=fresh();save()}selected=null;inside=null;tailOrder=null;$('#modal').hidden=true;mapPage();toast(rating?'Правки сброшены':'Карта начата заново')}
async function fix(){
 let d=current();if(rating){$('#modal').hidden=false;$('#modal').innerHTML=`<div class="dialog"><div class="dialog-head"><h2>Отправить вашу оценку?</h2><button onclick="closeModal()">×</button></div><p>Вы оценили: <b>${esc(reviewerName())}</b></p><p>Оценщик: <b>${esc(invitation.firstName)} ${esc(invitation.lastName)}</b></p><p>Сохраним вашу итоговую карту, включая ответы, которые вы оставили без изменений. Самооценка владельца останется прежней.</p><button class="primary wide" id="submit-review" onclick="submitReview()">Отправить результат</button></div>`;return}
 if(!d.edited.some(Boolean)&&!d.qedited.flat().some(Boolean)){toast('Сначала оцените хотя бы одно качество');return}
 state.fixed=structuredClone(d);state.fixedAt=new Date().toISOString();state.pendingNew=true;state.collectionId=null;remote.active=null;remote.summary=null;save();page='results';render();if(remote.signedIn){try{await ensureCollection();render();toast('Результат сохранен в аккаунте')}catch(e){toast('Карта сохранена на устройстве. '+e.message)}}else toast('Результат зафиксирован');
}
async function submitReview(){let b=$('#submit-review');if(b.disabled)return;b.disabled=true;b.textContent='Сохраняем…';try{await api('/api/collections/'+rating+'/reviews',{method:'POST',body:JSON.stringify({catalogVersion:CATALOG_VERSION,firstName:invitation.firstName,lastName:invitation.lastName,data:guest})});guestDone=true;try{sessionStorage.removeItem('profi-draft-'+rating)}catch{}closeModal();render()}catch(e){b.disabled=false;b.textContent='Отправить результат';toast(e.message)}}
function ranking(d,source='self'){const names=(getCatalog(dataCatalogVersion(d))||getCatalog()).clusters.map(c=>c.name);return d.areas.map((a,i)=>({a,i})).sort((a,b)=>b.a-a.a).map(({a,i},k)=>`<div class="rank"><span style="color:#9ca695">${String(k+1).padStart(2,'0')}</span><div><button onclick="showResultDetail(${i},'${source}')">${esc(names[i])} ↗</button><div class="bar"><i style="width:${a/Math.max(...d.areas)*100}%"></i></div><small>${d.edited[i]?'Оценено':'Не редактировалось напрямую'}</small></div><strong>${(a*100).toFixed(1)}%<small>${fmt(d.scores[i])}</small></strong></div>`).join('')}
function resultsPage(){
 $('#app').innerHTML=intro('МОИ РЕЗУЛЬТАТЫ','Ваш профессиональный профиль','Ваша зафиксированная самооценка. Как вас видят знакомые — в разделе «Взгляд со стороны».')+selfMarkup();
 const d=ownData();if(d)draw(d,'#results-self',false);
}
function showResultDetail(i,source='self'){let d=shared||(source==='previous'?(state.previousTest?.fixed||state.previousTest?.self):source==='external'?remote.summary?.aggregate:ownData());if(d)details(i,d)}
const legacyNotice=d=>dataCatalogVersion(d)===LEGACY_CATALOG_VERSION?'<div class="notice">Это результат по предыдущему демонстрационному справочнику. <button class="text-button" onclick="go(\'map\')">Открыть новый тест</button></div>':'';
const noMapMarkup=()=>previousTestNotice()+'<div class="panel empty"><h2>Сначала создайте свою карту</h2><p>Зафиксируйте результат, чтобы отправить его знакомым.</p><button class="primary" onclick="go(\'map\')">Перейти к карте →</button></div>';
function selfMarkup(){
 const d=ownData();if(!d)return collectionPicker()+noMapMarkup();
 return collectionPicker()+legacyNotice(d)+`<section class="comparison-section"><div class="section-head"><div><div class="eyebrow">МОЙ ВЗГЛЯД</div><h2>Моя диаграмма</h2></div><button class="primary" onclick="share()">Поделиться для оценки ↗</button></div><div class="results-grid"><div class="panel"><div class="panel-top"><strong>Ваша зафиксированная самооценка</strong><span>Сумма весов ${TOTAL_WEIGHT}</span></div><div class="map-wrap"><svg id="results-self" viewBox="0 0 700 620"></svg></div><button class="secondary wide" onclick="editOwnMap()">${dataCatalogVersion(d)===LEGACY_CATALOG_VERSION?'Пройти актуальный тест':'Редактировать мою карту'}</button></div><div class="panel rating-scroll"><h2>Мой рейтинг качеств</h2>${ranking(d,'self')}</div></div></section>`;
}
function editShareOwnerName(){
 $('#modal').hidden=false;
 $('#modal').innerHTML=`<form class="dialog" id="owner-name-form"><div class="dialog-head"><h2>Кого будут оценивать?</h2><button type="button" onclick="closeModal()">×</button></div><p>Укажите свое имя и фамилию. Оценщик будет видеть их на всем протяжении работы с вашей картой.</p><label>Имя владельца профиля<input name="ownerName" required minlength="2" maxlength="120" autocomplete="name" value="${esc(state.profile.name||remote.active?.ownerName||'')}"></label><p style="font-size:11px">В приглашение передается только это имя и карта качеств. Контакты и резюме остаются закрытыми.</p><button class="primary wide" style="margin-top:15px">Сохранить имя и создать ссылку →</button></form>`;
 $('#owner-name-form').onsubmit=e=>{e.preventDefault();let f=new FormData(e.target),name=f.get('ownerName').trim();if(!name)return;state.profile.name=name;save();closeModal();share()};
}

async function share(){
 if(!state.fixed&&!remote.active){toast('Сначала зафиксируйте самооценку');return}
 if(shareBusy)return;
 if(remote.loading){toast('Проверяем подключение. Повторите через несколько секунд.');return}
 if(!remote.signedIn){$('#modal').hidden=false;$('#modal').innerHTML='<div class="dialog"><div class="dialog-head"><h2>Соберите взгляды знакомых</h2><button onclick="closeModal()">×</button></div><p>Войдите по логину и паролю, чтобы сохранить приглашение и получать ответы на вашу карту с других устройств.</p>'+signInLink()+'</div>';return}
 if(!(state.profile.name?.trim()||remote.active?.ownerName)){editShareOwnerName();return}
 shareBusy=true;
 try{
  let c=await ensureCollection();
  let url=location.origin+'/#invite='+c.id;
  $('#modal').hidden=false;
  $('#modal').innerHTML=`<div class="dialog"><div class="dialog-head"><h2>Пригласите оценить ваш профиль</h2><button onclick="closeModal()">×</button></div><p>Оценят профиль: <b>${esc(c.ownerName)}</b> <button class="text-button" onclick="editShareOwnerName()">Изменить имя</button></p><p>Знакомый укажет имя и фамилию, откроет вашу готовую карту и скорректирует ячейки и вложенные качества.</p><label>Ссылка для оценки<input id="share-url" readonly value="${esc(url)}"></label><div class="notice">Ответы сохраняются онлайн. После двух участников под вашей диаграммой появится усредненная карта знакомых. Анкета, контакты и PDF по ссылке недоступны.</div><button class="secondary" onclick="copyLink()">Скопировать ссылку</button> <a class="primary button-link" target="_blank" rel="noopener" href="${esc(url)}">Открыть приглашение ↗</a></div>`;
  if(page==='results'||page==='external')render();
 }catch(e){toast(e.message)}finally{shareBusy=false}
}

function sharedPage(){document.body.classList.add('rating-mode');$('#crumb').textContent='Общий доступ / Профессиональный профиль';$('.save').textContent='Снимок результата · только просмотр';if(!shared){$('#app').innerHTML='<div class="panel empty"><h2>Ссылка повреждена</h2><p>Попросите владельца повторно скопировать полную ссылку.</p></div>';return}$('#app').innerHTML=intro('РЕЗУЛЬТАТ, КОТОРЫМ С ВАМИ ПОДЕЛИЛИСЬ','Профессиональный профиль','Сохраненная карта владельца. Откройте любой кластер, чтобы увидеть вложенные качества.')+`<div class="results-grid"><section class="panel"><h2>Карта качеств</h2><div class="map-wrap"><svg id="shared-map" viewBox="0 0 700 620"></svg></div><div class="notice">Сумма весов — ${TOTAL_WEIGHT} · цифры пропорциональны площади.<br>○ — кластер не редактировался напрямую.<br>Это предыдущий формат ссылки для просмотра. Чтобы отправить оценку владельцу, попросите у него новую ссылку «Поделиться для оценки».</div></section><section class="panel"><h2>Рейтинг качеств</h2>${ranking(shared)}</section></div>`;draw(shared,'#shared-map',false)}
async function copyLink(){try{await navigator.clipboard.writeText($('#share-url').value);toast('Ссылка скопирована')}catch{$('#share-url').select();toast('Выделенная ссылка готова для копирования')}}
// «Взгляд со стороны» opens straight into the comparison: both Voronoi maps side by side, then a population-pyramid
// of cluster weights. Rows keep the order of the owner's fixed self-assessment (largest at the bottom); friends'
// averages fill the same rows. Before two answers the friends' side shows the collection status instead.
function externalPage(){
 const own=ownData(),summary=remote.summary,n=summary?.count||0,aggregate=summary?.aggregate;
 const toolbar=`<div class="compare-bar">${remote.active?'<button class="secondary" onclick="refreshSummary()">↻ Обновить ответы</button>':''}${collectionPicker()}</div>${remote.error?'<p class="error-text">'+esc(remote.error)+'</p>':''}`;
 const head=intro('ВЗГЛЯД СО СТОРОНЫ','Я и взгляд знакомых','Ваша самооценка рядом со средним оценок знакомых.');
 if(!own){$('#app').innerHTML=head+toolbar+noMapMarkup();return}
 const people=summary?.reviewers?.length?'<div class="people">'+summary.reviewers.map(r=>'<span class="person">'+esc(r.firstName)+' '+esc(r.lastName)+'</span>').join('')+'</div>':'';
 const waiting=`<div class="external-header"><div><h3>${n} ${n===1?'ответ получен':'ответов получено'}</h3><p style="font-size:12px">${n===1?'Первый ответ сохранен. Его значения скрыты до второго участника.':'Усредненная карта откроется после двух участников.'}</p></div><span class="pill">${Math.min(n,2)} / 2 для открытия</span></div>${people}${!remote.signedIn?'<div class="notice">Войдите по логину и паролю, чтобы создать приглашение и получать ответы знакомых со всех устройств.</div>'+signInLink():!remote.active?'<div class="notice">Отправьте этот результат знакомым, чтобы получить их взгляд.</div><button class="primary" onclick="share()">Поделиться для оценки ↗</button>':''}`;
 const friends=aggregate?`<div class="panel-top"><strong><span class="swatch friends"></span>Взгляд знакомых</strong><span>среднее ${n} ${n%10===1&&n%100!==11?'участника':'участников'}</span></div><div class="map-wrap"><svg id="compare-external" viewBox="0 0 700 620"></svg></div>${people}`:`<div class="panel-top"><strong><span class="swatch friends"></span>Взгляд знакомых</strong></div>${waiting}`;
 $('#app').innerHTML=head+toolbar+legacyNotice(own)+`<div class="results-grid compare-maps"><div class="panel"><div class="panel-top"><strong><span class="swatch self"></span>Моя самооценка</strong><span>${fmt(TOTAL_WEIGHT)} баллов</span></div><div class="map-wrap"><svg id="compare-self" viewBox="0 0 700 620"></svg></div></div><div class="panel">${friends}</div></div>`+(aggregate?pyramidMarkup(own,aggregate,n):'');
 draw(own,'#compare-self',false);if(aggregate){draw(aggregate,'#compare-external',false);bindPyramid()}
}
// «Профессии»: recommendations by the self-assessment and by the friends' average (matching in profession-match.js).
const prof={refs:null,loading:false,error:'',shown:{self:10,friends:10},votes:new Map(),card:null,voting:false};
async function loadVotes(){try{const {votes}=await api('/api/professions/feedback');prof.votes=new Map(votes.map(v=>[voteKey(v.professionId,v.source),v.vote]))}catch{}}
async function loadProfessions(){if(prof.loading||prof.refs)return;prof.loading=true;loadVotes();try{prof.refs=prepareReferences((await api('/api/professions')).professions);prof.error=''}catch(e){prof.error=e.message}finally{prof.loading=false}if(page==='professions')render()}
function retryProfessions(){prof.error='';prof.refs=null;loadProfessions();render()}
function professionSources(){const own=ownData(),agg=remote.summary?.aggregate,current=!!own&&dataCatalogVersion(own)===CURRENT_CATALOG_VERSION;return {own:current?own:null,legacy:!!own&&!current,agg:current&&agg?agg:null}}
function recommendations(source){const {own,agg}=professionSources(),d=source==='self'?own:agg;if(!d||!prof.refs?.length)return null;const basis=source==='self'?basisOf(own):basisOf(own,agg);return {data:d,basis,rows:groupMatches(matchAll(d,prof.refs,basis))}}
const clusterNames=()=>getCatalog().clusters.map(c=>c.name),quoted=list=>{const q=list.map(i=>'«'+esc(clusterNames()[i])+'»');return q.length>1?q.slice(0,-1).join(', ')+' и '+q.at(-1):q[0]||''};
function recPanel(source){
 const self=source==='self',title=`<h2><span class="swatch ${self?'self':'friends'}"></span>${self?'По вашей самооценке':'По мнению знакомых'}</h2>`,r=recommendations(source),n=remote.summary?.count||0;
 if(!r)return `<section class="panel prof-panel">${title}<p class="prof-empty">${!remote.signedIn?'Войдите в аккаунт и отправьте карту знакомым — здесь появятся профессии по их мнению.':!remote.active?'Отправьте карту знакомым через «Поделиться для оценки» в «Моих результатах».':'Список появится после двух ответов знакомых. Сейчас '+n+' из 2.'}</p></section>`;
 const rated=r.basis.rated,rows=r.rows.slice(0,prof.shown[source]);
 const basis=rated<MIN_RATED_CLUSTERS?'Учтены все 33 кластера: оценено меньше трёх.':`Учтено кластеров: ${rated} из 33.`+(rated<8?' Оцените больше — рекомендации станут точнее.':'');
 return `<section class="panel prof-panel">${title}<p class="prof-basis">${self?basis:'Среднее '+n+' '+(n%10===1&&n%100!==11?'участника':'участников')+'. '+basis}</p><div class="prof-list">${rows.map((row,k)=>`<button class="prof-row" onclick="openProfession('${source}',${k})"><span class="prof-rank">${String(k+1).padStart(2,'0')}</span><span class="prof-name">${esc(row.name)}</span><span class="prof-bar"><i class="${self?'self':'friends'}" style="width:${row.percent}%"></i></span><b>${row.percent}%</b></button>`).join('')}</div>${r.rows.length>rows.length?`<button class="secondary wide" onclick="moreProfessions('${source}')">Показать ещё</button>`:''}</section>`;
}
function professionsPage(){
 loadProfessions();
 const {own,legacy}=professionSources(),head=intro('ПРОФЕССИИ','Какие профессии вам подходят','Совпадение акцентов вашей карты с типичным образом профессии.');
 let body;
 if(!own)body=legacy?legacyNotice(ownData())+'<div class="panel empty"><h2>Пройдите актуальный тест</h2><p>Рекомендации считаются по карте из 33 кластеров и 283 качеств.</p><button class="primary" onclick="go(\'map\')">Перейти к карте →</button></div>':noMapMarkup();
 else if(prof.error)body=`<div class="panel empty"><h2>Не удалось загрузить профессии</h2><p>${esc(prof.error)}</p><button class="secondary" onclick="retryProfessions()">Попробовать снова</button></div>`;
 else if(!prof.refs)body='<div class="panel empty"><h2>Загружаем профессии…</h2></div>';
 else if(!prof.refs.length)body='<div class="panel empty"><h2>Профили профессий ещё не загружены</h2><p>Их загружает администратор в кабинете профилей.</p></div>';
 else body=`<div class="results-grid prof-grid">${recPanel('self')}${recPanel('friends')}</div><p class="prof-note">Процент показывает, насколько акценты вашей карты — что вы усилили и что ослабили — совпадают с типичным образом профессии по данным O*NET. Кластеры, которые вы не трогали, считаются нейтральными. Это ориентир для размышлений, а не приговор.</p>`;
 $('#app').innerHTML=head+(remote.collections.length?`<div class="compare-bar">${collectionPicker()}</div>`:'')+body;
}
// A group of near-identical professions is voted on as one line, stored under its first member.
const voteKey=(id,source)=>id+':'+source,canonicalId=row=>row.members.map(m=>m.id).sort()[0];
function voteMarkup(){const c=prof.card,v=prof.votes.get(voteKey(canonicalId(c.row),c.source))||0,button=(value,label)=>`<button class="${v===value?'active':''}" aria-pressed="${v===value}" onclick="voteProfession(${value})">${label}</button>`;return `<div class="prof-vote"><span>Похоже на правду?</span>${button(1,'👍 Да')}${button(-1,'👎 Нет')}${v?'<small>Спасибо! Повторное нажатие отменит оценку.</small>':''}</div>`}
const paintVote=()=>{const box=$('#prof-vote');if(box&&prof.card)box.innerHTML=voteMarkup()};
async function voteProfession(vote){
 const c=prof.card;if(!c||prof.voting)return;
 const id=canonicalId(c.row),key=voteKey(id,c.source),before=prof.votes.get(key)||0,next=before===vote?0:vote,store=v=>{if(v)prof.votes.set(key,v);else prof.votes.delete(key)};
 prof.voting=true;store(next);paintVote();
 try{await api('/api/professions/feedback',{method:'POST',body:JSON.stringify({professionId:id,source:c.source,vote:next,percent:c.row.percent,rank:c.rank,rated:c.rated,collectionId:remote.active?.id||null})})}
 catch(e){store(before);paintVote();toast(e.message)}finally{prof.voting=false}
}
function moreProfessions(source){prof.shown[source]+=10;render()}
function openProfession(source,k){
 const r=recommendations(source),row=r?.rows[k];if(!row)return;
 const other=recommendations(source==='self'?'friends':'self'),twin=other?.rows.find(x=>x.members.some(m=>m.id===row.ref.id));
 const e=explainMatch(r.data,row.ref,r.basis),self=source==='self',score=(s,v)=>v==null?'':`<span class="prof-score"><span class="swatch ${s}"></span>${s==='self'?'По самооценке':'По мнению знакомых'} <b>${v}%</b></span>`;
 const why=e.strengths.length?`<p>${self?'Ваши выраженные стороны':'Знакомые видят у вас выраженными'} ${quoted(e.strengths)} — это важно для этой профессии.</p>`:'<p>Ярких общих акцентов немного — совпадение держится на общем балансе карты.</p>';
 const calm=e.lowShadows.length?`<p>${self?'Вы отметили у себя':'Знакомые видят у вас'} мало ${quoted(e.lowShadows)} — для этой профессии это плюс.</p>`:'';
 const diff=[e.needMore.length&&`Профессии нужно больше, чем ${self?'у вас':'видят знакомые'}: ${quoted(e.needMore)}.`,e.haveMore.length&&`${self?'У вас':'По мнению знакомых, у вас'} сильнее, чем обычно в профессии: ${quoted(e.haveMore)}.`,e.unrated.length&&`Важно для профессии, но ${self?'вы это не оценивали':'это никто не оценивал'}: ${quoted(e.unrated)}.`].filter(Boolean);
 const accent=accentOf(r.data,r.basis),subjects=(row.ref.subjects||[]).map(s=>{const ref=prof.refs.find(p=>p.id===s.candidate_id);return ref&&{subject:s.subject,percent:matchProfession(accent,ref).percent}}).filter(Boolean).sort((a,b)=>b.percent-a.percent).slice(0,3);
 prof.card={source,row,rank:k+1,rated:r.basis.rated};
 $('#modal').hidden=false;
 $('#modal').innerHTML=`<div class="dialog prof-card"><div class="dialog-head"><div class="category">ПРОФЕССИЯ</div><button onclick="closeModal()" aria-label="Закрыть">×</button></div><h1>${esc(row.name)}</h1><div class="prof-scores">${score('self',self?row.percent:twin?.percent)}${score('friends',self?twin?.percent:row.percent)}</div><h3>Почему подходит</h3>${why}${calm}${diff.length?'<h3>Где расхождения</h3>'+diff.map(t=>'<p>'+t+'</p>').join(''):''}${subjects.length?'<h3>Какой предмет ближе</h3><p>'+subjects.map(s=>esc(s.subject)+' — '+s.percent+'%').join(', ')+'. Процент — совпадение с профилем учёного или специалиста в этом предмете.</p>':''}${row.specialties.length?'<h3>Где учиться</h3><ul class="prof-specialties">'+row.specialties.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul>':''}<div id="prof-vote">${voteMarkup()}</div><p class="prof-source">Типичный образ профессии по данным O*NET 31.0, переведённый в 33 кластера${row.members.length>1?'. Эти профессии в данных почти не различаются, поэтому показаны вместе':''}.</p></div>`;
}
function niceMax(v){const step=10**Math.floor(Math.log10(v)),k=[1,2,2.5,5,10].find(k=>k*step>=v);return k*step}
function pyramidMarkup(own,other,n){
 const names=(getCatalog(dataCatalogVersion(own))||getCatalog()).clusters.map(c=>c.name);
 const order=own.scores.map((_,i)=>i).sort((a,b)=>own.scores[b]-own.scores[a]||a-b).reverse();
 const max=niceMax(Math.max(...own.scores,...other.scores)),ticks=[0,max/2,max],w=v=>(v/max*100).toFixed(2)+'%';
 // Gridlines at the tick positions; the owner's half grows leftwards from the centre.
 const grid=side=>'background-image:'+ticks.map(()=>'linear-gradient(var(--grid),var(--grid))').join(',')+';background-position:'+ticks.map(t=>(side==='self'?100-t/max*100:t/max*100)+'% 0').join(',');
 const row=i=>{const a=own.scores[i],b=other.scores[i];return `<div class="pyr-row" tabindex="0" data-i="${i}" aria-label="${esc(names[i])}: я ${fmt(a)}, знакомые ${fmt(b)}"><div class="pyr-side self" style="${grid('self')}"><i style="width:${w(a)}"></i></div><div class="pyr-name">${esc(names[i])}</div><div class="pyr-side friends" style="${grid('friends')}"><i style="width:${w(b)}"></i></div></div>`};
 const axis=side=>`<div class="pyr-side pyr-ticks ${side}">${ticks.map(t=>`<span style="${side==='self'?'right':'left'}:${t/max*100}%">${fmt(t)}</span>`).join('')}</div>`;
 const diff=i=>{const d=other.scores[i]-own.scores[i];return (d>0?'+':d<0?'−':'')+fmt(Math.abs(d))};
 return `<section class="panel pyramid-panel"><div class="pyr-head"><div><h2>Хвосты кластеров</h2><p>Порядок — по вашей самооценке: внизу самые весомые кластеры, вверху самые лёгкие. Ответы знакомых встают в те же строки.</p></div></div><div class="pyramid" style="--grid:#edf0ea"><div class="pyr-row pyr-legend" aria-hidden="true"><div class="pyr-side self"><span><span class="swatch self"></span>Я · самооценка</span></div><div class="pyr-name"></div><div class="pyr-side friends"><span>Знакомые · среднее ${n}<span class="swatch friends"></span></span></div></div>${order.map(row).join('')}<div class="pyr-row pyr-axis" aria-hidden="true">${axis('self')}<div class="pyr-name">баллы</div>${axis('friends')}</div><div class="pyr-tip" hidden></div></div><details class="pyr-table"><summary>Показать таблицей</summary><table><thead><tr><th>Кластер</th><th>Я</th><th>Знакомые</th><th>Разница</th></tr></thead><tbody>${[...order].reverse().map(i=>`<tr><td>${esc(names[i])}</td><td>${fmt(own.scores[i])}</td><td>${fmt(other.scores[i])}</td><td>${diff(i)}</td></tr>`).join('')}</tbody></table></details></section>`;
}
function bindPyramid(){
 const box=$('.pyramid'),tip=box&&box.querySelector('.pyr-tip');if(!tip)return;
 const own=ownData(),other=remote.summary?.aggregate,names=(getCatalog(dataCatalogVersion(own))||getCatalog()).clusters.map(c=>c.name);
 const show=(el,x,y)=>{const i=+el.dataset.i,a=own.scores[i],b=other.scores[i],d=b-a;tip.innerHTML=`<b>${esc(names[i])}</b><div><span class="swatch self"></span>Я: ${fmt(a)} · ${pct(a/TOTAL_WEIGHT)}</div><div><span class="swatch friends"></span>Знакомые: ${fmt(b)} · ${pct(b/TOTAL_WEIGHT)}</div><div class="pyr-diff">Разница: ${d>0?'+':d<0?'−':''}${fmt(Math.abs(d))}</div>`;tip.hidden=false;const r=box.getBoundingClientRect(),left=Math.min(Math.max(0,x-r.left+14),r.width-tip.offsetWidth);tip.style.left=left+'px';tip.style.top=(y-r.top+14)+'px';box.querySelectorAll('.pyr-row.active').forEach(r=>r.classList.remove('active'));el.classList.add('active')};
 const hide=()=>{tip.hidden=true;box.querySelectorAll('.pyr-row.active').forEach(r=>r.classList.remove('active'))};
 box.querySelectorAll('.pyr-row[data-i]').forEach(el=>{el.onpointermove=e=>show(el,e.clientX,e.clientY);el.onpointerleave=hide;el.onfocus=()=>{const r=el.getBoundingClientRect();show(el,r.left+r.width/2,r.bottom-6)};el.onblur=hide});
}

const professions=['Аналитик','Менеджер проектов','Разработчик','Дизайнер','Маркетолог','Предприниматель','Преподаватель','HR-специалист','Инженер','Врач','Юрист','Финансист','Руководитель','Другое'];
function field(label,key,type='text'){return `<label>${label}<input name="${key}" type="${type}" value="${esc(state.profile[key]||'')}" ${key==='email'?'autocomplete="email"':''}></label>`}
function selectField(label,key,values,multi=false){return `<label>${label}<select name="${key}" ${multi?'multiple size="4"':''}>${multi?'':'<option value="">Выберите из списка</option>'}${values.map(v=>`<option ${multi?(state.profile[key]||[]).includes(v)?'selected':'':state.profile[key]===v?'selected':''}>${v}</option>`).join('')}</select>${multi?'<small>Для выбора нескольких удерживайте Ctrl / ⌘</small>':''}</label>`}
function profilePage(){let p=state.profile;$('#app').innerHTML=intro('ЗНАКОМСТВО','Давайте начнем с вас','Заполните профиль удобным способом. Карту качеств можно исследовать уже сейчас.')+`<div class="tabs"><button class="${method==='manual'?'active':''}" onclick="setMethod('manual')">Заполнить вручную</button><button class="${method==='pdf'?'active':''}" onclick="setMethod('pdf')">Загрузить резюме</button></div><form id="profile-form" class="panel" style="max-width:950px"><div class="form-grid">${field('Имя и фамилия','name')}${field('Электронная почта','email','email')}${field('Телефон','phone','tel')}${method==='manual'?field('Дата рождения','birth','date')+selectField('Страна','country',['Россия','Казахстан','Беларусь','Армения','Грузия','Узбекистан','Другая'])+selectField('Уровень образования','education',['Среднее','Среднее профессиональное','Бакалавриат','Специалитет','Магистратура','Аспирантура']):`<div class="upload full"><h3>Загрузите PDF-резюме</h3><p style="font-size:11px">Файл сохраняется в профиле на этом устройстве. Без автоматического распознавания. До 10 МБ.</p><input id="resume" type="file" accept="application/pdf,.pdf"><div id="resume-status" style="margin-top:12px">${p.resumeName?esc(p.resumeName)+' <button type="button" class="secondary" onclick="openResume()">Открыть PDF ↗</button>':''}</div></div>`}${field('Университет','university')}${field('Специальность','specialty')}${selectField('Текущая профессия','profession',professions)}${selectField('Предыдущие профессии','previous',professions,true)}<label class="full">Удовлетворенность текущей профессией · <b id="sat">${p.satisfaction||5}</b> / 10<input name="satisfaction" type="range" min="1" max="10" value="${p.satisfaction||5}" oninput="document.querySelector('#sat').textContent=this.value"></label><label class="full">Что еще вы хотите рассказать о себе?<textarea name="comment" maxlength="5000">${esc(p.comment||'')}</textarea></label><label class="full check"><input type="checkbox" name="mentor" ${p.mentor?'checked':''}>Хочу быть ментором</label><div class="full bottom-bar"><p>Анкета и PDF сохраняются в этом браузере.<br>Ответы знакомых сохраняются онлайн после входа в аккаунт.</p><button class="primary">Сохранить и перейти к карте →</button></div></div></form>`;$('#profile-form').onsubmit=e=>{e.preventDefault();persistForm();save();go('map');toast('Профиль сохранен')};if($('#resume'))$('#resume').onchange=uploadResume;}
function persistForm(){const form=$('#profile-form');if(!form)return;let data=new FormData(form);for(let [k,v] of data)if(k!=='previous')state.profile[k]=v;state.profile.previous=data.getAll('previous');state.profile.mentor=data.has('mentor');state.profile.method=method}
function setMethod(m){persistForm();save();method=m;profilePage()}
function dbOpen(){return new Promise((resolve,reject)=>{let r=indexedDB.open('profi-files',1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function uploadResume(e){let f=e.target.files[0];if(!f)return;if(f.size>10*1024*1024){toast('Максимальный размер файла — 10 МБ');e.target.value='';return}let head=await f.slice(0,5).text();if(head!=='%PDF-'){toast('Выберите корректный PDF-файл');e.target.value='';return}try{let db=await dbOpen();await new Promise((res,rej)=>{let t=db.transaction('files','readwrite');t.objectStore('files').put(f,state.accountId?'resume-'+state.accountId:'resume');t.oncomplete=res;t.onerror=rej});state.profile.resumeName=f.name;state.profile.resumeKey=state.accountId?'resume-'+state.accountId:'resume';save();$('#resume-status').innerHTML=esc(f.name)+' <button type="button" class="secondary" onclick="openResume()">Открыть PDF ↗</button>';toast('PDF сохранен в профиле')}catch{toast('Не удалось сохранить файл в браузере')}}
async function openResume(){try{let db=await dbOpen(),f=await new Promise((res,rej)=>{let r=db.transaction('files').objectStore('files').get(state.profile.resumeKey||'resume');r.onsuccess=()=>res(r.result);r.onerror=rej});if(!f){toast('Файл недоступен на этом устройстве');return}let url=URL.createObjectURL(f);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000)}catch{toast('Не удалось открыть PDF')}}

Object.assign(globalThis,{applySynonym,tailRowTap,restartMap,confirmRestart,slideWeight,commitWeight,typeWeight,enterCluster,leaveCluster,openAuth,logout,chooseCollection,openProfession,voteProfession,moreProfessions,retryProfessions,clearClusterSelection,refreshTailRanking,setMapView,selectCell,adjustCell,details,adjust,closeModal,fix,submitReview,showResultDetail,editOwnMap,refreshSummary,share,editShareOwnerName,copyLink,go,setMethod,openResume,showPreviousTest});
function go(p){stopPointerDrag();if(page==='profile'){persistForm();save()}if(p==='professions'){prof.shown={self:10,friends:10};loadVotes()}page=p;render();window.scrollTo(0,0)}document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page));$('#modal').onclick=e=>{if(e.target===$('#modal'))closeModal()};document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('#modal').hidden)closeModal();else if(!Number.isInteger(selected)&&Number.isInteger(inside))leaveCluster();else clearClusterSelection()}});document.addEventListener('pointerup',e=>{if(drag&&drag.pointerId===e.pointerId)drag.element.onpointerup(e)},true);window.addEventListener('blur',()=>{if(drag){stopPointerDrag();mapPage()}});document.addEventListener('visibilitychange',()=>{if(document.hidden&&drag){stopPointerDrag();mapPage()}});method=state.profile.method||'manual';save();render();initialize();setInterval(()=>{if(!document.hidden&&!rating&&remote.signedIn&&remote.active)refreshSummary('auto')},20000);
