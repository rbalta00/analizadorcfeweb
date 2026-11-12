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

  const infoInmueble = ws.addRow(['INMUEBLE', r.inmueble || '—']);
  infoInmueble.font = { bold: true, color: { argb: COLOR_NAVY } };
  infoInmueble.height = 30;
  infoInmueble.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; });

  if (r.formulario?.tarifa) { const row = ws.addRow(['TARIFA', r.formulario.tarifa]); row.height = 26; row.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; }); }
  if (r.formulario?.consumoAnualKWh) { const row = ws.addRow(['CONSUMO ANUAL (kWh)', `${r.formulario.consumoAnualKWh}`]); row.height = 26; row.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; }); }
  if (r.formulario?.precioKWh) { const row = ws.addRow(['PRECIO UNITARIO ($/kWh)', `$${r.formulario.precioKWh.toFixed(4)}`]); row.height = 26; row.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; }); }
  if (r.formulario?.gastoAnual) { const row = ws.addRow(['GASTO ANUAL ACTUAL', `$${r.formulario.gastoAnual.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`]); row.height = 26; row.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; }); }
  if (r.formulario?.año) { const row = ws.addRow(['AÑO DE RECIBO', `${r.formulario.año}`]); row.height = 26; row.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; }); }
  if (r.formulario?.mes) { const row = ws.addRow(['MES DE RECIBO', `${r.formulario.mes}`]); row.height = 26; row.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; }); }

  ws.addRow([]);

  // DATOS DE CÁLCULO (si están disponibles)
  if (r.investment != null) {
    const seccionResultados = ws.addRow(['RESULTADOS DEL ANÁLISIS']);
    seccionResultados.font = { bold: true, color: { argb: COLOR_BLANCO }, size: 11 };
    seccionResultados.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
    seccionResultados.height = 22;
    seccionResultados.eachCell((cell) => { cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; });
    ws.mergeCells(seccionResultados.number, 1, seccionResultados.number, maxCols);

    // DATOS PRINCIPALES DE LA PROPUESTA
    const invRow = ws.addRow(['INVERSIÓN TOTAL', `$${r.investment.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`]);
    invRow.font = { bold: true, color: { argb: COLOR_NAVY } };
    invRow.height = 28;
    invRow.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; });

    if (r.ahorroAnual) {
      const ahorroRow = ws.addRow(['AHORRO ANUAL ESTIMADO', `$${r.ahorroAnual.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`]);
      ahorroRow.font = { bold: true, color: { argb: COLOR_NAVY } };
      ahorroRow.height = 28;
      ahorroRow.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; });
    }

    // INDICADORES FINANCIEROS
    if (r.pctAhorro != null) {
      const pctRow = ws.addRow(['PORCENTAJE DE AHORRO', `${(r.pctAhorro * 100).toFixed(1)}%`]);
      pctRow.height = 26;
      pctRow.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; });
    }

    if (r.payback != null) {
      const paybackRow = ws.addRow(['PAYBACK (AÑOS RECUPERACIÓN)', `${r.payback.toFixed(2)} años`]);
      paybackRow.height = 26;
      paybackRow.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; });
    }

    if (r.van != null) {
      const vanRow = ws.addRow(['VAN (VALOR ACTUAL NETO)', `$${r.van.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`]);
      vanRow.height = 26;
      vanRow.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; });
    }

    if (r.tir != null) {
      const tirRow = ws.addRow(['TIR (TASA INTERNA RETORNO)', `${(r.tir * 100).toFixed(2)}%`]);
      tirRow.font = { bold: true, color: { argb: COLOR_NAVY } };
      tirRow.height = 28;
      tirRow.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; });
    }

    // INFORMACIÓN DE CONSUMO
    if (r.annualbefore != null) {
      const consumoRow = ws.addRow(['GASTO ANUAL SIN SISTEMA', `$${r.annualbefore.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`]);
      consumoRow.height = 26;
      consumoRow.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; });
    }

    if (r.annualafter != null) {
      const consumoAftRow = ws.addRow(['GASTO ANUAL CON SISTEMA', `$${r.annualafter.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`]);
      consumoAftRow.height = 26;
      consumoAftRow.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; });
    }

    // INFORMACIÓN DEL SISTEMA FOTOVOLTAICO
    if (r.kwp != null) {
      const kwhRow = ws.addRow(['POTENCIA INSTALADA', `${r.kwp.toFixed(2)} kWp`]);
      kwhRow.height = 26;
      kwhRow.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; });
    }

    if (r.n != null) {
      const panRow = ws.addRow(['CANTIDAD DE PANELES', `${r.n}`]);
      panRow.height = 26;
      panRow.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; });
    }

    // ISR (si aplica)
    if (r.aplicaIsr && r.paybackNetoIsr != null) {
      const isr_payback = ws.addRow(['PAYBACK NETO (CON ISR)', `${r.paybackNetoIsr.toFixed(2)} años`]);
      isr_payback.height = 26;
      isr_payback.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; });
    }

    if (r.aplicaIsr && r.tirNetoIsr != null) {
      const isr_tir = ws.addRow(['TIR NETO (CON ISR)', `${(r.tirNetoIsr * 100).toFixed(2)}%`]);
      isr_tir.height = 26;
      isr_tir.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; });
    }

    if (r.aplicaIsr && r.vanNetoIsr != null) {
      const isr_van = ws.addRow(['VAN NETO (CON ISR)', `$${r.vanNetoIsr.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`]);
      isr_van.height = 26;
      isr_van.eachCell((cell) => { cell.alignment = { horizontal: 'left', vertical: 'center', wrapText: true }; });
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
