// Convierte fotos (jpg/png/webp) a un solo PDF -- pedido explicito del usuario: "que
// del formato que sea lo conviertas a PDF para trabajar mejor" en el formulario
// publico (cliente.html), para no terminar con un monton de archivos sueltos de
// distinto formato por cada envio. Usa jsPDF (ya vendorizado en lib/jspdf.umd.min.js,
// mismo que ya usa la app interna en pdfComponents.js) -- no agrega ninguna
// dependencia nueva. Los PDF que el cliente ya suba como PDF se dejan tal cual, no se
// reconvierten (jsPDF no puede leer/fusionar un PDF existente, solo crear uno nuevo).
const MAX_LADO_PX = 1800; // evita archivos enormes si la foto viene a resolucion de camara completa

function cargarImagen(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`No se pudo leer la imagen "${file.name}"`)); };
    img.src = url;
  });
}

// Dibuja la imagen en un canvas (reescalada si es muy grande) y regresa un dataURL
// JPEG -- asi jsPDF siempre recibe un formato que sabe leer, sin importar si el
// original era png/webp/heic-convertido-por-el-navegador.
function imagenADataUrlJpeg(img) {
  let { naturalWidth: w, naturalHeight: h } = img;
  if (Math.max(w, h) > MAX_LADO_PX) {
    const factor = MAX_LADO_PX / Math.max(w, h);
    w = Math.round(w * factor); h = Math.round(h * factor);
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // fondo blanco por si el PNG/WEBP tenia transparencia
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function esImagen(file) {
  return (file.type || '').startsWith('image/');
}

// Arma un PDF de una pagina por imagen (tamano carta, imagen centrada con margen,
// orientacion vertical u horizontal segun convenga a cada foto) y regresa un File
// PDF listo para subir. `nombreBase` se usa para el nombre del archivo resultante.
export async function convertirImagenesAPdf(imagenes, nombreBase) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
  const margen = 36;
  for (let i = 0; i < imagenes.length; i++) {
    const img = await cargarImagen(imagenes[i]);
    const dataUrl = imagenADataUrlJpeg(img);
    const esHorizontal = img.naturalWidth > img.naturalHeight;
    if (i > 0) doc.addPage('letter', esHorizontal ? 'landscape' : 'portrait');
    else if (esHorizontal) { doc.deletePage(1); doc.addPage('letter', 'landscape'); }
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const maxW = pageW - margen * 2;
    const maxH = pageH - margen * 2;
    const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
    const w = img.naturalWidth * ratio;
    const h = img.naturalHeight * ratio;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    doc.addImage(dataUrl, 'JPEG', x, y, w, h);
    URL.revokeObjectURL(img.src);
  }
  const blob = doc.output('blob');
  return new File([blob], `${nombreBase || 'recibo'}.pdf`, { type: 'application/pdf' });
}

// Prepara la lista final de archivos a subir: los PDF que ya eran PDF se quedan
// igual; todas las fotos juntas se convierten en UN solo PDF combinado (no uno por
// foto) para que "trabajar mejor" signifique de verdad menos archivos, no los mismos
// con otra extension.
export async function prepararArchivosParaSubir(files, nombreBase) {
  const pdfs = files.filter(f => (f.type || '') === 'application/pdf');
  const imagenes = files.filter(esImagen);
  const otros = files.filter(f => !esImagen(f) && (f.type || '') !== 'application/pdf');
  const resultado = [...pdfs, ...otros];
  if (imagenes.length) {
    resultado.push(await convertirImagenesAPdf(imagenes, nombreBase));
  }
  return resultado;
}
