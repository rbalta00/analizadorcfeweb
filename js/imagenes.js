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
