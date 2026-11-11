// Generador del PDF de la cotizacion -- port de app/propuesta.py (que tiene 21
// paginas), usando pdfComponents.js (ver ese archivo para la diferencia de
// arquitectura frente a reportlab). Cada pagina es una funcion (doc, r, numero) =>
// void: dibuja desde CONTENT_TOP hacia abajo, pensada para caber en UNA sola pagina
// A4 (mismo criterio que Python: "recortar para que quepa"). `numero` se pasa ya
// resuelto (tras filtrar por bloques activos) para poder escribir el encabezado "NN |
// Titulo" igual que Python renumera dinamicamente segun BLOQUES_COTIZACION/secciones_activas.
// OJO: aqui son 22 paginas fuente (no 21): la pagina 17 de Python ("que hace falta
// para cerrar el ahorro") se dividio en DOS paginas propias de este port --17 y 17b--
// porque agregar el checklist fijo de REQUISITOS_PRESUPUESTO_REAL (pedido del
// usuario, ver notas.js) mas las notas del recibo ya no cabian juntas en una sola
// hoja A4 sin paginacion automatica. Las 21 SECCIONES en pantalla (secciones.js) no
// cambian -- esa division es solo del lado del PDF.
import {
  CONTENT_W, CONTENT_TOP, CONTENT_BOTTOM, MARGIN_L, headX, subX, bodyX, spacer, cardsRow,
  notice, table, curve, groupedBarChart, horizontalBarChart, gauge, buildPdf, GREY,
  crearDoc, dibujarHeaderFooter,
} from './pdfComponents.js';
import { M, PCT, listaConceptos, agruparPresupuesto, FACTOR_CO2_KG_KWH, CO2_KG_POR_ARBOL_ANIO, EXPLICACION_TARIFA } from './util.js';
import { BLOQUES_COTIZACION } from './bloques.js';
import { COMERCIAL } from './comercial.js';
import { dibujarSeccionGenerica, textoVisibleDe } from './propuestaDom.js';
// beneficioCosto importado desde motor.js (auditoria 2026-11-06, hallazgo 1): antes
// esta copia local omitia la reposicion del inversor del costo descontado, mientras
// que secciones.js (pantalla) SI la incluia -- el PDF mostraba un indicador mas
// favorable que la pantalla para el mismo estudio. Se re-exporta tambien (abajo) porque
// resumen.js sigue importando `beneficioCosto` de este archivo.
import { beneficioCosto } from './motor.js';
export { beneficioCosto };
import { REQUISITOS_PRESUPUESTO_REAL } from './notas.js';

function pad2(n) { return String(n).padStart(2, '0'); }

// Grafico/tabla visual incluido en el PDF? -- mismo id e idea que graficoToggle() en
// secciones.js: el id es compartido entre pantalla y PDF, asi que apagar un grafico en
// pantalla (r.graficosExcluidos) tambien lo quita del PDF sin un segundo mecanismo
// aparte. Pedido explicito del usuario, 2026-11-05: "que todo todo, secciones,
// graficos se puedan apagar, ocultar... solo dime [lo que sea mejor]".
function graficoIncluido(r, id) { return !(r.graficosExcluidos || []).includes(id); }

// Filas/columnas ocultas de UNA tabla -- pedido explicito del usuario, 2026-11-05:
// "permite eliminar columnas o renglones de las tablas". Mismo patron reversible que
// graficosExcluidos: nunca es un borrado real, solo se ocultan (r.tablaColumnasOcultas/
// r.tablaFilasOcultas, ver secciones.js/clientes.js), y el PDF debe respetar EXACTAMENTE
// lo mismo que la pantalla -- aqui se filtran encabezados/filas/anchos ANTES de llamar a
// table() de pdfComponents.js (que no sabe nada de columnas/filas ocultas, solo dibuja lo
// que se le da). `widths` se filtra igual que `headers` para no desalinear columnas
// cuando a una tabla con anchos fijos le falta una columna.
function tablaF(doc, y, id, r, headers, filas, opts = {}) {
  const colsOcultas = new Set((r.tablaColumnasOcultas || {})[id] || []);
  const filasOcultas = new Set((r.tablaFilasOcultas || {})[id] || []);
  const idxVisibles = headers.map((_, i) => i).filter((i) => !colsOcultas.has(i));
  const headersF = idxVisibles.map((i) => headers[i]);
  const filasF = filas.filter((_, fi) => !filasOcultas.has(fi)).map((fila) => idxVisibles.map((i) => fila[i]));
  const opts2 = { ...opts };
  if (opts.widths) opts2.widths = idxVisibles.map((i) => opts.widths[i]);
  return table(doc, y, headersF, filasF, opts2);
}

function encabezado(doc, numero, titulo, titular) {
  let y = headX(doc, CONTENT_TOP, `${pad2(numero)} | ${titulo}`);
  y = subX(doc, y, titular);
  return y;
}

function resumenInmueble(inm) {
  if (!inm) return null;
  const partes = [];
  if (inm.actividad) partes.push(`actividad: ${inm.actividad}`);
  if (inm.tensionFases) partes.push(`tensión/fases: ${inm.tensionFases}`);
  if (inm.cubierta) partes.push(`cubierta: ${inm.cubierta}`);
  if (inm.areaDisponible) partes.push(`área disponible: ${inm.areaDisponible} (${inm.areaFuente === 'medida' ? 'medida' : 'estimada'})`);
  if (inm.sombras) partes.push(`sombras/obstáculos: ${inm.sombras}`);
  if (inm.sistemasExistentes) partes.push(`sistemas existentes: ${inm.sistemasExistentes}`);
  if (inm.tablero) partes.push(`tablero/interruptor: ${inm.tablero}`);
  if (inm.puntoConexion) partes.push(`punto de conexión: ${inm.puntoConexion}`);
  return partes.length ? partes.join('; ') + '.' : null;
}

// ---------- Pagina 1: resumen ----------
function pagina01(doc, r, numero) {
  let y = encabezado(doc, numero, 'Su proyecto, explicado en una página', r.titular);
  y = bodyX(doc, y, `${r.domicilio || 'domicilio por confirmar'} · Servicio CFE ${r.noServicio || 'por confirmar'} · Estudio del ${r.fechaEstudio}.`);
  y = spacer(y, 4);
  y = cardsRow(doc, y, [
    [M(r.investment), 'Lo que cuesta el sistema, IVA incluido'],
    [r.payback ? `${r.payback.toFixed(1)} años` : 'N/D', 'En cuánto tiempo se paga solo'],
    [M(r.ahorroAnual), 'Lo que ahorraría en el primer año'],
  ]);
  y = spacer(y, 10);
  y = cardsRow(doc, y, [
    [`${r.n} paneles`, `${r.moduloWp} W por módulo / ${r.kwp.toFixed(2)} kWp`],
    [M(r.ahorroAnual - r.om1), 'Ahorro neto año 1, tras mantenimiento'],
    [PCT(r.pctAhorro), 'Porcentaje de la factura que ahorraría'],
  ]);
  y = spacer(y, 12);
  y = subX(doc, y, 'Qué se propone');
  y = bodyX(doc, y, `Instalar un sistema conectado a red de ${r.n} paneles de ${r.moduloWp} W. Su producción ` +
    `regional de referencia es de ${r.gen.toLocaleString('en-US', { maximumFractionDigits: 0 })} kWh/año. Se ` +
    'plantea medición neta, sujeta a contratación y autorización.');
  y = subX(doc, y, 'Cuánto cuesta y en cuánto se paga solo');
  const recupTxt = r.payback ? `${r.payback.toFixed(1)} años` : 'un tiempo no calculable con el ahorro estimado actual';
  const flujoTxt = r.recuperacionAcumulada
    ? ` (o ${r.recuperacionAcumulada.toFixed(1)} años si se cuenta el mantenimiento y el cambio de inversor)` : '';
  y = bodyX(doc, y, `El sistema completo cuesta ${M(r.investment)} (ya con IVA). Con el ahorro que generaría cada ` +
    `mes, esa inversión se recupera en aproximadamente ${recupTxt}${flujoTxt}. Después de ese tiempo, el ahorro ` +
    'mensual es ganancia, no recuperación de lo invertido.');
  y = bodyX(doc, y, `En el año de referencia se estima pasar de pagar ${M(r.annualbefore)} a ${M(r.annualafter)} ` +
    `al año. El promedio mensual sería ${M(r.annualafter / 12)} en vez de ${M(r.annualbefore / 12)}. Son ` +
    'promedios de un modelo, no pagos mensuales fijos.');
  y = spacer(y, 4);
  y = notice(doc, y, 'El recibo permite comprobar el gasto actual; el ahorro futuro es una estimación condicionada. ' +
    `Se conserva el gasto observado de ${listaConceptos(r.meta.noReducibles)} sin anticipar ahorro adicional. ` +
    'Los precios deberán actualizarse antes de contratar.');
  y = spacer(y, 4);
  notice(doc, y, `Esta cotización es válida hasta el ${r.fechaVigencia} (${r.vigenciaDias} días desde el estudio). ` +
    'Los precios de materiales son una provisión de mercado, no una cotización fija de proveedor.');
}

// ---------- Pagina 2: recibo ----------
function pagina02(doc, r, numero) {
  let y = encabezado(doc, numero, 'Su recibo: datos comprobados', r.titular);
  const explicTarifa = EXPLICACION_TARIFA[r.tarifa] || 'tarifa de CFE; consultar al emisor el detalle de su clasificación.';
  y = bodyX(doc, y, `Titular: ${r.titular}. Domicilio: ${(r.domicilio || 'por confirmar').replace(/\.$/, '')}.`);
  y = bodyX(doc, y, `Tarifa ${r.tarifa}: ${explicTarifa}`);
  if (r.tituloRecibo && r.tituloRecibo.trim().toUpperCase() !== r.titular.trim().toUpperCase()) {
    y = spacer(y, 4);
    y = notice(doc, y, `El nombre impreso en el recibo de CFE es "${r.tituloRecibo}", distinto al nombre con el ` +
      `que se identifica este inmueble ("${r.titular}"). Verificar que ambos correspondan al mismo servicio antes de continuar.`);
  }
  y = spacer(y, 8);
  if (graficoIncluido(r, 'g02-datos-recibo')) {
    const filasRecibo = [['Período', `${r.periodoDias || '?'} días`], ['Consumo del período', r.periodoKwh ? `${r.periodoKwh.toLocaleString('en-US', { maximumFractionDigits: 0 })} kWh` : 'por confirmar']];
    if (r.demandaContratadaKw) filasRecibo.push(['Demanda contratada', `${r.demandaContratadaKw.toFixed(0)} kW`]);
    y = tablaF(doc, y, 'g02-datos-recibo-a', r, ['Dato verificado', 'Valor'], filasRecibo, { widths: [CONTENT_W * 0.45, CONTENT_W * 0.55] });
    y = spacer(y, 10);
    y = tablaF(doc, y, 'g02-datos-recibo-b', r, ['Total del recibo', 'Importe'], [
      ['Servicio con IVA', M(r.pagoRecurrentePeriodo - (r.dap || 0))],
      ['Alumbrado público (DAP)', M(r.dap || 0)],
      ['Pago recurrente del período', M(r.pagoRecurrentePeriodo)],
    ], { widths: [CONTENT_W * 0.6, CONTENT_W * 0.4] });
    y = spacer(y, 10);
  }
  notice(doc, y, 'Los datos de este recibo se usan como base de cálculo del estudio completo; cualquier ' +
    'corrección debe confirmarse contra el documento original de CFE.');
}

// ---------- Pagina 3: como se forma el pago ----------
function pagina03(doc, r, numero) {
  let y = encabezado(doc, numero, 'Cómo se forma lo que paga a CFE', r.titular);
  const filasCargos = [];
  for (const k of ['suministro', 'distribucion', 'transmision', 'cenace', 'energia', 'energia_base',
                    'energia_intermedia', 'energia_punta', 'capacidad', 'scnmem']) {
    if (k in r.cargos) filasCargos.push([listaConceptos([k]), M(r.cargos[k])]);
  }
  const suma = Object.values(r.cargos).reduce((a, b) => a + b, 0);
  filasCargos.push(['Suma de componentes', M(suma)]);
  if (graficoIncluido(r, 'g03-cargos')) {
    y = tablaF(doc, y, 'g03-cargos', r, ['Componente del recibo', 'Importe'], filasCargos, { widths: [CONTENT_W * 0.6, CONTENT_W * 0.4] });
    y = spacer(y, 10);
  }
  y = bodyX(doc, y, 'En palabras simples: "Suministro" es lo que cuesta que CFE le dé servicio, sin importar ' +
    'cuánto consuma. "Distribución" y "Transmisión" son el costo de llevar la electricidad desde la planta ' +
    'hasta su medidor. "CENACE" y "SCnMEM" son cargos que CFE traslada tal cual del operador del sistema ' +
    'eléctrico nacional — no los decide CFE libremente. "Energía" y "Capacidad" son lo que cuesta generar y ' +
    'tener disponible la electricidad que usa.');
  y = bodyX(doc, y, 'Para valorar el ahorro no se multiplica toda la producción solar por el precio medio de la ' +
    'factura: cada uno de estos cargos tiene su propia regla, explicada en la página siguiente.');
  if (r.tarifa === 'GDBT') {
    y = spacer(y, 4);
    notice(doc, y, 'Tarifa GDBT sin validar contra un recibo real: la fórmula usa el mismo motor que GDMTO/GDMTH ' +
      '(probado con varios recibos reales de esas tarifas), pero GDBT no se ha confirmado todavía contra un ' +
      'recibo real de esta tarifa específica. Revisar a mano el desglose antes de confiar en el resultado.');
  }
}

// ---------- Pagina 4: que cargos pueden disminuir ----------
function pagina04(doc, r, numero) {
  let y = encabezado(doc, numero, 'Qué cargos pueden disminuir', r.titular);
  const razon = r.meta.tieneDemandaContratada
    ? 'Tiene demanda contratada: Distribución y Capacidad se facturan por kW, no por kWh, y no bajan aunque la energía neta llegue a cero.'
    : 'No tiene demanda contratada: casi toda la factura se factura por kWh, por lo que casi todo baja con la energía solar.';
  y = bodyX(doc, y, `Tarifa ${r.tarifa}. ${razon}`);
  y = spacer(y, 8);
  const montoReduc = r.meta.reducibles.reduce((s, k) => s + (r.cargos[k] || 0), 0);
  const montoNoReduc = r.meta.noReducibles.reduce((s, k) => s + (r.cargos[k] || 0), 0);
  if (graficoIncluido(r, 'g04-reducibles')) {
    y = horizontalBarChart(doc, y, [
      ['Sí baja con los paneles', montoReduc, '#21798b'],
      ['No baja con los paneles', montoNoReduc, '#163b4c'],
    ], { height: 70 });
    y = spacer(y, 4);
  }
  y = bodyX(doc, y, `Lo que SÍ baja: ${listaConceptos(r.meta.reducibles)}. Lo que NO baja: ${listaConceptos(r.meta.noReducibles)}.`);
  y = spacer(y, 10);
  y = bodyX(doc, y, `Por eso, aunque se instalaran más paneles de los que se necesitan, el pago de un período no ` +
    `bajaría de ${M(r.pisoPeriodo)} (ya con IVA y DAP) frente a los ${M(r.pagoRecurrentePeriodo)} actuales. El ` +
    `ahorro máximo posible en este recibo, sin importar cuántos paneles se instalen, es de ${M(r.ahorroMaxPeriodo)} ` +
    `por período — un ${PCT(r.pctMaxPeriodo)}.`);
  notice(doc, y, 'No se prometen ahorros de demanda sin conocer la energía importada y la demanda después de ' +
    'instalar. Conservar su importe en el presupuesto es un criterio prudente, no afirmar que esos cargos sean fijos.');
}

// ---------- Pagina 5: consumo anual ----------
function pagina05(doc, r, numero) {
  let y = encabezado(doc, numero, 'Consumo anual: base disponible', r.titular);
  const historial = r.historial;
  if (historial && historial.length >= 3) {
    y = bodyX(doc, y, `El propio recibo trae impreso un historial de ${historial.length} períodos ya facturados ` +
      '— es la base más confiable para calcular el consumo anual, mejor que suponer que todos los meses son iguales al último período.');
    y = spacer(y, 8);
    const meses = historial.map(x => `${x.mes}${x.anio}`);
    const kwh = historial.map(x => x.kwh);
    const prom = kwh.reduce((a, b) => a + b, 0) / kwh.length;
    if (graficoIncluido(r, 'g05-historial')) {
      y = groupedBarChart(doc, y, meses, 'Consumo real facturado', kwh, 'Promedio del historial', kwh.map(() => prom), { height: 150 });
      y = spacer(y, 10);
    }
    if (graficoIncluido(r, 'g05-historial-tabla')) {
      y = tablaF(doc, y, 'g05-historial-tabla', r, ['Período', 'Consumo facturado'], historial.map(x => [`${x.mes} ${x.anio}`, `${x.kwh.toLocaleString('en-US', { maximumFractionDigits: 0 })} kWh`]),
        { widths: [CONTENT_W * 0.5, CONTENT_W * 0.5], small: true });
      y = spacer(y, 10);
    }
  }
  if (graficoIncluido(r, 'g05-base-trabajo')) {
    y = tablaF(doc, y, 'g05-base-trabajo', r, ['Base de trabajo', 'Resultado'], [
      ['Período observado', r.periodoKwh && r.periodoDias ? `${r.periodoKwh.toLocaleString('en-US', { maximumFractionDigits: 0 })} kWh en ${r.periodoDias} días` : 'por confirmar'],
      ['Base usada para el consumo anual', r.basisConsumo],
      ['Consumo anual de referencia', `${r.annualKwh.toLocaleString('en-US', { maximumFractionDigits: 0 })} kWh/año`],
      ['Gasto anual de referencia', M(r.annualbefore) + ' con IVA y 12 cuotas de DAP'],
    ], { widths: [CONTENT_W * 0.45, CONTENT_W * 0.55] });
    y = spacer(y, 10);
  }
  if (historial && historial.length >= 6) {
    notice(doc, y, `Esta base usa el historial real de consumo del propio recibo (${historial.length} períodos), no una extrapolación de un solo mes.`);
  } else {
    notice(doc, y, 'La extrapolación de un solo período sirve para presupuestar. El historial de consumo de 12 ' +
      'meses, cuando esté disponible, debe usarse para confirmar esta base antes de comprometer una cifra de ahorro definitiva.');
  }
}

// ---------- Pagina 6: sistema propuesto ----------
function pagina06(doc, r, numero) {
  let y = encabezado(doc, numero, `Sistema propuesto: ${r.n} paneles de ${r.moduloWp} W`, r.titular);
  const acKw = r.kwp / 1.2;
  if (graficoIncluido(r, 'g06-sistema')) {
    y = tablaF(doc, y, 'g06-sistema', r, ['Parte del sistema', 'Cantidad y función'], [
      ['Paneles', `${r.n} módulos de ${r.moduloWp} W: ${r.kwp.toFixed(2)} kWp de potencia nominal. Marca y modelo por confirmar.`],
      ['Inversor', `${acKw.toFixed(2)} kW AC como capacidad de cálculo económico; equipo comercial por seleccionar.`],
      ['Relación DC:AC', '1.2 — el inversor se dimensiona más chico que la suma de los paneles a propósito (práctica estándar de la industria, no un error de cálculo).'],
      ['Estructura', 'Compatible con cubierta y panel. Anclajes, viento y cargas por calcular.'],
      ['Conexiones y protecciones', 'Cables DC/AC, conectores, canalización, protecciones y puesta a tierra previstos.'],
      ['Monitoreo', 'Consulta de producción, según solución y comunicaciones disponibles.'],
      ['Espacio preliminar', `${(r.n * 4).toLocaleString('en-US')} m² con pasillos, como provisión de 4 m² por módulo; sujeto a levantamiento.`],
    ], { widths: [CONTENT_W * 0.3, CONTENT_W * 0.7] });
    y = spacer(y, 8);
  }
  const resInm = resumenInmueble(r.inmueble);
  if (resInm) {
    y = bodyX(doc, y, 'Condiciones actuales del inmueble (declaradas, pendientes de levantamiento técnico): ' + resInm);
    y = spacer(y, 4);
  }
  notice(doc, y, 'No incluye baterías ni respaldo durante apagones. La potencia y las cantidades presupuestadas ' +
    'no sustituyen el plano y los cálculos de ingeniería. Es una distribución conceptual, sin levantamiento ' +
    'validado: no es prueba de cabida, escala exacta ni seguridad estructural.');
}

// ---------- Pagina 6b: foto del sembrado de paneles (SOLO si r.fotoSembrado existe) ----------
// Pagina condicional, pedida por el usuario: la foto del sembrado (distribucion de
// paneles sobre el techo, aportada por fuera) se agrega a la cotizacion. Aparte de la
// pagina 6 porque entre la tabla de equipo + el aviso + (a veces) las condiciones del
// inmueble, la pagina 6 ya usa casi todo el espacio de una hoja A4 -- no hay donde
// meter ademas una imagen sin arriesgar que se encime con el pie de pagina.
function pagina06b(doc, r, numero) {
  let y = encabezado(doc, numero, 'Distribución de paneles sobre el techo/azotea (sembrado)', r.titular);
  y = bodyX(doc, y, 'Fotografía o esquema aportado para este proyecto. Es una referencia declarada, no un ' +
    'levantamiento topográfico ni una prueba de que ese arreglo exacto cabe o es estructuralmente viable.');
  y = spacer(y, 6);
  const { dataUrl, ancho, alto } = r.fotoSembrado;
  const maxAltoDisponible = CONTENT_BOTTOM - y - 20;
  const escala = Math.min(CONTENT_W / ancho, maxAltoDisponible / alto, 1);
  const wDibujo = ancho * escala, hDibujo = alto * escala;
  const xDibujo = MARGIN_L + (CONTENT_W - wDibujo) / 2;
  doc.addImage(dataUrl, 'JPEG', xDibujo, y, wDibujo, hDibujo);
}

// ---------- Pagina 6c: fotos de condiciones GENERALES del inmueble (SOLO si
// r.fotosInmueble tiene al menos 1) ----------
// Distinta de pagina06b (que es solo la distribucion de paneles): aqui van las fotos
// de sombras/cubierta/tablero/etc. capturadas en "Condiciones actuales del inmueble".
// Pedido explicito del usuario, hueco declarado desde 2026-10-29 ("no hay captura de
// fotografias en esta version"). Grid de hasta 3 columnas, cada foto se ajusta dentro
// de su celda conservando su proporcion real (nunca se deforma, solo se encoje).
function pagina06c(doc, r, numero) {
  let y = encabezado(doc, numero, 'Fotos de condiciones del inmueble', r.titular);
  y = bodyX(doc, y, 'Evidencia fotográfica aportada para este proyecto -- no sustituye un levantamiento técnico.');
  y = spacer(y, 8);
  const fotos = r.fotosInmueble || [];
  const cols = 3;
  const gap = 10;
  const cellW = (CONTENT_W - gap * (cols - 1)) / cols;
  const cellH = 120; // alto fijo de celda (imagen + etiqueta)
  fotos.forEach((foto, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellX = MARGIN_L + col * (cellW + gap);
    const cellY = y + row * (cellH + gap);
    const maxImgAlto = cellH - 16;
    const escala = Math.min(cellW / foto.ancho, maxImgAlto / foto.alto, 1);
    const wImg = foto.ancho * escala, hImg = foto.alto * escala;
    const xImg = cellX + (cellW - wImg) / 2;
    doc.addImage(foto.dataUrl, 'JPEG', xImg, cellY, wImg, hImg);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(GREY);
    doc.text(foto.etiqueta || `Foto ${i + 1}`, cellX + cellW / 2, cellY + maxImgAlto + 10, { align: 'center' });
  });
}

// ---------- Documento adjunto (recibo original / verificacion en sitio) ----------
// Pedido explicito del usuario, 2026-11-07: estas 2 secciones (17 "Documento: recibo
// original", 18 "Documento: verificacion en sitio" en pantalla) nunca tuvieron pagina
// propia aqui -- hueco documentado desde el 2026-10-31, nunca cerrado. r._archivosReciboImgs/
// r._archivosVerificacionImgs se preparan en app.js ANTES de llamar generarPdf() (fetch +
// archivoAImagenComprimida(), misma funcion ya usada para la foto de sembrado/inmueble) --
// jsPDF.addImage() necesita un dataURL ya listo, no puede ir a buscar una URL remota solo.
// Mismo patron de grid que pagina06c, pero con filas calculadas segun cuantas imagenes
// hay (recibo/verificacion normalmente son 1-3 paginas, no caben en una sola fila fija).
function paginaDocumentoAdjunto(doc, r, numero, titulo, imagenes, seccionEl) {
  let y = encabezado(doc, numero, titulo, r.titular);
  // Lee el parrafo explicativo del DOM (con su edicion/ocultado real aplicado) en vez
  // de usar texto fijo -- bug real reportado por el usuario, 2026-11-09: en pantalla
  // este parrafo SI tiene los controles ✓/🙈 (ver s22/s23 en secciones.js -- s22 usa
  // avisoCream(), s23 usa p() cuando SI hay archivo adjunto; los dos quedan con clase
  // 'texto-editable' igual, ver campoEditableConId(), por eso basta ese selector para
  // los dos casos sin distinguir cual es), pero como esta pagina nunca lo leia,
  // editarlo u ocultarlo no tenia ningun efecto en el PDF -- confuso, porque los
  // controles se ven identicos a los de cualquier otro parrafo que SI funciona.
  // filaArchivo() (la lista de archivos de .documentos-grid) no tiene ningun nodo
  // '.texto-editable' propio, asi que no hay riesgo de que este selector agarre el
  // nombre de un archivo por error.
  // OJO: crearSeccion() SIEMPRE agrega 2 '.texto-editable' en el header de CUALQUIER
  // seccion, ANTES del parrafo que de verdad queremos -- el titulo
  // ('.titulo-seccion-grande', tituloEditable()) y la "pregunta"
  // ('.seccion-pregunta', campoEditableConId() en crearSeccion()). Sin excluirlos,
  // '.texto-editable' solo (probado en vivo, bug real encontrado en la propia revision
  // de este fix) agarraba el TITULO de la seccion en vez del parrafo explicativo.
  // 'oculto' = el usuario lo apago, se omite igual que cualquier otro parrafo oculto en
  // el resto del PDF. 'no-encontrado' (seccionEl no se paso, o la estructura de
  // s22/s23 cambio) cae al texto de respaldo de siempre, para no dejar la pagina sin
  // ninguna explicacion.
  const resultado = textoVisibleDe(seccionEl, '.texto-editable:not(.titulo-seccion-grande):not(.seccion-pregunta)');
  if (resultado !== 'oculto') {
    const texto = resultado === 'no-encontrado'
      ? 'Documento adjunto a esta cotización, tal como se subió -- no se extrajo ningún dato nuevo ' +
        'de él aquí (ver la sección de "Su recibo: datos comprobados" para la trazabilidad de cada dato).'
      : resultado;
    y = bodyX(doc, y, texto);
    y = spacer(y, 8);
  }
  const cols = imagenes.length <= 2 ? imagenes.length : 2;
  const filas = Math.ceil(imagenes.length / cols);
  const gap = 10;
  const cellW = (CONTENT_W - gap * (cols - 1)) / cols;
  const altoDisponible = CONTENT_BOTTOM - y - 10;
  const cellH = (altoDisponible - gap * (filas - 1)) / filas;
  imagenes.forEach((img, i) => {
    const col = i % cols;
    const fila = Math.floor(i / cols);
    const cellX = MARGIN_L + col * (cellW + gap);
    const cellY = y + fila * (cellH + gap);
    const escala = Math.min(cellW / img.ancho, cellH / img.alto, 1);
    const wImg = img.ancho * escala, hImg = img.alto * escala;
    const xImg = cellX + (cellW - wImg) / 2;
    const yImg = cellY + (cellH - hImg) / 2;
    doc.addImage(img.dataUrl, 'JPEG', xImg, yImg, wImg, hImg);
  });
}
// `seccionEl` opcional: solo lo manda generarPdfCompletaDesdeVista (que SI tiene el
// DOM ya renderizado a la mano). El generador viejo generarPdf() (texto fijo, ver mas
// abajo, PAGINAS) llama estas mismas 2 funciones sin ese parametro -- ahi
// textoVisibleDe(undefined, ...) cae solo a 'no-encontrado' y usa el texto de
// respaldo de siempre, comportamiento identico al que ya tenia antes de este fix.
export function paginaDocumentoRecibo(doc, r, numero, seccionEl) {
  paginaDocumentoAdjunto(doc, r, numero, 'Documento: recibo original de CFE', r._archivosReciboImgs || [], seccionEl);
}
export function paginaDocumentoVerificacion(doc, r, numero, seccionEl) {
  // Respeta el apagado por renglon de cada archivo (pedido explicito del usuario,
  // 2026-11-10, ver ID_DOCUMENTOS_VERIFICACION en secciones.js) -- mismo id/indice que
  // en pantalla, filtrado antes de dibujar, igual que tablaF() filtra filas/columnas
  // ocultas de una tabla real.
  const ocultos = new Set(r.tablaFilasOcultas?.['g18-documentos-verificacion'] || []);
  const imagenes = (r._archivosVerificacionImgs || []).filter((_, i) => !ocultos.has(i));
  paginaDocumentoAdjunto(doc, r, numero, 'Documento: verificación en sitio', imagenes, seccionEl);
}

// ---------- Proyecto segun verificacion en sitio / comparativo (secciones 19/20
// en pantalla) -- NUNCA tuvieron pagina propia en este PDF (hueco preexistente, ver
// CLAUDE.md). Solo existen si r.escenarioVerificado existe (se capturo cuantos
// paneles sugiere la verificacion en campo) -- mismo condicional que en pantalla
// (s24/s25 en secciones.js). Version condensada del mismo contenido (mismos numeros).
export function paginaProyectoVerificado(doc, r, numero) {
  const ev = r.escenarioVerificado;
  let y = encabezado(doc, numero, 'Su proyecto según la verificación en sitio', r.titular);
  y = bodyX(doc, y, `Mismo recibo, mismo cálculo -- solo cambia el número de paneles: ${ev.n} según la ` +
    `verificación en campo, en vez de los ${r.n} que calcula este sistema a partir del consumo real.`);
  y = spacer(y, 4);
  y = cardsRow(doc, y, [
    [M(ev.investment), 'Lo que costaría el sistema, IVA incluido'],
    [ev.payback ? `${ev.payback.toFixed(1)} años` : 'N/D', 'En cuánto tiempo se pagaría solo'],
    [M(ev.ahorroAnual), 'Lo que ahorraría en el primer año'],
  ]);
  y = spacer(y, 10);
  y = cardsRow(doc, y, [
    [`${ev.n} paneles`, `${r.moduloWp} W por módulo / ${ev.kwp.toFixed(2)} kWp`],
    [M(ev.ahorroAnual - ev.om1), 'Ahorro neto año 1, tras mantenimiento'],
    [PCT(ev.pctAhorro), 'Porcentaje de la factura que ahorraría'],
  ]);
  y = spacer(y, 10);
  if (ev.van != null || ev.tir != null) {
    y = tablaF(doc, y, 'g19-indicador-adicional', r, ['Indicador adicional', 'Valor'], [
      ['VAN (valor actual neto) al 10%', M(ev.van)],
      ['TIR (tasa interna de retorno)', ev.tir ? PCT(ev.tir) : 'No calculable'],
      ['Recuperación del flujo', ev.recuperacionAcumulada ? `${ev.recuperacionAcumulada.toFixed(1)} años` : 'No se recupera en 25 años'],
    ], { widths: [CONTENT_W * 0.6, CONTENT_W * 0.4], small: true });
    y = spacer(y, 8);
  }
  notice(doc, y, 'El ahorro no necesariamente sube con más paneles: si el consumo real ya satura el piso de ' +
    'ahorro estructural de la tarifa, paneles de más no generan ahorro adicional, solo más inversión.');
}

export function paginaComparativoVerificacion(doc, r, numero) {
  const ev = r.escenarioVerificado;
  const dif = ev.diferenciaPaneles;
  let y = encabezado(doc, numero, 'Comparativo: calculado vs. verificación en sitio', r.titular);
  y = bodyX(doc, y, `Lo que este sistema calculó a partir del consumo real del recibo (${r.n} paneles) comparado ` +
    `con lo que propone el documento de verificación en campo (${ev.n} paneles) -- ambos escenarios usan el ` +
    'mismo recibo, la misma tarifa y los mismos costos, solo cambia el número de paneles.');
  y = spacer(y, 4);
  y = tablaF(doc, y, 'g20-comparativo', r, ['Concepto comparable', 'Calculado por el sistema', 'Verificación en sitio', 'Diferencia'], [
    ['Paneles', `${r.n}`, `${ev.n}`, dif === 0 ? 'Igual' : `${dif > 0 ? '+' : ''}${dif}`],
    ['Potencia', `${r.kwp.toFixed(2)} kWp`, `${ev.kwp.toFixed(2)} kWp`, `${(ev.kwp - r.kwp).toFixed(2)} kWp`],
    ['Inversión, IVA incluido', M(r.investment), M(ev.investment), M(ev.investment - r.investment)],
    ['Ahorro anual', M(r.ahorroAnual), M(ev.ahorroAnual), M(ev.diferenciaAhorro)],
    ['Recuperación simple', r.payback ? `${r.payback.toFixed(1)} años` : 'N/D', ev.payback ? `${ev.payback.toFixed(1)} años` : 'N/D', '—'],
    ['% de ahorro de factura', PCT(r.pctAhorro), PCT(ev.pctAhorro), '—'],
  ], { widths: [CONTENT_W * 0.3, CONTENT_W * 0.25, CONTENT_W * 0.25, CONTENT_W * 0.2], small: true });
  y = spacer(y, 8);
  y = bodyX(doc, y, dif === 0
    ? 'El número de paneles calculado por el consumo real coincide con lo que sugirió la verificación en campo -- ambos escenarios salen iguales.'
    : `La verificación en campo sugiere ${Math.abs(dif)} panel${Math.abs(dif) === 1 ? '' : 'es'} ` +
      `${dif > 0 ? 'más' : 'menos'} que lo que calcula este sistema a partir del consumo real del recibo, lo que ` +
      `cambia la inversión en ${M(Math.abs(ev.investment - r.investment))} y el ahorro anual en ` +
      `${M(Math.abs(ev.diferenciaAhorro))}. Ambos criterios son válidos; conviene presentarle al cliente las dos ` +
      'referencias antes de decidir el tamaño final.');
  notice(doc, y, 'Ambos escenarios se calcularon con el mismo motor (mismo recibo, misma tarifa, mismos costos ' +
    'de materiales) -- solo cambia el número de paneles. No implica que ambos tamaños quepan físicamente en el ' +
    'espacio disponible; eso depende de la medición real en sitio.');
}

// ---------- Pagina 7: produccion ----------
function pagina07(doc, r, numero) {
  let y = encabezado(doc, numero, 'Cuánta electricidad podría producir', r.titular);
  y = cardsRow(doc, y, [
    [`${r.gen.toLocaleString('en-US', { maximumFractionDigits: 0 })} kWh`, 'Producción anual regional estimada'],
    [`${(r.gen / r.kwp).toLocaleString('en-US', { maximumFractionDigits: 2 })}`, 'kWh por kWp al año de referencia'],
    [`${r.kwp.toFixed(2)} kWp`, 'Potencia nominal de cálculo'],
  ]);
  y = spacer(y, 10);
  y = bodyX(doc, y, 'El segundo número (kWh por kWp al año) es un indicador de rendimiento: cuánta energía ' +
    'produce, en promedio, cada kWp instalado durante un año. Con el criterio fijo de horas-sol, ese número ' +
    'sale prácticamente igual sin importar el predio o el tamaño del sistema.');
  y = spacer(y, 8);
  const mesesAbrev = r.rows.map(x => x.mes.slice(0, 3));
  if (graficoIncluido(r, 'g07-extrapolado')) {
    y = groupedBarChart(doc, y, mesesAbrev, 'Generación estimada', r.rows.map(x => x.generacionKwh), 'Consumo extrapolado', r.rows.map(x => x.consumoExtrapoladoKwh));
    y = spacer(y, 10);
  }
  y = tablaF(doc, y, 'g07-detalle-mensual', r, ['Mes', 'Generación estimada', 'Consumo extrapolado'],
    r.rows.map(x => [x.mes, `${x.generacionKwh.toLocaleString('en-US', { maximumFractionDigits: 0 })} kWh`, `${x.consumoExtrapoladoKwh.toLocaleString('en-US', { maximumFractionDigits: 0 })} kWh`]),
    { widths: [CONTENT_W * 0.34, CONTENT_W * 0.33, CONTENT_W * 0.33], small: true });
  y = spacer(y, 8);
  notice(doc, y, r.metodoGeneracion || 'Criterio preliminar de horas-sol fijas (4.5 h/día, 30.5 días/mes), no ' +
    'una simulación con PVGIS ni datos de irradiancia reales del sitio. No hay simulación de sombras exactas ' +
    'del inmueble ni descuento de pérdidas de sistema.');
}

// ---------- Pagina 8: impacto ambiental ----------
function pagina08(doc, r, numero) {
  let y = encabezado(doc, numero, 'Impacto ambiental estimado', r.titular);
  const co2Kg = r.gen * FACTOR_CO2_KG_KWH, co2Ton = co2Kg / 1000, arboles = co2Kg / CO2_KG_POR_ARBOL_ANIO;
  y = bodyX(doc, y, 'Generar su propia electricidad con el sol, en vez de tomarla de la red (que en México ' +
    'todavía se produce en buena parte quemando combustibles), evita que se emita cierta cantidad de CO2 cada ' +
    'año que el sistema esté funcionando.');
  y = spacer(y, 8);
  y = cardsRow(doc, y, [
    [`${co2Ton.toLocaleString('en-US', { maximumFractionDigits: 1 })} ton`, 'CO2 evitado estimado, cada año'],
    [`${arboles.toLocaleString('en-US', { maximumFractionDigits: 0 })} árboles`, 'Equivalente en árboles urbanos durante un año'],
    [`${(co2Ton * 25).toLocaleString('en-US', { maximumFractionDigits: 0 })} ton`, 'CO2 evitado acumulado en 25 años (sin degradación)'],
  ]);
  y = spacer(y, 10);
  notice(doc, y, `Estimación de referencia: ${FACTOR_CO2_KG_KWH} kg de CO2 evitado por cada kWh generado ` +
    `(Sistema Eléctrico Nacional, SEMARNAT/CFE) y ~${CO2_KG_POR_ARBOL_ANIO.toFixed(0)} kg de CO2 absorbido por ` +
    'árbol urbano al año. No es una certificación de bono de carbono ni una medición propia del inmueble.');
}

// ---------- Pagina 9: como se obtiene el ahorro ----------
function pagina09(doc, r, numero) {
  let y = encabezado(doc, numero, 'Cómo se obtiene el ahorro que se presenta', r.titular);
  y = bodyX(doc, y, 'Se calcula mes a mes la energía neta facturable y la factura resultante. En palabras ' +
    'simples, el modelo sigue estas reglas:');
  if (graficoIncluido(r, 'g09-criterios')) {
    y = tablaF(doc, y, 'g09-criterios', r, ['Criterio', 'Aplicación'], [
      ['Compensación', 'Medición neta: lo que generan los paneles se resta directo de su consumo del mes, en vez de vendérselo a CFE aparte. Requiere contrato y medidor autorizados.'],
      ['Energía aplicada', 'Cada mes se compara cuánto consumió contra cuánto generaron los paneles ese mismo mes, y se usa el MENOR de los dos (se reserva además un 1% de margen de seguridad).'],
      ['Excedentes entre meses', 'Si algún mes los paneles generan más de lo que consume, ese sobrante no se guarda para el siguiente mes ni se vende aparte.'],
      [listaConceptos(r.meta.noReducibles), 'Se conserva su gasto de referencia proporcional a días, sin presupuestar ahorro adicional.'],
      ['IVA y DAP', 'Se incluye IVA 16%. Se conserva el DAP observado en los pagos modelados.'],
    ], { widths: [CONTENT_W * 0.3, CONTENT_W * 0.7] });
    y = spacer(y, 8);
  }
  notice(doc, y, 'Esta estimación no es una refacturación oficial de CFE ni una garantía mínima de ahorro.');
}

// ---------- Pagina 10: cuanto pagaria y ahorraria ----------
function pagina10(doc, r, numero) {
  let y = encabezado(doc, numero, 'Cuánto pagaría y cuánto ahorraría', r.titular);
  if (graficoIncluido(r, 'g10-anual')) {
    y = horizontalBarChart(doc, y, [
      ['Hoy, sin paneles (al año)', r.annualbefore, '#163b4c'],
      ['Con paneles (al año)', r.annualafter, '#21798b'],
    ], { height: 70 });
    y = spacer(y, 10);
  }
  if (graficoIncluido(r, 'g10-tabla-comparativa')) {
    y = tablaF(doc, y, 'g10-tabla-comparativa', r, ['Concepto comparable', 'Sin sistema', 'Con sistema estimado'], [
      ['Gasto anual de referencia', M(r.annualbefore), M(r.annualafter)],
      ['Promedio mensual del año', M(r.annualbefore / 12), M(r.annualafter / 12)],
      ['Ahorro anual de factura', '—', M(r.ahorroAnual)],
      ['Ahorro promedio mensual', '—', M(r.ahorroAnual / 12)],
      ['Ahorro total anual', '—', PCT(r.pctAhorro)],
      ['Mantenimiento del primer año', '—', M(r.om1)],
      ['Ahorro neto del primer año', '—', M(r.ahorroAnual - r.om1)],
    ], { widths: [CONTENT_W * 0.4, CONTENT_W * 0.3, CONTENT_W * 0.3] });
    y = spacer(y, 8);
  }
  y = bodyX(doc, y, 'El ahorro de factura es la diferencia entre pagos de electricidad. El ahorro neto descuenta el mantenimiento; no son cifras que deban sumarse.');
  notice(doc, y, 'Son estimaciones con las bases descritas. El ahorro real se medirá después de operar, comparando recibos equivalentes y cambios de consumo.');
}

// ---------- Pagina 11: presupuesto resumen ----------
function pagina11(doc, r, numero) {
  let y = encabezado(doc, numero, 'Presupuesto y alcance económico', r.titular);
  if (graficoIncluido(r, 'g11-resumen-venta')) {
    y = tablaF(doc, y, 'g11-resumen-venta', r, ['Resumen de venta', 'Importe'], [
      ['Subtotal', M(r.ventaSinIva)], ['IVA 16%', M(r.iva)], ['INVERSIÓN TOTAL ESTIMADA', M(r.investment)],
    ], { widths: [CONTENT_W * 0.6, CONTENT_W * 0.4] });
    y = spacer(y, 10);
  }
  const cat = agruparPresupuesto(r.materiales);
  if (graficoIncluido(r, 'g11-presupuesto')) {
    y = horizontalBarChart(doc, y, cat.map(([g, v]) => [g, v, '#163b4c']), { height: cat.length * 24 + 10 });
    y = spacer(y, 10);
  }
  y = bodyX(doc, y, 'La inversión contempla los equipos y trabajos agrupados arriba (detalle completo en la ' +
    'página siguiente): módulos, inversor presupuestado, estructura, conexión, protecciones, monitoreo, ' +
    'ingeniería, gestión, flete, montaje y pruebas dentro de las cantidades previstas.');
  notice(doc, y, 'Los precios deberán actualizarse y confirmarse antes de contratar. El total ya incluye el ' +
    'IVA modelado. No se supone devolución de IVA, deducciones fiscales, subsidios ni financiamiento.');
}

// ---------- Pagina 12: detalle presupuesto ----------
function pagina12(doc, r, numero) {
  let y = encabezado(doc, numero, 'Detalle del presupuesto', r.titular);
  if (graficoIncluido(r, 'g12-detalle-presupuesto')) {
    // Columna "Precio unitario" agregada 2026-11-09 -- mismo fix que en secciones.js,
    // para que este generador viejo (usado por "Enviar por WhatsApp") no se desfase.
    y = tablaF(doc, y, 'g12-detalle-presupuesto', r, ['Concepto', 'Cantidad prevista', 'Precio unitario', 'Importe sin IVA'],
      r.materiales.map(m => [m.partida, `${m.cantidad.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${m.unidad}`, M(m.unitarioMxn), M(m.importeMxn)]),
      { widths: [CONTENT_W * 0.4, CONTENT_W * 0.2, CONTENT_W * 0.2, CONTENT_W * 0.2], small: true });
    y = spacer(y, 8);
  }
  y = bodyX(doc, y, `Subtotal: ${M(r.ventaSinIva)} · IVA: ${M(r.iva)} · Inversión con IVA: ${M(r.investment)}.`);
  notice(doc, y, 'Las capacidades, longitudes y accesorios son provisiones. El modelo de inversor, calibres y ' +
    'cantidades finales se ajustarán mediante ingeniería y cotización vigente antes de contratar.');
}

// ---------- Pagina 13: recuperacion ----------
function pagina13(doc, r, numero) {
  let y = encabezado(doc, numero, 'En cuánto se recuperaría la inversión', r.titular);
  const paybackTxt = r.payback ? `${r.payback.toFixed(1)} años` : 'no calculable con el ahorro actual';
  y = bodyX(doc, y, `Esta es la pregunta más importante de todo el estudio: ¿cuándo deja de deber la inversión ` +
    `y empieza a ganar? Con este cálculo, la respuesta es ${paybackTxt}.`);
  const flujo25 = r.flujo25Rows || [];
  if (flujo25.length && graficoIncluido(r, 'g13-curva')) {
    y = spacer(y, 6);
    y = curve(doc, y, flujo25.map(x => [x.anio, x.acumuladoMxn]), { recuperacionAnios: r.recuperacionAcumulada });
    y = spacer(y, 6);
  }
  const roi = r.investment ? r.ahorroAnual / r.investment : 0;
  const bc = beneficioCosto(r);
  const reposicionAnio = flujo25.find(x => x.reposicionMxn)?.anio;
  // "Recuperación simple"/"ROI anual simple" NUNCA restan mantenimiento (mismo r.payback/
  // roi que secciones.js) -- texto corregido a BRUTO en vez de "neto" (auditoria
  // 2026-11-06, hallazgo 2), misma correccion aplicada en secciones.js.
  const filasInd = [
    ['Recuperación simple', r.payback ? `${r.payback.toFixed(1)} años: inversión / ahorro BRUTO del primer año (antes de mantenimiento).` : 'Sin recuperación con el ahorro del primer año.'],
    ['Recuperación del flujo', r.recuperacionAcumulada ? `${r.recuperacionAcumulada.toFixed(1)} años, considerando degradación, mantenimiento creciente${reposicionAnio ? ` y reposición del inversor en el año ${reposicionAnio}.` : '.'}` : 'No se recupera dentro del horizonte de 25 años.'],
    ['ROI anual simple', `${PCT(roi)}: ahorro BRUTO del primer año (antes de mantenimiento) / inversión.`],
    ['TIR (tasa interna de retorno)', r.tir ? `${PCT(r.tir)} del flujo de 25 años: equivale a la ganancia anual de invertir ese dinero ahí en vez de en otra parte. No es una tasa garantizada.` : 'No calculable con un solo cambio de signo.'],
    ['VAN (valor actual neto) al 10%', `${M(r.van)}: cuánto más valen, en pesos de hoy, los ahorros futuros que lo que costó el sistema.`],
  ];
  if (bc != null) filasInd.push(['Beneficio/costo', `${bc.toFixed(2)}: por cada peso invertido (y gastado en mantenimiento${reposicionAnio ? ' y reposición del inversor' : ''}), regresa ${bc.toFixed(2)} pesos actualizados en ahorros.`]);
  if (graficoIncluido(r, 'g13-indicadores')) {
    y = tablaF(doc, y, 'g13-indicadores', r, ['Indicador estimado', 'Resultado y explicación'], filasInd, { widths: [CONTENT_W * 0.3, CONTENT_W * 0.7], small: true });
  }
  y = spacer(y, 6);
  const escPct = r.escalamientoTarifaPct || 0;
  const escTxt = escPct
    ? `Se supone que la tarifa de CFE sube ${escPct.toFixed(1)}% anual (criterio del estudio, no una cifra oficial de CFE) a partir del año 1.`
    : 'Los precios de electricidad se mantienen constantes como base económica del recibo (sin supuesto de incremento de tarifa).';
  notice(doc, y, 'Se consideran degradación de 0.5% anual, mantenimiento inicial de 1% de la inversión total ' +
    '(con IVA) que crece 3% anual' + (reposicionAnio ? `, y reposición del inversor en el año ${reposicionAnio}. ` : '. No se incluyó reposición de inversor en este cálculo. ') + escTxt);
}

// ---------- Pagina 14: flujo 25 años ----------
function pagina14(doc, r, numero) {
  let y = encabezado(doc, numero, 'Flujo del proyecto durante 25 años', r.titular);
  const flujo25 = r.flujo25Rows || [];
  if (flujo25.length) {
    const reposicionAnio = flujo25.find(x => x.reposicionMxn)?.anio;
    const montoReposicion = flujo25.find(x => x.reposicionMxn)?.reposicionMxn || 0;
    y = bodyX(doc, y, `Año cero: inversión de ${M(r.investment)}. El flujo neto descuenta mantenimiento` +
      (reposicionAnio ? `, y en el año ${reposicionAnio}, ${M(montoReposicion)} de reposición del inversor.` : '. No se incluyó reposición de inversor en este cálculo.') + ' Importes en MXN.');
    const filasFlujo = flujo25.filter(x => x.anio > 0).map(x => [x.reposicionMxn ? `${x.anio} *` : x.anio, M(x.ahorroMxn), M(x.flujoMxn), M(x.acumuladoMxn)]);
    y = tablaF(doc, y, 'g14-detalle-flujo', r, ['Año', 'Ahorro factura', 'Flujo neto', 'Acumulado'], filasFlujo,
      { widths: [CONTENT_W * 0.15, CONTENT_W * 0.28, CONTENT_W * 0.28, CONTENT_W * 0.29], small: true });
    if (reposicionAnio) { y = spacer(y, 4); y = bodyX(doc, y, '* Año con reposición de inversor incluida en el Flujo neto.'); }
  } else {
    y = bodyX(doc, y, 'Flujo a 25 años no disponible para este cálculo.');
  }
  y = spacer(y, 6);
  notice(doc, y, 'El cálculo mensual no da valor a excedentes entre meses ni reduce los cargos por demanda; no ' +
    'incluye crédito, efectos fiscales, valor de rescate ni venta de energía.');
}

// ---------- Pagina 15: pagos mensuales ----------
function pagina15(doc, r, numero) {
  let y = encabezado(doc, numero, 'Pagos estimados por mes del año de referencia', r.titular);
  const mesesAbrev = r.rows.map(x => x.mes.slice(0, 3));
  if (graficoIncluido(r, 'g15-mensual')) {
    y = groupedBarChart(doc, y, mesesAbrev, 'Sin solar', r.rows.map(x => x.pagoSinSolarMxn), 'Con solar estimado', r.rows.map(x => x.pagoConSolarEstimadoMxn));
    y = spacer(y, 10);
  }
  y = tablaF(doc, y, 'g15-detalle-mensual', r, ['Mes', 'Sin solar', 'Con solar estimado', 'Ahorro estimado'],
    r.rows.map(x => [x.mes, M(x.pagoSinSolarMxn), M(x.pagoConSolarEstimadoMxn), M(x.ahorroEstimadoMxn)]),
    { widths: [CONTENT_W * 0.2, CONTENT_W * 0.27, CONTENT_W * 0.27, CONTENT_W * 0.26], small: true });
  y = spacer(y, 8);
  y = bodyX(doc, y, `Total anual: ${M(r.annualbefore)} sin solar y ${M(r.annualafter)} con solar. Ahorro estimado: ${M(r.ahorroAnual)}.`);
  notice(doc, y, 'Los meses son un año de referencia climático y de consumo extrapolado, no una fecha prometida ' +
    'de instalación. No se presentan meses del historial como si ya hubieran operado con paneles.');
}

// ---------- Pagina 16: que tan cerca del 100% ----------
function pagina16(doc, r, numero) {
  let y = encabezado(doc, numero, 'Qué tan cerca se puede llegar al 100% de ahorro', r.titular);
  if (graficoIncluido(r, 'g16-gauge')) {
    y = gauge(doc, y, r.pctMaxPeriodo, { label: 'Ahorro máximo posible de este recibo' });
    y = spacer(y, 10);
  }
  y = bodyX(doc, y, `Para ahorrar el 100% de un pago recurrente de ${M(r.pagoRecurrentePeriodo)} por ${r.periodoDias || '?'} ` +
    'días, el pago residual tendría que ser $0.00. La generación anual por sí sola no demuestra ese resultado.');
  y = bodyX(doc, y, 'La estimación comercial aquí presentada no llega a ese 100%, por DOS razones distintas e independientes entre sí:');
  y = spacer(y, 6);
  y = subX(doc, y, '1. El piso estructural de su tarifa');
  y = bodyX(doc, y, `El piso estructural de este recibo es ${M(r.pisoPeriodo)} por período (${PCT(r.pctMaxPeriodo)} ` +
    'de ahorro máximo) — ver página 4. Sin importar cuántos paneles se instalen, esta parte de la factura no baja a cero.');
  y = spacer(y, 6);
  y = subX(doc, y, '2. El alumbrado público (DAP), un cobro aparte');
  y = bodyX(doc, y, 'La Ley de Ingresos de cada municipio de Puebla suele fijar una cuota mensual de alumbrado ' +
    'público (DAP), con un descuento (estímulo) cuando el consumo de energía baja lo suficiente. Este cobro no ' +
    'depende de los paneles ni de la tarifa eléctrica: es un trámite municipal aparte.');
  notice(doc, y, 'No se ofrece un porcentaje de ahorro garantizado ni se declara un piso absoluto de pago. El ' +
    'contrato deberá usar un compromiso sustentado en medición, ingeniería y reglas de facturación verificadas.');
}

// ---------- Pagina 17: que falta ----------
function pagina17(doc, r, numero) {
  let y = encabezado(doc, numero, 'Qué hace falta para cerrar el ahorro', r.titular);
  y = bodyX(doc, y, 'Esta cotización se calculó únicamente con la información del recibo de CFE que se ' +
    'cargó o capturó — sin importar si ese recibo venía completo o no, esto SIEMPRE hace falta confirmar ' +
    'antes de poder ofrecer un presupuesto real y firme de este servicio:');
  if (graficoIncluido(r, 'g21-pendientes')) {
    tablaF(doc, y, 'g21-pendientes', r, ['Pendiente para un presupuesto real'], REQUISITOS_PRESUPUESTO_REAL.map(x => [x]), { small: true });
  }
}

// ---------- Pagina 17b: notas especificas de ESTE recibo ----------
function pagina17b(doc, r, numero) {
  let y = encabezado(doc, numero, 'Qué hace falta para cerrar el ahorro: notas de este cálculo', r.titular);
  const notas = r.notas || [];
  if (notas.length) {
    for (const n of notas) { y = notice(doc, y, n); y = spacer(y, 6); }
  } else {
    notice(doc, y, 'Sin pendientes adicionales detectados automáticamente en este recibo en particular.');
  }
}

// ---------- Pagina 18: alcance y condiciones ----------
function pagina18(doc, r, numero) {
  let y = encabezado(doc, numero, 'Alcance, exclusiones y condiciones comerciales', r.titular);
  y = bodyX(doc, y, 'Incluye provisiones para suministro, montaje, conexión, protecciones, puesta a tierra, ' +
    'monitoreo, ingeniería, documentación, preparación y seguimiento de gestión, flete, pruebas y capacitación básica dentro del presupuesto.');
  y = bodyX(doc, y, 'No incluye baterías, respaldo en apagones, refuerzo estructural, sustitución de cubierta, ' +
    'impermeabilización general, cambio de transformador, obra de media tensión ni rehabilitación eléctrica ' +
    'ajena al sistema. Cualquier necesidad adicional se cotizará y aceptará por escrito.');
  if (graficoIncluido(r, 'g22-condiciones-pago')) {
    y = tablaF(doc, y, 'g22-condiciones-pago', r, ['Condiciones de pago sugeridas', ''], COMERCIAL.pagos.map(pg => [`${Math.round(pg.porcentaje * 100)}%`, pg.hito]),
      { widths: [CONTENT_W * 0.15, CONTENT_W * 0.85] });
    y = spacer(y, 8);
  }
  y = bodyX(doc, y, COMERCIAL.naturalezaCondiciones);
  y = tablaF(doc, y, 'g22-detalle-cronograma', r, ['Etapa', 'Plazo estimado'], COMERCIAL.cronograma, { widths: [CONTENT_W * 0.4, CONTENT_W * 0.6], small: true });
  y = spacer(y, 6);
  notice(doc, y, 'Los precios deberán actualizarse antes de contratar. Las garantías serán las documentadas para los equipos y trabajos efectivamente suministrados.');
}

// ---------- Pagina 19: entrega y mantenimiento ----------
function pagina19(doc, r, numero) {
  let y = encabezado(doc, numero, 'Entrega, mantenimiento y comprobación del ahorro', r.titular);
  if (graficoIncluido(r, 'g23-entrega')) {
    y = tablaF(doc, y, 'g23-entrega', r, ['Momento', 'Entrega o comprobación'], [
      ['Antes de obra', 'Plano, diagrama unifilar, memoria eléctrica, cálculo de estructura, modelos, protecciones, alcance y contrato.'],
      ['Al terminar', 'Inventario y números de serie, pruebas, documentación de conexión, manuales y garantías, plano final, acceso al monitoreo y capacitación.'],
      ['Durante operación', 'Registrar producción, importaciones, exportaciones, demanda, consumo y recibos. Revisar limpiezas, conexiones y alarmas.'],
      ['Para medir ahorro', 'Comparar factura sin solar ajustada al consumo real con factura efectivamente pagada, en períodos equivalentes. Separar IVA, DAP, adeudos y cambios tarifarios.'],
    ], { widths: [CONTENT_W * 0.25, CONTENT_W * 0.75] });
    y = spacer(y, 8);
  }
  y = bodyX(doc, y, `El mantenimiento inicial modelado es ${M(r.om1)} al año. Es una provisión económica, no una ` +
    'póliza incluida gratuitamente ni un precio fijo para toda la vida del sistema.');
  y = notice(doc, y, COMERCIAL.garantiaInstalacion);
  y = spacer(y, 4);
  notice(doc, y, COMERCIAL.garantiaEquipos);
}

// ---------- Pagina 20: glosario ----------
function pagina20(doc, r, numero) {
  let y = encabezado(doc, numero, 'Glosario: términos usados en este estudio', r.titular);
  y = bodyX(doc, y, 'Para consultar rápido el significado de los términos técnicos que aparecen en las páginas anteriores.');
  y = spacer(y, 8);
  if (graficoIncluido(r, 'g24-glosario')) tablaF(doc, y, 'g24-glosario', r, ['Término', 'Qué significa'], [
    ['kWh (kilowatt-hora)', 'La unidad en la que CFE cobra la electricidad: cuánta energía se consumió.'],
    ['kW / kWp', 'La potencia (velocidad del consumo/generación). "Pico" es la potencia máxima de los paneles en condiciones ideales.'],
    ['Demanda contratada', 'En tarifas de negocio/gobierno, la potencia máxima reservada por CFE; se paga por tenerla disponible.'],
    ['Medición neta', 'Esquema de CFE donde la energía de los paneles se resta de la que se consume, en vez de venderse aparte.'],
    ['Relación de desempeño (PR)', 'Qué tan cerca está la producción real de lo ideal, tras descontar pérdidas.'],
    ['Degradación', 'Pérdida pequeña y normal de producción cada año (en este estudio, 0.5% anual).'],
    ['Recuperación simple', 'En cuántos años el ahorro de los primeros años iguala lo que costó el sistema.'],
    ['Recuperación del flujo', 'Lo mismo, pero con degradación, mantenimiento creciente y cambio de inversor.'],
    ['ROI', 'El ahorro del primer año como porcentaje de lo que costó el sistema.'],
    ['TIR', 'La ganancia anual que representa la inversión, para comparar contra otras opciones.'],
    ['VAN', 'Cuánto vale hoy el conjunto de ahorros futuros, descontando lo que costó el sistema.'],
    ['Beneficio/costo', 'Por cada peso que cuesta el sistema, cuántos pesos regresa en ahorros.'],
    ['DAP', 'Cobro municipal de alumbrado público que CFE incluye en el recibo; no es consumo del predio.'],
    ['CENACE / SCnMEM', 'Cargos trasladados tal cual del operador del mercado eléctrico nacional.'],
  ], { widths: [CONTENT_W * 0.28, CONTENT_W * 0.72], small: true });
}

// ---------- Pagina 21: fuentes ----------
function pagina21(doc, r, numero) {
  let y = encabezado(doc, numero, 'Fuentes y trazabilidad del cálculo', r.titular);
  y = bodyX(doc, y, `Documento principal: recibo CFE del servicio ${r.noServicio || 'por confirmar'}${r.periodoDias ? ', período ' + r.periodoDias + ' días' : ''}.`);
  y = bodyX(doc, y, 'Producción: ' + (r.metodoGeneracion || 'criterio preliminar de horas-sol fijas (4.5 h/día, 30.5 días/mes), no PVGIS ni irradiancia real del sitio.'));
  y = bodyX(doc, y, 'Marco tarifario: Acuerdo CNE 2026, apartados 3.1.2, 5.1, 5.2 y 5.5. sidof.segob.gob.mx/notas/docFuente/5783862');
  y = bodyX(doc, y, 'Compensación: metodología de medición neta del Anexo I de RES/142/2017 y contrato que corresponda al suministro.');
  y = bodyX(doc, y, 'DAP: Ley de Ingresos del municipio correspondiente para el ejercicio vigente; verificar artículo y porcentaje de estímulo aplicable.');
  y = bodyX(doc, y, `Impacto ambiental: factor de emisión de referencia ${FACTOR_CO2_KG_KWH} kg CO2/kWh (SEMARNAT/CFE) y absorción de referencia de árbol urbano.`);
  notice(doc, y, 'Se conserva evidencia, archivo de cálculo mensual, presupuesto y flujo financiero. El recibo ' +
    'no acredita un contrato de generación firmado ni un ahorro futuro medido.');
}

// Tercer elemento opcional: condicion(r) -- si se da y regresa false, la pagina no se
// incluye aunque su bloque este activo. La usan pagina06b (la foto del sembrado) y
// pagina06c (fotos de condiciones del inmueble), que solo existen si el proyecto
// tiene algo cargado.
// Cuarto elemento: el numero de SECCION en pantalla (1-25, secciones.js/bloques.js)
// que corresponde a esta pagina del PDF -- permite que un apagado INDIVIDUAL de una
// seccion (r.seccionesExcluidas, no solo el bloque completo) tambien se refleje aqui.
// pagina06b/06c no tienen seccion propia en pantalla (son contenido condicional
// DENTRO de la seccion 6) -- comparten el numero 6: apagar la seccion 6 individual
// tambien las quita a ellas. 'documentos' (secciones 17-18: recibo/verificacion
// adjuntos) y 'comparativo_verificacion' (secciones 19-20) ya tienen pagina propia,
// agregadas 2026-11-07 -- hueco preexistente desde 2026-10-31, cerrado.
const PAGINAS = [
  ['resumen', pagina01, null, 1],
  ['recibo_cargos', pagina02, null, 2], ['recibo_cargos', pagina03, null, 3], ['recibo_cargos', pagina04, null, 4],
  ['consumo_sistema', pagina05, null, 5],
  // Seccion 19 ("Su proyecto segun la verificacion en sitio") adelantada aqui, justo
  // antes del sistema propuesto (seccion 6) -- mismo orden que ordenSeccionesEfectivo
  // en secciones.js: primero el proyecto segun la agencia estatal, despues nuestro
  // propio calculo. El comparativo (seccion 20) se deja en su lugar de siempre, mas
  // adelante -- pedido explicito del usuario de no moverlo junto con la 19.
  ['comparativo_verificacion', paginaProyectoVerificado, (r) => !!r.escenarioVerificado, 19],
  ['consumo_sistema', pagina06, null, 6],
  ['consumo_sistema', pagina06b, (r) => !!r.fotoSembrado, 6],
  ['consumo_sistema', pagina06c, (r) => !!(r.fotosInmueble && r.fotosInmueble.length), 6],
  ['produccion', pagina07, null, 7], ['ambiental', pagina08, null, 8],
  ['ahorro_pagos', pagina09, null, 9], ['ahorro_pagos', pagina10, null, 10],
  ['presupuesto', pagina11, null, 11], ['presupuesto', pagina12, null, 12],
  ['recuperacion', pagina13, null, 13], ['recuperacion', pagina14, null, 14],
  ['pagos_100', pagina15, null, 15], ['pagos_100', pagina16, null, 16],
  ['documentos', paginaDocumentoRecibo, (r) => !!(r._archivosReciboImgs && r._archivosReciboImgs.length), 17],
  ['documentos', paginaDocumentoVerificacion, (r) => !!(r._archivosVerificacionImgs && r._archivosVerificacionImgs.length), 18],
  ['comparativo_verificacion', paginaComparativoVerificacion, (r) => !!r.escenarioVerificado, 20],
  ['pendientes', pagina17, null, 21], ['pendientes', pagina17b, null, 21],
  ['alcance', pagina18, null, 22], ['alcance', pagina19, null, 23],
  ['glosario_fuentes', pagina20, null, 24], ['glosario_fuentes', pagina21, null, 25],
];

// generarPdf(r, {secciones, seccionesExcluidas}) -- secciones: array de claves de
// BLOQUES_COTIZACION a incluir (null/undefined = todas, el default). seccionesExcluidas:
// numeros de seccion (1-25) excluidos INDIVIDUALMENTE aunque su bloque siga activo --
// mismo estado que controla el indice en pantalla (ver onToggleSeccion en app.js),
// pedido explicito del usuario, 2026-11-05, para que apagar una seccion suelta tambien
// la quite del PDF, no solo de la pantalla. 'resumen' se incluye siempre aunque no
// venga en la lista. Las paginas que sobreviven el filtro se renumeran de corrido (1,
// 2, 3...) -- mismo criterio que generar_pdf() en Python.
export function generarPdf(r, { secciones = null, seccionesExcluidas = null } = {}) {
  const activas = new Set(secciones != null ? secciones : BLOQUES_COTIZACION.map(([c]) => c));
  activas.add('resumen');
  const excluidasIndividual = new Set(seccionesExcluidas || []);
  const paginasFiltradas = PAGINAS.filter(([clave, , condicion, seccionNum]) =>
    activas.has(clave) && !excluidasIndividual.has(seccionNum) && (!condicion || condicion(r)));

  const titulo = `ESTUDIO DEL SISTEMA SOLAR · ${r.titular}`;
  const subtitulo = `${r.tarifa} · servicio ${r.noServicio || ''} · ${r.fechaEstudio} · ${r.n} paneles de ${r.moduloWp} W`;
  const aviso = 'Presupuesto preliminar. Los precios deberán actualizarse antes de contratar.';
  const paginas = paginasFiltradas.map(([, fn], i) => (doc) => fn(doc, r, i + 1));
  return buildPdf(titulo, subtitulo, aviso, paginas);
}

// "Cotizacion completa" CON las ediciones de texto reales -- pedido explicito del
// usuario, 2026-11-07, tras varias rondas donde el documento no las reflejaba (ver
// la nota larga al inicio de propuestaDom.js para el porque de este diseño en vez de
// intentar "conectar" los textos editados a las paginas fijas de arriba).
//
// No recibe secciones/seccionesExcluidas como generarPdf() -- lee directo cuales
// secciones estan activas del DOM de #contenedorSecciones, que YA viene renderizado
// con exactamente ese filtro (clase .seccion-apagada, calculada por secciones.js con
// el mismo r.seccionesActivas/r.seccionesExcluidas). Requiere que la pantalla ya haya
// calculado y renderizado este mismo `r` -- siempre es el caso cuando se llama desde
// el boton real de la app (nunca se calcula un PDF sin haber calculado la cotizacion
// primero).
//
// Las secciones 17/18/19/20 (documentos adjuntos + comparativo vs. verificacion en
// sitio) siguen usando sus funciones dedicadas -- manejan datos (imagenes ya
// descargadas, escenario verificado) que no son texto plano del DOM. El resto se
// dibuja genericamente leyendo el contenido YA renderizado (con ediciones aplicadas).
export function generarPdfCompletaDesdeVista(r) {
  const doc = crearDoc();
  const contenedor = document.getElementById('contenedorSecciones');
  const seccionesDom = contenedor
    ? Array.from(contenedor.querySelectorAll(':scope > .seccion')).filter((s) => !s.classList.contains('seccion-apagada'))
    : [];

  // Secciones 19/20 (comparativo vs. verificacion en sitio) SE QUITARON de aqui
  // (2026-11-07) -- usaban paginaProyectoVerificado/paginaComparativoVerificacion
  // (texto fijo, no reflejan ediciones), el mismo problema que esta reescritura entera
  // vino a resolver. A diferencia de 17/18 (que si necesitan imagenes remotas
  // pre-descargadas), 19/20 son solo parrafos/tarjetas/tablas -- el mismo contenido que
  // cualquier otra seccion generica, ya resuelto en el DOM con sus ediciones aplicadas.
  seccionesDom.forEach((seccionEl, i) => {
    const numero = Number((seccionEl.id || '').replace('seccion-', ''));
    if (i > 0) doc.addPage();
    const pag = doc.getNumberOfPages();
    if (numero === 17 && r._archivosReciboImgs && r._archivosReciboImgs.length) paginaDocumentoRecibo(doc, r, pag, seccionEl);
    else if (numero === 18 && r._archivosVerificacionImgs && r._archivosVerificacionImgs.length) paginaDocumentoVerificacion(doc, r, pag, seccionEl);
    else dibujarSeccionGenerica(doc, seccionEl);
  });

  const titulo = `ESTUDIO DEL SISTEMA SOLAR · ${r.titular}`;
  const subtitulo = `${r.tarifa} · servicio ${r.noServicio || ''} · ${r.fechaEstudio} · ${r.n} paneles de ${r.moduloWp} W`;
  const aviso = 'Presupuesto preliminar. Los precios deberán actualizarse antes de contratar. Documento generado desde la vista en pantalla -- incluye tus ediciones.';
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    dibujarHeaderFooter(doc, titulo, subtitulo, aviso, p, total);
  }
  return doc;
}
