// Componentes de PDF reutilizables -- equivalente JS de app/pdf_components.py, mismos
// colores/medidas/paleta (cfe-presupuestos/style.md). jsPDF se configura en PUNTOS
// (unit: 'pt') para que las medidas (MARGIN_L=40, etc.) sean las MISMAS que en
// reportlab, sin conversion.
//
// Diferencia clave de arquitectura frente a reportlab/Platypus: reportlab tiene un
// motor de "flowables" que acomoda contenido automaticamente y salta de pagina solo.
// jsPDF no tiene eso -- es un lienzo de bajo nivel. Como cada pagina de la cotizacion
// de Python ya esta disenada a proposito para caber en UNA sola pagina (ver
// comentarios en propuesta.py sobre "recortar para que quepa"), aqui se usa un cursor Y
// manual: cada funcion de componente recibe (doc, y) y regresa el nuevo y despues de
// dibujar, en vez de un sistema de flujo automatico. jsPDF usa Y creciendo hacia abajo
// (origen arriba-izquierda); reportlab usa Y creciendo hacia arriba -- las formulas de
// las graficas se reescribieron con esa convencion, no se portaron linea por linea.

export const NAVY = '#163b4c';
export const GOLD = '#c8a654';
export const GREY = '#5e737c';
export const CREAM = '#fff4da';
export const CARDBG = '#edf5f5';
export const LINE = '#d7e2e6';
export const TEAL = '#21798b';
export const WHITE = '#ffffff';
export const BLACK = '#000000';

export const PAGE_W = 595.28, PAGE_H = 841.89; // A4 en puntos
export const MARGIN_L = 40, MARGIN_R = 40, MARGIN_T = 70, MARGIN_B = 40;
export const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
// OJO: a diferencia de reportlab (Y=0 abajo, crece hacia arriba), jsPDF tiene Y=0
// ARRIBA y crece hacia ABAJO -- por eso el contenido empieza en un y PEQUEÑO (justo
// debajo del encabezado) y el pie de pagina esta en un y GRANDE (cerca de PAGE_H).
export const CONTENT_TOP = MARGIN_T; // y donde arranca el contenido de cada pagina
export const CONTENT_BOTTOM = PAGE_H - MARGIN_B;

export function crearDoc() {
  const { jsPDF } = window.jspdf;
  return new jsPDF({ unit: 'pt', format: 'a4', compress: true });
}

function setFont(doc, size, bold = false, color = BLACK) {
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  doc.setTextColor(color);
}

// Envuelve texto a `width` puntos y lo dibuja desde `y`, regresando el nuevo y.
function dibujarParrafo(doc, text, x, y, width, { size = 10, bold = false, color = BLACK,
                          leading = size * 1.35, spaceAfter = 6, align = 'left' } = {}) {
  setFont(doc, size, bold, color);
  const lineas = doc.splitTextToSize(String(text), width);
  for (const linea of lineas) {
    doc.text(linea, align === 'right' ? x + width : x, y, { align });
    y += leading;
  }
  return y + spaceAfter - leading + leading; // y ya quedo al final de la ultima linea + leading; spaceAfter se suma aparte
}

export function headX(doc, y, text) {
  return dibujarParrafo(doc, text, MARGIN_L, y + 18, CONTENT_W, { size: 18, bold: true, color: NAVY, leading: 22, spaceAfter: 10 });
}

export function subX(doc, y, text) {
  return dibujarParrafo(doc, text, MARGIN_L, y + 11.5, CONTENT_W, { size: 11.5, bold: true, color: NAVY, leading: 15, spaceAfter: 8 });
}

export function bodyX(doc, y, text, width = CONTENT_W, x = MARGIN_L) {
  return dibujarParrafo(doc, text, x, y + 10, width, { size: 10, bold: false, color: BLACK, leading: 13.5, spaceAfter: 6 });
}

export function spacer(y, h) {
  return y + h;
}

// --- Pagina/titular (equivalente a _page() en propuesta.py) ---
export function encabezadoPagina(doc, y, titulo, titular) {
  y = headX(doc, y, titulo);
  y = subX(doc, y, titular);
  return y;
}

// --- Tarjetas de metricas (cards_row) ---
export function cardsRow(doc, y, items) {
  const colW = CONTENT_W / 3;
  const cardW = colW - 10;
  const h = 56;
  items.forEach(([valor, etiqueta], i) => {
    const x = MARGIN_L + i * colW;
    doc.setFillColor(CARDBG);
    doc.rect(x, y, cardW, h, 'F');
    setFont(doc, 16, true, NAVY);
    doc.text(doc.splitTextToSize(String(valor), cardW - 20), x + 10, y + 24);
    setFont(doc, 8.5, false, GREY);
    doc.text(doc.splitTextToSize(String(etiqueta), cardW - 20), x + 10, y + 40);
  });
  return y + h;
}

// --- Aviso (notice) ---
export function notice(doc, y, text) {
  setFont(doc, 9.5, false, BLACK);
  const lineas = doc.splitTextToSize(String(text), CONTENT_W - 20);
  const h = lineas.length * 13 + 20;
  doc.setFillColor(CREAM);
  doc.rect(MARGIN_L, y, CONTENT_W, h, 'F');
  let ly = y + 10 + 9.5;
  for (const linea of lineas) {
    doc.text(linea, MARGIN_L + 10, ly);
    ly += 13;
  }
  return y + h;
}

// --- Tabla (table) ---
// headers: array de strings. rows: array de arrays (cada celda se castea a string).
// widths: array de anchos en puntos (si no se da, columnas iguales).
export function table(doc, y, headers, rows, { widths = null, small = false } = {}) {
  const colW = widths || headers.map(() => CONTENT_W / headers.length);
  const sizeH = small ? 8 : 9, sizeB = small ? 8 : 9;
  const padX = 6, padY = 5;
  const lineH = (small ? 10 : 11.5) + padY * 2;

  // encabezado
  doc.setFillColor(NAVY);
  doc.rect(MARGIN_L, y, CONTENT_W, lineH, 'F');
  setFont(doc, sizeH, true, WHITE);
  let x = MARGIN_L;
  headers.forEach((h, i) => {
    doc.text(String(h), x + padX, y + lineH / 2 + sizeH / 2 - 1);
    x += colW[i];
  });
  y += lineH;

  // filas (cada celda puede envolver a varias lineas; la fila usa la altura de la celda mas alta)
  setFont(doc, sizeB, false, BLACK);
  for (const fila of rows) {
    const celdasLineas = fila.map((c, i) => doc.splitTextToSize(String(c), colW[i] - padX * 2));
    const nLineas = Math.max(...celdasLineas.map(l => l.length), 1);
    const alturaFila = nLineas * (small ? 10 : 11.5) + padY * 2;
    x = MARGIN_L;
    fila.forEach((c, i) => {
      const alinDer = i > 0;
      setFont(doc, sizeB, false, BLACK);
      celdasLineas[i].forEach((linea, li) => {
        const ly = y + padY + (small ? 8 : 9) + li * (small ? 10 : 11.5);
        if (alinDer) doc.text(linea, x + colW[i] - padX, ly, { align: 'right' });
        else doc.text(linea, x + padX, ly);
      });
      x += colW[i];
    });
    doc.setDrawColor(LINE);
    doc.setLineWidth(0.5);
    doc.line(MARGIN_L, y + alturaFila, MARGIN_L + CONTENT_W, y + alturaFila);
    y += alturaFila;
  }
  return y;
}

// --- Grafica de linea (curve) -- saldo acumulado a 25 anios, con el punto de recuperacion ---
export function curve(doc, y0, points, { width = CONTENT_W, height = 150, recuperacionAnios = null } = {}) {
  const padL = 55, padR = 15, padT = 10, padB = 35;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys, 0), yMax = Math.max(...ys, 0);
  const yRange = (yMax - yMin) || 1, xRange = (xMax - xMin) || 1;
  const px = (x) => MARGIN_L + padL + (x - xMin) / xRange * plotW;
  // jsPDF: y crece hacia abajo: "arriba" del plot es y0+padT, "abajo" (valor minimo) es y0+padT+plotH
  const py = (v) => y0 + padT + plotH - (v - yMin) / yRange * plotH;

  if (recuperacionAnios) {
    doc.setFillColor(CREAM);
    doc.rect(MARGIN_L + padL, y0 + padT, px(recuperacionAnios) - (MARGIN_L + padL), plotH, 'F');
  }
  doc.setDrawColor(GREY);
  doc.setLineWidth(0.75);
  doc.line(MARGIN_L + padL, py(0), MARGIN_L + padL + plotW, py(0));
  setFont(doc, 7, false, GREY);
  doc.text('$0', MARGIN_L + padL - 6, py(0) + 2, { align: 'right' });
  doc.text(`$${yMax.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, MARGIN_L + padL - 6, y0 + padT + 4, { align: 'right' });
  if (yMin < 0) {
    doc.text(`$${yMin.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, MARGIN_L + padL - 6, y0 + padT + plotH, { align: 'right' });
  }
  for (const [x] of points) {
    doc.text(String(Math.trunc(x)), px(x), y0 + padT + plotH + 14, { align: 'center' });
  }
  doc.setDrawColor(TEAL);
  doc.setLineWidth(1.8);
  for (let i = 0; i < points.length - 1; i++) {
    doc.line(px(points[i][0]), py(points[i][1]), px(points[i + 1][0]), py(points[i + 1][1]));
  }
  if (recuperacionAnios !== null && recuperacionAnios >= xMin && recuperacionAnios <= xMax) {
    const xr = px(recuperacionAnios);
    doc.setDrawColor(GOLD);
    doc.setLineWidth(1.2);
    doc.setLineDashPattern([3, 2], 0);
    doc.line(xr, y0 + padT, xr, y0 + padT + plotH);
    doc.setLineDashPattern([], 0);
    setFont(doc, 8, true, NAVY);
    const etiqueta = `Recuperas la inversión: ${recuperacionAnios.toFixed(1)} años`;
    doc.text(etiqueta, xr, y0, { align: xr < width - 90 ? 'center' : 'right' });
  }
  return y0 + height;
}

// --- Barras agrupadas (2 series por categoria) ---
export function groupedBarChart(doc, y0, categories, serie1Label, serie1Values, serie2Label, serie2Values,
                                 { width = CONTENT_W, height = 170 } = {}) {
  const padL = 10, padR = 10, padT = 18, padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const n = categories.length;
  const groupW = plotW / n;
  const barW = groupW * 0.32;
  const maxV = Math.max(...serie1Values, ...serie2Values) || 1;

  setFont(doc, 9, false, NAVY);
  doc.setFillColor(NAVY);
  doc.rect(MARGIN_L + padL, y0 + 4, 8, 8, 'F');
  doc.text(serie1Label, MARGIN_L + padL + 12, y0 + 11);
  doc.setFillColor(TEAL);
  doc.rect(MARGIN_L + padL + 110, y0 + 4, 8, 8, 'F');
  doc.text(serie2Label, MARGIN_L + padL + 122, y0 + 11);

  const baseY = y0 + padT + plotH;
  categories.forEach((cat, i) => {
    const x0 = MARGIN_L + padL + i * groupW;
    const h1 = serie1Values[i] / maxV * plotH;
    const h2 = serie2Values[i] / maxV * plotH;
    doc.setFillColor(NAVY);
    doc.rect(x0 + groupW * 0.14, baseY - h1, barW, h1, 'F');
    doc.setFillColor(TEAL);
    doc.rect(x0 + groupW * 0.14 + barW + 2, baseY - h2, barW, h2, 'F');
    setFont(doc, 6.8, false, GREY);
    doc.text(String(cat), x0 + groupW / 2, baseY + 10, { align: 'center' });
  });
  doc.setDrawColor(GREY);
  doc.setLineWidth(0.75);
  doc.line(MARGIN_L + padL, baseY, MARGIN_L + padL + plotW, baseY);
  return y0 + height;
}

// --- Barras horizontales (presupuesto por categoria, comparativos) ---
export function horizontalBarChart(doc, y0, items, { width = CONTENT_W, barHeight = 16, gap = 8,
                                    valueFmt = (v) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}` } = {}) {
  const height = items.length * (barHeight + gap) + gap;
  const labelW = 185;
  const plotW = width - labelW - 70;
  const maxV = Math.max(...items.map(([, v]) => v)) || 1;
  let y = y0 + gap;
  for (const [label, value, color] of items) {
    let texto = String(label);
    if (texto.length > 36) texto = texto.slice(0, 33).trimEnd() + '...';
    setFont(doc, 8, false, NAVY);
    doc.text(texto, MARGIN_L + labelW - 8, y + barHeight / 2 + 3, { align: 'right' });
    const w = Math.max(value / maxV * plotW, 2);
    doc.setFillColor(color);
    doc.rect(MARGIN_L + labelW, y, w, barHeight, 'F');
    setFont(doc, 8, false, NAVY);
    doc.text(valueFmt(value), MARGIN_L + labelW + w + 6, y + barHeight / 2 + 3);
    y += barHeight + gap;
  }
  return y0 + height;
}

// --- Medidor de porcentaje (gauge) ---
export function gauge(doc, y0, pct, { width = CONTENT_W, label = '' } = {}) {
  const barH = 18;
  doc.setFillColor(CARDBG);
  doc.setDrawColor(LINE);
  doc.setLineWidth(0.75);
  doc.rect(MARGIN_L, y0, width, barH, 'FD');
  const w = Math.max(Math.min(pct, 1.0) * width, 2);
  doc.setFillColor(TEAL);
  doc.rect(MARGIN_L, y0, w, barH, 'F');
  setFont(doc, 8.5, false, NAVY);
  doc.text(`${(100 * pct).toFixed(1)}% del recibo`, MARGIN_L + Math.min(w + 6, width - 60), y0 + barH / 2 + 3);
  setFont(doc, 7, false, GREY);
  doc.text('0%', MARGIN_L, y0 + barH + 12);
  doc.text('100%', MARGIN_L + width, y0 + barH + 12, { align: 'right' });
  void label;
  return y0 + barH + 20;
}

// --- Ensamblado final: header/footer + paginas ---
// paginas: array de funciones (doc) => void, cada una dibuja el contenido de UNA
// pagina empezando en y = CONTENT_TOP (el encabezadoPagina ya lo hace). buildPdf se
// encarga de addPage() entre paginas y de dibujar header/footer + numero de pagina en
// cada una.
export function buildPdf(titulo, subtitulo, aviso, paginas) {
  const doc = crearDoc();
  paginas.forEach((dibujarPagina, i) => {
    if (i > 0) doc.addPage();
    dibujarPagina(doc);
    dibujarHeaderFooter(doc, titulo, subtitulo, aviso, i + 1, paginas.length);
  });
  return doc;
}

// Hallazgo 5, auditoria 2026-11-06: el encabezado repetido en cada pagina se dibujaba
// con doc.text() directo, sin splitTextToSize ni verificacion de ancho -- un nombre o
// razon social largo (comun en dependencias de gobierno) se cortaba a media palabra
// contra el borde derecho de la hoja, en las 22 paginas. El cuerpo de las paginas SI
// envuelve bien (headX/subX/notice/table ya usan splitTextToSize) -- el problema era
// solo este encabezado de una sola linea. No se envuelve a 2 lineas porque el titulo y
// el subtitulo estan a solo 12pt de distancia (34 y 46) -- envolver chocaria con la
// linea de abajo. Se trunca con "…" en vez de cortar a media palabra.
function textoAcotado(doc, texto, maxWidth) {
  const cadena = String(texto);
  if (doc.getTextWidth(cadena) <= maxWidth) return cadena;
  let acotado = cadena;
  while (acotado.length > 1 && doc.getTextWidth(acotado + '…') > maxWidth) {
    acotado = acotado.slice(0, -1);
  }
  return acotado + '…';
}

// Pedido explicito del usuario, 2026-11-09: sin pie de pagina (ni el aviso ni el
// numero de pagina "N / total") en ningun PDF -- se quita, se deja solo el
// encabezado (titulo/subtitulo/linea dorada) de cada pagina. `aviso`/`pagina`/
// `totalPaginas` se mantienen como parametros (varios call-sites los siguen pasando)
// para no tener que tocar cada generador de PDF, pero ya no se dibujan.
export function dibujarHeaderFooter(doc, titulo, subtitulo, aviso, pagina, totalPaginas) {
  void aviso; void pagina; void totalPaginas;
  setFont(doc, 10.5, true, NAVY);
  doc.text(textoAcotado(doc, titulo, CONTENT_W), MARGIN_L, 34);
  setFont(doc, 7.8, false, GREY);
  doc.text(textoAcotado(doc, subtitulo, CONTENT_W), MARGIN_L, 46);
  doc.setDrawColor(GOLD);
  doc.setLineWidth(1.5);
  doc.line(MARGIN_L, 54, PAGE_W - MARGIN_R, 54);
}
