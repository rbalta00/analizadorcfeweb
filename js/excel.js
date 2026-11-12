// Exportar la cotizacion a Excel (.xlsx) -- pedido explicito del usuario, 2026-11-11:
// primero "un boton para descargar la cotizacion no solo en pdf tambien en excel",
// despues "en una sola hoja casi que se imprima como el PDF", y finalmente "no le
// puedes dar formato al Excel como la cotizacion de PDF" -- por eso este archivo usa
// ExcelJS (lib/exceljs.min.js), no SheetJS/xlsx (se probo primero: la version libre de
// SheetJS NO escribe estilos de celda al .xlsx -- es una funcion de pago de esa
// libreria, confirmado haciendo un ida-y-vuelta real de escribir+leer un estilo antes
// de cambiar de libreria). ExcelJS es gratuita y SI escribe fuente/color/relleno/
// bordes reales.
//
// Lee directo el DOM ya renderizado (#contenedorSecciones), igual que
// generarPdfCompletaDesdeVista() en propuesta.js -- asi respeta automaticamente el
// paso de entrega activo, las secciones/graficos/tablas apagados, y las columnas/filas
// ocultas de cada tabla, sin necesitar una segunda fuente de datos que se pueda
// desincronizar del PDF.
import { seccionesActivasEnOrden } from './secciones.js';

const CLASES_TABLA_EXCLUIR_NODO = ['grafico-apagado', 'seccion-apagada'];
// badge-num-editable: la etiqueta fija "S4.2"/"g03-cargos·H1" (ver numerarContenidoEditable
// en app.js) vive como <span> DENTRO de la celda, justo antes del texto real -- sin
// excluirla, su texto se concatena con el de la celda ("g03-cargos·H1Componente del
// recibo" en vez de "Componente del recibo").
const CLASES_CELDA_EXCLUIR = ['col-oculta-tabla', 'fila-oculta-tabla', 'th-accion-tabla', 'td-accion-tabla', 'badge-num-editable', 'nota-texto-global', 'nota-texto-oculto'];

// Mismos colores de marca que el PDF/la pantalla (ver --cfe-navy/--cfe-teal/--cfe-gold
// en css/styles.css) -- ARGB con alfa FF (ExcelJS siempre quiere los 8 caracteres).
const COLOR_NAVY = 'FF163B4C';
const COLOR_GOLD_TINT = 'FFF3E7CE';
const COLOR_TEAL_TINT = 'FFE4F0F2';
const COLOR_BLANCO = 'FFFFFFFF';
const COLOR_BORDE = 'FFCBD5DC';
const BORDE_FINO = { style: 'thin', color: { argb: COLOR_BORDE } };

function tablaVisible(tabla) {
  let n = tabla;
  while (n) {
    if (n.classList && CLASES_TABLA_EXCLUIR_NODO.some((c) => n.classList.contains(c))) return false;
    n = n.parentElement;
  }
  return true;
}

// Etiqueta legible de la tabla: el texto del checkbox "Mostrar: X" que la envuelve
// (graficoToggle en secciones.js), sin el icono ni el "Mostrar:" -- si no hay (tabla
// suelta sin toggle propio), usa el texto del encabezado de la sección más cercana.
function etiquetaDeTabla(tabla, wrap) {
  const toggleLabel = wrap.closest('.grafico-togglable')?.querySelector('.toggle-grafico');
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

// Recorre el DOM y arma una lista plana de filas con su TIPO (para darles formato
// distinto despues) -- 'seccion'/'tabla' son banners de contexto, 'encabezado' es la
// primera fila de cada tabla (nombres de columna), 'dato' el resto, 'vacio' separador.
function construirFilasEstructuradas(r) {
  const cont = document.getElementById('contenedorSecciones');
  if (!cont) throw new Error('No hay estudio calculada todavía.');
  const activos = new Set(seccionesActivasEnOrden(r));
  const filas = [];
  let tablasAgregadas = 0;
  cont.querySelectorAll('.seccion').forEach((seccionEl) => {
    const numero = Number((seccionEl.id || '').replace('seccion-', ''));
    if (!activos.has(numero)) return; // seccion apagada -- no se exporta
    const tablasDeEstaSeccion = [...seccionEl.querySelectorAll('.tabla-wrap > table')].filter(tablaVisible);
    if (!tablasDeEstaSeccion.length) return; // nada que exportar de esta seccion
    const h2 = seccionEl.querySelector('h2');
    filas.push({ tipo: 'seccion', valores: [`SECCIÓN ${numero}: ${(h2 ? h2.textContent.trim() : '').toUpperCase()}`] });
    tablasDeEstaSeccion.forEach((tabla) => {
      const wrap = tabla.closest('.tabla-wrap');
      const filasTabla = filasDeTabla(limpiarParaExcel(tabla));
      if (!filasTabla.length) return; // tabla vacia tras limpiar (nada que exportar)
      filas.push({ tipo: 'tabla', valores: [etiquetaDeTabla(tabla, wrap)] });
      filasTabla.forEach((f, i) => filas.push({ tipo: i === 0 ? 'encabezado' : 'dato', valores: f }));
      filas.push({ tipo: 'vacio', valores: [] });
      tablasAgregadas++;
    });
    filas.push({ tipo: 'vacio', valores: [] });
  });
  if (!tablasAgregadas) throw new Error('No se encontró ninguna tabla visible para exportar (revisa que no estén todas apagadas).');
  return filas;
}

export function generarExcelCotizacion(r) {
  const filasEstructuradas = construirFilasEstructuradas(r);
  const maxCols = filasEstructuradas.reduce((m, f) => Math.max(m, f.valores.length), 1);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Estudio', { pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'portrait' } });
  ws.getColumn(1).width = 48;
  for (let c = 2; c <= maxCols; c++) ws.getColumn(c).width = 22;
  filasEstructuradas.forEach(({ tipo, valores }) => {
    const row = ws.addRow(valores);
    if (tipo === 'seccion') {
      ws.mergeCells(row.number, 1, row.number, maxCols);
      row.height = 20;
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { bold: true, color: { argb: COLOR_BLANCO }, size: 12 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
        cell.alignment = { vertical: 'middle' };
      });
    } else if (tipo === 'tabla') {
      ws.mergeCells(row.number, 1, row.number, maxCols);
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { bold: true, color: { argb: COLOR_NAVY } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_GOLD_TINT } };
      });
    } else if (tipo === 'encabezado') {
      row.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: COLOR_NAVY } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TEAL_TINT } };
        cell.border = { top: BORDE_FINO, bottom: BORDE_FINO, left: BORDE_FINO, right: BORDE_FINO };
      });
    } else if (tipo === 'dato') {
      row.eachCell((cell) => {
        cell.border = { top: BORDE_FINO, bottom: BORDE_FINO, left: BORDE_FINO, right: BORDE_FINO };
      });
    }
  });
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
