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
    periodoDias, periodoKwh, dap, cargos, rateKw, btPct, fpBonusPct, recargoFpPct,
    moduloWp, cobertura, horasUtiles, costos, escalamientoPct,
    escalones, dapDomestica, cargoFijoDomestica,
    leido, inmueble, aplicaIsr, tasaIsrPct, historialManual, vigenciaDias,
  } = input;

  let invoice, meta, pagoRecurrentePeriodo, piso, ahorroMax, pctMax, cargosFinal, facturaDetalle;
  if (!esDomestica) {
    const construido = construirInvoice(tarifa, periodoDias, periodoKwh, cargos, rateKw, dap, btPct, fpBonusPct, recargoFpPct || 0);
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
    invoice = construirInvoiceDomestica(escalones, periodoDias, dapDomestica, cargoFijoDomestica || 0);
    facturaDetalle = invoice(periodoDias, periodoKwh, false);
    pagoRecurrentePeriodo = facturaDetalle.total;
    piso = invoice(periodoDias, 0, true).total;
    ahorroMax = pagoRecurrentePeriodo - piso;
    pctMax = pagoRecurrentePeriodo ? ahorroMax / pagoRecurrentePeriodo : 0;
    cargosFinal = { energia: facturaDetalle.base };
    meta = { tieneDemandaContratada: false, reducibles: ['energia'], noReducibles: [] };
  }

  // Consumo base para dimensionar: se promedian TODOS los periodos de historial
  // capturados (a mano o detectados del recibo), normalizados a kWh/mes antes de
  // promediar -- asi ningun periodo pesa mas que otro solo por tener mas o menos dias.
  // Sin historial capturado, se usa el periodo que se esta facturando ahora (el unico
  // dato real disponible). diasPorPeriodoHistorial distingue tarifas que se facturan
  // mensual (~30.5 dias) de las domesticas/01/DAC, que se facturan bimestral (~61 dias).
  //
  // Diseño corregido 2026-11-01, dos veces, a pedido explicito del usuario: un primer
  // intento exigia un minimo de 3 periodos de historial antes de confiar en su promedio; un
  // segundo intento comparaba el periodo facturado contra el historial parcial y usaba el
  // mayor de los dos; un tercer intento agregaba el periodo facturado actual como un dato
  // MAS junto con el historial, sin importar cuantos periodos de historial hubiera. Ese
  // tercer intento resulto en una inconsistencia real: el recibo de CFE normalmente YA
  // incluye el periodo mas reciente como el ultimo dato de su propio historial impreso, asi
  // que sumar el periodo actual por separado lo contaba DOS VECES -- visible como un
  // desajuste real (13 periodos en la formula de la seccion 5/6 contra 12 en la grafica de
  // la seccion 7, que solo usa el historial). Diseño final: el historial, cuando existe, ES
  // la fuente completa (incluye el periodo actual si el recibo lo imprime asi); el periodo
  // facturado por separado solo se usa cuando NO hay ningun historial capturado.
  const diasPorPeriodoHistorial = esDomestica ? DIAS_MES_REF * 2 : DIAS_MES_REF;
  const historialOcr = (leido && leido.historial) ? leido.historial.map(h => h.kwh) : null;
  const historialUsadoCrudo = (historialManual && historialManual.length) ? historialManual : historialOcr;
  // El ULTIMO periodo del historial (impreso en el recibo, o copiado a las casillas al
  // leerlo) es el MISMO periodo que se esta facturando ahora -- si se corrige "kWh del
  // período" a mano en el formulario (porque el OCR lo leyo mal, o por cualquier motivo),
  // esa correccion tiene que reflejarse aqui tambien. Sin esto, la correccion "no hacia
  // nada" porque el promedio seguia usando el valor viejo que quedo en la ultima casilla
  // del historial, sin tocar (bug real reportado por el usuario, 2026-11-01: "por que
  // siguen afectando cuando cambio... los kwh del periodo").
  const historialUsado = (historialUsadoCrudo && historialUsadoCrudo.length)
    ? [...historialUsadoCrudo.slice(0, -1), periodoKwh]
    : historialUsadoCrudo;
  const consumosMensuales = (historialUsado && historialUsado.length)
    ? historialUsado.map(kwh => kwh / diasPorPeriodoHistorial * DIAS_MES_REF)
    : [normalizarConsumoMensual(periodoKwh, periodoDias)];
  const consumoMensual = consumosMensuales.reduce((a, b) => a + b, 0) / consumosMensuales.length;
  const dailyKwh = consumoMensual / DIAS_MES_REF;
  const metodoGeneracion = `Horas-sol fijas (${horasUtiles} h/día, criterio del usuario, no oficial de CFE/PVGIS). ` +
    (historialUsado && historialUsado.length
      ? `Consumo mensual normalizado: promedio de ${consumosMensuales.length} período(s) de historial = ${consumoMensual.toFixed(2)} kWh/mes.`
      : `Consumo mensual normalizado del período facturado actual (${periodoKwh} kWh en ${periodoDias} días, sin historial capturado) = ${consumoMensual.toFixed(2)} kWh/mes.`);
  // Bug real encontrado probando con un PDF real (2026-11-01): esto decia "(capturados a
  // mano)" siempre que historialManual tuviera datos -- pero historialManual se llena
  // igual tanto si el usuario los tecleo como si el OCR/texto nativo del PDF los escribio
  // solo en las casillas (aplicarGridHistorial, ver formularioRecibo.js). La UNICA forma de
  // saber que de verdad son "a mano" es que el OCR no haya encontrado ningun historial para
  // este recibo en absoluto.
  const historialVieneDelRecibo = !!(leido && leido.historial && leido.historial.length);
  const basisConsumo = (historialUsado && historialUsado.length)
    ? `historial real de ${consumosMensuales.length} período(s)` +
      (historialVieneDelRecibo ? ' (impresos en el recibo)' : ' (capturados a mano)')
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
  const historialParaMostrarCrudo = (historialManual && historialManual.length)
    ? historialManual.map((kwh, i) => ({ mes: `P${i + 1}`, anio: '', kwh }))
    : (leido ? leido.historial : null);
  // Mismo reemplazo del ultimo periodo que arriba (historialUsado), para que la grafica y
  // la tabla de la seccion 5/7 muestren el MISMO numero que realmente se promedio -- nunca
  // el valor viejo que haya quedado en la casilla si se corrigio "kWh del período" aparte.
  const historialParaMostrar = (historialParaMostrarCrudo && historialParaMostrarCrudo.length)
    ? historialParaMostrarCrudo.map((h, i) => i === historialParaMostrarCrudo.length - 1 ? { ...h, kwh: periodoKwh } : h)
    : historialParaMostrarCrudo;
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
  // Antes: consumoMensual * 12 -- consumoMensual esta normalizado con DIAS_MES_REF=30.5
  // (30.5*12 = 366 dias exactos), mientras que `rows` (de donde salen annualbefore/
  // annualafter de arriba) usa los dias REALES del año calendario vigente (365 en años
  // no bisiestos). Las dos cifras se mostraban juntas en el mismo documento
  // (Consumo anual de referencia vs. suma de la columna "Consumo extrapolado" de la
  // tabla mensual) y no coincidian entre si (~0.27% de diferencia) -- auditoria
  // 2026-11-06, hallazgo 9. Ahora "Consumo anual de referencia" usa la MISMA base de
  // dias reales que ya usa el resto del documento, una sola fuente de verdad.
  const annualKwh = Math.round(rows.reduce((s, x) => s + x.consumoExtrapoladoKwh, 0) * 100) / 100;

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
    // omBaseInvestment = pres.inversion (la inversion REAL, no la neta de ISR): el
    // mantenimiento fisico del sistema (limpieza, revision) no depende de cuanto ISR se
    // ahorro -- antes se calculaba sobre `inversionNetaIsr`, subestimandolo solo por el
    // beneficio fiscal (auditoria 2026-11-06, hallazgo 4).
    const flujo25Isr = flujo25Anios(inversionNetaIsr, ahorroAnual, 0.10, 25, (escalamientoPct || 0) / 100, 0.01, 0.03, 0.005, costoInv, 13, pres.inversion);
    vanNetoIsr = flujo25Isr.van; tirNetoIsr = flujo25Isr.tir;
    paybackNetoIsr = ahorroAnual > 0 ? inversionNetaIsr / ahorroAnual : null;
  }

  const r = {
    titular: titular || 'Cliente', tituloRecibo: leido ? leido.titular : null, domicilio,
    noServicio, tarifa, fechaEstudio: fechaEstudioEs(),
    vigenciaDias: vigenciaDias || 15, fechaVigencia: fechaVigenciaEs(vigenciaDias || 15),
    periodoDias, periodoKwh, dap: esDomestica ? (dapDomestica || 0) : dap, cargos: cargosFinal, meta,
    btPct: btPct || 0, fpBonusPct: fpBonusPct || 0, recargoFpPct: recargoFpPct || 0, esDomestica: !!esDomestica,
    escalones: esDomestica ? escalones : null, cargoFijoDomestica: esDomestica ? (cargoFijoDomestica || 0) : null,
    demandaContratadaKw: leido ? leido.demanda_contratada_kw : null,
    pagoRecurrentePeriodo, pisoPeriodo: piso, ahorroMaxPeriodo: ahorroMax, pctMaxPeriodo: pctMax, facturaDetalle,
    n, kwp, moduloWp, cobertura, horasUtiles, gen: genAnual, annualKwh, metodoGeneracion,
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
    // Texto corregido (auditoria 2026-11-06, hallazgo 4): "100% inmediata" se presta a
    // leerse como "efectivo en el momento de la compra". El Art. 34 fraccion XIII LISR
    // SI permite deducir el 100% en el ejercicio de la erogacion, pero el beneficio real
    // (menor ISR a pagar) se recibe de forma escalonada durante ese ejercicio fiscal --
    // en los pagos provisionales o hasta la declaracion anual, no el dia de la compra --
    // y solo si el cliente causa suficiente ISR contra el cual aplicarlo. Este calculo
    // SI modela el beneficio como si llegara junto con la inversion (año 0), por
    // simplicidad -- se advierte aqui en vez de dejarlo implicito.
    r.notas.push(
      `Se estimó una deducción fiscal del 100% del costo antes de IVA en el ejercicio de la compra (Art. 34 fracción XIII LISR), ` +
      `por $${ahorroFiscalIsr.toLocaleString('en-US', { minimumFractionDigits: 2 })} ` +
      `(${tasaIsrPct.toFixed(0)}% de ISR sobre $${pres.ventaSinIva.toLocaleString('en-US', { minimumFractionDigits: 2 })}). ` +
      `Este cálculo trata ese beneficio como si se recibiera al mismo tiempo que la inversión (reduciendo la inversión neta efectiva a ` +
      `$${inversionNetaIsr.toLocaleString('en-US', { minimumFractionDigits: 2 })} y el payback simple a ${paybackTxt}) -- en la realidad, el beneficio ` +
      'se recibe de forma escalonada durante el ejercicio fiscal (pagos provisionales o declaración anual), no el día de la compra, y solo aplica si el ' +
      'cliente causa suficiente ISR. Además requiere que el equipo permanezca en operación al menos 5 años (Art. 35 LISR) o se debe pagar la diferencia. ' +
      'Es una estimación general, no asesoría fiscal -- confirmar con el contador o fiscalista del cliente antes de prometerlo en una oferta firme.'
    );
  }
  return r;
}
