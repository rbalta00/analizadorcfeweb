// Arma el objeto `r` completo (misma forma que st.session_state.resultado en
// cotizador_app.py) a partir de los datos capturados -- fuente unica usada por la
// vista de 21 secciones (secciones.js) Y por el generador de PDF (propuesta.js), para
// que nunca se desincronicen (ver seccion 13 del encargo: "todas las tarjetas,
// graficas, tablas y exportaciones deben usar la misma fuente de calculo").
import {
  construirInvoice, construirInvoiceDomestica, pisoDeAhorro, flujoMensualAnual,
  dimensionarHorasSol, normalizarConsumoMensual, presupuestar, costoInversor, flujo25Anios, R,
  consumoMensualDesdeHistorial, DIAS_MES_REF,
} from './motor.js';
import { generarNotas } from './notas.js';
import { fechaEstudioEs } from './util.js';

export function construirResultado(input) {
  const {
    titular, domicilio, noServicio, tarifa, esDomestica,
    periodoDias, periodoKwh, dap, cargos, rateKw, btPct, fpBonusPct,
    moduloWp, cobertura, horasUtiles, costos, escalamientoPct,
    escalones, dapDomestica,
    leido, inmueble, aplicaIsr, tasaIsrPct, historialManual,
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

  // Consumo base para dimensionar: si hay historial real (varios periodos, a mano o
  // detectado del recibo) se promedia -- mas representativo que extrapolar un solo
  // periodo porque suaviza variacion estacional. diasPorPeriodo distingue tarifas que
  // se facturan mensual (~30.5 dias) de las domesticas/01/DAC, que se facturan
  // bimestral (~61 dias) -- sin esto, promediar kWh/periodo directo subestimaria a la
  // mitad el consumo mensual real de un cliente domestico.
  const diasPorPeriodoHistorial = esDomestica ? DIAS_MES_REF * 2 : DIAS_MES_REF;
  const historialOcr = (leido && leido.historial) ? leido.historial.map(h => h.kwh) : null;
  const historialUsado = (historialManual && historialManual.length) ? historialManual : historialOcr;
  const desdeHistorial = historialUsado ? consumoMensualDesdeHistorial(historialUsado, diasPorPeriodoHistorial) : null;

  let consumoMensual, dailyKwh, metodoGeneracion, basisConsumo;
  if (desdeHistorial) {
    consumoMensual = desdeHistorial.consumoMensual;
    // El promedio del historial tambien alimenta la simulacion de factura (dailyKwh)
    // -- si no, el sistema quedaria dimensionado para el consumo promedio real pero
    // el ahorro se calcularia contra el periodo mas reciente, que puede ser atipico
    // (mes bajo/alto), dando un ahorro inconsistente con el tamano del sistema.
    dailyKwh = consumoMensual / DIAS_MES_REF;
    metodoGeneracion = `Horas-sol fijas (${horasUtiles} h/día, criterio del usuario, no oficial de CFE/PVGIS). ` +
      `Consumo normalizado promedio de ${desdeHistorial.periodosUsados} periodos reales de historial: ` +
      `${consumoMensual.toFixed(2)} kWh/mes (30.5 días) -- mas representativo que un solo periodo.`;
    basisConsumo = `historial real de ${desdeHistorial.periodosUsados} periodos` +
      (historialManual && historialManual.length ? ' (capturados a mano)' : ' (impresos en el recibo)');
  } else {
    dailyKwh = periodoKwh / periodoDias;
    consumoMensual = normalizarConsumoMensual(periodoKwh, periodoDias);
    metodoGeneracion = `Horas-sol fijas (${horasUtiles} h/día, criterio del usuario, no oficial de CFE/PVGIS). ` +
      `Consumo normalizado de este servicio: ${consumoMensual.toFixed(2)} kWh/mes (30.5 días), a partir del período ` +
      `real facturado (${periodoKwh} kWh en ${periodoDias} días).`;
    basisConsumo = `extrapolación de un solo período (${periodoDias} días)`;
  }
  const { n, kwp, genAnual } = dimensionarHorasSol(consumoMensual, moduloWp, cobertura, horasUtiles);
  const monthlyE = Array(12).fill(genAnual / kwp);

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
