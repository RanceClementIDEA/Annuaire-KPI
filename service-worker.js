const CACHE_NAME = "kpi-idea-cache-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./xlsx.full.min.js",
  "./logo-idea.png",
  "./footer-idea.png",
  "./manifest.json"
];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then(r => {
      const cl = r.clone();
      caches.open(CACHE_NAME).then(cache => { if (cl.ok) cache.put(e.request, cl); });
      return r;
    }).catch(() => caches.match(e.request).then(c => c || caches.match("./index.html")))
  );
});
