// Arma el objeto `r` completo (misma forma que st.session_state.resultado en
// cotizador_app.py) a partir de los datos capturados -- fuente unica usada por la
// vista de 21 secciones (secciones.js) Y por el generador de PDF (propuesta.js), para
// que nunca se desincronicen (ver seccion 13 del encargo: "todas las tarjetas,
// graficas, tablas y exportaciones deben usar la misma fuente de calculo").
import {
  construirInvoice, construirInvoiceDomestica, pisoDeAhorro, flujoMensualAnual,
  dimensionarHorasSol, normalizarConsumoMensual, presupuestar, costoInversor, flujo25Anios, R,
} from './motor.js';
import { generarNotas } from './notas.js';
import { fechaEstudioEs } from './util.js';

export function construirResultado(input) {
  const {
    titular, domicilio, noServicio, tarifa, esDomestica,
    periodoDias, periodoKwh, dap, cargos, rateKw, btPct, fpBonusPct,
    moduloWp, cobertura, horasUtiles, costos, escalamientoPct,
    escalones, dapDomestica,
    leido, inmueble, aplicaIsr, tasaIsrPct,
  } = input;

  let invoice, meta, pagoRecurrentePeriodo, piso, ahorroMax, pctMax, cargosFinal;
  if (!esDomestica) {
    const construido = construirInvoice(tarifa, periodoDias, periodoKwh, cargos, rateKw, dap, btPct, fpBonusPct);
    invoice = construido.invoice; meta = construido.meta;
    pagoRecurrentePeriodo = invoice(periodoDias, periodoKwh, false).total;
    const pisoCalc = pisoDeAhorro(periodoDias, pagoRecurrentePeriodo, invoice);
    piso = pisoCalc.piso; ahorroMax = pisoCalc.ahorroMax; pctMax = pisoCalc.pct;
    cargosFinal = cargos;
  } else {
    invoice = construirInvoiceDomestica(escalones, periodoDias, dapDomestica);
    pagoRecurrentePeriodo = invoice(periodoDias, periodoKwh, false).total;
    piso = invoice(periodoDias, 0, true).total;
    ahorroMax = pagoRecurrentePeriodo - piso;
    pctMax = pagoRecurrentePeriodo ? ahorroMax / pagoRecurrentePeriodo : 0;
    cargosFinal = { energia: invoice(periodoDias, periodoKwh, false).base };
    meta = { tieneDemandaContratada: false, reducibles: ['energia'], noReducibles: [] };
  }

  const dailyKwh = periodoKwh / periodoDias;
  const consumoMensual = normalizarConsumoMensual(periodoKwh, periodoDias);
  const { n, kwp, genAnual } = dimensionarHorasSol(consumoMensual, moduloWp, cobertura, horasUtiles);
  const monthlyE = Array(12).fill(genAnual / kwp);
  const metodoGeneracion = `Horas-sol fijas (${horasUtiles} h/día, criterio del usuario, no oficial de CFE/PVGIS). ` +
    `Consumo normalizado de este servicio: ${consumoMensual.toFixed(2)} kWh/mes (30.5 días), a partir del período ` +
    `real facturado (${periodoKwh} kWh en ${periodoDias} días).`;

  const pres = presupuestar(n, kwp, moduloWp, costos);
  const rows = flujoMensualAnual(invoice, dailyKwh, monthlyE, kwp, 1);
  const annualbefore = Math.round(rows.reduce((s, x) => s + x.pagoSinSolarMxn, 0) * 100) / 100;
  const annualafter = Math.round(rows.reduce((s, x) => s + x.pagoConSolarEstimadoMxn, 0) * 100) / 100;
  const ahorroAnual = Math.round((annualbefore - annualafter) * 100) / 100;
  const pctAhorro = annualbefore ? ahorroAnual / annualbefore : 0;
  const costoInv = costoInversor(pres.materiales);
  const flujo25 = flujo25Anios(pres.inversion, ahorroAnual, 0.10, 25, (escalamientoPct || 0) / 100, 0.01, 0.03, 0.005, costoInv);
  const payback = ahorroAnual > 0 ? pres.inversion / ahorroAnual : null;
  const om1 = pres.inversion * 0.01;
  const annualKwh = consumoMensual * 12;
  const basisConsumo = (leido && leido.historial_meses_cubiertos)
    ? `historial real de ${leido.historial_meses_cubiertos} meses impreso en el recibo`
    : `extrapolación de un solo período (${periodoDias} días)`;

  // Deduccion fiscal ISR (Art. 34 fraccion XIII LISR) -- opcional, solo clientes
  // privados/comerciales que pagan ISR (gobierno NO). No afecta el ahorro de factura,
  // solo la inversion neta efectiva y el flujo/payback a 25 anios.
  let ahorroFiscalIsr = 0, inversionNetaIsr = pres.inversion, vanNetoIsr = null, tirNetoIsr = null, paybackNetoIsr = null;
  if (aplicaIsr) {
    ahorroFiscalIsr = R(pres.ventaSinIva * (tasaIsrPct / 100));
    inversionNetaIsr = R(pres.inversion - ahorroFiscalIsr);
    const flujo25Isr = flujo25Anios(inversionNetaIsr, ahorroAnual, 0.10, 25, (escalamientoPct || 0) / 100, 0.01, 0.03, 0.005, costoInv);
    vanNetoIsr = flujo25Isr.van; tirNetoIsr = flujo25Isr.tir;
    paybackNetoIsr = ahorroAnual > 0 ? inversionNetaIsr / ahorroAnual : null;
  }

  const r = {
    titular: titular || 'Cliente', tituloRecibo: leido ? leido.titular : null, domicilio,
    noServicio, tarifa, fechaEstudio: fechaEstudioEs(),
    periodoDias, periodoKwh, dap, cargos: cargosFinal, meta,
    demandaContratadaKw: leido ? leido.demanda_contratada_kw : null,
    pagoRecurrentePeriodo, pisoPeriodo: piso, ahorroMaxPeriodo: ahorroMax, pctMaxPeriodo: pctMax,
    n, kwp, moduloWp, gen: genAnual, annualKwh, metodoGeneracion,
    investment: pres.inversion, ventaSinIva: pres.ventaSinIva, iva: pres.iva,
    payback, ahorroAnual, pctAhorro, om1, annualbefore, annualafter,
    van: flujo25.van, tir: flujo25.tir, recuperacionAcumulada: flujo25.recuperacionAcumulada,
    flujo25Rows: flujo25.flujo, escalamientoTarifaPct: escalamientoPct,
    materiales: pres.materiales, rows,
    historial: leido ? leido.historial : null, basisConsumo,
    inmueble: inmueble || null,
    aplicaIsr: !!aplicaIsr, tasaIsrPct: tasaIsrPct || 0, ahorroFiscalIsr, inversionNetaIsr,
    vanNetoIsr, tirNetoIsr, paybackNetoIsr,
  };
  r.notas = generarNotas(leido || null, r, esDomestica);
  if (aplicaIsr) {
    const paybackTxt = paybackNetoIsr ? `${paybackNetoIsr.toFixed(2)} años` : 'no calculable';
    r.notas.push(
      `Se estimó una deducción fiscal 100% inmediata (Art. 34 fracción XIII LISR) de $${ahorroFiscalIsr.toLocaleString('en-US', { minimumFractionDigits: 2 })} ` +
      `(${tasaIsrPct.toFixed(0)}% de ISR sobre el costo antes de IVA, $${pres.ventaSinIva.toLocaleString('en-US', { minimumFractionDigits: 2 })}). ` +
      `Esto reduciría la inversión neta efectiva a $${inversionNetaIsr.toLocaleString('en-US', { minimumFractionDigits: 2 })} y el payback simple a ${paybackTxt}. ` +
      'Es una estimación general, no asesoría fiscal -- confirmar con el contador o fiscalista del cliente antes de prometerlo en una oferta firme.'
    );
  }
  return r;
}
