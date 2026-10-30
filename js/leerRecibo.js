// Orquestador equivalente a leer_recibo()/extraer_texto() en app/leer_recibo.py:
// intenta el texto nativo del PDF primero; si no es legible (o es una foto/imagen),
// cae a OCR con Tesseract.js sobre un render de cada pagina.
import { abrirPdf, extraerTextoDeDocumento } from './pdftext.js';
import { ocrImagen, renderizarPaginaComoCanvas } from './ocr.js';
import { extraerCampos, textoPareceLegible, quitarAcentos } from './recibo.js';

export async function extraerTexto(file) {
  const esPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (esPdf) {
    const buf = await file.arrayBuffer();
    const pdf = await abrirPdf(buf); // una sola apertura; se reusa abajo si hace falta OCR
    const texto = await extraerTextoDeDocumento(pdf);
    const legible = texto.trim().length >= 80 && textoPareceLegible(quitarAcentos(texto).toUpperCase());
    if (legible) return { texto, usoOcr: false };

    // Texto nativo ausente o con fuente codificada -> OCR sobre un render de cada pagina.
    const partes = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const canvas = await renderizarPaginaComoCanvas(page, 2.5);
      partes.push(await ocrImagen(canvas));
    }
    return { texto: partes.join('\n'), usoOcr: true };
  }
  // Imagen (jpg/png/webp): OCR directo sobre el archivo.
  return { texto: await ocrImagen(file), usoOcr: true };
}

export async function leerRecibo(file) {
  const { texto, usoOcr } = await extraerTexto(file);
  return extraerCampos(texto, usoOcr);
}
