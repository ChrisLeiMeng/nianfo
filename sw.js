// 離線快取：先連網取得最新檔案（你修改 txt / json 後立即生效），沒網路時改用快取
// YouTube 等外部網址不處理，播放仍需網路

const CACHE = 'nianfo-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' }) // 略過瀏覽器的 HTTP 快取，發佈後馬上拿到新檔
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
