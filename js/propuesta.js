// Generador del PDF de la cotizacion -- port progresivo de app/propuesta.py. Cada
// pagina es una funcion (doc, r) => void que dibuja desde CONTENT_TOP hacia abajo,
// pensada para caber en una sola pagina A4 (mismo criterio que el Python: "recortar
// para que quepa", no flujo automatico multi-pagina). Ver pdfComponents.js para la
// diferencia de arquitectura frente a reportlab.
import {
  CONTENT_TOP, CONTENT_W, MARGIN_L, NAVY, TEAL, GOLD, GREY,
  headX, subX, bodyX, spacer, cardsRow, notice, table, curve,
  groupedBarChart, horizontalBarChart, gauge, buildPdf,
} from './pdfComponents.js';

const M = (x) => `$${x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PCT = (x) => `${(100 * x).toFixed(1)}%`;

export const NOMBRES_CONCEPTO = {
  energia: 'Energía', energia_base: 'Energía base', energia_intermedia: 'Energía intermedia',
  energia_punta: 'Energía punta', transmision: 'Transmisión', cenace: 'CENACE', scnmem: 'SCnMEM',
  suministro: 'Suministro', distribucion: 'Distribución', capacidad: 'Capacidad',
};

function lista(keys) {
  return keys && keys.length ? keys.map(k => NOMBRES_CONCEPTO[k] || k).join(' + ') : '—';
}

// Beneficio/costo del flujo a 25 anios -- mismo calculo que propuesta.beneficio_costo() en Python.
export function beneficioCosto(r) {
  const flujo25 = r.flujo25Rows || [];
  if (!flujo25.length) return null;
  const beneficioDesc = flujo25.filter(x => x.anio > 0).reduce((s, x) => s + x.ahorroMxn / Math.pow(1.10, x.anio), 0);
  const costoDesc = r.investment + flujo25.filter(x => x.anio > 0).reduce((s, x) => s + x.omMxn / Math.pow(1.10, x.anio), 0);
  return costoDesc ? beneficioDesc / costoDesc : null;
}

// ---------- Pagina 1: resumen ----------
function paginaResumen(doc, r) {
  let y = CONTENT_TOP;
  y = headX(doc, y, 'Su proyecto, explicado en una página');
  y = subX(doc, y, `${r.titular} · ${r.domicilio || 'domicilio por confirmar'}`);
  y = bodyX(doc, y, `Servicio CFE ${r.noServicio || 'por confirmar'} · Estudio del ${r.fechaEstudio}.`);
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
    ? ` (o ${r.recuperacionAcumulada.toFixed(1)} años si se cuenta el mantenimiento y el cambio de inversor en el año 13)` : '';
  y = bodyX(doc, y, `El sistema completo cuesta ${M(r.investment)} (ya con IVA). Con el ahorro que generaría cada ` +
    `mes, esa inversión se recupera en aproximadamente ${recupTxt}${flujoTxt}. Después de ese tiempo, el ahorro ` +
    'mensual es ganancia, no recuperación de lo invertido.');
  y = bodyX(doc, y, `En el año de referencia se estima pasar de pagar ${M(r.annualbefore)} a ${M(r.annualafter)} ` +
    `al año. El promedio mensual sería ${M(r.annualafter / 12)} en vez de ${M(r.annualbefore / 12)}. Son ` +
    'promedios de un modelo, no pagos mensuales fijos.');

  y = spacer(y, 4);
  y = notice(doc, y, 'El recibo permite comprobar el gasto actual; el ahorro futuro es una estimación ' +
    `condicionada. Se conserva el gasto observado de ${lista(r.meta.noReducibles)} sin anticipar ahorro ` +
    'adicional. Los precios deberán actualizarse antes de contratar.');
  return y;
}

export function generarPdf(r, { secciones = null } = {}) {
  void secciones; // bloques apagables: pendiente, ver ESTADO.md -- por ahora solo pagina 1
  const titulo = `ESTUDIO DEL SISTEMA SOLAR · ${r.titular}`;
  const subtitulo = `${r.tarifa} · servicio ${r.noServicio || ''} · ${r.fechaEstudio} · ${r.n} paneles de ${r.moduloWp} W`;
  const aviso = 'Presupuesto preliminar. Los precios deberán actualizarse antes de contratar.';
  const paginas = [(doc) => paginaResumen(doc, r)];
  return buildPdf(titulo, subtitulo, aviso, paginas);
}
