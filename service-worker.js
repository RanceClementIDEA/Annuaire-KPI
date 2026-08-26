const CACHE_NAME = "kpi-idea-cache-v20";

/* Les pièces de l'application, mises en cache à l'installation pour qu'elle
   démarre hors ligne. C'est aussi la SEULE liste que le cache d'exécution
   accepte de rafraîchir : voir plus bas. */
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./xlsx.full.min.js",
  "./js/storage.js",
  "./js/merge.js",
  "./js/carousel.js",
  "./js/zip.js",
  "./js/empreintes.js",
  "./js/derivation.js",
  "./js/pptx.js",
  "./js/inspecter-deck.js",
  "./js/selection.js",
  "./modele-deck.pptx",
  "./empreintes-livrees.json",
  "./logo-idea.png",
  "./footer-idea.png",
  "./manifest.json"
];

/** Le chemin d'une adresse, ramené à la racine du service worker. */
function cheminLocal(url) {
  try {
    const u = new URL(url);
    if (u.origin !== self.location.origin) return null;
    return u.pathname + (u.pathname.endsWith("/") ? "" : "");
  } catch (err) { return null; }
}

/* Les chemins autorisés en cache, calculés une fois. Tout le reste — API,
   suivi de session Firestore, images d'un autre domaine — ne doit JAMAIS
   entrer : chaque adresse y étant unique, le cache gonflait sans fin. */
const AUTORISES = new Set(
  ASSETS.map(a => cheminLocal(new URL(a, self.location).href)).filter(Boolean)
);

/** Cette réponse mérite-t-elle d'être gardée ? */
function aGarder(requete, reponse) {
  if (!reponse || !reponse.ok || reponse.type === "opaque") return false;
  if (requete.method !== "GET") return false;
  const chemin = cheminLocal(requete.url);
  if (!chemin || !AUTORISES.has(chemin)) return false;

  /* Un portail captif ou un proxy d'entreprise répond 200 avec sa propre
     page HTML. Mise en cache, elle remplaçait durablement app.js, et le
     navigateur signalait « Unexpected token '<' » à la prochaine ouverture
     hors ligne. On vérifie donc que le type reçu correspond à ce qu'on a
     demandé. */
  const type = (reponse.headers.get("content-type") || "").toLowerCase();
  const estHtml = type.includes("text/html");
  const veutHtml = chemin.endsWith("/") || chemin.endsWith(".html");
  return estHtml === veutHtml;
}

self.addEventListener("install", e => {
  self.skipWaiting();
  /* Pièce par pièce, et non `addAll` : celui-ci échoue EN BLOC dès qu'une
     seule adresse répond 404. L'installation échouait alors sans un mot —
     `register()` se résolvait quand même — et l'ancienne version restait
     aux commandes indéfiniment, avec un cache vide en travers du chemin.
     Un fichier manquant ne doit coûter que ce fichier. */
  e.waitUntil(caches.open(CACHE_NAME).then(async cache => {
    const manquants = [];
    await Promise.all(ASSETS.map(async a => {
      try {
        const r = await fetch(new Request(a, { cache: "reload" }));
        if (r.ok) await cache.put(a, r); else manquants.push(a + " (" + r.status + ")");
      } catch (err) { manquants.push(a + " (" + (err.message || "réseau") + ")"); }
    }));
    if (manquants.length) console.warn("[SW] pièces non mises en cache :", manquants);
  }));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      /* Prévenir les onglets restés ouverts : ils exécutent encore l'ANCIEN
         code alors que ce service worker leur sert déjà les nouveaux
         fichiers. Un annuaire dont le format aurait changé se viderait sous
         leurs yeux, sans explication. */
      .then(() => self.clients.matchAll({ type: "window" }))
      .then(clients => clients.forEach(c => c.postMessage({ type: "maj-disponible", cache: CACHE_NAME })))
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (aGarder(e.request, r)) {
        const cl = r.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, cl));
      }
      return r;
    }).catch(() => caches.match(e.request).then(c => {
      if (c) return c;
      // Repli sur la page seulement pour une NAVIGATION. Le faire pour tout
      // rendait index.html en réponse à un script indisponible (Firebase hors
      // ligne, CDN bloqué) : le navigateur tentait alors d'exécuter du HTML
      // et signalait « Unexpected token '<' ».
      if (e.request.mode === "navigate") return caches.match("./index.html");
      return Response.error();
    }))
  );
});
