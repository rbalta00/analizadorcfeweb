// -*- coding: utf-8 -*-
// Motor de facturacion y financiero, portado 1:1 desde el motor Python ya validado
// (cfe-presupuestos/app/motor_tarifas.py y dimensionamiento.py). Mismas formulas,
// mismos nombres de variable donde fue posible, para poder auditar este archivo linea
// por linea contra el original. NO reinventar logica aqui -- si algo no coincide con el
// Python, es un bug de este port, no una mejora.
//
// Exporta todo via `export` (ES module) para poder probarlo con Node y para usarlo
// despues desde la UI (index.html <script type="module">).

// ---------------------------------------------------------------------------
// Redondeo: Python usa Decimal(...).quantize(ROUND_HALF_UP) -- "redondea .5 siempre
// hacia arriba", distinto del redondeo bancario que hace Math.round en negativos y
// distinto de toFixed (que tiene errores de punto flotante conocidos, ej.
// (1.005).toFixed(2) === "1.00" en vez de "1.01"). Se implementa a mano sobre el valor
// en centavos para evitar ambos problemas.
export function R(x) {
  const centavos = Math.sign(x) * Math.round(Math.abs(x) * 100 + 1e-9);
  return centavos / 100;
}

// ---------------------------------------------------------------------------
// Catalogo de tarifas (motor_tarifas.py)
// ---------------------------------------------------------------------------
export const TARIFAS_CON_DEMANDA = new Set(['GDMTO', 'GDMTH', 'GDBT']);
export const TARIFAS_SIN_DEMANDA = new Set(['PDBT']);
export const TARIFAS_VOLUMETRICAS_RESIDENCIALES = new Set(['01', 'DAC']);

export const CONCEPTOS_DEMANDA = ['distribucion', 'capacidad'];
const _CONCEPTOS_ENERGIA = ['energia', 'energia_base', 'energia_intermedia', 'transmision', 'cenace', 'scnmem'];
const CONCEPTO_PUNTA = 'energia_punta'; // GDMTH: el sol no genera en horario punta

export class ErrorDeClasificacion extends Error {}

// verifica que la tarifa declarada sea consistente con la columna "$/kW" del recibo.
// rate_kw: {distribucion: 0|>0, capacidad: 0|>0}. Lanza ErrorDeClasificacion si hay
// contradiccion -- igual que motor_tarifas.verificar_clasificacion().
export function verificarClasificacion(tariff, rateKw) {
  if (rateKw == null) {
    throw new ErrorDeClasificacion(
      'rate_kw es obligatorio: lee la columna "$/kW" del recibo para Distribucion y Capacidad ' +
      'y pasala explicitamente (0.0 si aparece en $0.00). No se puede clasificar a ciegas.');
  }
  for (const k of CONCEPTOS_DEMANDA) {
    if (!(k in rateKw)) {
      throw new ErrorDeClasificacion(`rate_kw no trae ${k}; son los conceptos que deciden si hay demanda contratada.`);
    }
  }
  const tieneDemanda = CONCEPTOS_DEMANDA.some(k => Math.abs(rateKw[k] || 0) > 1e-9);
  if (TARIFAS_CON_DEMANDA.has(tariff) && !tieneDemanda) {
    throw new ErrorDeClasificacion(
      `La tarifa declarada es ${tariff} (normalmente con demanda contratada), pero el recibo trae ` +
      'la columna "$/kW" en $0.00 para Distribucion y Capacidad. Puede ser en realidad PDBT mal ' +
      'etiquetado, o datos incompletos. Resolver la contradiccion antes de calcular.');
  }
  if (TARIFAS_SIN_DEMANDA.has(tariff) && tieneDemanda) {
    throw new ErrorDeClasificacion(
      `La tarifa declarada es ${tariff} (normalmente sin demanda contratada), pero el recibo trae ` +
      'la columna "$/kW" > 0 para Distribucion y/o Capacidad. Puede ser en realidad GDMTO/GDMTH/GDBT. ' +
      'Resolver la contradiccion antes de calcular.');
  }
  if (!TARIFAS_CON_DEMANDA.has(tariff) && !TARIFAS_SIN_DEMANDA.has(tariff)) {
    throw new ErrorDeClasificacion(
      `Tarifa "${tariff}" sin metodologia implementada en este motor. Tarifas de demanda soportadas: ` +
      `${[...TARIFAS_CON_DEMANDA].sort()}; sin demanda: ${[...TARIFAS_SIN_DEMANDA].sort()}. Para tarifas ` +
      `domesticas (${[...TARIFAS_VOLUMETRICAS_RESIDENCIALES].sort()}) usar construirInvoiceDomestica(), no esta funcion.`);
  }
  return tieneDemanda;
}

// Construye la funcion invoice(dias, netEnergy, solar) -- igual forma que en Python.
// cargos: objeto con llaves de _CONCEPTOS_ENERGIA + CONCEPTOS_DEMANDA + 'suministro'.
export function construirInvoice(tariff, periodoDias, periodoKwh, cargos, rateKw,
                                  dapMensual, btPct, fpBonusPct, recargoFpPct = 0, ivaPct = 0.16) {
  const tieneDemanda = verificarClasificacion(tariff, rateKw);
  if (periodoKwh <= 0) throw new Error('periodoKwh debe ser > 0');
  // periodoDias llega aqui ya validado si vino de un recibo leido por OCR (recibo.js acota
  // 1-100), pero NO si se tecleo a mano -- el min="1" del <input> es solo cosmetico, no
  // bloquea el valor real leido por JS. Sin este freno, un 0 o negativo tecleado a mano
  // produce Infinity/NaN en monthlyFixed sin ningun aviso (hallazgo de la auditoria de
  // 2026-11-01). Mismo patron que el freno de periodoKwh de la linea de arriba.
  if (!(periodoDias > 0)) throw new Error('periodoDias debe ser > 0');

  let noReducibles, reducibles;
  if (tieneDemanda) {
    noReducibles = ['suministro', 'distribucion', 'capacidad'].filter(k => k in cargos);
    reducibles = _CONCEPTOS_ENERGIA.filter(k => k in cargos);
  } else {
    noReducibles = ('suministro' in cargos) ? ['suministro'] : [];
    reducibles = Object.keys(cargos).filter(k => !noReducibles.includes(k) && k !== CONCEPTO_PUNTA);
  }
  if (CONCEPTO_PUNTA in cargos) {
    reducibles = reducibles.filter(k => k !== CONCEPTO_PUNTA);
    if (!noReducibles.includes(CONCEPTO_PUNTA)) noReducibles = [...noReducibles, CONCEPTO_PUNTA];
  }

  const reducible = R(reducibles.reduce((s, k) => s + (cargos[k] || 0), 0));
  const noReducible = R(noReducibles.reduce((s, k) => s + (cargos[k] || 0), 0));
  const energyRate = reducible / periodoKwh;
  const monthlyFixed = noReducible / periodoDias;

  function invoice(dias, netEnergy, solar = false) {
    const base = monthlyFixed * dias + energyRate * netEnergy;
    const bt = R(base * btPct);
    // Ver motor_tarifas.py para la razon de excluir el bono de factor de potencia en
    // el escenario solar: el bono depende de la razon reactiva/activa del medidor, y
    // con menos energia activa neta tomada de la red esa razon empeora -- se excluye
    // por prudencia, no se asume que se mantiene igual. Mismo criterio para el recargo
    // por FP bajo (auditoria 2026-11-06, hallazgo 6: antes no existia ningun mecanismo
    // para un RECARGO por factor de potencia, solo la bonificacion -- CFE aplica un
    // recargo cuando el FP cae debajo de 90%, Acuerdo SHCP 2000, ademas de la
    // bonificacion cuando es >=90%. recargoFpPct es independiente de fpBonusPct: un
    // mismo recibo nunca trae los dos a la vez, pero el motor no lo asume, solo suma
    // ambos efectos (el que no aplique llega en 0).
    const bonus = solar ? 0 : R((base + bt) * fpBonusPct);
    const recargo = solar ? 0 : R((base + bt) * recargoFpPct);
    const pre = R(base + bt - bonus + recargo);
    const vat = R(pre * ivaPct);
    return { base: R(base), bt, bonus, recargo, subtotal: pre, iva: vat, dap: dapMensual, total: R(pre + vat + dapMensual) };
  }

  const meta = { tieneDemandaContratada: tieneDemanda, reducibles, noReducibles, reducible, noReducible, energyRate, monthlyFixed };
  return { invoice, meta };
}

export function pisoDeAhorro(periodoDias, pagoRecurrentePeriodo, invoiceFn) {
  const piso = invoiceFn(periodoDias, 0, true).total;
  const ahorroMax = R(pagoRecurrentePeriodo - piso);
  const pct = pagoRecurrentePeriodo ? ahorroMax / pagoRecurrentePeriodo : 0;
  return { piso, ahorroMax, pct };
}

const NOMBRES_MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
                        'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Antes era una constante fija DIAS_POR_MES_2026 = [31,28,...] ("2026 no es bisiesto") --
// bug real reportado por el usuario, 2026-11-05 (auditoria de scripts): esta herramienta
// se sigue usando año tras año, y un año bisiesto (2028, 2032, ...) habria calculado
// febrero con 28 dias en vez de 29, descuadrando ligeramente produccion/consumo/ahorro
// de ese mes en la seccion 7. `diasPorMes(anioCalendario)` calcula los dias reales de
// cada mes de CUALQUIER año con el truco estandar de JS (dia 0 del mes siguiente = ultimo
// dia del mes actual, que ya maneja bisiestos solo). Por default usa el año calendario
// real de hoy -- esta funcion no recibe (ni tiene por que recibir) un año de referencia
// propio: `anio` en su firma es el año de DEGRADACION del sistema (año 1, año 2... del
// horizonte de 25 años), un concepto distinto, no el año calendario.
function diasPorMes(anioCalendario) {
  return Array.from({ length: 12 }, (_, m) => new Date(anioCalendario, m + 1, 0).getDate());
}

export function flujoMensualAnual(invoiceFn, consumoDiarioKwh, generacionMensualKwhPorKwp, kwp,
                                   anio = 1, reservaPct = 0.01, degradacion = 0.005, nombresMeses = null,
                                   anioCalendario = new Date().getFullYear()) {
  nombresMeses = nombresMeses || NOMBRES_MESES;
  const diasDelAnio = diasPorMes(anioCalendario);
  const rows = [];
  for (let i = 0; i < generacionMensualKwhPorKwp.length; i++) {
    const eM = generacionMensualKwhPorKwp[i];
    const dias = diasDelAnio[i];
    const load = consumoDiarioKwh * dias;
    const produccion = eM * kwp * Math.pow(1 - degradacion, anio - 1);
    const disponible = produccion * (1 - reservaPct);
    const aplicada = Math.min(load, disponible);
    const neta = Math.max(load - aplicada, 0);
    const sin = invoiceFn(dias, load);
    const con = invoiceFn(dias, neta, true);
    rows.push({
      mes: nombresMeses[i], dias, consumoExtrapoladoKwh: load, generacionKwh: R(produccion),
      energiaAplicadaKwh: R(aplicada), energiaNetaKwh: R(neta),
      pagoSinSolarMxn: sin.total, pagoConSolarEstimadoMxn: con.total, ahorroEstimadoMxn: R(sin.total - con.total),
    });
  }
  return rows;
}

// Tarifa domestica (01/DAC): volumetrica por escalones, sin cargo de demanda.
// escalones: lista de [limiteKwhONull, tarifaMxnKwh], el ultimo con limite null.
// cargoFijoBimestral (hallazgo 7, auditoria 2026-11-06): antes no existia ningun
// mecanismo para un cargo fijo de CFE en tarifas domesticas -- fuentes periodisticas
// (no el acuerdo oficial directo) reportan que 01/DAC si traen uno, pero sin un monto
// oficial confirmado no se asume ningun valor por default (0). Se captura del recibo
// real cuando el admin lo ve impreso, igual que el resto de los cargos del proyecto --
// nunca se inventa una cifra. Se prorratea por dias igual que el DAP, y SI esta sujeto
// a IVA (a diferencia del DAP, que es un derecho municipal aparte) porque es un cargo
// de CFE como el resto de la factura.
export function construirInvoiceDomestica(escalones, periodoDias, dapBimestral, cargoFijoBimestral = 0, ivaPct = 0.16) {
  if (!(periodoDias > 0)) throw new Error('periodoDias debe ser > 0');
  // Los limites de escalon (Basico/Intermedio) vienen calibrados al periodo completo
  // del recibo (periodoDias, bimestral ~61 dias). invoice() tambien se llama con un
  // solo mes (~30 dias) dentro de la proyeccion a 25 anios (flujoMensualAnual) -- sin
  // prorratear el limite por dias/periodoDias, un mes caia en los tramos baratos
  // pensados para los dos meses del bimestre completo, subvaluando la factura "sin
  // solar" (~8%) y el ahorro proyectado (~9%). Si dias === periodoDias el factor es 1
  // y el resultado es identico al de antes.
  function energia(kwh, dias) {
    const factor = dias / periodoDias;
    let restante = kwh, total = 0.0;
    for (const [limite, tarifa] of escalones) {
      const limiteProrrateado = (limite === null) ? null : limite * factor;
      const usar = (limiteProrrateado === null) ? restante : Math.min(restante, limiteProrrateado);
      total += usar * tarifa;
      restante -= usar;
      if (restante <= 0) break;
    }
    return R(total);
  }
  function invoice(dias, netEnergy) {
    const energiaMonto = energia(netEnergy, dias);
    const cargoFijo = R(cargoFijoBimestral * dias / periodoDias);
    const base = R(energiaMonto + cargoFijo);
    const vat = R(base * ivaPct);
    const dap = R(dapBimestral * dias / periodoDias);
    return { base, bt: 0.0, bonus: 0.0, cargoFijo, subtotal: base, iva: vat, dap, total: R(base + vat + dap) };
  }
  return invoice;
}

// ---------------------------------------------------------------------------
// Dimensionamiento y presupuesto (dimensionamiento.py)
// ---------------------------------------------------------------------------
export const COSTOS_RESIDENCIAL = {
  tcMxnUsd: 18.0, moduloUsdW: 0.158, inversorMxnKwAc: 2200, relacionDcAc: 1.2,
  estructuraMxnModulo: 1100, cableDcMModulo: 8, cableDcUsdM: 1.25, cableAcM: 15, cableAcMxnM: 150,
  conectorParesModulo: 1, conectorParUsd: 3.15, proteccionDcMxn: 1200, proteccionAcMxn: 1200,
  tierraMxn: 1500, canalizacionMxn: 2000, monitoreoMxn: 800, ingenieriaMxn: 2500, tramitesMxn: 1500,
  fleteMxn: 1800, manoObraMxnWp: 3.0, contingencia: 0.08, margenSobreVenta: 0.25, iva: 0.16,
};

export const COSTOS_COMERCIAL = {
  tcMxnUsd: 18.0, moduloUsdW: 0.158, inversorMxnKwAc: 2000, relacionDcAc: 1.2,
  estructuraMxnModulo: 1050, cableDcMModulo: 8, cableDcUsdM: 1.25, cableAcM: 30, cableAcMxnM: 180,
  conectorParesModulo: 1, conectorParUsd: 3.15, proteccionDcMxn: 6500, proteccionAcMxn: 6500,
  tierraMxn: 6000, canalizacionMxn: 8000, monitoreoMxn: 5000, ingenieriaMxn: 12000, tramitesMxn: 7000,
  fleteMxn: 5500, manoObraMxnWp: 2.5, contingencia: 0.08, margenSobreVenta: 0.25, iva: 0.16,
};

export const DIAS_MES_REF = 30.5;
const HORAS_UTILES_REF = 4.5;

// Promedia varios periodos reales de historial (kWh por periodo, el mismo numero que
// aparece en la grafica "Historial de consumo" del recibo) a un consumo mensual
// normalizado -- mas representativo que extrapolar un solo periodo porque promedia
// variacion estacional. `diasPorPeriodo` depende de la tarifa: ~30.5 para tarifas que
// se facturan mensual (GDMTO/GDMTH/GDBT/PDBT), ~61 para domesticas/01/DAC que se
// facturan bimestral -- SIN esto, promediar kWh/periodo directo subestimaria a la
// mitad el consumo mensual real de un cliente domestico (cada periodo cubre 2 meses).
export function consumoMensualDesdeHistorial(valoresKwh, diasPorPeriodo, diasMes = DIAS_MES_REF) {
  const vals = (valoresKwh || []).filter(v => v != null && !Number.isNaN(Number(v)) && Number(v) > 0).map(Number);
  if (!vals.length) return null;
  const promedioPeriodo = vals.reduce((s, v) => s + v, 0) / vals.length;
  return { consumoMensual: promedioPeriodo / diasPorPeriodo * diasMes, periodosUsados: vals.length };
}

export function generacionMensualPanel(moduloWp, horasUtiles = HORAS_UTILES_REF, diasMes = DIAS_MES_REF) {
  return moduloWp / 1000 * diasMes * horasUtiles;
}

export function normalizarConsumoMensual(periodoKwh, periodoDias, diasMes = DIAS_MES_REF) {
  return periodoKwh / periodoDias * diasMes;
}

export function dimensionarHorasSol(consumoMensualKwh, moduloWp, cobertura = 1.0,
                                     horasUtiles = HORAS_UTILES_REF, diasMes = DIAS_MES_REF) {
  const genPanel = generacionMensualPanel(moduloWp, horasUtiles, diasMes);
  // moduloWp/horasUtiles tecleados a mano (0 o negativo) hacian genPanel <= 0, lo que
  // produce n=Infinity/NaN y se propaga en silencio a kwp/genMensual/genAnual y de ahi a
  // TODO el presupuesto y el flujo a 25 años (hallazgo de la auditoria de 2026-11-01,
  // mismo patron que el freno ya agregado a periodoDias/periodoKwh).
  if (!(genPanel > 0)) throw new Error('moduloWp y horasUtiles deben ser > 0');
  const n = Math.ceil(consumoMensualKwh * cobertura / genPanel);
  const kwp = R(n * moduloWp / 1000);
  const genMensual = R(n * genPanel);
  const genAnual = R(genMensual * 12);
  return { n, kwp, genMensual, genAnual };
}

// Reparte la contingencia + margen comercial proporcionalmente dentro del precio de
// cada partida (ver dimensionamiento.distribuir_markup -- el cliente no ve la
// utilidad como un renglon aparte, pero la tabla de materiales SI cuadra exacto con
// el Subtotal/Inversion).
export function distribuirMarkup(materiales, direct, sale) {
  if (!materiales.length || !direct) return;
  const factor = sale / direct;
  let acumulado = 0.0;
  materiales.forEach((m, i) => {
    let nuevoImporte;
    if (i < materiales.length - 1) {
      nuevoImporte = R(m.importeMxn * factor);
    } else {
      nuevoImporte = R(sale - acumulado);
    }
    acumulado += nuevoImporte;
    m.unitarioMxn = m.cantidad ? Math.round((nuevoImporte / m.cantidad) * 10000) / 10000 : nuevoImporte;
    m.importeMxn = nuevoImporte;
  });
}

export function presupuestar(n, kwp, moduloWp, p) {
  const acKw = R(kwp / p.relacionDcAc);
  const materiales = [];
  const add = (partida, cantidad, unidad, precio, origen) => {
    materiales.push({ partida, cantidad, unidad, unitarioMxn: Math.round(precio * 10000) / 10000,
                       importeMxn: R(cantidad * precio), origen });
  };
  add(`Panel fotovoltaico de ${moduloWp} W; marca y modelo por confirmar`, n, 'modulo',
      moduloWp * p.moduloUsdW * p.tcMxnUsd, 'Lista de proveedor (verificar vigencia)');
  add('Inversor para conversion DC/AC; equipo por seleccionar', acKw, 'kW AC presupuestado',
      p.inversorMxnKwAc, 'provision');
  add('Estructura compatible; modelo y anclajes pendientes', n, 'modulo soportado', p.estructuraMxnModulo, 'provision');
  add('Cable DC 10 AWG, longitud agregada ambos polos', n * p.cableDcMModulo, 'm', p.cableDcUsdM * p.tcMxnUsd, 'Lista de proveedor');
  add('Conectores compatibles, par H/M', Math.ceil(n * p.conectorParesModulo), 'par', p.conectorParUsd * p.tcMxnUsd, 'Lista de proveedor');
  add('Cable AC; calibre por calculo', p.cableAcM, 'm', p.cableAcMxnM, 'provision');
  add('Protecciones DC', 1, 'lote', p.proteccionDcMxn, 'provision');
  add('Protecciones AC', 1, 'lote', p.proteccionAcMxn, 'provision');
  add('Puesta a tierra y equipotencialidad', 1, 'lote', p.tierraMxn, 'provision');
  add('Canalizacion, fijaciones y accesorios', 1, 'lote', p.canalizacionMxn, 'provision');
  add('Monitoreo', 1, 'lote', p.monitoreoMxn, 'provision');
  add('Ingenieria y documentacion', 1, 'lote', p.ingenieriaMxn, 'provision');
  add('Gestion y tramites', 1, 'lote', p.tramitesMxn, 'provision');
  add('Flete y maniobras', 1, 'lote', p.fleteMxn, 'provision');
  add('Mano de obra y puesta en marcha', kwp * 1000, 'Wp', p.manoObraMxnWp, 'provision');

  const direct = R(materiales.reduce((s, m) => s + m.importeMxn, 0));
  const contingencia = R(direct * p.contingencia);
  const costo = direct + contingencia;
  const venta = R(costo / (1 - p.margenSobreVenta));
  const iva = R(venta * p.iva);
  const inversion = R(venta + iva);
  distribuirMarkup(materiales, direct, venta);
  return { materiales, directo: direct, contingencia, costo, ventaSinIva: venta, iva, inversion, acKw };
}

export function costoInversor(materiales) {
  const m = materiales.find(x => x.partida.toLowerCase().includes('inversor'));
  return m ? m.importeMxn : 0.0;
}

// Recalcula venta/iva/inversion/flujo a 25 anios/payback/ISR a partir de una tabla de
// materiales YA EDITADA a mano (ej. se sobreescribe el precio del inversor con una
// cotizacion real de proveedor). `ahorroAnual` NO cambia aqui -- depende del consumo y
// la tarifa del recibo, no de cuanto cuesta el sistema. Puerto 1:1 de
// dimensionamiento.recalcular_desde_materiales().
export function recalcularDesdeMateriales(materiales, ahorroAnual, escalamientoTarifaPct = 0,
                                           aplicaIsr = false, tasaIsrPct = 0, iva = 0.16) {
  // Hallazgo 15, auditoria 2026-11-06: al editar importeMxn a mano (editor de precios),
  // unitarioMxn se quedaba con el valor viejo (nunca se recalculaba aqui) -- hoy no se
  // muestra en ninguna tabla de pantalla/PDF asi que no era visible, pero es dato
  // interno inconsistente (unitarioMxn * cantidad ya no cuadraba con importeMxn). Se
  // recalcula para que los datos internos sigan siendo correctos.
  materiales.forEach((m) => {
    m.unitarioMxn = m.cantidad ? Math.round((m.importeMxn / m.cantidad) * 10000) / 10000 : m.importeMxn;
  });
  const ventaSinIva = R(materiales.reduce((s, m) => s + m.importeMxn, 0));
  const ivaMonto = R(ventaSinIva * iva);
  const investment = R(ventaSinIva + ivaMonto);
  const om1 = R(investment * 0.01);
  const costoInv = costoInversor(materiales);
  const flujo25 = flujo25Anios(investment, ahorroAnual, 0.10, 25, (escalamientoTarifaPct || 0) / 100,
                                0.01, 0.03, 0.005, costoInv);
  const payback = ahorroAnual > 0 ? investment / ahorroAnual : null;
  const out = {
    ventaSinIva, iva: ivaMonto, investment, om1,
    van: flujo25.van, tir: flujo25.tir, recuperacionAcumulada: flujo25.recuperacionAcumulada,
    flujo25Rows: flujo25.flujo, payback,
  };
  if (aplicaIsr) {
    const ahorroFiscalIsr = R(ventaSinIva * (tasaIsrPct / 100));
    const inversionNetaIsr = R(investment - ahorroFiscalIsr);
    // omBaseInvestment = investment (la real, no la neta de ISR) -- mismo fix que en
    // resultado.js, hallazgo 4: el mantenimiento real no depende del beneficio fiscal.
    const flujo25Isr = flujo25Anios(inversionNetaIsr, ahorroAnual, 0.10, 25, (escalamientoTarifaPct || 0) / 100,
                                     0.01, 0.03, 0.005, costoInv, 13, investment);
    const paybackNetoIsr = ahorroAnual > 0 ? inversionNetaIsr / ahorroAnual : null;
    Object.assign(out, {
      ahorroFiscalIsr, inversionNetaIsr, vanNetoIsr: flujo25Isr.van, tirNetoIsr: flujo25Isr.tir, paybackNetoIsr,
    });
  }
  return out;
}

// Pago mensual de un credito simple de cuota fija (amortizacion francesa), para
// comparar contra el ahorro mensual estimado. NO es una oferta de financiamiento
// real: la tasa y el plazo reales los pone el banco/financiera que el cliente elija;
// esto es solo una simulacion generica para la conversacion con el cliente. Puerto
// 1:1 de dimensionamiento.pago_mensual_credito().
export function pagoMensualCredito(monto, tasaAnual, plazoAnios) {
  if (monto <= 0) return 0.0;
  const tasaMensual = tasaAnual / 12;
  const nMeses = plazoAnios * 12;
  if (tasaMensual === 0) return monto / nMeses;
  return monto * tasaMensual / (1 - Math.pow(1 + tasaMensual, -nMeses));
}

function npv(rate, flows) {
  return flows.reduce((s, v, i) => s + v / Math.pow(1 + rate, i), 0);
}

function irr(flows) {
  const nz = flows.filter(v => v);
  const signs = nz.map(v => (v > 0 ? 1 : -1));
  let cambios = 0;
  for (let i = 0; i < signs.length - 1; i++) if (signs[i] !== signs[i + 1]) cambios++;
  if (cambios !== 1) return null;
  let lo = -0.95, hi = 10.0;
  if (npv(lo, flows) * npv(hi, flows) > 0) return null;
  for (let i = 0; i < 120; i++) {
    const mid = (lo + hi) / 2;
    if (npv(mid, flows) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Flujo a 25 anios con degradacion, mantenimiento creciente y (opcional) reposicion
// de inversor en anioReposicionInversor -- ver dimensionamiento.flujo_25_anios(). Si
// costoInversorHoy se deja en 0, el flujo NO incluye reposicion: quien llama esta
// funcion debe pasar el costo real (ver costoInversor()) para que cualquier texto que
// diga "se incluye reposicion del inversor" sea cierto.
// omBaseInvestment: base SEPARADA para calcular el mantenimiento (om1), distinta de
// `investment` (que sigue siendo el desembolso real del flujo/VAN/TIR). Por default es
// la misma `investment` -- sin cambio de comportamiento para ningun llamador existente.
// Se agrego (auditoria 2026-11-06, hallazgo 4) porque el escenario ISR volvia a llamar
// esta funcion con `inversionNetaIsr` (la inversion YA reducida por el beneficio
// fiscal) como `investment` -- eso hacia que el mantenimiento de ESE escenario saliera
// mas chico solo porque hubo un beneficio fiscal, aunque el mantenimiento real del
// sistema (limpieza, revision) no depende de cuanto ISR se ahorro. Quien llame con
// ISR debe pasar la inversion REAL (bruta) en `omBaseInvestment`.
export function flujo25Anios(investment, ahorroAnio1, descuento = 0.10, horizonte = 25,
                              escalamientoAhorro = 0.0, omFraccion = 0.01, escalamientoOm = 0.03,
                              degradacion = 0.005, costoInversorHoy = 0.0, anioReposicionInversor = 13,
                              omBaseInvestment = null) {
  const om1 = (omBaseInvestment ?? investment) * omFraccion;
  const flows = [-investment];
  const rows = [{ anio: 0, ahorroMxn: 0, omMxn: 0, reposicionMxn: 0, flujoMxn: -investment, acumuladoMxn: -investment }];
  let cum = -investment;
  let recovered = null;
  for (let year = 1; year <= horizonte; year++) {
    const ahorro = ahorroAnio1 * Math.pow(1 - degradacion, year - 1) * Math.pow(1 + escalamientoAhorro, year - 1);
    const om = om1 * Math.pow(1 + escalamientoOm, year - 1);
    const reposicion = (year === anioReposicionInversor && costoInversorHoy)
      ? R(costoInversorHoy * Math.pow(1 + escalamientoOm, year - 1)) : 0.0;
    const net = ahorro - om - reposicion;
    const prev = cum;
    cum += net;
    if (recovered === null && prev < 0 && cum >= 0 && net > 0) {
      recovered = (year - 1) + (-prev / net);
    }
    flows.push(net);
    rows.push({ anio: year, ahorroMxn: R(ahorro), omMxn: R(om), reposicionMxn: reposicion, flujoMxn: R(net), acumuladoMxn: R(cum) });
  }
  return { flujo: rows, van: R(npv(descuento, flows)), tir: irr(flows), recuperacionAcumulada: recovered };
}

// Beneficio/costo del flujo a 25 anios -- fuente UNICA (auditoria 2026-11-06, hallazgo
// 1): antes existian 2 copias de este calculo (secciones.js y propuesta.js) que se
// habian desincronizado -- la de pantalla SI incluia la reposicion del inversor en el
// costo descontado, la del PDF no, dando un indicador mas favorable en el PDF que en
// pantalla para el mismo estudio. Ahora pantalla y PDF importan esta misma funcion.
// `r`: el objeto resultado completo (usa r.flujo25Rows y r.investment).
export function beneficioCosto(r) {
  const flujo25 = r.flujo25Rows || [];
  if (!flujo25.length) return null;
  const flujoPos = flujo25.filter(x => x.anio > 0);
  const beneficioDesc = flujoPos.reduce((s, x) => s + x.ahorroMxn / Math.pow(1.10, x.anio), 0);
  const costoDesc = r.investment + flujoPos.reduce((s, x) => s + (x.omMxn + (x.reposicionMxn || 0)) / Math.pow(1.10, x.anio), 0);
  return costoDesc ? beneficioDesc / costoDesc : null;
}
