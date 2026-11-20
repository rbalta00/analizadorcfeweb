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
//
// REESCRITO 2026-11-19 -- bug real reportado por el usuario: "los excel solo traen
// tablas no traen textos ni otra informacion, parece incompleto". Causa: la version
// anterior solo barria `.tabla-wrap > table` de cada seccion e ignoraba todo lo demas
// (titulo, "pregunta", avisos, parrafos del cuerpo, tarjetas de metricas, graficas) --
// justo lo que SI incluye el PDF generico (dibujarSeccionGenerica/recorrer(), ver
// propuestaDom.js). Se reescribe este archivo para recorrer el DOM de cada seccion con
// la MISMA logica de inclusion/exclusion que usa ese PDF (duplicada aqui a proposito,
// no importada, para no arriesgar el generador de PDF ya probado con este cambio) --
// asi el Excel deja de estar incompleto frente al PDF/pantalla. De paso, pedido
// explicito del mismo mensaje: las tablas y los textos se alinean "justificado" (antes
// 'left') en vez de alineados a la izquierda.
import { seccionesActivasEnOrden } from './secciones.js';
import { resumenInmueble } from './propuesta.js';

// Mismas clases que CLASES_OMITIR en propuestaDom.js (controles del propio editor,
// contenido apagado) -- un nodo con cualquiera de estas clases (o cualquier <button>)
// nunca se exporta, ni el ni sus hijos.
const CLASES_OMITIR = [
  'toggle-seccion', 'btn-guardar-texto', 'btn-ocultar-texto', 'nota-texto-global',
  'nota-texto-oculto', 'th-accion-tabla', 'td-accion-tabla', 'grafico-apagado',
  'campo-oculto', 'col-oculta-tabla', 'calculo-detalle-apagado', 'fila-oculta-tabla',
  'documento-adjunto-pdf', 'nota-admin-oculto', 'badge-num-editable',
];
// 'badge-num-editable' tambien se quita DENTRO de una celda de tabla que si se exporta
// (ver limpiarParaExcel/textoSinIconos abajo) -- sin esto su texto ("№12") se pega al
// texto real de la celda ("№12Distribución").
const CLASES_CELDA_EXCLUIR = ['col-oculta-tabla', 'fila-oculta-tabla', 'th-accion-tabla', 'td-accion-tabla', 'badge-num-editable', 'nota-texto-global', 'nota-texto-oculto'];

// Mismos colores de marca que el PDF/la pantalla (ver --cfe-navy/--cfe-teal/--cfe-gold
// en css/styles.css) -- ARGB con alfa FF (ExcelJS siempre quiere los 8 caracteres).
const COLOR_NAVY = 'FF163B4C';
const COLOR_GOLD_TINT = 'FFF3E7CE';
const COLOR_TEAL_TINT = 'FFE4F0F2';
const COLOR_GREY_TEXT = 'FF5B6B74';
const COLOR_BLANCO = 'FFFFFFFF';
const COLOR_BORDE = 'FFCBD5DC';
const BORDE_FINO = { style: 'thin', color: { argb: COLOR_BORDE } };

function esVisible(nodo) {
  if (nodo.nodeType !== 1) return false;
  if (nodo.tagName === 'BUTTON') return false;
  if (nodo.classList && CLASES_OMITIR.some((c) => nodo.classList.contains(c))) return false;
  return true;
}

// Lee el texto real de un nodo quitando botones/badges/notas-del-editor que viajan
// DENTRO del mismo nodo (ver textoSinIconos en propuestaDom.js, mismo criterio).
function textoSinIconos(nodo) {
  if (!nodo) return '';
  const clon = nodo.cloneNode(true);
  clon.querySelectorAll('button').forEach((b) => b.remove());
  clon.querySelectorAll('.badge-num-editable, .nota-texto-global, .nota-texto-oculto').forEach((el) => el.remove());
  return clon.textContent.replace(/\s+/g, ' ').trim();
}

// Etiqueta legible de la tabla: el texto del checkbox "Mostrar: X" que la envuelve
// (graficoToggle en secciones.js), sin el icono ni el "Mostrar:" -- si no hay (tabla
// suelta sin toggle propio), usa el texto del encabezado de la sección más cercana.
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

function agregarTabla(tabla, filas) {
  const wrap = tabla.closest('.tabla-wrap');
  const filasTabla = filasDeTabla(limpiarParaExcel(tabla));
  if (!filasTabla.length) return;
  filas.push({ tipo: 'tabla', valores: [etiquetaDeTabla(tabla, wrap)] });
  filasTabla.forEach((f, i) => filas.push({ tipo: i === 0 ? 'encabezado' : 'dato', valores: f }));
  filas.push({ tipo: 'vacio', valores: [] });
}

// Tarjetas de metricas (tarjetas-metricas > .metrica > .valor + .etiqueta, ver
// secciones.js) -- se exportan como pares etiqueta/valor, mismo criterio que
// dibujarTarjetas() en propuestaDom.js.
function agregarTarjetas(cont, filas) {
  const metricas = Array.from(cont.querySelectorAll(':scope > .metrica'));
  if (!metricas.length) return;
  const pares = metricas
    .map((m) => [textoSinIconos(m.querySelector('.etiqueta')), textoSinIconos(m.querySelector('.valor'))])
    .filter(([e, v]) => e || v);
  if (!pares.length) return;
  filas.push({ tipo: 'encabezado', valores: ['Indicador', 'Valor'] });
  pares.forEach((f) => filas.push({ tipo: 'dato', valores: f }));
  filas.push({ tipo: 'vacio', valores: [] });
}

// Graficas (barra horizontal/agrupada/gauge/curva) -- se exportan como la misma tabla
// chica de etiquetas/valores que ya usa el PDF (dibujarGraficaComoTabla en
// propuestaDom.js), en vez de perderse por no ser una <table> real.
function agregarGraficaComoTabla(cont, filas) {
  let pares = [];
  let headers = ['Dato', 'Valor'];
  if (cont.classList.contains('grafica-h')) {
    pares = Array.from(cont.querySelectorAll('.grafica-h-fila')).map((f) => [
      textoSinIconos(f.querySelector('.grafica-h-etq')),
      textoSinIconos(f.querySelector('.grafica-h-val')),
    ]);
  } else if (cont.classList.contains('grafica-agrupada')) {
    const leyenda = Array.from(cont.querySelectorAll('.grafica-leyenda > *')).map((n) => textoSinIconos(n)).filter(Boolean);
    const [s1 = 'Serie 1', s2 = 'Serie 2'] = leyenda;
    headers = ['Categoría', s1, s2];
    pares = Array.from(cont.querySelectorAll('.grafica-agrupada-grupo')).map((g) => {
      const cat = textoSinIconos(g.querySelector('.grafica-agrupada-etq'));
      const [b1, b2] = g.querySelectorAll('.grafica-agrupada-barra-1, .grafica-agrupada-barra-2');
      return [cat, b1?.title.split(':').slice(1).join(':').trim() || '', b2?.title.split(':').slice(1).join(':').trim() || ''];
    });
  } else if (cont.classList.contains('grafica-gauge')) {
    const label = textoSinIconos(cont.querySelector('.grafica-gauge-label'));
    const valor = textoSinIconos(cont.querySelector('.grafica-gauge-ejes strong'));
    pares = [[label || 'Avance', valor]];
  } else if (cont.classList.contains('grafica-curva')) {
    pares = Array.from(cont.querySelectorAll('svg text')).map((t) => t.textContent.trim()).filter(Boolean).map((t) => [t, '']);
  }
  pares = pares.filter((f) => f.some((v) => v));
  if (!pares.length) return;
  filas.push({ tipo: 'encabezado', valores: headers });
  pares.forEach((f) => filas.push({ tipo: 'dato', valores: f }));
  filas.push({ tipo: 'vacio', valores: [] });
}

// Clasifica un nodo de texto (parrafo/titulo/pregunta/aviso/nota suelta) y lo agrega a
// `filas` con el tipo que le corresponde -- mismo criterio de clases que dibujarTexto()
// en propuestaDom.js, para que el Excel y el PDF coincidan en que es cada cosa.
function agregarTexto(nodo, filas) {
  const texto = textoSinIconos(nodo);
  if (!texto) return;
  const tag = nodo.tagName;
  const cls = nodo.className || '';
  // El titulo de la seccion (h2.titulo-seccion-grande) ya se agrega como banner
  // 'seccion' por el llamador antes de recorrer el cuerpo -- evitar duplicarlo aqui.
  if (tag === 'H2' && cls.includes('titulo-seccion-grande')) return;
  if (tag === 'H3' || tag === 'H4' || tag === 'H5') {
    filas.push({ tipo: 'subtitulo', valores: [texto] });
    return;
  }
  if (cls.includes('seccion-pregunta')) {
    filas.push({ tipo: 'pregunta', valores: [texto] });
    return;
  }
  if (cls.includes('aviso')) { // aviso-cream / "nota aviso" (avisoRojo)
    filas.push({ tipo: 'aviso', valores: [texto] });
    return;
  }
  filas.push({ tipo: 'texto', valores: [texto] });
}

// Recorre el DOM de una seccion (o de cualquier contenedor dentro de ella) en el MISMO
// orden visual que la pantalla/el PDF, repartiendo cada nodo visible al tipo de fila
// que le corresponde -- misma estructura de decision que recorrer() en
// propuestaDom.js, adaptada para juntar filas de Excel en vez de dibujar un PDF.
function recorrerParaExcel(nodo, filas) {
  for (const hijo of Array.from(nodo.children)) {
    if (!esVisible(hijo)) continue;
    const cls = hijo.className || '';
    if (cls.includes('texto-editable') || cls.includes('texto-editable-chico')) {
      agregarTexto(hijo, filas);
    } else if (hijo.tagName === 'TABLE') {
      agregarTabla(hijo, filas);
    } else if (cls.includes('tarjetas-metricas')) {
      agregarTarjetas(hijo, filas);
    } else if (cls.includes('grafica') && (hijo.classList.contains('grafica-h') || hijo.classList.contains('grafica-agrupada') || hijo.classList.contains('grafica-gauge') || hijo.classList.contains('grafica-curva'))) {
      agregarGraficaComoTabla(hijo, filas);
    } else if (cls.includes('documento-adjunto') && !cls.includes('documento-adjunto-pdf')) {
      // Imagen/documento adjunto (recibo, verificación en sitio) -- Excel no es un
      // buen lugar para una imagen dentro de una celda; se deja una nota en vez de
      // perderlo en silencio (la imagen real va en el PDF).
      filas.push({ tipo: 'texto', valores: ['📎 Documento adjunto (ver el PDF de la cotización para la imagen).'] });
    } else if (hijo.tagName === 'IMG') {
      filas.push({ tipo: 'texto', valores: ['🖼️ Imagen (ver el PDF de la cotización).'] });
    } else if (hijo.tagName === 'DETAILS') {
      // "Ver detalle del cálculo" -- se incluye siempre (el Excel no tiene "clic para
      // expandir"), saltando el <summary> (solo el texto del control).
      for (const nieto of Array.from(hijo.children)) {
        if (nieto.tagName === 'SUMMARY') continue;
        recorrerParaExcel(nieto, filas);
      }
    } else if (!hijo.children.length && hijo.textContent.trim()) {
      // Texto "huerfano" (ej. .seccion-numero "06 de 25", .badge-estado "Comprobado").
      agregarTexto(hijo, filas);
    } else {
      // Contenedor generico (div envoltorio, campo-editable, seccion-header, etc.).
      recorrerParaExcel(hijo, filas);
    }
  }
}

// Recorre el DOM y arma una lista plana de filas con su TIPO (para darles formato
// distinto despues).
function construirFilasEstructuradas(r) {
  const cont = document.getElementById('contenedorSecciones');
  if (!cont) throw new Error('No hay estudio calculada todavía.');
  const activos = new Set(seccionesActivasEnOrden(r));
  const filas = [];
  let seccionesConContenido = 0;
  cont.querySelectorAll('.seccion').forEach((seccionEl) => {
    const numero = Number((seccionEl.id || '').replace('seccion-', ''));
    if (!activos.has(numero)) return; // seccion apagada -- no se exporta
    const filasSeccion = [];
    recorrerParaExcel(seccionEl, filasSeccion);
    if (!filasSeccion.length) return; // nada visible en esta seccion
    const h2 = seccionEl.querySelector('h2');
    filas.push({ tipo: 'seccion', valores: [`SECCIÓN ${numero}: ${(h2 ? textoSinIconos(h2) : '').toUpperCase()}`] });
    filas.push(...filasSeccion);
    filas.push({ tipo: 'vacio', valores: [] });
    seccionesConContenido++;
  });
  if (!seccionesConContenido) throw new Error('No se encontró contenido visible para exportar (revisa que no esté todo apagado).');
  return filas;
}

// Estimacion simple de cuantas lineas va a ocupar un texto largo ya justificado/con
// ajuste de linea, para no dejar la fila con una altura fija demasiado chica (antes
// este archivo no tenia filas de texto libre, asi que esta estimacion es nueva) --
// mismo criterio aproximado (contar caracteres, no medir fuente real) que
// anchosProporcionales() en propuestaDom.js.
function alturaParaTexto(texto, caracteresPorLinea) {
  const lineas = Math.max(1, Math.ceil(String(texto).length / caracteresPorLinea));
  return Math.min(lineas * 15 + 10, 400);
}

export function generarExcelCotizacion(r) {
  const filasEstructuradas = construirFilasEstructuradas(r);
  const maxCols = Math.max(filasEstructuradas.reduce((m, f) => Math.max(m, f.valores.length), 1), 7);
  const caracteresPorLineaMerge = 65 + (maxCols - 1) * 60;
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
  seccionInfo.eachCell((cell) => { cell.alignment = { horizontal: 'justify', vertical: 'middle', wrapText: true }; });
  ws.mergeCells(seccionInfo.number, 1, seccionInfo.number, maxCols);

  const infoTitular = ws.addRow(['TITULAR', r.titular || '—']);
  infoTitular.font = { bold: true, color: { argb: COLOR_NAVY } };
  infoTitular.height = 30;
  infoTitular.eachCell((cell) => { cell.alignment = { horizontal: 'justify', vertical: 'center', wrapText: true }; });

  // BUG REAL corregido (auditoría 2026-11-13): r.inmueble es un objeto (ver
  // leerInmueble() en app.js: {actividad, horarios, equipos, areaFuente, sombras,
  // sistemasExistentes, fechaVisita, notas, panelesVerificacion, nombreVerificacion}),
  // nunca un texto -- escribirlo directo en una celda producía "[object Object]" (o un
  // error de ExcelJS, según la versión). Se usa el mismo resumenInmueble() que ya
  // arma el PDF (propuesta.js), para que Excel y PDF digan lo mismo.
  const infoInmueble = ws.addRow(['INMUEBLE', resumenInmueble(r.inmueble) || '—']);
  infoInmueble.font = { bold: true, color: { argb: COLOR_NAVY } };
  infoInmueble.height = 30;
  infoInmueble.eachCell((cell) => { cell.alignment = { horizontal: 'justify', vertical: 'center', wrapText: true }; });

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
    row.getCell(1).alignment = { horizontal: 'justify', vertical: 'center', wrapText: true };
    const celdaValor = row.getCell(2);
    celdaValor.numFmt = numFmt;
    celdaValor.alignment = { horizontal: 'right', vertical: 'center', wrapText: true };
  }
  function filaTexto(etiqueta, valor, { negrita = false } = {}) {
    if (valor == null) return;
    const row = ws.addRow([etiqueta, valor]);
    if (negrita) row.font = { bold: true, color: { argb: COLOR_NAVY } };
    row.height = negrita ? 28 : 26;
    row.eachCell((cell) => { cell.alignment = { horizontal: 'justify', vertical: 'center', wrapText: true }; });
  }

  // DATOS DE CÁLCULO (si están disponibles)
  if (r.investment != null) {
    const seccionResultados = ws.addRow(['RESULTADOS DEL ANÁLISIS']);
    seccionResultados.font = { bold: true, color: { argb: COLOR_BLANCO }, size: 11 };
    seccionResultados.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
    seccionResultados.height = 22;
    seccionResultados.eachCell((cell) => { cell.alignment = { horizontal: 'justify', vertical: 'middle', wrapText: true }; });
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

  // TABLAS, TEXTOS Y SECCIONES
  filasEstructuradas.forEach(({ tipo, valores }) => {
    const row = ws.addRow(valores);
    if (tipo === 'seccion') {
      ws.mergeCells(row.number, 1, row.number, maxCols);
      row.height = 22;
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { bold: true, color: { argb: COLOR_BLANCO }, size: 12 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_NAVY } };
        cell.alignment = { horizontal: 'justify', vertical: 'middle', wrapText: true };
      });
    } else if (tipo === 'tabla') {
      ws.mergeCells(row.number, 1, row.number, maxCols);
      row.height = 18;
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { bold: true, color: { argb: COLOR_NAVY } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_GOLD_TINT } };
        cell.alignment = { horizontal: 'justify', vertical: 'middle', wrapText: true };
      });
    } else if (tipo === 'encabezado') {
      row.height = 30;
      row.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: COLOR_NAVY } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TEAL_TINT } };
        cell.border = { top: BORDE_FINO, bottom: BORDE_FINO, left: BORDE_FINO, right: BORDE_FINO };
        cell.alignment = { horizontal: 'justify', vertical: 'middle', wrapText: true };
      });
    } else if (tipo === 'dato') {
      row.height = 28;
      row.eachCell((cell) => {
        cell.border = { top: BORDE_FINO, bottom: BORDE_FINO, left: BORDE_FINO, right: BORDE_FINO };
        cell.alignment = { horizontal: 'justify', vertical: 'middle', wrapText: true };
      });
    } else if (tipo === 'subtitulo') {
      ws.mergeCells(row.number, 1, row.number, maxCols);
      row.height = Math.max(22, alturaParaTexto(valores[0], caracteresPorLineaMerge));
      const cell = row.getCell(1);
      cell.font = { bold: true, color: { argb: COLOR_NAVY }, size: 11 };
      cell.alignment = { horizontal: 'justify', vertical: 'middle', wrapText: true };
    } else if (tipo === 'pregunta') {
      ws.mergeCells(row.number, 1, row.number, maxCols);
      row.height = Math.max(20, alturaParaTexto(valores[0], caracteresPorLineaMerge));
      const cell = row.getCell(1);
      cell.font = { italic: true, color: { argb: COLOR_GREY_TEXT } };
      cell.alignment = { horizontal: 'justify', vertical: 'middle', wrapText: true };
    } else if (tipo === 'aviso') {
      ws.mergeCells(row.number, 1, row.number, maxCols);
      row.height = Math.max(26, alturaParaTexto(valores[0], caracteresPorLineaMerge));
      const cell = row.getCell(1);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_GOLD_TINT } };
      cell.font = { color: { argb: COLOR_NAVY } };
      cell.border = { top: BORDE_FINO, bottom: BORDE_FINO, left: BORDE_FINO, right: BORDE_FINO };
      cell.alignment = { horizontal: 'justify', vertical: 'middle', wrapText: true };
    } else if (tipo === 'texto') {
      ws.mergeCells(row.number, 1, row.number, maxCols);
      row.height = Math.max(24, alturaParaTexto(valores[0], caracteresPorLineaMerge));
      const cell = row.getCell(1);
      cell.alignment = { horizontal: 'justify', vertical: 'middle', wrapText: true };
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
