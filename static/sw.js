const CACHE_NAME = "toeflmate-v3";
const STATIC_ASSETS = [
    "/",
    "/static/css/app.css",
    "/static/js/app.js",
    "/static/manifest.json",
];

self.addEventListener("install", (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (e) => {
    const url = new URL(e.request.url);
    if (url.pathname.startsWith("/api/")) {
        e.respondWith(fetch(e.request).catch(() => new Response('{"error":"offline"}', { status: 503 })));
    } else {
        e.respondWith(
            fetch(e.request).then((res) => {
                const clone = res.clone();
                caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
                return res;
            }).catch(() => caches.match(e.request))
        );
    }
});
