/**
 * 世界时间 - Service Worker
 * 缓存优先策略 (Cache-First)
 * 确保所有静态资源可离线访问
 */

const CACHE_NAME = 'world-clock-v1.4.2';
const ASSETS_TO_CACHE = [
  '/',
  'index.html',
  'manifest.json',
  'css/base.css', 'css/panels.css',
  'css/comet.css',
  'js/cities/east-asia.js',
  'js/cities/southeast-asia.js',
  'js/cities/south-asia.js',
  'js/cities/central-asia.js',
  'js/cities/middle-east.js',
  'js/cities/europe.js',
  'js/cities/africa.js',
  'js/cities/north-america.js',
  'js/cities/south-america.js',
  'js/cities/oceania.js',
  'js/cities.js',
  'js/clock.js',
  'js/theme.js',
  'js/astro.js',
  'js/globe.js',
  'js/app.js',
  'js/detail.js', 'js/compare.js',
  'js/mini-globe.js',
  'js/i18n.js',
  'js/dev.js',
  'js/elev.js',
  'lang/en.json',
  'data/elevations.json',
  'lib/three.min.js',
  'lib/topojson-client.js',
  'data/city-3d-coords.json',
  'data/ne_50m_land.topojson',
  'sw.js',
];

// ========== 安装：预缓存所有静态资源 ==========
self.addEventListener('install', (event) => {
  console.log('[SW] 安装中...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] 缓存资源:', ASSETS_TO_CACHE);
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => {
      console.log('[SW] 安装完成，所有资源已缓存');
      return self.skipWaiting();
    })
  );
});

// ========== 激活：清理旧缓存 ==========
self.addEventListener('activate', (event) => {
  console.log('[SW] 激活中...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[SW] 清理旧缓存:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => {
      console.log('[SW] 激活完成');
      return self.clients.claim();
    })
  );
});

// ========== 请求拦截：缓存优先（离线优先） ==========
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      // 缓存命中 → 直接返回（离线可用）
      if (cached) return cached;
      // 缓存未命中 → 网络请求（首次加载或新资源）
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('index.html');
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// ========== 热更新通知 ==========
// 新 SW 激活后，通知所有打开的页面刷新
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') {
    self.skipWaiting();
  }
});
