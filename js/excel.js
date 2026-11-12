// Exportar la cotizacion a Excel (.xlsx) -- pedido explicito del usuario, 2026-11-11:
// "un boton para descargar la cotizacion no solo en pdf tambien en excel", despues
// ajustado a "en una sola hoja casi que se imprima como el PDF" -- UNA sola hoja,
// todas las tablas en el mismo orden que se ven en pantalla/PDF, con el titulo de cada
// sección y cada tabla como fila separadora, lista para imprimir de corrido.
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
// recibo" en vez de "Componente del recibo"). Bug real encontrado en la propia prueba
// de este archivo antes de pushearlo.
const CLASES_CELDA_EXCLUIR = ['col-oculta-tabla', 'fila-oculta-tabla', 'th-accion-tabla', 'td-accion-tabla', 'badge-num-editable', 'nota-texto-global', 'nota-texto-oculto'];

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

export function generarExcelCotizacion(r) {
  const cont = document.getElementById('contenedorSecciones');
  if (!cont) throw new Error('No hay cotización calculada todavía.');
  const activos = new Set(seccionesActivasEnOrden(r));
  const filas = [];
  let tablasAgregadas = 0;
  cont.querySelectorAll('.seccion').forEach((seccionEl) => {
    const numero = Number((seccionEl.id || '').replace('seccion-', ''));
    if (!activos.has(numero)) return; // seccion apagada -- no se exporta
    const tablasDeEstaSeccion = [...seccionEl.querySelectorAll('.tabla-wrap > table')].filter(tablaVisible);
    if (!tablasDeEstaSeccion.length) return; // nada que exportar de esta seccion
    const h2 = seccionEl.querySelector('h2');
    filas.push([`SECCIÓN ${numero}: ${(h2 ? h2.textContent.trim() : '').toUpperCase()}`]);
    tablasDeEstaSeccion.forEach((tabla) => {
      const wrap = tabla.closest('.tabla-wrap');
      const filasTabla = filasDeTabla(limpiarParaExcel(tabla));
      if (!filasTabla.length) return; // tabla vacia tras limpiar (nada que exportar)
      filas.push([etiquetaDeTabla(tabla, wrap)]);
      filasTabla.forEach((f) => filas.push(f));
      filas.push([]); // separador entre tabla y la siguiente
      tablasAgregadas++;
    });
    filas.push([]); // separador entre secciones
  });
  if (!tablasAgregadas) throw new Error('No se encontró ninguna tabla visible para exportar (revisa que no estén todas apagadas).');
  const ws = XLSX.utils.aoa_to_sheet(filas);
  const maxCols = filas.reduce((m, f) => Math.max(m, f.length), 1);
  ws['!cols'] = Array.from({ length: maxCols }, (_, i) => ({ wch: i === 0 ? 48 : 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cotización');
  return wb;
}

export function descargarExcelCotizacion(r, nombreArchivo) {
  const wb = generarExcelCotizacion(r);
  XLSX.writeFile(wb, nombreArchivo);
}
