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
import { resumenInmueble } from './propuesta.js';

// 'calculo-detalle-apagado' agregado (auditoría 2026-11-13): un bloque "Cómo se
// calculó" apagado individualmente (ver secciones.js, bloqueCalculo) se filtraba del
// PDF (propuestaDom.js usa la misma clase) pero no del Excel -- su tabla seguía
// apareciendo en el archivo exportado aunque el admin ya la hubiera apagado.
const CLASES_TABLA_EXCLUIR_NODO = ['grafico-apagado', 'seccion-apagada', 'calculo-detalle-apagado'];
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
  const maxCols = Math.max(filasEstructuradas.reduce((m, f) => Math.max(m, f.valores.length), 1), 7);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Estudio', { pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' } });
  ws.getColumn(1).width = 65;
  for (let c = 2; c <= maxCols; c++) ws.getColumn(c).width = 60;

  // ENCABEZADO DEL DOCUMENTO
  const titulo = ws.addRow(['ANALIZADOR DE SISTEMAS FOTOVOLTAICOS — CFE']);
  titulo.font = { bold: true, size: 14, color: { argb: COLOR_BLANCO } };
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
  titulo.height = 35;
  titulo.eachCell((cell) => { cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
  ws.mergeCells(titulo.number, 1, titulo.number, maxCols);

  const subtitulo = ws.addRow(['GESTORIA Y PROYECTOS SOELRB · la estudio sale del análisis, no al revés']);
  subtitulo.font = { italic: true, size: 10 };
  subtitulo.height = 30;
  subtitulo.eachCell((cell) => { cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
  ws.mergeCells(subtitulo.number, 1, subtitulo.number, maxCols);

  // INFORMACIÓN DEL ESTUDIO
  ws.addRow([]);
  const seccionInfo = ws.addRow(['INFORMACIÓN DEL ESTUDIO']);
  seccionInfo.font = { bold: true, color: { argb: COLOR_BLANCO }, size: 11 };
  seccionInfo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
  seccionInfo.height = 22;
  seccionInfo.eachCell((cell) => { cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
  ws.mergeCells(seccionInfo.number, 1, seccionInfo.number, maxCols);

  const infoTitular = ws.addRow(['TITULAR', r.titular || '—']);
  infoTitular.font = { bold: true, color: { argb: COLOR_NAVY } };
  infoTitular.height = 30;
  infoTitular.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; });

  // BUG REAL corregido (auditoría 2026-11-13): r.inmueble es un objeto (ver
  // leerInmueble() en app.js: {actividad, horarios, equipos, areaFuente, sombras,
  // sistemasExistentes, fechaVisita, notas, panelesVerificacion, nombreVerificacion}),
  // nunca un texto -- escribirlo directo en una celda producía "[object Object]" (o un
  // error de ExcelJS, según la versión). Se usa el mismo resumenInmueble() que ya
  // arma el PDF (propuesta.js), para que Excel y PDF digan lo mismo.
  const infoInmueble = ws.addRow(['INMUEBLE', resumenInmueble(r.inmueble) || '—']);
  infoInmueble.font = { bold: true, color: { argb: COLOR_NAVY } };
  infoInmueble.height = 30;
  infoInmueble.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; });

  // BUG REAL corregido (auditoría 2026-11-13): estas 6 filas leían `r.formulario`, una
  // propiedad que construirResultado() (resultado.js) nunca produce -- código muerto,
  // nunca aparecían. Reemplazadas por campos reales que SÍ existen en `r`. Días/kWh
  // del período como celdas numéricas (no texto concatenado), por el mismo criterio de
  // "celdas numéricas utilizables" aplicado al bloque de resultados más abajo.
  filaTexto('TARIFA', r.tarifa || '—');
  filaTexto('NO. DE SERVICIO', r.noServicio || '—');
  filaNumerica('PERÍODO FACTURADO (días)', r.periodoDias, '0');
  filaNumerica('CONSUMO DEL PERÍODO (kWh)', r.periodoKwh, '#,##0');
  filaTexto('FECHA DEL ESTUDIO', r.fechaEstudio || '—');

  ws.addRow([]);

  // Hallazgo real corregido (auditoría 2026-11-13, "celdas numéricas utilizables"):
  // todo este bloque escribía el VALOR YA FORMATEADO como texto (ej. "$304,411.97") en
  // vez del número real -- Excel lo trataba como texto plano, no usable en SUM/
  // promedios/gráficas ni alineado a la derecha como cualquier número. Ahora se
  // escribe el numero real en la celda y el formato visual (moneda/%/decimales) se
  // aplica con `numFmt`, que es lo que Excel espera para una celda numérica de verdad.
  const FMT_MONEDA = '$#,##0.00;($#,##0.00)';
  const FMT_PCT = '0.0%';
  function filaNumerica(etiqueta, valor, numFmt, { negrita = false } = {}) {
    if (valor == null || Number.isNaN(valor)) return;
    const row = ws.addRow([etiqueta, valor]);
    if (negrita) row.font = { bold: true, color: { argb: COLOR_NAVY } };
    row.height = negrita ? 28 : 26;
    row.getCell(1).alignment = { horizontal: 'left', vertical: 'center', wrapText: true };
    const celdaValor = row.getCell(2);
    celdaValor.numFmt = numFmt;
    celdaValor.alignment = { horizontal: 'right', vertical: 'center', wrapText: true };
  }
  function filaTexto(etiqueta, valor, { negrita = false } = {}) {
    if (valor == null) return;
    const row = ws.addRow([etiqueta, valor]);
    if (negrita) row.font = { bold: true, color: { argb: COLOR_NAVY } };
    row.height = negrita ? 28 : 26;
    row.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; });
  }

  // DATOS DE CÁLCULO (si están disponibles)
  if (r.investment != null) {
    const seccionResultados = ws.addRow(['RESULTADOS DEL ANÁLISIS']);
    seccionResultados.font = { bold: true, color: { argb: COLOR_BLANCO }, size: 11 };
    seccionResultados.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
    seccionResultados.height = 22;
    seccionResultados.eachCell((cell) => { cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
    ws.mergeCells(seccionResultados.number, 1, seccionResultados.number, maxCols);

    filaNumerica('INVERSIÓN TOTAL ($)', r.investment, FMT_MONEDA, { negrita: true });
    filaNumerica('AHORRO ANUAL ESTIMADO ($)', r.ahorroAnual, FMT_MONEDA, { negrita: true });
    filaNumerica('PORCENTAJE DE AHORRO', r.pctAhorro, FMT_PCT);
    filaNumerica('PAYBACK (AÑOS RECUPERACIÓN)', r.payback, '0.00');
    filaNumerica('VAN (VALOR ACTUAL NETO) ($)', r.van, FMT_MONEDA);
    filaNumerica('TIR (TASA INTERNA DE RETORNO)', r.tir, FMT_PCT, { negrita: true });
    filaNumerica('GASTO ANUAL SIN SISTEMA ($)', r.annualbefore, FMT_MONEDA);
    filaNumerica('GASTO ANUAL CON SISTEMA ($)', r.annualafter, FMT_MONEDA);
    filaNumerica('POTENCIA INSTALADA (kWp)', r.kwp, '0.00');
    filaNumerica('CANTIDAD DE PANELES', r.n, '0');
    if (r.aplicaIsr) {
      filaNumerica('PAYBACK NETO (CON ISR, AÑOS)', r.paybackNetoIsr, '0.00');
      filaNumerica('TIR NETO (CON ISR)', r.tirNetoIsr, FMT_PCT);
      filaNumerica('VAN NETO (CON ISR) ($)', r.vanNetoIsr, FMT_MONEDA);
    }

    ws.addRow([]);
  }

  // TABLAS Y SECCIONES
  filasEstructuradas.forEach(({ tipo, valores }) => {
    const row = ws.addRow(valores);
    if (tipo === 'seccion') {
      ws.mergeCells(row.number, 1, row.number, maxCols);
      row.height = 22;
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { bold: true, color: { argb: COLOR_BLANCO }, size: 12 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      });
    } else if (tipo === 'tabla') {
      ws.mergeCells(row.number, 1, row.number, maxCols);
      row.height = 18;
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { bold: true, color: { argb: COLOR_NAVY } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_GOLD_TINT } };
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      });
    } else if (tipo === 'encabezado') {
      row.height = 30;
      row.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: COLOR_NAVY } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TEAL_TINT } };
        cell.border = { top: BORDE_FINO, bottom: BORDE_FINO, left: BORDE_FINO, right: BORDE_FINO };
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      });
    } else if (tipo === 'dato') {
      row.height = 28;
      row.eachCell((cell) => {
        cell.border = { top: BORDE_FINO, bottom: BORDE_FINO, left: BORDE_FINO, right: BORDE_FINO };
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
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
