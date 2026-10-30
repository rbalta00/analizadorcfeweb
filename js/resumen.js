// Port 1:1 de app/resumen.py: los 2 PDFs de apoyo para presentar una cotizacion, para
// tenerlos a la mano en la reunion con el cliente sin hojear las 21 paginas.
// - generarResumenEjecutivo: 1 pagina con los numeros YA calculados de un caso
//   especifico (el mismo objeto `r` que usa propuesta.generarPdf).
// - generarGuiaPresentacion: 1 pagina generica (no depende de ningun caso) de como
//   presentar cualquier cotizacion de 21 paginas.
import {
  CONTENT_TOP, CONTENT_W, headX, subX, bodyX, spacer, cardsRow, notice, table, buildPdf,
} from './pdfComponents.js';
import { M, PCT, listaConceptos } from './util.js';
import { beneficioCosto } from './propuesta.js';

export function generarResumenEjecutivo(r) {
  const bc = beneficioCosto(r);
  const reposicionAnio = (r.flujo25Rows || []).find(x => x.reposicionMxn)?.anio;
  const tieneDemanda = r.meta?.tieneDemandaContratada || false;
  const noReducibles = r.meta?.noReducibles || [];
  const escPct = r.escalamientoTarifaPct || 0;

  const clasif = tieneDemanda
    ? `Clasificación ${r.tarifa}: tiene demanda contratada, así que ${listaConceptos(noReducibles)} se ` +
      `mantienen aunque se cubra el 100% del consumo con paneles — el ${PCT(r.pctAhorro)} de ahorro ya lo refleja.`
    : `Clasificación ${r.tarifa}: no tiene demanda contratada, casi todo el recibo es reducible con paneles — ` +
      `el ${PCT(r.pctAhorro)} de ahorro ya lo refleja.`;
  const escTxt = escPct
    ? ` Supone que la tarifa de CFE sube ${escPct.toFixed(1)}% anual (criterio del estudio, no oficial de CFE).`
    : ' No se supone incremento de tarifa (precios constantes).';

  function pagina(doc) {
    let y = headX(doc, CONTENT_TOP, `Resumen ejecutivo — ${r.titular}`);
    y = subX(doc, y, `${r.tarifa} · servicio ${r.noServicio || 'por confirmar'} · ${r.domicilio || 'domicilio por confirmar'}`);
    y = cardsRow(doc, y, [
      [M(r.investment), 'Costo del sistema, IVA incluido'],
      [r.payback ? `${r.payback.toFixed(1)} años` : 'N/D', 'Recuperación simple de la inversión'],
      [M(r.ahorroAnual), 'Ahorro estimado año 1'],
    ]);
    y = spacer(y, 6);
    y = cardsRow(doc, y, [
      [`${r.n} paneles`, `${r.moduloWp} W cada uno / ${r.kwp.toFixed(2)} kWp`],
      [PCT(r.pctAhorro), 'De la factura anual que ahorraría'],
      [M(r.van), 'VAN a 25 años (10% de descuento)'],
    ]);
    y = spacer(y, 12);

    y = subX(doc, y, 'Antes vs. después');
    y = table(doc, y, ['Concepto', 'Hoy (sin paneles)', 'Con el sistema propuesto'], [
      ['Pago anual estimado', M(r.annualbefore), M(r.annualafter)],
      ['Pago mensual promedio', M(r.annualbefore / 12), M(r.annualafter / 12)],
    ], { widths: [CONTENT_W * 0.4, CONTENT_W * 0.3, CONTENT_W * 0.3] });
    y = spacer(y, 10);

    y = subX(doc, y, 'Retorno a 25 años');
    y = table(doc, y, ['Indicador', 'Valor'], [
      ['Recuperación simple', r.payback ? `${r.payback.toFixed(1)} años (inversión ÷ ahorro neto del primer año)` : 'No calculable con el ahorro actual'],
      ['Recuperación del flujo', r.recuperacionAcumulada
        ? `${r.recuperacionAcumulada.toFixed(1)} años, con degradación, mantenimiento${reposicionAnio ? ` y cambio de inversor en el año ${reposicionAnio}` : ''}`
        : 'No se recupera en 25 años'],
      ['TIR (25 años)', r.tir ? PCT(r.tir) : 'No calculable'],
      ['Beneficio / costo', bc ? `${bc.toFixed(2)} — por cada peso invertido, regresa $${bc.toFixed(2)} actualizados en ahorros` : 'No calculable'],
    ], { widths: [CONTENT_W * 0.4, CONTENT_W * 0.6] });
    y = spacer(y, 10);

    notice(doc, y, clasif + escTxt + ' Presupuesto preliminar: precios y levantamiento en sitio pendientes de confirmar.');
  }

  return buildPdf(`Resumen ejecutivo · ${r.titular}`, 'GESTORIA Y PROYECTOS SOELRB',
    'Resumen de apoyo para la presentación — ver la cotización completa de 21 páginas para el detalle.', [pagina]);
}

const GUIA_FILAS = [
  ['1', 'Resumen: costo, payback, ahorro año 1', 'Arranca aquí siempre. Si el cliente solo ve una página, que sea esta.'],
  ['2–4', 'Su recibo real / cómo se forma el pago / qué baja y qué no',
    'El cálculo parte de SU recibo, no de un promedio. Aquí se explica por qué Suministro, Distribución o ' +
    'Capacidad (si tiene demanda contratada) no bajan aunque instale muchos paneles.'],
  ['5–6', 'Consumo anual y sistema propuesto (cuántos paneles y por qué ese tamaño)',
    'El número de paneles sale de cubrir el consumo real del recibo, no de un tamaño arbitrario.'],
  ['7', 'Producción estimada mes a mes',
    'Si pregunta por qué el rendimiento (kWh/kWp/año) sale igual que otros casos: es un criterio preliminar fijo (horas-sol), no una simulación con datos del sitio.'],
  ['8', 'Impacto ambiental estimado', 'Gancho de cierre si el cliente valora sustentabilidad; es secundario al retorno económico.'],
  ['9–10', 'Cómo se obtiene el ahorro / cuánto pagaría con vs. sin paneles', 'Aterriza el ahorro en pesos al mes, no solo el porcentaje.'],
  ['11–12', 'Presupuesto resumen y detalle de materiales',
    'Aquí suelen venir las dudas de precio. La página de "Fuentes" (21) aclara si se usaron precios reales de catálogo o provisión genérica.'],
  ['13–14', 'Recuperación de la inversión y flujo a 25 años',
    'La pregunta más importante de todo el documento: "¿cuándo deja de deber y empieza a ganar?" — está en la página 13, con gráfica.'],
  ['15–16', 'Pagos mensuales y qué tan cerca queda del 100% de cobertura',
    'Útil si el cliente pregunta "¿me vas a dejar en $0 de luz?" — la respuesta honesta casi nunca es 100%, y aquí se ve por qué.'],
  ['17', 'Qué falta para cerrar el ahorro (notas y pendientes)',
    'Léela ANTES de presentar: son los supuestos que hay que verificar en sitio. Decirlo de frente genera más confianza que ocultarlo.'],
  ['18–19', 'Alcance, condiciones, entrega y mantenimiento', 'Para cuando el cliente ya está decidido y pregunta "¿qué sigue?".'],
  ['20–21', 'Glosario y fuentes', 'Para el cliente técnico o el que quiere auditar de dónde sale cada cifra (tarifario, horas-sol, medición neta).'],
];

export function generarGuiaPresentacion() {
  function pagina(doc) {
    let y = headX(doc, CONTENT_TOP, 'Guía para presentar la cotización (21 páginas)');
    y = notice(doc, y, 'Empieza SIEMPRE por la página 1: es lo único que le importa a un cliente nuevo (cuánto ' +
      'cuesta, en cuánto se paga, cuánto ahorra). El resto del documento solo respalda esos 3 números si pide más detalle.');
    y = spacer(y, 8);
    y = table(doc, y, ['Páginas', 'Qué contienen', 'Qué decir / cuándo usarlas'], GUIA_FILAS,
      { widths: [CONTENT_W * 0.1, CONTENT_W * 0.42, CONTENT_W * 0.48], small: true });
    y = spacer(y, 10);
    y = subX(doc, y, 'Preguntas que casi siempre salen');
    // Nota: jsPDF con la fuente Helvetica estandar (WinAnsiEncoding) no soporta la
    // flecha Unicode (sale como glifo roto, bug real encontrado al revisar el PDF) --
    // se usa "->" en el texto que va al PDF; en HTML (secciones.js) si se usa la
    // flecha real, el navegador la renderiza bien.
    y = bodyX(doc, y, '• "¿Por qué no baja todo mi recibo?" -> por la demanda contratada (págs. 3–4), si la tarifa la tiene.');
    y = bodyX(doc, y, '• "¿Por qué el rendimiento es igual que otro caso?" -> criterio preliminar fijo (horas-sol), pág. 7.');
    bodyX(doc, y, '• "¿Esto es definitivo?" -> No: es preliminar, precios y levantamiento en sitio pendientes (pág. 17).');
  }

  return buildPdf('Guía de presentación · Cotizador FV CFE', 'GESTORIA Y PROYECTOS SOELRB',
    'Guía de apoyo para presentar cualquier cotización — no es específica de un predio.', [pagina]);
}
