// Exportar la cotizacion a Excel (.xlsx) -- pedido explicito del usuario, 2026-11-11:
// primero "un boton para descargar la cotizacion no solo en pdf tambien en excel",
// despues "en una sola hoja casi que se imprima como el PDF", y finalmente "no le
// puedes dar formato al Excel como la cotizacion de PDF" -- por eso este archivo usa
// ExcelJS (lib/exceljs.min.js), no SheetJS/xlsx (se probo primero: la version libre de
// SheetJS NO escribe estilos de celda al .xlsx -- es una funcion de pago de esa
// libreria). ExcelJS es gratuita y SI escribe fuente/color/relleno/bordes reales.
//
// Lee directo el DOM ya renderizado (#contenedorSecciones), igual que
// generarPdfCompletaDesdeVista() en propuesta.js -- asi respeta automaticamente el
// paso de entrega activo, las secciones/graficos/tablas apagados, y las columnas/filas
// ocultas de cada tabla, sin necesitar una segunda fuente de datos que se pueda
// desincronizar del PDF.
//
// REESCRITO 2026-11-19 (primera pasada) -- bug real reportado por el usuario: "los
// excel solo traen tablas no traen textos ni otra informacion, parece incompleto".
// Causa: la version anterior solo barria `.tabla-wrap > table` de cada seccion e
// ignoraba todo lo demas (titulo, "pregunta", avisos, parrafos, tarjetas, graficas).
// Se agrego un recorrido del DOM con la MISMA logica de inclusion/exclusion que el PDF
// generico (propuestaDom.js).
//
// REESCRITO 2026-11-19 (segunda pasada, mismo dia) -- encargo "Excel clon del PDF":
// que el Excel sea un clon fiel del PDF -- misma pagina A4 vertical, mismos margenes,
// las tablas con las MISMAS proporciones de columna que calcula el PDF real
// (anchosProporcionales(), ahora exportada de propuestaDom.js en vez de reinventar
// anchos aqui), saltos de pagina simulados con la MISMA altura por linea que usa
// jsPDF (se mide con un documento jsPDF real, nunca creado para mostrarse, solo para
// `splitTextToSize()`), celdas de importe/porcentaje/cantidad como NUMEROS reales
// (usables en SUM/promedios), y los anexos de documentos (recibo/verificacion) al
// final, con sus imagenes reales incrustadas -- mismos datos que ya prepara
// prepararDocumentosAdjuntosParaPdf() en app.js para el PDF (r._archivosReciboImgs/
// _archivosVerificacionImgs), ahora tambien llamada antes de generar el Excel.
//
// Decision de alcance explicita (el encargo pedia "graficas: incrustalas como imagen
// PNG"): el PDF REAL (propuestaDom.js, dibujarGraficaComoTabla) NUNCA dibuja las
// graficas de barras/gauge como imagen -- las convierte en una tabla chica de
// etiquetas/valores, justamente porque capturar esta UI (divs con CSS, no canvas) como
// imagen ya se intento en este proyecto y no funciono de forma confiable (ver
// ESTADO.md, html2canvas). Agregar imagenes de grafica aqui que el PDF NO tiene haria
// al Excel MENOS fiel al PDF, no mas -- se mantiene la misma tabla-resumen que ya usa
// el PDF, para que ambos digan exactamente lo mismo. Las imagenes REALES que si existen
// en el PDF (los documentos adjuntos) si se incrustan.
import { seccionesActivasEnOrden } from './secciones.js';
import { resumenInmueble } from './propuesta.js';
import { anchosProporcionales, CLASES_OMITIR } from './propuestaDom.js';
import { CONTENT_W, CONTENT_TOP, CONTENT_BOTTOM, MARGIN_L, MARGIN_R, MARGIN_T, MARGIN_B, crearDoc } from './pdfComponents.js';

// CLASES_OMITIR: importada de propuestaDom.js (controles del propio editor, contenido
// apagado, graficas alternativas no-primarias) -- un nodo con cualquiera de estas
// clases (o cualquier <button>) nunca se exporta, ni el ni sus hijos. Antes era una
// copia local que se desalineo de la de propuestaDom.js (ver nota ahi, Parte 3 del
// encargo "Arreglar la conclusión vieja...", 2026-11-20) -- una sola fuente.
const CLASES_CELDA_EXCLUIR = ['col-oculta-tabla', 'fila-oculta-tabla', 'th-accion-tabla', 'td-accion-tabla', 'badge-num-editable', 'nota-texto-global', 'nota-texto-oculto'];

// Mismos colores de marca que el PDF/la pantalla.
const COLOR_NAVY = 'FF163B4C';
const COLOR_GOLD_TINT = 'FFF3E7CE';
const COLOR_TEAL_TINT = 'FFE4F0F2';
const COLOR_GREY_TEXT = 'FF5B6B74';
const COLOR_BLANCO = 'FFFFFFFF';
const COLOR_BORDE = 'FFCBD5DC';
const BORDE_FINO = { style: 'thin', color: { argb: COLOR_BORDE } };

// Rejilla de 20 columnas iguales sobre el ancho util de la pagina (punto 2 del
// encargo) -- cada tabla ocupa tramos de esta rejilla proporcionales a sus anchos
// reales (ver spansDeAnchos). El ancho de columna en "unidades de caracter" de Excel
// es aproximado: 1 unidad ~ 7px ~ 5.25pt a 96dpi con la fuente default -- se reparte el
// mismo CONTENT_W del PDF entre las 20 columnas con esa equivalencia, no una constante
// inventada aparte.
const GRID_COLS = 20;
const ANCHO_COLUMNA_GRID = (CONTENT_W / 5.25) / GRID_COLS;

function esVisible(nodo) {
  if (nodo.nodeType !== 1) return false;
  if (nodo.tagName === 'BUTTON') return false;
  if (nodo.classList && CLASES_OMITIR.some((c) => nodo.classList.contains(c))) return false;
  return true;
}

function textoSinIconos(nodo) {
  if (!nodo) return '';
  const clon = nodo.cloneNode(true);
  clon.querySelectorAll('button').forEach((b) => b.remove());
  clon.querySelectorAll('.badge-num-editable, .nota-texto-global, .nota-texto-oculto').forEach((el) => el.remove());
  return clon.textContent.replace(/\s+/g, ' ').trim();
}

function etiquetaDeTabla(tabla, wrap) {
  const toggleLabel = wrap?.closest('.grafico-togglable')?.querySelector('.toggle-grafico');
  if (toggleLabel) {
    const texto = toggleLabel.textContent.replace(/^\s*Mostrar:\s*/, '').trim();
    if (texto) return texto;
  }
  const seccion = tabla.closest('.seccion');
  const h2 = seccion?.querySelector('h2');
  return h2 ? h2.textContent.trim() : 'Tabla';
}

function limpiarParaExcel(tabla) {
  const clon = tabla.cloneNode(true);
  clon.querySelectorAll('button').forEach((b) => b.remove());
  CLASES_CELDA_EXCLUIR.forEach((cls) => {
    clon.querySelectorAll('.' + cls).forEach((el) => el.remove());
  });
  clon.querySelectorAll('tr').forEach((tr) => {
    if (!tr.querySelector('th,td')) tr.remove();
  });
  return clon;
}

function filasDeTabla(clon) {
  return [...clon.querySelectorAll('tr')]
    .map((tr) => [...tr.querySelectorAll('th,td')].map((c) => c.textContent.trim()))
    .filter((fila) => fila.length);
}

// ---------- Construccion de la lista de bloques (igual orden que pantalla/PDF) ----------
// Cada entrada es {tipo, texto} para texto suelto, o {tipo:'tabla', etiqueta, headers,
// filas} para una tabla completa (headers+filas juntos, para poder calcular sus anchos
// proporcionales UNA sola vez con anchosProporcionales(), igual que hace el PDF).

function agregarTabla(tabla, bloques) {
  const wrap = tabla.closest('.tabla-wrap');
  const filasTabla = filasDeTabla(limpiarParaExcel(tabla));
  if (!filasTabla.length) return;
  const [headers, ...filas] = filasTabla;
  if (!filas.length) return;
  bloques.push({ tipo: 'tabla', etiqueta: etiquetaDeTabla(tabla, wrap), headers, filas });
}

function agregarTarjetas(cont, bloques) {
  const metricas = Array.from(cont.querySelectorAll(':scope > .metrica'));
  if (!metricas.length) return;
  const filas = metricas
    .map((m) => [textoSinIconos(m.querySelector('.etiqueta')), textoSinIconos(m.querySelector('.valor'))])
    .filter(([e, v]) => e || v);
  if (!filas.length) return;
  bloques.push({ tipo: 'tabla', etiqueta: 'Indicadores', headers: ['Indicador', 'Valor'], filas });
}

// Graficas (barra horizontal/agrupada/gauge/curva) -- se exportan como la misma tabla
// chica de etiquetas/valores que ya usa el PDF real (dibujarGraficaComoTabla en
// propuestaDom.js) -- ver nota de alcance al inicio del archivo sobre por que no se
// incrustan como imagen.
function agregarGraficaComoTabla(cont, bloques) {
  let filas = [];
  let headers = ['Dato', 'Valor'];
  if (cont.classList.contains('grafica-h')) {
    filas = Array.from(cont.querySelectorAll('.grafica-h-fila')).map((f) => [
      textoSinIconos(f.querySelector('.grafica-h-etq')),
      textoSinIconos(f.querySelector('.grafica-h-val')),
    ]);
  } else if (cont.classList.contains('grafica-agrupada')) {
    const leyenda = Array.from(cont.querySelectorAll('.grafica-leyenda > *')).map((n) => textoSinIconos(n)).filter(Boolean);
    const [s1 = 'Serie 1', s2 = 'Serie 2'] = leyenda;
    headers = ['Categoría', s1, s2];
    filas = Array.from(cont.querySelectorAll('.grafica-agrupada-grupo')).map((g) => {
      const cat = textoSinIconos(g.querySelector('.grafica-agrupada-etq'));
      const [b1, b2] = g.querySelectorAll('.grafica-agrupada-barra-1, .grafica-agrupada-barra-2');
      return [cat, b1?.title.split(':').slice(1).join(':').trim() || '', b2?.title.split(':').slice(1).join(':').trim() || ''];
    });
  } else if (cont.classList.contains('grafica-gauge')) {
    const label = textoSinIconos(cont.querySelector('.grafica-gauge-label'));
    const valor = textoSinIconos(cont.querySelector('.grafica-gauge-ejes strong'));
    filas = [[label || 'Avance', valor]];
  } else if (cont.classList.contains('grafica-curva')) {
    filas = Array.from(cont.querySelectorAll('svg text')).map((t) => t.textContent.trim()).filter(Boolean).map((t) => [t, '']);
  }
  filas = filas.filter((f) => f.some((v) => v));
  if (!filas.length) return;
  bloques.push({ tipo: 'tabla', etiqueta: 'Gráfica (resumen de datos)', headers, filas });
}

function agregarTexto(nodo, bloques) {
  const texto = textoSinIconos(nodo);
  if (!texto) return;
  const tag = nodo.tagName;
  const cls = nodo.className || '';
  // El titulo de la seccion (h2.titulo-seccion-grande) ya se agrega como banner
  // 'seccion' por el llamador antes de recorrer el cuerpo -- evitar duplicarlo aqui.
  if (tag === 'H2' && cls.includes('titulo-seccion-grande')) return;
  if (tag === 'H3' || tag === 'H4' || tag === 'H5') { bloques.push({ tipo: 'subtitulo', texto }); return; }
  if (cls.includes('seccion-pregunta')) { bloques.push({ tipo: 'pregunta', texto }); return; }
  if (cls.includes('aviso')) { bloques.push({ tipo: 'aviso', texto }); return; } // aviso-cream / "nota aviso"
  bloques.push({ tipo: 'texto', texto });
}

// Recorre el DOM de una seccion en el MISMO orden visual que la pantalla/el PDF --
// misma estructura de decision que recorrer() en propuestaDom.js.
function recorrerParaExcel(nodo, bloques) {
  for (const hijo of Array.from(nodo.children)) {
    if (!esVisible(hijo)) continue;
    const cls = hijo.className || '';
    if (cls.includes('texto-editable') || cls.includes('texto-editable-chico')) {
      agregarTexto(hijo, bloques);
    } else if (hijo.tagName === 'TABLE') {
      agregarTabla(hijo, bloques);
    } else if (cls.includes('tarjetas-metricas')) {
      agregarTarjetas(hijo, bloques);
    } else if (cls.includes('grafica') && (hijo.classList.contains('grafica-h') || hijo.classList.contains('grafica-agrupada') || hijo.classList.contains('grafica-gauge') || hijo.classList.contains('grafica-curva'))) {
      agregarGraficaComoTabla(hijo, bloques);
    } else if (cls.includes('documento-adjunto') && !cls.includes('documento-adjunto-pdf')) {
      // Las imagenes reales de documentos adjuntos van en el anexo final (mismos datos
      // que usa el PDF, r._archivosReciboImgs/_archivosVerificacionImgs) -- aqui solo
      // se evita perder la referencia en silencio dentro del cuerpo de la seccion.
      bloques.push({ tipo: 'texto', texto: '📎 Documento adjunto -- ver el anexo al final de este Excel.' });
    } else if (hijo.tagName === 'IMG') {
      bloques.push({ tipo: 'texto', texto: '🖼️ Imagen (ver el PDF de la cotización).' });
    } else if (hijo.tagName === 'DETAILS') {
      for (const nieto of Array.from(hijo.children)) {
        if (nieto.tagName === 'SUMMARY') continue;
        recorrerParaExcel(nieto, bloques);
      }
    } else if (!hijo.children.length && hijo.textContent.trim()) {
      agregarTexto(hijo, bloques);
    } else {
      recorrerParaExcel(hijo, bloques);
    }
  }
}

// Construye la lista COMPLETA de secciones a exportar, cada una con su banner y sus
// bloques, en el mismo orden que ordenSeccionesEfectivo(). Las secciones 17/18
// (documentos adjuntos) se EXCLUYEN de este recorrido general a proposito -- el PDF
// real tampoco las dibuja genericamente (usa paginaDocumentoRecibo/Verificacion con
// las imagenes YA descargadas, ver propuesta.js) -- se exportan aparte, al final, como
// anexo con sus imagenes reales (construirAnexoDocumentos).
function construirSeccionesParaExcel(r) {
  const cont = document.getElementById('contenedorSecciones');
  if (!cont) throw new Error('No hay estudio calculada todavía.');
  const activos = new Set(seccionesActivasEnOrden(r));
  const secciones = [];
  cont.querySelectorAll('.seccion').forEach((seccionEl) => {
    const numero = Number((seccionEl.id || '').replace('seccion-', ''));
    if (!activos.has(numero) || numero === 17 || numero === 18) return;
    const bloques = [];
    recorrerParaExcel(seccionEl, bloques);
    if (!bloques.length) return;
    const h2 = seccionEl.querySelector('h2');
    secciones.push({ numero, titulo: (h2 ? textoSinIconos(h2) : '').toUpperCase(), bloques });
  });
  if (!secciones.length) throw new Error('No se encontró contenido visible para exportar (revisa que no esté todo apagado).');
  return secciones;
}

// ---------- Medidor de texto compartido con el PDF ----------
// Un documento jsPDF real (crearDoc(), el MISMO constructor que usa el PDF), creado
// solo para medir -- splitTextToSize()/setFont()/setFontSize() no dibujan nada, nunca
// se llama .save()/.output() sobre el. Asi el ajuste de linea (y por lo tanto la
// altura de cada fila y donde cae cada salto de pagina) usa la MISMA metrica de fuente
// que el PDF real, no un conteo de caracteres aproximado.
function medirLineas(medidor, texto, anchoPt, tamano) {
  medidor.setFont('helvetica', 'normal');
  medidor.setFontSize(tamano);
  return medidor.splitTextToSize(String(texto == null ? '' : texto), Math.max(anchoPt, 10));
}

// Alturas de texto suelto -- MISMAS constantes (tamaño/interlineado/margen) que
// dibujarTexto() en propuestaDom.js y bodyX/subX/notice en pdfComponents.js.
const FORMATO_TEXTO = {
  seccion: { size: 14, ancho: CONTENT_W, lineH: 18, extra: 4 },
  subtitulo: { size: 11.5, ancho: CONTENT_W, lineH: 15, extra: 8 },
  pregunta: { size: 9.5, ancho: CONTENT_W, lineH: 12, extra: 4 },
  texto: { size: 10, ancho: CONTENT_W, lineH: 13.5, extra: 6 },
  aviso: { size: 9.5, ancho: CONTENT_W - 20, lineH: 13, extra: 20 },
};
function alturaDeTexto(medidor, tipo, texto) {
  const f = FORMATO_TEXTO[tipo];
  const n = medirLineas(medidor, texto, f.ancho, f.size).length;
  return n * f.lineH + f.extra;
}
// Alturas de fila de tabla -- MISMAS constantes que dibujarTablaPaginada() en
// propuestaDom.js con small=true (lo que usa SIEMPRE el PDF real para tablas
// genericas leidas del DOM): tamaño de fuente 8, interlineado 10, relleno 10.
const TABLA_LINEH = 10, TABLA_PADY2 = 10, TABLA_SIZE = 8;
function alturaFilaTabla(medidor, valores, anchosPt) {
  const n = Math.max(...valores.map((v, i) => medirLineas(medidor, v, anchosPt[i], TABLA_SIZE).length), 1);
  return n * TABLA_LINEH + TABLA_PADY2;
}

// Reparte `anchosPt` (los MISMOS puntos que calcula anchosProporcionales(), igual que
// el PDF real) en tramos de la rejilla de 20 columnas -- redondeo normal, y el
// sobrante/faltante de redondear se ajusta en la columna mas grande para que la suma
// sea EXACTO 20 siempre (nunca una columna de 0, nunca una tabla que no llene la
// rejilla completa).
function spansDeAnchos(anchosPt) {
  const total = anchosPt.reduce((a, b) => a + b, 0) || anchosPt.length;
  const spans = anchosPt.map((a) => Math.max(1, Math.round((a / total) * GRID_COLS)));
  let diff = GRID_COLS - spans.reduce((a, b) => a + b, 0);
  while (diff !== 0) {
    let idx = 0;
    for (let i = 1; i < spans.length; i++) if (spans[i] > spans[idx]) idx = i;
    if (diff > 0) { spans[idx]++; diff--; } else if (spans[idx] > 1) { spans[idx]--; diff++; } else break;
  }
  return spans;
}
function iniciosDeColumna(spans) {
  const inicios = [1];
  for (let i = 0; i < spans.length - 1; i++) inicios.push(inicios[i] + spans[i]);
  return inicios;
}

// Detecta si el texto de una celda es un importe/porcentaje/cantidad con el MISMO
// formato que usa M()/PCT() en util.js -- si lo es, regresa el numero real + el
// numFmt visual correcto, para escribirlo como celda NUMERICA de verdad (punto 5 del
// encargo: "el clon debe seguir siendo una hoja de calculo usable -- sumas y
// promedios deben funcionar"). Celdas compuestas ("$8,776.54 (80.0%)", dos numeros en
// un mismo texto, ver filaAhorroConcepto() en secciones.js) se quedan como texto -- no
// hay una sola celda numerica que represente ambos numeros sin perder informacion.
function valorNumericoDeCelda(texto) {
  const t = String(texto).trim();
  let m = t.match(/^\(?(-|−)?\$([\d,]+\.\d{2})\)?$/);
  if (m) {
    const v = parseFloat(m[2].replace(/,/g, ''));
    return { valor: (m[1] || /^\(/.test(t)) ? -v : v, numFmt: '$#,##0.00;($#,##0.00)' };
  }
  m = t.match(/^(-|−)?(\d+(?:\.\d+)?)%$/);
  if (m) {
    const v = parseFloat(m[2]) / 100;
    return { valor: m[1] ? -v : v, numFmt: '0.0%' };
  }
  m = t.match(/^(-|−)?([\d,]+)$/);
  if (m && /\d/.test(t)) {
    const v = parseFloat(m[2].replace(/,/g, ''));
    return { valor: m[1] ? -v : v, numFmt: '#,##0' };
  }
  return null;
}

export function generarExcelCotizacion(r) {
  const secciones = construirSeccionesParaExcel(r);
  const medidor = crearDoc();
  const wb = new ExcelJS.Workbook();
  // Punto 1 del encargo: misma pagina (A4 vertical) y mismos margenes que el PDF
  // (pdfComponents.js), convertidos de puntos a pulgadas (unidad que usa ExcelJS para
  // pageSetup.margins) -- 72pt = 1 pulgada. fitToWidth:1/fitToHeight:0 -- la vista
  // previa de impresion escala el ANCHO a una sola pagina (igual que el PDF, que
  // nunca es mas ancho que una hoja) sin forzar a comprimir el ALTO (el PDF real
  // tampoco lo hace -- usa tantas paginas de alto como haga falta).
  const ws = wb.addWorksheet('Estudio', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: MARGIN_L / 72, right: MARGIN_R / 72, top: MARGIN_T / 72, bottom: MARGIN_B / 72, header: 0, footer: 0 },
    },
  });
  for (let c = 1; c <= GRID_COLS; c++) ws.getColumn(c).width = ANCHO_COLUMNA_GRID;

  // --- Simulacion de paginacion: un cursor Y en puntos, igual umbral (CONTENT_BOTTOM)
  // y mismas alturas por elemento que usa continuarSiNecesario()/dibujarTexto()/
  // dibujarTablaPaginada() en propuestaDom.js -- cuando un bloque no cabria en lo que
  // queda de la pagina actual del PDF, se marca un salto de pagina manual (ws.rowBreaks,
  // via row.addPageBreak()) justo despues de la ULTIMA fila ya escrita, y el cursor se
  // reinicia. No es una repeticion literal del render del PDF (eso exigiria correr el
  // generador de PDF completo en paralelo solo para medir) -- usa las MISMAS fórmulas
  // de altura, asi que coincide en el caso comun; una tabla completa se trata como un
  // solo bloque atomico (no se parte entre paginas, a diferencia del PDF que si repite
  // el encabezado si una tabla no cabe entera -- Excel no tiene un mecanismo limpio
  // para repetir un encabezado DISTINTO por cada tabla, asi que se prefirio nunca
  // partir una tabla a la mitad en la vista de impresion).
  let yCursor = CONTENT_TOP;
  let ultimaFila = null;
  function marcarUltimaFila() { ultimaFila = ws.lastRow.number; }
  function reservar(alturaBloquePt) {
    if (ultimaFila != null && yCursor + alturaBloquePt > CONTENT_BOTTOM) {
      ws.getRow(ultimaFila).addPageBreak();
      yCursor = CONTENT_TOP;
    }
    yCursor += alturaBloquePt;
  }
  function saltoDePaginaForzado() {
    if (ultimaFila != null) { ws.getRow(ultimaFila).addPageBreak(); }
    yCursor = CONTENT_TOP;
  }

  function fusionar(row, desde, hasta) { if (hasta > desde) ws.mergeCells(row.number, desde, row.number, hasta); }

  // ===================== PÁGINA 1 (solo-Excel): portada + resumen rápido =====================
  // El PDF no tiene un equivalente a esta portada (su página 1 ya es la sección 1,
  // "Su proyecto explicado en una página") -- esta portada es información de consulta
  // rápida propia del Excel, por eso no se mide/pagina con las fórmulas de arriba; al
  // terminar se fuerza un salto de página para que la sección 1 (y de ahí en adelante,
  // página N del Excel ≈ página N-1 del PDF) arranque siempre en una página limpia.
  const titulo = ws.addRow(['ANALIZADOR DE SISTEMAS FOTOVOLTAICOS — CFE']);
  titulo.font = { bold: true, size: 14, color: { argb: COLOR_BLANCO } };
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
  titulo.height = 35;
  titulo.eachCell({ includeEmpty: true }, (cell) => { cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
  fusionar(titulo, 1, GRID_COLS);

  ws.addRow([]);
  const seccionInfo = ws.addRow(['INFORMACIÓN DEL ANÁLISIS']);
  seccionInfo.font = { bold: true, color: { argb: COLOR_BLANCO }, size: 11 };
  seccionInfo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
  seccionInfo.height = 22;
  seccionInfo.eachCell({ includeEmpty: true }, (cell) => { cell.alignment = { horizontal: 'justify', vertical: 'middle', wrapText: true }; });
  fusionar(seccionInfo, 1, GRID_COLS);

  const COL_VALOR_DESDE = 8; // etiqueta: columnas 1-7; valor: columnas 8-20
  function filaInfoTexto(etiqueta, valor, { negrita = false } = {}) {
    if (valor == null) return;
    const row = ws.addRow([etiqueta, ...Array(COL_VALOR_DESDE - 2).fill(null), valor]);
    if (negrita) row.font = { bold: true, color: { argb: COLOR_NAVY } };
    row.height = negrita ? 28 : 26;
    fusionar(row, 1, COL_VALOR_DESDE - 1);
    fusionar(row, COL_VALOR_DESDE, GRID_COLS);
    row.eachCell({ includeEmpty: true }, (cell) => { cell.alignment = { horizontal: 'justify', vertical: 'center', wrapText: true }; });
  }
  const FMT_MONEDA = '$#,##0.00;($#,##0.00)';
  const FMT_PCT = '0.0%';
  function filaInfoNumerica(etiqueta, valor, numFmt, { negrita = false } = {}) {
    if (valor == null || Number.isNaN(valor)) return;
    const row = ws.addRow([etiqueta, ...Array(COL_VALOR_DESDE - 2).fill(null), valor]);
    if (negrita) row.font = { bold: true, color: { argb: COLOR_NAVY } };
    row.height = negrita ? 28 : 26;
    fusionar(row, 1, COL_VALOR_DESDE - 1);
    fusionar(row, COL_VALOR_DESDE, GRID_COLS);
    row.getCell(1).alignment = { horizontal: 'justify', vertical: 'center', wrapText: true };
    const celdaValor = row.getCell(COL_VALOR_DESDE);
    celdaValor.numFmt = numFmt;
    celdaValor.alignment = { horizontal: 'right', vertical: 'center', wrapText: true };
  }
  filaInfoTexto('TITULAR', r.titular || '—');
  filaInfoTexto('INMUEBLE', resumenInmueble(r.inmueble) || '—');
  filaInfoTexto('TARIFA', r.tarifa || '—');
  filaInfoTexto('NO. DE SERVICIO', r.noServicio || '—');
  filaInfoNumerica('PERÍODO FACTURADO (días)', r.periodoDias, '0');
  filaInfoNumerica('CONSUMO DEL PERÍODO (kWh)', r.periodoKwh, '#,##0');
  filaInfoTexto('FECHA DEL ESTUDIO', r.fechaEstudio || '—');

  ws.addRow([]);
  if (r.investment != null) {
    const seccionResultados = ws.addRow(['RESULTADOS DEL ANÁLISIS']);
    seccionResultados.font = { bold: true, color: { argb: COLOR_BLANCO }, size: 11 };
    seccionResultados.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
    seccionResultados.height = 22;
    seccionResultados.eachCell({ includeEmpty: true }, (cell) => { cell.alignment = { horizontal: 'justify', vertical: 'middle', wrapText: true }; });
    fusionar(seccionResultados, 1, GRID_COLS);

    filaInfoNumerica('INVERSIÓN TOTAL ($)', r.investment, FMT_MONEDA, { negrita: true });
    filaInfoNumerica('AHORRO ANUAL ESTIMADO ($)', r.ahorroAnual, FMT_MONEDA, { negrita: true });
    filaInfoNumerica('PORCENTAJE DE AHORRO', r.pctAhorro, FMT_PCT);
    filaInfoNumerica('PAYBACK (AÑOS RECUPERACIÓN)', r.payback, '0.00');
    filaInfoNumerica('VAN (VALOR ACTUAL NETO) ($)', r.van, FMT_MONEDA);
    filaInfoNumerica('TIR (TASA INTERNA DE RETORNO)', r.tir, FMT_PCT, { negrita: true });
    filaInfoNumerica('GASTO ANUAL SIN SISTEMA ($)', r.annualbefore, FMT_MONEDA);
    filaInfoNumerica('GASTO ANUAL CON SISTEMA ($)', r.annualafter, FMT_MONEDA);
    filaInfoNumerica('POTENCIA INSTALADA (kWp)', r.kwp, '0.00');
    filaInfoNumerica('CANTIDAD DE PANELES', r.n, '0');
    if (r.aplicaIsr) {
      filaInfoNumerica('PAYBACK NETO (CON ISR, AÑOS)', r.paybackNetoIsr, '0.00');
      filaInfoNumerica('TIR NETO (CON ISR)', r.tirNetoIsr, FMT_PCT);
      filaInfoNumerica('VAN NETO (CON ISR) ($)', r.vanNetoIsr, FMT_MONEDA);
    }
  }
  marcarUltimaFila();
  saltoDePaginaForzado(); // de aqui en adelante, una página de Excel por cada sección

  // ===================== CONTENIDO (clon del PDF, sección por sección) =====================
  function escribirBloqueTexto(tipo, texto, estilo) {
    const altura = alturaDeTexto(medidor, tipo, texto);
    reservar(altura);
    const row = ws.addRow([texto]);
    row.height = altura;
    fusionar(row, 1, GRID_COLS);
    const cell = row.getCell(1);
    cell.alignment = { horizontal: 'justify', vertical: 'middle', wrapText: true };
    Object.assign(cell, estilo);
    marcarUltimaFila();
  }

  function escribirTabla(bloque) {
    const { etiqueta, headers, filas } = bloque;
    const anchosPt = anchosProporcionales(headers, filas); // MISMA fuente que el PDF real
    const spans = spansDeAnchos(anchosPt);
    const inicios = iniciosDeColumna(spans);
    const alturaHeader = alturaFilaTabla(medidor, headers, anchosPt);
    const alturasFilas = filas.map((f) => alturaFilaTabla(medidor, f, anchosPt));
    const alturaTotal = 18 + alturaHeader + alturasFilas.reduce((a, b) => a + b, 0);
    reservar(alturaTotal); // la tabla completa se mueve entera a la pagina siguiente si no cabe

    const rowEtiqueta = ws.addRow([etiqueta]);
    rowEtiqueta.height = 18;
    fusionar(rowEtiqueta, 1, GRID_COLS);
    rowEtiqueta.getCell(1).font = { bold: true, color: { argb: COLOR_NAVY } };
    rowEtiqueta.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_GOLD_TINT } };
    rowEtiqueta.getCell(1).alignment = { horizontal: 'justify', vertical: 'middle', wrapText: true };

    const rowHead = ws.addRow(headers);
    rowHead.height = alturaHeader;
    headers.forEach((h, i) => {
      fusionar(rowHead, inicios[i], inicios[i] + spans[i] - 1);
      const cell = rowHead.getCell(inicios[i]);
      cell.font = { bold: true, color: { argb: COLOR_NAVY } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TEAL_TINT } };
      cell.border = { top: BORDE_FINO, bottom: BORDE_FINO, left: BORDE_FINO, right: BORDE_FINO };
      cell.alignment = { horizontal: 'justify', vertical: 'middle', wrapText: true };
    });

    filas.forEach((fila, fi) => {
      const rowDato = ws.addRow(fila);
      rowDato.height = alturasFilas[fi];
      fila.forEach((valor, i) => {
        fusionar(rowDato, inicios[i], inicios[i] + spans[i] - 1);
        const cell = rowDato.getCell(inicios[i]);
        cell.border = { top: BORDE_FINO, bottom: BORDE_FINO, left: BORDE_FINO, right: BORDE_FINO };
        // Punto 5 del encargo: numero real + numFmt cuando la celda es un
        // importe/porcentaje/cantidad -- nunca en la columna 0 (siempre la
        // etiqueta/nombre de fila, nunca un valor calculado).
        const numerico = i > 0 ? valorNumericoDeCelda(valor) : null;
        if (numerico) {
          cell.value = numerico.valor;
          cell.numFmt = numerico.numFmt;
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        } else {
          cell.alignment = { horizontal: 'justify', vertical: 'middle', wrapText: true };
        }
      });
    });
    marcarUltimaFila();
  }

  secciones.forEach(({ numero, titulo: tituloSeccion, bloques }) => {
    const textoBanner = `SECCIÓN ${numero}: ${tituloSeccion}`;
    reservar(alturaDeTexto(medidor, 'seccion', textoBanner));
    const rowSeccion = ws.addRow([textoBanner]);
    rowSeccion.height = 22;
    fusionar(rowSeccion, 1, GRID_COLS);
    const cellSeccion = rowSeccion.getCell(1);
    cellSeccion.font = { bold: true, color: { argb: COLOR_BLANCO }, size: 12 };
    cellSeccion.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
    cellSeccion.alignment = { horizontal: 'justify', vertical: 'middle', wrapText: true };
    marcarUltimaFila();

    bloques.forEach((bloque) => {
      if (bloque.tipo === 'tabla') escribirTabla(bloque);
      else if (bloque.tipo === 'subtitulo') escribirBloqueTexto('subtitulo', bloque.texto, { font: { bold: true, color: { argb: COLOR_NAVY }, size: 11 } });
      else if (bloque.tipo === 'pregunta') escribirBloqueTexto('pregunta', bloque.texto, { font: { italic: true, color: { argb: COLOR_GREY_TEXT } } });
      else if (bloque.tipo === 'aviso') escribirBloqueTexto('aviso', bloque.texto, { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_GOLD_TINT } }, font: { color: { argb: COLOR_NAVY } }, border: { top: BORDE_FINO, bottom: BORDE_FINO, left: BORDE_FINO, right: BORDE_FINO } });
      else escribirBloqueTexto('texto', bloque.texto, {});
    });
  });

  // ===================== ANEXOS: documentos adjuntos (al final, punto 4) =====================
  // Mismos datos que usa el PDF real (r._archivosReciboImgs/_archivosVerificacionImgs,
  // preparados por prepararDocumentosAdjuntosParaPdf() en app.js antes de llamar aqui)
  // -- cada imagen en su propia pagina de Excel, igual que paginaDocumentoRecibo/
  // Verificacion() fuerzan su propia pagina en el PDF. Si no hay archivo, se imprime
  // el MISMO aviso honesto que ya usa secciones.js (s22/s23) -- nunca afirmar que algo
  // se adjunta cuando no es cierto.
  const activosFinal = new Set(seccionesActivasEnOrden(r));
  function construirAnexoDocumento(tituloAnexo, imagenes, textoSinArchivo) {
    saltoDePaginaForzado();
    const rowBanner = ws.addRow([`ANEXO: ${tituloAnexo}`]);
    rowBanner.height = 22;
    fusionar(rowBanner, 1, GRID_COLS);
    const cellBanner = rowBanner.getCell(1);
    cellBanner.font = { bold: true, color: { argb: COLOR_BLANCO }, size: 12 };
    cellBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
    cellBanner.alignment = { horizontal: 'justify', vertical: 'middle', wrapText: true };
    marcarUltimaFila();
    if (!imagenes || !imagenes.length) {
      const rowTexto = ws.addRow([textoSinArchivo]);
      rowTexto.height = 24;
      fusionar(rowTexto, 1, GRID_COLS);
      rowTexto.getCell(1).alignment = { horizontal: 'justify', vertical: 'middle', wrapText: true };
      marcarUltimaFila();
      return;
    }
    const anchoPx = Math.round((CONTENT_W * 96) / 72); // CONTENT_W de puntos a pixeles (96dpi)
    imagenes.forEach((img, idx) => {
      if (idx > 0) saltoDePaginaForzado();
      const altoPx = Math.round(anchoPx * ((img.alto || 1) / (img.ancho || 1)));
      const m = /^data:image\/(\w+);base64,(.+)$/.exec(img.dataUrl || '');
      if (!m) return;
      const extension = m[1] === 'jpg' ? 'jpeg' : m[1];
      const imageId = wb.addImage({ base64: m[2], extension });
      const rowImagen = ws.addRow([]);
      rowImagen.height = Math.min(altoPx * 0.75, 720); // px -> pt (96dpi: 1px=0.75pt)
      ws.addImage(imageId, { tl: { col: 0, row: rowImagen.number - 1 }, ext: { width: anchoPx, height: altoPx } });
      marcarUltimaFila();
    });
  }
  if (activosFinal.has(17)) {
    construirAnexoDocumento('DOCUMENTO: RECIBO ORIGINAL DE CFE', r._archivosReciboImgs, 'Aún no se adjuntó el recibo original a este análisis.');
  }
  if (activosFinal.has(18)) {
    construirAnexoDocumento('DOCUMENTO: VERIFICACIÓN EN SITIO', r._archivosVerificacionImgs, 'Aún no se adjuntó el documento de "Verificación en sitio" a este análisis.');
  }

  return wb;
}

export async function descargarExcelCotizacion(r, nombreArchivo) {
  const wb = generarExcelCotizacion(r);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
