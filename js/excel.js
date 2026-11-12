// Exportar la cotizacion a Excel (.xlsx) -- pedido explicito del usuario, 2026-11-11:
// "un boton para descargar la cotizacion no solo en pdf tambien en excel". A
// diferencia del PDF (que reconstruye el diseño visual), esto exporta las TABLAS de
// datos crudas -- una hoja por tabla -- para que se puedan revisar o reusar los
// numeros, no para copiar el diseño.
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

function nombreHojaUnico(base, usados) {
  // Excel: maximo 31 caracteres, sin \ / ? * [ ] : , y nombre unico por libro.
  let limpio = base.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || 'Tabla';
  let nombre = limpio;
  let i = 2;
  while (usados.has(nombre.toLowerCase())) {
    nombre = `${limpio} (${i})`.slice(0, 31);
    i++;
  }
  usados.add(nombre.toLowerCase());
  return nombre;
}

export function generarExcelCotizacion(r) {
  const cont = document.getElementById('contenedorSecciones');
  if (!cont) throw new Error('No hay cotización calculada todavía.');
  const activos = new Set(seccionesActivasEnOrden(r));
  const wb = XLSX.utils.book_new();
  const usados = new Set();
  let hojasAgregadas = 0;
  cont.querySelectorAll('.seccion').forEach((seccionEl) => {
    const numero = Number((seccionEl.id || '').replace('seccion-', ''));
    if (!activos.has(numero)) return; // seccion apagada -- no se exporta
    seccionEl.querySelectorAll('.tabla-wrap > table').forEach((tabla) => {
      const wrap = tabla.closest('.tabla-wrap');
      if (!tablaVisible(tabla)) return;
      const clon = limpiarParaExcel(tabla);
      if (!clon.querySelector('tr')) return; // tabla vacia tras limpiar (nada que exportar)
      const ws = XLSX.utils.table_to_sheet(clon, { raw: false });
      const nombre = nombreHojaUnico(`${numero}. ${etiquetaDeTabla(tabla, wrap)}`, usados);
      XLSX.utils.book_append_sheet(wb, ws, nombre);
      hojasAgregadas++;
    });
  });
  if (!hojasAgregadas) throw new Error('No se encontró ninguna tabla visible para exportar (revisa que no estén todas apagadas).');
  return wb;
}

export function descargarExcelCotizacion(r, nombreArchivo) {
  const wb = generarExcelCotizacion(r);
  XLSX.writeFile(wb, nombreArchivo);
}
