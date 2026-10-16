const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const root=process.cwd(),origin='http://127.0.0.1:8877';
const oldSource=execFileSync('git',['show','216cfa8f61234c87a63bc51bf5be1d541ccb7bc4:public/app.js'],{encoding:'utf8'});
const baseline={scores:Array(33).fill(10),areas:Array(33).fill(1/33),edited:Array(33).fill(true),qualities:Array.from({length:33},()=>Array(4).fill(15)),qedited:Array.from({length:33},()=>Array(4).fill(true))};
const server=http.createServer((req,res)=>{
 const path=new URL(req.url,origin).pathname;
 if(path==='/api/session'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({signedIn:false,user:null}));return}
 if(path.startsWith('/api/collections/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ownerName:'Ирина Петрова',baseline,catalogVersion:'examples-v1',alreadySubmitted:false,isOwner:false}));return}
 const file=path==='/app.js'?'public/app.js':path==='/style.css'?'public/style.css':'ui/index.html';res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.setHeader('Cache-Control','no-store');res.end(fs.readFileSync(root+'/'+file));
});
(async()=>{
 await new Promise(resolve=>server.listen(8877,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});let errors=[];
 try{
  async function open({old=false,reviewer=false,mobile=false}={}){const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1050},hasTouch:mobile,isMobile:mobile});page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',route=>route.abort());if(old)await page.route('**/app.js?*',route=>route.fulfill({body:oldSource,contentType:'text/javascript'}));await page.goto(origin+(reviewer?'/#invite=browser-review':'/'),{waitUntil:'networkidle'});if(reviewer){await page.locator('[name=firstName]').fill('Анна');await page.locator('[name=lastName]').fill('Смирнова');await page.getByRole('button',{name:'Начать оценку →'}).click()}await page.getByRole('button',{name:'▤ Хвост',exact:true}).click();return page}
  async function repeatSameSpot(page,clicks=3){const control=page.locator('[data-tail-cluster="3"] .tail-stepper button').last();await control.scrollIntoViewIfNeeded();const b=await control.boundingBox();for(let n=0;n<clicks;n++)await page.mouse.click(b.x+b.width/2,b.y+b.height/2)}
  const before=await open({old:true});await repeatSameSpot(before);let reproduced=await before.evaluate(()=>current().scores.filter(v=>v>10).length);assert.ok(reproduced>1,'Old tail must reproduce multiple clusters growing from the same click position');console.log('Reproduced previous bug: repeated clicks at one position changed '+reproduced+' clusters.');await before.close();
  for(const config of [{},{reviewer:true},{mobile:true}]){
   const page=await open(config);const originalOrder=await page.locator('[data-tail-cluster]').evaluateAll(rows=>rows.map(r=>r.dataset.tailCluster));await repeatSameSpot(page);let result=await page.evaluate(()=>({scores:current().scores,edited:current().edited,reviewFlags:reviewChanges.clusters,selected,drag}));assert.equal(result.scores[3],13);assert.ok(result.scores.every((v,i)=>i===3||v<10));assert.deepEqual(await page.locator('[data-tail-cluster]').evaluateAll(rows=>rows.map(r=>r.dataset.tailCluster)),originalOrder);
   if(config.reviewer){assert.equal(result.reviewFlags.filter(Boolean).length,1);assert.equal(result.reviewFlags[3],true);assert.ok(await page.locator('.review-context').textContent().then(v=>v.includes('Ирина Петрова')))}
   await page.getByRole('button',{name:'Снять выделение',exact:true}).click();assert.equal(await page.evaluate(()=>selected),null);assert.equal(await page.locator('.tail-selected').count(),0);const committed=await page.evaluate(()=>JSON.stringify(current().scores));await page.mouse.move(250,250);assert.equal(await page.evaluate(()=>JSON.stringify(current().scores)),committed);
   await page.getByRole('button',{name:'Обновить рейтинг ↓',exact:true}).click();assert.equal(await page.locator('[data-tail-cluster]').first().getAttribute('data-tail-cluster'),'3');assert.equal(await page.evaluate(()=>JSON.stringify(current().scores)),committed);
   await page.getByRole('button',{name:'◈ Вороной',exact:true}).click();assert.equal(await page.locator('#diagram path.selected').count(),0);assert.equal(await page.evaluate(()=>JSON.stringify(current().scores)),committed);
   if(!config.mobile){await page.screenshot({path:root+'/.sites-runtime/tail-fixed-'+(config.reviewer?'reviewer':'owner')+'.png',fullPage:true})}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   console.log('Passed '+(config.mobile?'mobile':config.reviewer?'reviewer':'owner')+': one target, stable rows, deselection, explicit sort and matching Voronoi values.');await page.close();
  }
  assert.deepEqual(errors,[]);console.log('Browser checks passed.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
