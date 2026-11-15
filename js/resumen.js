// Port 1:1 de app/resumen.py: los 2 PDFs de apoyo para presentar una cotizacion, para
// tenerlos a la mano en la reunion con el cliente sin hojear las 21 paginas.
// - generarResumenEjecutivo: 1 pagina con los numeros YA calculados de un caso
//   especifico (el mismo objeto `r` que usa propuesta.generarPdf).
// - generarGuiaPresentacion: 1 pagina generica (no depende de ningun caso) de como
//   presentar cualquier cotizacion de 21 paginas.
import {
  CONTENT_TOP, CONTENT_W, MARGIN_L, headX, subX, bodyX, spacer, cardsRow, notice, table, buildPdf,
  NAVY, TEAL, WHITE, LINE,
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

    // El renglon "Presupuesto preliminar: precios y levantamiento en sitio pendientes de
    // confirmar" se quito a peticion explicita del usuario (2026-11-09) -- es el mismo
    // aviso que ya se quito del pie de pagina global en pdfComponents.js, pero aqui
    // vivia ademas pegado como texto FIJO dentro del cuerpo de esta pagina (no por
    // dibujarHeaderFooter), por eso seguia apareciendo pese al primer fix.
    notice(doc, y, clasif + escTxt);
  }

  return buildPdf(`Resumen ejecutivo · ${r.titular}`, 'GESTORIA Y PROYECTOS SOELRB',
    'Resumen de apoyo para la presentación — ver la estudio completa de 21 páginas para el detalle.', [pagina]);
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
    let y = headX(doc, CONTENT_TOP, 'Guía para presentar la estudio (21 páginas)');
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

  return buildPdf('Guía de presentación · Analizador FV CFE', 'GESTORIA Y PROYECTOS SOELRB',
    'Guía de apoyo para presentar cualquier estudio — no es específica de un predio.', [pagina]);
}

// ---------------------------------------------------------------------------
// Anexo de apoyo para el tramite de interconexion con CFE -- pedido del usuario tras
// investigar que le falta a la app (ver ESTADO.md): CFE pide, ademas de la cotizacion
// de venta, un croquis de ubicacion y un diagrama unifilar para activar el contrato de
// interconexion/facturacion neta. Esto es ORIENTACION, NO el diagrama certificado que
// pide CFE -- ese lo tiene que firmar el instalador/perito responsable de la obra, no
// se genera solo con los datos de una cotizacion preliminar. Se dice asi de claro en
// el propio PDF para no hacer pasar esto por un documento oficial.
const REQUISITOS_TRAMITE_CFE = [
  ['Solicitud de interconexión', 'Formato que entrega CFE en su Centro de Atención a Clientes (CAC) o en línea -- no lo genera esta app.'],
  ['Croquis de ubicación', 'Mapa de dónde está la instalación. Usa el link de Google Maps de abajo (domicilio del recibo) y toma una captura.'],
  ['Diagrama unifilar', 'Vea la referencia de abajo -- es un punto de partida con los datos YA calculados. El instalador/perito responsable debe firmar la versión final.'],
  ['Copia del recibo CFE pagado', 'O el Registro Móvil de Usuario (RMU) de tu contrato de suministro vigente.'],
  ['Cumplimiento de Normas Oficiales Mexicanas', 'La instalación eléctrica debe cumplir las NOM aplicables -- lo certifica el instalador, no esta estudio.'],
];

function cajaDiagrama(doc, x, y, w, h, titulo, subtitulo) {
  doc.setDrawColor(NAVY);
  doc.setFillColor(WHITE);
  doc.setLineWidth(1.2);
  doc.roundedRect(x, y, w, h, 4, 4, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(NAVY);
  const lineasTitulo = doc.splitTextToSize(titulo, w - 10);
  let ty = y + h / 2 - (lineasTitulo.length * 10 + (subtitulo ? 11 : 0)) / 2 + 9;
  for (const linea of lineasTitulo) { doc.text(linea, x + w / 2, ty, { align: 'center' }); ty += 10; }
  if (subtitulo) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(TEAL);
    doc.text(subtitulo, x + w / 2, ty + 2, { align: 'center' });
  }
}

function flechaDiagrama(doc, x1, x2, y) {
  doc.setDrawColor(TEAL);
  doc.setLineWidth(1.2);
  doc.line(x1, y, x2, y);
  doc.setFillColor(TEAL);
  doc.triangle(x2, y - 3, x2, y + 3, x2 + 5, y, 'F');
}

function diagramaUnifilarReferencia(doc, y0, r) {
  const cajas = [
    [`${r.n} paneles FV`, `${r.moduloWp} W c/u · ${r.kwp.toFixed(2)} kWp`],
    ['Inversor', r.acKw ? `~${r.acKw.toFixed(2)} kW AC` : 'por seleccionar'],
    ['Protecciones\nDC / AC', 'interruptores + fusibles'],
    ['Medidor\nbidireccional', 'lo instala CFE'],
    ['Red CFE', 'punto de interconexión'],
  ];
  const w = 95, h = 44, gap = 14;
  const totalW = cajas.length * w + (cajas.length - 1) * gap;
  let x = MARGIN_L + (CONTENT_W - totalW) / 2;
  const y = y0 + h / 2;
  cajas.forEach(([titulo, sub], i) => {
    cajaDiagrama(doc, x, y0, w, h, titulo, sub);
    if (i < cajas.length - 1) flechaDiagrama(doc, x + w, x + w + gap, y);
    x += w + gap;
  });
  return y0 + h;
}

export function generarAnexoInterconexion(r) {
  function pagina(doc) {
    let y = headX(doc, CONTENT_TOP, 'Documentación de apoyo para tu trámite de interconexión con CFE');
    y = notice(doc, y, 'Este anexo es de ORIENTACIÓN para reunir lo que pide CFE -- NO es el diagrama unifilar ' +
      'certificado que CFE exige: ese debe elaborarlo y firmarlo el instalador o perito responsable de la obra, ' +
      'con los datos finales de la instalación (no los de esta estudio preliminar).');
    y = spacer(y, 8);
    y = subX(doc, y, 'Qué pide CFE para activar el contrato de interconexión');
    y = table(doc, y, ['Documento', 'Qué es / de dónde sale'], REQUISITOS_TRAMITE_CFE,
      { widths: [CONTENT_W * 0.28, CONTENT_W * 0.72], small: true });
    y = spacer(y, 8);
    y = subX(doc, y, 'Croquis de ubicación');
    y = bodyX(doc, y, `Domicilio del recibo: ${r.domicilio || 'por confirmar'}.`);
    if (r.domicilio || r.titular) {
      const query = encodeURIComponent(r.domicilio || r.titular);
      const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(TEAL);
      doc.textWithLink('Abrir este domicilio en Google Maps (toca o haz clic aquí)', MARGIN_L, y + 10, { url });
      y = spacer(y, 18);
    }
    y = spacer(y, 6);
    y = subX(doc, y, 'Diagrama unifilar de referencia');
    y = bodyX(doc, y, 'Topología típica de un sistema interconectado a red, con los datos ya calculados de este ' +
      'caso. El instalador debe completarlo con calibres de cable, marca/modelo de equipos y protecciones exactas.');
    y = spacer(y, 6);
    diagramaUnifilarReferencia(doc, y, r);
  }
  return buildPdf('Anexo de interconexión CFE · Analizador FV CFE', `${r.titular || 'Cliente'} — ${r.fechaEstudio}`,
    'Material de orientación -- no sustituye el diagrama firmado por el instalador/perito responsable.', [pagina]);
}
