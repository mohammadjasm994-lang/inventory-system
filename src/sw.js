// Service Worker: الشبكة أولاً، والنسخة المحفوظة عند انقطاع الإنترنت
const CACHE = 'app-__BUILD__';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // ملفات الموقع نفسه فقط؛ المكتبات الخارجية و Firestore يتركها للمتصفح مباشرة
  // (اعتراضها من الـ Service Worker يصطدم بسياسة الأمان CSP)
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('/').then(h => h || Response.error()) : Response.error())))
  );
});
