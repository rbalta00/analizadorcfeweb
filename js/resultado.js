// Arma el objeto `r` completo (misma forma que st.session_state.resultado en
// cotizador_app.py) a partir de los datos capturados -- fuente unica usada por la
// vista de 21 secciones (secciones.js) Y por el generador de PDF (propuesta.js), para
// que nunca se desincronicen (ver seccion 13 del encargo: "todas las tarjetas,
// graficas, tablas y exportaciones deben usar la misma fuente de calculo").
import {
  construirInvoice, construirInvoiceDomestica, pisoDeAhorro, flujoMensualAnual,
  dimensionarHorasSol, normalizarConsumoMensual, presupuestar, costoInversor, flujo25Anios, R,
  DIAS_MES_REF,
} from './motor.js';
import { generarNotas } from './notas.js';
import { fechaEstudioEs, fechaVigenciaEs } from './util.js';

export function construirResultado(input) {
  const {
    titular, domicilio, noServicio, tarifa, esDomestica,
    periodoDias, periodoKwh, dap, cargos, rateKw, btPct, fpBonusPct,
    moduloWp, cobertura, horasUtiles, costos, escalamientoPct,
    escalones, dapDomestica,
    leido, inmueble, aplicaIsr, tasaIsrPct, historialManual, vigenciaDias,
  } = input;

  let invoice, meta, pagoRecurrentePeriodo, piso, ahorroMax, pctMax, cargosFinal, facturaDetalle;
  if (!esDomestica) {
    const construido = construirInvoice(tarifa, periodoDias, periodoKwh, cargos, rateKw, dap, btPct, fpBonusPct);
    invoice = construido.invoice; meta = construido.meta;
    // facturaDetalle: el desglose REAL que ya calcula invoice() (base/bt/bonus/subtotal/
    // iva/dap/total) -- expuesto en `r` para que secciones.js pueda mostrar el paso a paso
    // de "como se calculo" con los numeros EXACTOS que ya uso el motor, en vez de que la
    // vista reconstruya la aritmetica por su cuenta (riesgo de desincronizarse con
    // motor.js). Pedido del usuario, 2026-11-01: el bloque "como se calculo" seguia sin
    // ser claro -- la causa real era que mezclaba formula+sustitucion en una sola frase
    // densa; con este desglose la vista puede armar una tabla paso-por-paso en vez de prosa.
    facturaDetalle = invoice(periodoDias, periodoKwh, false);
    pagoRecurrentePeriodo = facturaDetalle.total;
    const pisoCalc = pisoDeAhorro(periodoDias, pagoRecurrentePeriodo, invoice);
    piso = pisoCalc.piso; ahorroMax = pisoCalc.ahorroMax; pctMax = pisoCalc.pct;
    cargosFinal = cargos;
  } else {
    invoice = construirInvoiceDomestica(escalones, periodoDias, dapDomestica);
    facturaDetalle = invoice(periodoDias, periodoKwh, false);
    pagoRecurrentePeriodo = facturaDetalle.total;
    piso = invoice(periodoDias, 0, true).total;
    ahorroMax = pagoRecurrentePeriodo - piso;
    pctMax = pagoRecurrentePeriodo ? ahorroMax / pagoRecurrentePeriodo : 0;
    cargosFinal = { energia: facturaDetalle.base };
    meta = { tieneDemandaContratada: false, reducibles: ['energia'], noReducibles: [] };
  }

  // Consumo base para dimensionar: SIEMPRE se promedia el periodo que se esta facturando
  // ahora (periodoKwh/periodoDias, real y siempre presente) junto con CUALQUIER periodo de
  // historial capturado (a mano o detectado del recibo), normalizando todos a kWh/mes antes
  // de promediar -- asi ningun periodo pesa mas que otro solo por tener mas o menos dias, y
  // nunca se descarta un dato real capturado, sea 1 periodo o 12. diasPorPeriodoHistorial
  // distingue tarifas que se facturan mensual (~30.5 dias) de las domesticas/01/DAC, que se
  // facturan bimestral (~61 dias).
  //
  // Diseño corregido 2026-11-01 a pedido explicito del usuario: un primer intento exigia un
  // minimo de 3 periodos de historial antes de confiar en su promedio (con menos, usaba solo
  // el periodo facturado); un segundo intento comparaba el periodo facturado contra el
  // historial parcial y usaba el mayor de los dos. El usuario senalo que ambos eran
  // complicaciones innecesarias: "deberia ser el promedio [anual]" -- punto. El periodo que
  // se factura ahora YA es un dato real (como cualquier periodo de historial), asi que
  // promediarlo junto con el resto, sin umbrales ni comparaciones, es el diseño correcto: si
  // el recibo imprime su historial incluyendo el periodo mas reciente (lo normal en CFE),
  // promediarlo de nuevo con el periodo actual no distorsiona nada (es el mismo valor); si el
  // historial capturado es de periodos genuinamente distintos, se incorporan de verdad,
  // suavizando la estacionalidad -- con 1 solo periodo de historial YA DISTINTO al actual, el
  // promedio de ambos (2 datos reales) nunca puede colapsar a un unico valor atipico.
  const diasPorPeriodoHistorial = esDomestica ? DIAS_MES_REF * 2 : DIAS_MES_REF;
  const historialOcr = (leido && leido.historial) ? leido.historial.map(h => h.kwh) : null;
  const historialUsado = (historialManual && historialManual.length) ? historialManual : historialOcr;
  const consumoMensualPeriodoActual = normalizarConsumoMensual(periodoKwh, periodoDias);
  const consumosMensuales = [consumoMensualPeriodoActual];
  if (historialUsado && historialUsado.length) {
    for (const kwh of historialUsado) consumosMensuales.push(kwh / diasPorPeriodoHistorial * DIAS_MES_REF);
  }
  const consumoMensual = consumosMensuales.reduce((a, b) => a + b, 0) / consumosMensuales.length;
  const dailyKwh = consumoMensual / DIAS_MES_REF;
  const metodoGeneracion = `Horas-sol fijas (${horasUtiles} h/día, criterio del usuario, no oficial de CFE/PVGIS). ` +
    `Consumo mensual normalizado: promedio de ${consumosMensuales.length} período(s) real(es) -- el período ` +
    `facturado actual (${periodoKwh} kWh en ${periodoDias} días)` +
    (historialUsado && historialUsado.length ? ` + ${historialUsado.length} período(s) de historial` : '') +
    ` = ${consumoMensual.toFixed(2)} kWh/mes.`;
  const basisConsumo = (historialUsado && historialUsado.length)
    ? `promedio de ${consumosMensuales.length} períodos reales (el período facturado actual + ${historialUsado.length} de historial` +
      (historialManual && historialManual.length ? ', capturados a mano)' : ', impresos en el recibo)')
    : `extrapolación de un solo período (${periodoDias} días, sin historial capturado)`;
  // Bug real encontrado en la auditoria de 2026-11-01: `historial` (usado en secciones.js
  // para la grafica/tabla de la seccion 5 y la comparacion generacion-vs-historial de la
  // seccion 7) solo se llenaba con `leido.historial` (historial leido por OCR del PDF) --
  // el historial capturado A MANO (historialManual, que SI se usa arriba para dimensionar
  // el sistema cuando esta presente, ver `historialUsado`) nunca se reflejaba aqui.
  // Resultado: para un cliente 100% manual, esas graficas se quedaban vacias/"supuesto"
  // aunque el calculo si uso datos reales. historialParaMostrar refleja la MISMA fuente
  // que realmente se uso para dimensionar, para que lo que se grafica nunca contradiga lo
  // que se calculo. Los periodos manuales no tienen mes/año real (el formulario solo pide
  // "P1..P12" genericos) -- se etiquetan como "P1", "P2"... en vez de inventar un mes.
  const historialParaMostrar = (historialManual && historialManual.length)
    ? historialManual.map((kwh, i) => ({ mes: `P${i + 1}`, anio: '', kwh }))
    : (leido ? leido.historial : null);
  // 2026-10-29): dimensionarHorasSol() SI calcula genMensual (produccion mensual real
  // del sistema), pero aqui nunca se usaba -- monthlyE se llenaba con genAnual/kwp
  // (kWh por kWp AL AÑO), no genMensual/kwp (kWh por kWp AL MES). flujoMensualAnual()
  // multiplica monthlyE[i] * kwp para obtener la "produccion" de CADA mes -- con el
  // bug, cada uno de los 12 meses recibia la produccion ANUAL completa (12x inflada),
  // garantizando que el sistema pareciera cubrir el 100% del consumo de CUALQUIER mes
  // sin importar que tan grande fuera ese consumo. Esto afectaba generacionKwh (tabla/
  // grafica de la seccion 7), y tambien ahorroAnual/pctAhorro/payback/VAN/TIR (todos
  // derivados de sumar rows, que a su vez dependia de esa produccion mensual inflada).
  const { n, kwp, genAnual, genMensual } = dimensionarHorasSol(consumoMensual, moduloWp, cobertura, horasUtiles);
  const monthlyE = Array(12).fill(genMensual / kwp);

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

  // Escenario alterno: cuantos paneles sugiere la verificacion en sitio que hizo el
  // gobierno (dato manual, inmueble.panelesVerificacion) -- se recalcula TODO con el
  // mismo motor/recibo/costos que el escenario principal, solo cambiando n/kwp, para
  // que la comparacion sea realmente apples-to-apples (misma metodologia, no un
  // modelo aparte). Idea tomada de la carpeta "mario" (tarjetas Opcion A/B/C con
  // inversion/paneles/ahorro/payback/% ahorro por escenario), pedido explicito del
  // usuario -- antes esto no se calculaba, solo se mostraba el conteo de paneles.
  let escenarioVerificado = null;
  const nVerificado = inmueble && inmueble.panelesVerificacion ? Math.round(Number(inmueble.panelesVerificacion)) : 0;
  if (nVerificado > 0) {
    const kwpVerificado = R(nVerificado * moduloWp / 1000);
    const presV = presupuestar(nVerificado, kwpVerificado, moduloWp, costos);
    const rowsV = flujoMensualAnual(invoice, dailyKwh, monthlyE, kwpVerificado, 1);
    const annualafterV = Math.round(rowsV.reduce((s, x) => s + x.pagoConSolarEstimadoMxn, 0) * 100) / 100;
    const ahorroAnualV = Math.round((annualbefore - annualafterV) * 100) / 100;
    const pctAhorroV = annualbefore ? ahorroAnualV / annualbefore : 0;
    const costoInvV = costoInversor(presV.materiales);
    const flujo25V = flujo25Anios(presV.inversion, ahorroAnualV, 0.10, 25, (escalamientoPct || 0) / 100, 0.01, 0.03, 0.005, costoInvV);
    const paybackV = ahorroAnualV > 0 ? presV.inversion / ahorroAnualV : null;
    escenarioVerificado = {
      n: nVerificado, kwp: kwpVerificado, investment: presV.inversion,
      ahorroAnual: ahorroAnualV, om1: presV.inversion * 0.01, pctAhorro: pctAhorroV,
      payback: paybackV, van: flujo25V.van, tir: flujo25V.tir,
      recuperacionAcumulada: flujo25V.recuperacionAcumulada,
      diferenciaPaneles: nVerificado - n, diferenciaAhorro: Math.round((ahorroAnualV - ahorroAnual) * 100) / 100,
    };
  }

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
    vigenciaDias: vigenciaDias || 15, fechaVigencia: fechaVigenciaEs(vigenciaDias || 15),
    periodoDias, periodoKwh, dap: esDomestica ? (dapDomestica || 0) : dap, cargos: cargosFinal, meta,
    btPct: btPct || 0, fpBonusPct: fpBonusPct || 0, esDomestica: !!esDomestica,
    escalones: esDomestica ? escalones : null,
    demandaContratadaKw: leido ? leido.demanda_contratada_kw : null,
    pagoRecurrentePeriodo, pisoPeriodo: piso, ahorroMaxPeriodo: ahorroMax, pctMaxPeriodo: pctMax, facturaDetalle,
    n, kwp, moduloWp, gen: genAnual, annualKwh, metodoGeneracion,
    investment: pres.inversion, ventaSinIva: pres.ventaSinIva, iva: pres.iva, acKw: pres.acKw,
    payback, ahorroAnual, pctAhorro, om1, annualbefore, annualafter,
    van: flujo25.van, tir: flujo25.tir, recuperacionAcumulada: flujo25.recuperacionAcumulada,
    flujo25Rows: flujo25.flujo, escalamientoTarifaPct: escalamientoPct,
    materiales: pres.materiales, rows,
    historial: historialParaMostrar, basisConsumo, consumosMensualesUsados: consumosMensuales,
    inmueble: inmueble || null, escenarioVerificado,
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
