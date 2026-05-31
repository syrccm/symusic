// SY Music Service Worker
const CACHE_NAME = 'symusic-v4';
const urlsToCache = [
  '/',
  '/index.html',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json'
];

// 설치 시 캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('SY Music 캐시 열림');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// 활성화 시 오래된 캐시 삭제
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('오래된 캐시 삭제:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Cache API는 GET 외 메서드를 캐시할 수 없고, Firebase 실시간 트래픽은 캐시 대상이 아님.
// (이전: 모든 요청을 cache.put하다가 Firestore POST에서 'Request method POST is unsupported' 발생)
function shouldBypassSW(request) {
  if (request.method !== 'GET') return true;
  const url = request.url;
  return (
    url.includes('firestore.googleapis.com') ||
    url.includes('firebaseio.com') ||
    url.includes('firebaseapp.com') ||
    url.includes('googleapis.com/identitytoolkit') ||
    url.includes('securetoken.googleapis.com') ||
    url.includes('identitytoolkit.googleapis.com') ||
    // 음악 스트림(Cloudflare R2)은 SW가 가로채면 오디오 Range 요청이 끊기므로 네트워크 직행
    url.includes('.r2.dev') ||
    url.includes('r2.cloudflarestorage.com')
  );
}

// 네트워크 우선, 실패 시 캐시 사용
self.addEventListener('fetch', (event) => {
  // 비-GET 또는 Firebase 트래픽은 SW 개입 없이 네트워크로 직행
  if (shouldBypassSW(event.request)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // basic 응답(같은 출처)이고 200일 때만 캐시
        if (response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseClone);
            })
            .catch((err) => console.warn('[SW] cache.put 실패:', err));
        }
        return response;
      })
      .catch(() => {
        // 네트워크 실패 시 캐시에서 가져오기
        return caches.match(event.request);
      })
  );
});
