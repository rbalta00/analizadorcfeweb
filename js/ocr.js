// OCR con Tesseract.js -- equivalente web de pytesseract en leer_recibo.py. Requiere
// que lib/tesseract.min.js ya este cargado (expone window.Tesseract) y que
// lib/tesseract-worker.min.js este vendorizado localmente (ver manifest del service
// worker). El motor WASM (tesseract-core) y los datos del idioma espanol se obtienen
// del CDN propio de Tesseract.js la primera vez que se usa OCR (requiere internet esa
// primera vez; el navegador los cachea despues). Vendorizarlos tambien es posible pero
// se dejo pendiente -- ver ESTADO.md.

let workerPromise = null;

function obtenerWorker() {
  if (!workerPromise) {
    workerPromise = window.Tesseract.createWorker('spa', 1, {
      workerPath: 'lib/tesseract-worker.min.js',
      logger: () => {},
    });
  }
  return workerPromise;
}

export async function ocrImagen(fuenteImagen) {
  const worker = await obtenerWorker();
  const { data } = await worker.recognize(fuenteImagen);
  return data.text;
}

// Renderiza una pagina de un documento pdf.js ya abierto a un canvas, en escala alta
// (equivalente al dpi=200 que usa fitz en Python) para que el OCR tenga mejor material.
export async function renderizarPaginaComoCanvas(pdfPage, escala = 2.5) {
  const viewport = pdfPage.getViewport({ scale: escala });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  await pdfPage.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}
