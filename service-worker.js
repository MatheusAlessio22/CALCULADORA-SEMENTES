// Service worker da Calculadora Coasul.
// Guarda o "app shell" (html/css/js/ícones) em cache na instalação, pra ficha
// abrir 100% offline depois da primeira visita. Estratégia: responde do
// cache na hora (rápido, funciona sem rede) e atualiza o cache em segundo
// plano sempre que a rede responder — assim a próxima abertura já vem com a
// versão mais nova, sem travar a atual esperando a rede.
//
// Pra publicar uma atualização: mude CACHE_VERSION (ex.: v1 -> v2). Isso cria
// um cache novo, o "activate" apaga o antigo, e os clientes pegam a versão
// nova na próxima abertura.
const CACHE_VERSION = "coasul-calc-v7";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/calculos.js",
  "./js/cultivares.js",
  "./js/app.js",
  "./assets/logo.png",
  "./assets/mark.png",
  "./assets/fonts/inter-400.woff2",
  "./assets/fonts/inter-500.woff2",
  "./assets/fonts/inter-600.woff2",
  "./assets/fonts/inter-700.woff2",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached || caches.match("./index.html"));

      // cache-first: responde na hora se já tem; senão espera a rede
      return cached || network;
    })
  );
});
