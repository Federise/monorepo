/// <reference lib="webworker" />

import { precacheAndRoute, matchPrecache } from 'workbox-precaching';
import {
  registerRoute,
  setCatchHandler,
} from 'workbox-routing';
import {
  CacheFirst,
  NetworkFirst,
  NetworkOnly,
} from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import manifest from './sw-manifest.json';

declare const self: ServiceWorkerGlobalScope;

// Cache version - increment to force cache refresh
const CACHE_VERSION = 'v1';

// Filter manifest to exclude hashed _astro assets in development
// These cause precaching failures when hashes change during hot reload
const filteredManifest = manifest.filter(
  (entry: { url: string }) => !entry.url.startsWith('/_astro/')
);

// Precache pages (not hashed assets which change during development)
// Hashed assets are cached on-demand via CacheFirst strategy below
precacheAndRoute(filteredManifest);

// ===== ROUTING STRATEGIES =====

// 1. HTML Pages - Network First (always try to get fresh content)
//    Falls back to cache if offline
registerRoute(
  ({ request }) => request.destination === 'document',
  new NetworkFirst({
    cacheName: `pages-cache-${CACHE_VERSION}`,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
    ],
  })
);

// 2. JavaScript & CSS - Cache First (static assets with hashes)
//    These have content hashes in filename, so cache indefinitely
registerRoute(
  ({ request }) =>
    request.destination === 'script' || request.destination === 'style',
  new CacheFirst({
    cacheName: `static-assets-cache-${CACHE_VERSION}`,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
      }),
    ],
  })
);

// 3. Images - Cache First with expiration
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: `images-cache-${CACHE_VERSION}`,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 24 * 60 * 60, // 60 days
      }),
    ],
  })
);

// 4. Fonts - Cache First (external Google Fonts)
registerRoute(
  ({ url }) =>
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: `fonts-cache-${CACHE_VERSION}`,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
      }),
    ],
  })
);

// 5. External API Calls - Network Only (never cache gateway API)
registerRoute(
  ({ url }) => url.hostname.endsWith('.workers.dev'),
  new NetworkOnly()
);

// ===== OFFLINE FALLBACK =====

// Catch-all: if everything fails, show offline page
setCatchHandler(async ({ request }) => {
  // Only return offline page for navigation requests
  if (request.destination === 'document') {
    return (await matchPrecache('/offline')) || Response.error();
  }

  // For other requests, just fail
  return Response.error();
});

// ===== LIFECYCLE EVENTS =====

self.addEventListener('install', () => {
  console.log('[SW] Installing service worker...');
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    (async () => {
      // Clean up old caches from previous versions
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => !name.includes(CACHE_VERSION))
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );

      // Take control of all clients immediately
      await self.clients.claim();

      console.log('[SW] Service worker activated and ready!');
    })()
  );
});

// Message handler for manual cache updates
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
