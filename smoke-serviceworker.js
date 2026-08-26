/* ============================================================
   LE SERVICE WORKER, ÉPROUVÉ DANS UN VRAI NAVIGATEUR
   ------------------------------------------------------------
   Trois pannes réelles, qu'aucun test unitaire ne peut voir parce
   qu'elles vivent dans le cache du navigateur :

     1. UN PORTAIL CAPTIF. Un proxy d'entreprise répond 200 avec sa
        propre page HTML. Mise en cache, elle remplaçait durablement
        app.js : à la prochaine ouverture hors ligne, le navigateur
        essayait d'exécuter du HTML et signalait « Unexpected token '<' ».
     2. LES APPELS D'API. Chaque adresse de suivi Firestore étant
        unique, le cache d'exécution gonflait sans fin, sans que rien
        ne le purge jamais.
     3. UNE PIÈCE MANQUANTE. `cache.addAll` échoue EN BLOC dès qu'une
        seule adresse répond 404 : l'installation échouait sans un mot
        et l'ancienne version restait aux commandes pour toujours.

   Lancement :  node smoke-serviceworker.js
   ============================================================ */
const http=require('http'),fs=require('fs'),path=require('path');
const { chromium } = require('playwright');
const R=__dirname;
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.pptx':'application/octet-stream','.ico':'image/x-icon','.svg':'image/svg+xml'};
let portailCaptif=false, manquant=null;
const srv=http.createServer((q,r)=>{
  const p=q.url.split('?')[0];
  if(p.startsWith('/api/')){ r.writeHead(200,{'Content-Type':'application/json'}); return r.end('{"ok":1}'); }
  if(portailCaptif && p==='/app.js'){ r.writeHead(200,{'Content-Type':'text/html'}); return r.end('<!DOCTYPE html><html>PORTAIL CAPTIF</html>'); }
  if(manquant && p===manquant){ r.writeHead(404); return r.end(); }
  const f=path.join(R,p==='/'?'/index.html':p);
  fs.readFile(f,(e,d)=>e?(r.writeHead(404),r.end()):(r.writeHead(200,{'Content-Type':T[path.extname(f)]||'text/plain'}),r.end(d)));
});
const etat=[]; const dire=(n,ok,d)=>{etat.push(ok);console.log((ok?'  ✓ ':'  ✗ ')+n+(d?' → '+d:''));};
(async()=>{
  await new Promise(ok=>srv.listen(8977,'127.0.0.1',ok));
  const nav=await chromium.launch();
  const ctx=await nav.newContext(); const p=await ctx.newPage();
  await p.goto('http://127.0.0.1:8977/index.html',{waitUntil:'load'});
  await p.evaluate(()=>navigator.serviceWorker.ready); await p.waitForTimeout(1500);

  // 1. portail captif
  portailCaptif=true;
  await p.evaluate(()=>fetch('/app.js').then(r=>r.text()));
  await p.waitForTimeout(600);
  const cache=await p.evaluate(async()=>{
    const c=await caches.open((await caches.keys()).find(k=>k.startsWith('kpi-idea')));
    const r=await c.match('/app.js'); return r? (await r.text()).slice(0,40):'(absent)';
  });
  dire('un portail captif ne remplace plus app.js dans le cache',
    !/PORTAIL CAPTIF/.test(cache), cache.slice(0,38));
  portailCaptif=false;

  // 2. appels d'API
  await p.evaluate(async()=>{ for(let i=0;i<25;i++) await fetch('/api/listen?sid='+i); });
  await p.waitForTimeout(800);
  const nbApi=await p.evaluate(async()=>{
    const c=await caches.open((await caches.keys()).find(k=>k.startsWith('kpi-idea')));
    return (await c.keys()).filter(k=>k.url.includes('/api/')).length;
  });
  dire('les appels d\'API ne gonflent plus le cache', nbApi===0, nbApi+' entrée(s)');

  // 3. une pièce manquante à l'installation
  manquant='/footer-idea.png';
  const sw=fs.readFileSync(R+'/service-worker.js','utf8');
  // Une version inédite, quel que soit le numéro courant : c'est le
  // changement de nom qui déclenche une nouvelle installation.
  fs.writeFileSync(R+'/service-worker.js', sw.replace(/kpi-idea-cache-v\d+/,'kpi-idea-cache-v99'));
  const p2=await ctx.newPage();
  await p2.goto('http://127.0.0.1:8977/index.html',{waitUntil:'load'});
  await p2.waitForTimeout(2500);
  await p2.reload({waitUntil:'load'}); await p2.waitForTimeout(2000);
  const r=await p2.evaluate(async()=>{
    const reg=await navigator.serviceWorker.getRegistration();
    const cles=await caches.keys();
    const c=await caches.open('kpi-idea-cache-v99').catch(()=>null);
    return { actif: !!(reg&&reg.active), cles, pieces: c? (await c.keys()).length : -1 };
  });
  fs.writeFileSync(R+'/service-worker.js', sw);
  dire('une pièce manquante ne bloque plus toute l\'installation',
    r.cles.includes('kpi-idea-cache-v99') && r.pieces >= 18,
    r.pieces+' pièces en cache, caches : '+r.cles.join(','));

  await nav.close(); srv.close();
  console.log(etat.every(Boolean)?'\nLe service worker tient.\n':'\nDes contrôles ont échoué.\n');
  process.exitCode = etat.every(Boolean)?0:1;
})();
