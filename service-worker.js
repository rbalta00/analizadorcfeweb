// Service worker del Cotizador FV CFE. Mismo patron (red primero, cache de respaldo)
// que cotizador-soelrb/service-worker.js, ya probado y funcionando como PWA instalada
// en esta maquina -- ver web/ESTADO.md. Los datos (historial de cotizaciones) nunca
// pasan por aqui, viven en localStorage del navegador, no en este cache.

const CACHE_NOMBRE = "cfe-cotizador-v66";

const ARCHIVOS_APP_SHELL = [
  "./",
  "index.html",
  "cliente.html",
  "manifest.json",
  "css/styles.css",
  "css/vista-previa.css",
  "vista-previa.html",
  "vista-previa-compartida.html",
  "js/app.js",
  "js/vistaPrevia.js",
  "js/vistaPreviaCompartida.js",
  "js/vistaPreviaComun.js",
  "js/clienteForm.js",
  "js/formularioRecibo.js",
  "js/formulariosPorTarifa.js",
  "js/archivosAPdf.js",
  "js/textosGlobales.js",
  "js/supabase.js",
  "js/motor.js",
  "js/recibo.js",
  "js/pdftext.js",
  "js/ocr.js",
  "js/leerRecibo.js",
  "js/bloques.js",
  "js/notas.js",
  "js/util.js",
  "js/charts.js",
  "js/clientes.js",
  "js/comercial.js",
  "js/resultado.js",
  "js/secciones.js",
  "js/propuesta.js",
  "js/propuestaDom.js",
  "js/resumen.js",
  "js/imagenes.js",
  "js/sembrador.js",
  "js/pdfComponents.js",
  "js/nube.js",
  "js/excel.js",
  "lib/jspdf.umd.min.js",
  "lib/pdf.min.js",
  "lib/pdf.worker.min.js",
  "lib/tesseract.min.js",
  "lib/tesseract-worker.min.js",
  "lib/exceljs.min.js",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NOMBRE).then((cache) => cache.addAll(ARCHIVOS_APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(nombres.filter((n) => n !== CACHE_NOMBRE).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    // "cache: no-store" en el fetch de red -- pedido explicito del usuario,
    // 2026-11-10: el boton "Actualizar" debe traer los cambios sin tener que cerrar y
    // volver a abrir la app. Antes el fetch de red usaba las reglas normales de cache
    // HTTP del navegador (ademas de este cache de respaldo) -- aunque la intencion ya
    // era "red primero", el navegador podia seguir sirviendo una copia de su propio
    // cache HTTP sin volver a pedirla al servidor, asi que un redeploy no siempre
    // llegaba aunque se recargara la pagina. "no-store" fuerza a ignorar ese cache y
    // pedir siempre al servidor mientras haya red -- el cache de este service worker
    // (caches.put/caches.match de abajo) sigue siendo el respaldo offline de siempre.
    fetch(event.request, { cache: "no-store" })
      .then((respuestaRed) => {
        const copia = respuestaRed.clone();
        caches.open(CACHE_NOMBRE).then((cache) => cache.put(event.request, copia));
        return respuestaRed;
      })
      .catch(() => caches.match(event.request).then((r) => r || caches.match("index.html")))
  );
});
