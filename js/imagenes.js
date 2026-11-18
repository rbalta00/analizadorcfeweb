// Convierte un archivo (imagen o PDF de una pagina) en un data URL JPEG comprimido,
// listo para guardar en localStorage (ver clientes.js: cada proyecto puede guardar la
// foto del sembrado de paneles) y para embeber en el PDF de la cotizacion
// (propuesta.js, via doc.addImage). Se comprime a proposito -- una foto de celular sin
// comprimir facilmente pesa varios MB, y localStorage tiene una cuota de unos 5-10MB
// POR TODA la app (todos los clientes), no por imagen.
import { abrirPdf } from './pdftext.js';
import { renderizarPaginaComoCanvas } from './ocr.js';

function canvasDesdeImagen(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  canvas.getContext('2d').drawImage(img, 0, 0);
  return canvas;
}

function redimensionarCanvas(canvasOrigen, maxAncho) {
  if (canvasOrigen.width <= maxAncho) return canvasOrigen;
  const factor = maxAncho / canvasOrigen.width;
  const canvas = document.createElement('canvas');
  canvas.width = maxAncho;
  canvas.height = Math.round(canvasOrigen.height * factor);
  canvas.getContext('2d').drawImage(canvasOrigen, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function cargarImagenDesdeArchivo(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    img.src = URL.createObjectURL(file);
  });
}

// archivoAImagenComprimida(file) -> Promise<{dataUrl, ancho, alto}>
export async function archivoAImagenComprimida(file, { maxAncho = 1400, calidad = 0.72 } = {}) {
  const esPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  let canvas;
  if (esPdf) {
    const buf = await file.arrayBuffer();
    const pdf = await abrirPdf(buf);
    const page = await pdf.getPage(1);
    canvas = await renderizarPaginaComoCanvas(page, 2.0);
  } else {
    const img = await cargarImagenDesdeArchivo(file);
    canvas = canvasDesdeImagen(img);
    URL.revokeObjectURL(img.src);
  }
  canvas = redimensionarCanvas(canvas, maxAncho);
  return { dataUrl: canvas.toDataURL('image/jpeg', calidad), ancho: canvas.width, alto: canvas.height };
}

function blobADataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer la imagen descargada.'));
    reader.readAsDataURL(blob);
  });
}

// No se pudo guardar -- la memoria del navegador (localStorage) se llenaba porque
// fotoSembrado/fotosInmueble se guardaban como data: URI completo dentro de CADA
// proyecto (hasta 6 fotos + el sembrado, por estudio, acumulados entre todos los
// clientes). 2026-11-17: se migraron a Supabase Storage igual que archivosRecibo/
// archivosVerificacion -- ahora solo se guarda {nombre,tipo,url,ruta,ancho,alto} (unos
// cientos de bytes) en vez de la imagen completa. doc.addImage() (jsPDF) y
// dibujarImagenDataUrl() (propuestaDom.js, "Cotización completa") solo aceptan un
// data: URI real, nunca una URL remota -- este helper descarga y convierte de vuelta,
// solo cuando hace falta (si el objeto ya trae `dataUrl`, es un proyecto guardado ANTES
// de esta migracion, y se regresa tal cual sin volver a descargar nada).
export async function conDataUrlResuelto(obj) {
  if (!obj) return null;
  if (obj.dataUrl) return obj;
  if (!obj.url) return null;
  const resp = await fetch(obj.url);
  if (!resp.ok) throw new Error(`No se pudo descargar la imagen (HTTP ${resp.status}).`);
  const dataUrl = await blobADataUrl(await resp.blob());
  return { ...obj, dataUrl };
}

// Mismo problema que arriba pero para "Cotización completa" (generarPdfCompletaDesdeVista
// en propuesta.js), que NO lee fotoSembrado/archivosRecibo/etc. directo -- lee el DOM YA
// RENDERIZADO (#contenedorSecciones), asi que cualquier <img src="https://..."> (ahora
// la norma, desde que todo esto vive en Supabase Storage) se perdia en silencio del PDF
// porque dibujarImagenDataUrl() ignora cualquier src que no empiece con "data:". Esto
// resuelve cada <img> remoto a un data: URI en el DOM mismo, justo antes de generar --
// seguro de mutar porque el siguiente render (recalcular, reabrir el proyecto) reconstruye
// esos nodos desde cero.
export async function resolverImagenesRemotasEnDom(contenedorId = 'contenedorSecciones') {
  const cont = document.getElementById(contenedorId);
  if (!cont) return;
  const imgs = Array.from(cont.querySelectorAll('img')).filter((img) => img.src && !img.src.startsWith('data:'));
  await Promise.all(imgs.map(async (img) => {
    try {
      const resp = await fetch(img.src);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      img.src = await blobADataUrl(await resp.blob());
    } catch (err) {
      console.error('No se pudo preparar una imagen del DOM para el PDF:', err);
    }
  }));
}
