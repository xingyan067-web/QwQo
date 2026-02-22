// 【关键修改】版本号升级为 v3，这会强制浏览器删除旧缓存
const CACHE_NAME = 'ios-theme-v3'; 
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json'
];

// 安装 Service Worker
self.addEventListener('install', (event) => {
    // 【关键修改】强制立即接管页面，跳过等待，让新版立即生效
    self.skipWaiting();
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
});

// 激活 Service Worker
self.addEventListener('activate', (event) => {
    // 立即控制所有页面
    event.waitUntil(self.clients.claim());
    
    // 清理旧缓存
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // 删除所有不是当前版本的缓存
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// 拦截网络请求
self.addEventListener('fetch', (event) => {
    // 优先使用网络，网络失败才用缓存 (Network First 策略，适合开发调试)
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // 如果网络请求成功，更新缓存
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }
                const responseToCache = response.clone();
                caches.open(CACHE_NAME)
                    .then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                return response;
            })
            .catch(() => {
                // 网络失败，读取缓存
                return caches.match(event.request);
            })
    );
});
