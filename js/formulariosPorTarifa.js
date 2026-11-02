// Un formulario propio e independiente por cada tarifa de CFE soportada, en vez de un
// solo bloque compartido con sub-partes que se esconden/muestran (como funcionaba
// antes formularioRecibo.js). Pedido explicito del usuario: "cada tarifa tenga su
// propio formulario para que no te confundas" -- al elegir la tarifa aparece SU
// seccion, con solo los campos que a ella le tocan, sin radios ni checkboxes de otra
// tarifa escondidos en el mismo bloque.
//
// Para no repetir 4 veces casi el mismo markup (GDMTO/GDMTH/GDBT/PDBT comparten
// estructura, solo cambia si la Energia viene partida en 3 renglones -- GDMTH -- y si
// la columna "$/kW" trae demanda por defecto -- PDBT normalmente no), se generan con
// una sola funcion parametrizada; lo mismo para 01/DAC (comparten estructura, DAC no
// trae escalones). Las secciones resultantes son elementos de DOM completamente
// separados -- no se compara esto con "ocultar sub-bloques", cada tarifa tiene los
// suyos propios.
import { TARIFAS_CON_DEMANDA, TARIFAS_SIN_DEMANDA, TARIFAS_VOLUMETRICAS_RESIDENCIALES } from './motor.js';

export const TARIFAS_SOPORTADAS = ['GDMTO', 'GDMTH', 'GDBT', 'PDBT', '01', 'DAC'];

const $ = (id) => document.getElementById(id);

export function esDomestica(tarifa) {
  return TARIFAS_VOLUMETRICAS_RESIDENCIALES.has(tarifa);
}

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) e.append(c);
  return e;
}

function campoNumero(id, label, valor, extra = {}) {
  const input = el('input', { id, type: 'number', value: valor, step: extra.step || '0.01', ...extra });
  return el('label', {}, [document.createTextNode(label), input]);
}

function gridHistorial(prefijo, n) {
  const cont = el('div', { class: 'fila historial' });
  for (let i = 1; i <= n; i++) {
    cont.append(el('label', {}, [
      document.createTextNode(`P${i}`),
      el('input', { id: `${prefijo}hist_${i}`, type: 'number', step: '0.01', min: '0', placeholder: 'kWh' }),
    ]));
  }
  return cont;
}

// GDMTO / GDMTH / GDBT / PDBT -- todas se facturan mensual (12 periodos de historial) y
// comparten el mismo desglose de cargos; solo difiere si la Energia viene partida
// (GDMTH) y si la columna "$/kW" trae demanda por defecto (PDBT normalmente no).
function crearSeccionConDemanda(prefijo, { energiaDividida, demandaPorDefecto }) {
  const p = `${prefijo}_`;
  const sec = el('section', { id: `tarjeta_${prefijo}`, class: 'tarjeta', hidden: 'true' });

  sec.append(el('div', { class: 'fila' }, [
    campoNumero(`${p}periodoDias`, 'Días del período', 30, { min: '1' }),
    campoNumero(`${p}periodoKwh`, 'kWh del período', 1000, { min: '0.01' }),
    campoNumero(`${p}dap`, 'DAP (alumbrado público), por período', 197, { min: '0' }),
  ]));

  sec.append(el('h4', { text: 'Historial de consumo (opcional, nos ayuda a calcular mejor)' }));
  sec.append(el('p', { class: 'nota', text: 'Si tu recibo trae una gráfica o tabla de "Historial de consumo" (normalmente los últimos 12 meses), copia el kWh de cada uno abajo -- así calculamos tu sistema con tu consumo real promedio en vez de un solo mes. Si no la tienes, déjala en blanco, no es obligatoria.' }));
  sec.append(gridHistorial(p, 12));

  sec.append(el('h4', { text: 'Desglose de cargos del período (MXN)' }));
  sec.append(el('p', { class: 'nota', text: 'En la tabla de conceptos de tu recibo, copia el importe de cada renglón. Si alguno no aparece en tu recibo, déjalo en 0.' }));
  const filaCargos = el('div', { class: 'fila cargos' }, [
    campoNumero(`${p}c_suministro`, 'Suministro', 0),
    campoNumero(`${p}c_distribucion`, 'Distribución', 0),
    campoNumero(`${p}c_transmision`, 'Transmisión', 0),
    campoNumero(`${p}c_cenace`, 'CENACE', 0),
  ]);
  if (energiaDividida) {
    filaCargos.append(campoNumero(`${p}c_energia_base`, 'Energía Base', 0));
    filaCargos.append(campoNumero(`${p}c_energia_intermedia`, 'Energía Intermedia', 0));
    filaCargos.append(campoNumero(`${p}c_energia_punta`, 'Energía Punta', 0));
  } else {
    filaCargos.append(campoNumero(`${p}c_energia`, 'Energía', 0));
  }
  filaCargos.append(campoNumero(`${p}c_capacidad`, 'Capacidad', 0));
  filaCargos.append(campoNumero(`${p}c_scnmem`, 'SCnMEM', 0));
  sec.append(filaCargos);
  if (energiaDividida) {
    sec.append(el('p', { class: 'nota', text: 'Tu tarifa (GDMTH) trae la Energía partida en 3 renglones en tu recibo: "Generación Base", "Generación Intermedia" y "Generación Punta". Ya los copiaste arriba.' }));
  }

  sec.append(el('h4', { text: 'Columna "$/kW" del recibo' }));
  sec.append(el('p', { class: 'nota', text: 'En la tabla de tu recibo, busca la columna "$/kW" de Distribución y Capacidad. Si trae un importe (no $0.00), marca "Sí hay demanda".' }));
  const def = demandaPorDefecto || 'demanda';
  const fsDist = el('fieldset', {}, [el('legend', { text: 'Distribución' })]);
  fsDist.append(el('label', {}, [el('input', { type: 'radio', name: `${p}rkDist`, value: 'demanda', ...(def === 'demanda' ? { checked: 'true' } : {}) }), document.createTextNode(' Trae importe en $/kW (SÍ hay demanda)')]));
  fsDist.append(el('label', {}, [el('input', { type: 'radio', name: `${p}rkDist`, value: 'mercado', ...(def === 'mercado' ? { checked: 'true' } : {}) }), document.createTextNode(' Aparece en $0.00 (NO hay demanda)')]));
  const fsCap = el('fieldset', {}, [el('legend', { text: 'Capacidad' })]);
  fsCap.append(el('label', {}, [el('input', { type: 'radio', name: `${p}rkCap`, value: 'demanda', ...(def === 'demanda' ? { checked: 'true' } : {}) }), document.createTextNode(' Trae importe en $/kW (SÍ hay demanda)')]));
  fsCap.append(el('label', {}, [el('input', { type: 'radio', name: `${p}rkCap`, value: 'mercado', ...(def === 'mercado' ? { checked: 'true' } : {}) }), document.createTextNode(' Aparece en $0.00 (NO hay demanda)')]));
  sec.append(el('div', { class: 'fila' }, [fsDist, fsCap]));
  if (TARIFAS_SIN_DEMANDA.has(prefijo)) {
    sec.append(el('p', { class: 'nota', text: 'Tu tarifa (PDBT) normalmente NO trae demanda contratada -- por eso las dos quedan marcadas en $0.00 por defecto. Si tu recibo sí trae importe en $/kW, cámbialo arriba.' }));
  }

  sec.append(el('h4', { text: 'Cargos extra del recibo (si aplican)' }));
  const filaExtra = el('div', { class: 'fila' });
  const chkBt = el('input', { type: 'checkbox', id: `${p}traeBt` });
  const montoBt = el('input', { id: `${p}btMonto`, type: 'number', value: 0, min: '0', step: '0.01', disabled: 'true' });
  chkBt.addEventListener('change', () => { montoBt.disabled = !chkBt.checked; });
  filaExtra.append(el('label', {}, [chkBt, document.createTextNode(' Trae cargo de 2% en baja tensión')]));
  filaExtra.append(el('label', {}, [document.createTextNode('Monto del 2% (MXN)'), montoBt]));
  const chkBonus = el('input', { type: 'checkbox', id: `${p}traeBonus` });
  const montoBonus = el('input', { id: `${p}bonusMonto`, type: 'number', value: 0, min: '0', step: '0.01', disabled: 'true' });
  chkBonus.addEventListener('change', () => { montoBonus.disabled = !chkBonus.checked; });
  filaExtra.append(el('label', {}, [chkBonus, document.createTextNode(' Trae bonificación por factor de potencia')]));
  filaExtra.append(el('label', {}, [document.createTextNode('Monto de la bonificación (MXN, positivo)'), montoBonus]));
  sec.append(filaExtra);

  return sec;
}

// 01 (doméstica) / DAC (doméstica alto consumo) -- se facturan bimestral (6 periodos de
// historial), volumétricas, sin cargo de demanda. DAC es tarifa plana única por kWh
// (sin escalones) -- ver motor.js/motor_tarifas.py; 01 sí tiene los 3 escalones
// Básico/Intermedio/Excedente.
function crearSeccionDomestica(prefijo, { conEscalones }) {
  const p = `${prefijo}_`;
  const sec = el('section', { id: `tarjeta_${prefijo}`, class: 'tarjeta', hidden: 'true' });

  sec.append(el('div', { class: 'fila' }, [
    campoNumero(`${p}periodoDias`, 'Días del período', 60, { min: '1' }),
    campoNumero(`${p}periodoKwh`, 'kWh del período', 400, { min: '0.01' }),
    campoNumero(`${p}dap`, 'DAP del período (MXN)', 0, { min: '0' }),
  ]));

  sec.append(el('h4', { text: 'Historial de consumo (opcional, nos ayuda a calcular mejor)' }));
  sec.append(el('p', { class: 'nota', text: 'Si tu recibo trae una gráfica o tabla de "Historial de consumo" (normalmente los últimos 6 bimestres), copia el kWh de cada uno abajo. Si no la tienes, déjala en blanco, no es obligatoria.' }));
  sec.append(gridHistorial(p, 6));

  if (conEscalones) {
    sec.append(el('h4', { text: 'Escalones de tu tarifa (si tu recibo los trae impresos)' }));
    sec.append(el('p', { class: 'nota', text: 'Busca en tu recibo la tabla con los renglones "Básico", "Intermedio" y "Excedente" (los límites de kWh y el precio por kWh de cada uno). Si no la encuentras, déjalo como está -- usaremos valores típicos y los confirmamos contigo antes de la cotización final.' }));
    sec.append(el('div', { class: 'fila' }, [
      campoNumero(`${p}basicoKwh`, 'Límite Básico (kWh)', 150, { step: '1' }),
      campoNumero(`${p}basicoRate`, 'Tarifa Básico ($/kWh)', 1.140, { step: '0.001' }),
    ]));
    sec.append(el('div', { class: 'fila' }, [
      campoNumero(`${p}interKwh`, 'Límite Intermedio (kWh adicionales)', 130, { step: '1' }),
      campoNumero(`${p}interRate`, 'Tarifa Intermedio ($/kWh)', 1.385, { step: '0.001' }),
    ]));
    sec.append(el('div', { class: 'fila' }, [
      campoNumero(`${p}excedRate`, 'Tarifa Excedente ($/kWh)', 4.054, { step: '0.001' }),
    ]));
  } else {
    sec.append(el('h4', { text: 'Tarifa de tu recibo' }));
    sec.append(el('p', { class: 'nota', text: 'Tu tarifa (DAC, doméstica de alto consumo) no tiene escalones -- es un precio único por cada kWh. Búscalo en tu recibo (viene como "Precio medio" o el precio por kWh de Energía) y cópialo abajo.' }));
    sec.append(el('div', { class: 'fila' }, [
      campoNumero(`${p}flatRate`, 'Precio único ($/kWh)', 6.500, { step: '0.001' }),
    ]));
  }

  return sec;
}

const OPCIONES = {
  GDMTO: { tipo: 'demanda', energiaDividida: false },
  GDMTH: { tipo: 'demanda', energiaDividida: true },
  GDBT: { tipo: 'demanda', energiaDividida: false },
  PDBT: { tipo: 'demanda', energiaDividida: false, demandaPorDefecto: 'mercado' },
  '01': { tipo: 'domestica', conEscalones: true },
  DAC: { tipo: 'domestica', conEscalones: false },
};

// Crea las 6 secciones (todas ocultas) dentro del contenedor indicado. Llamar una sola
// vez al cargar la página.
export function inicializarFormulariosPorTarifa(contenedorId) {
  const cont = $(contenedorId);
  if (!cont || cont.childElementCount) return;
  for (const tarifa of TARIFAS_SOPORTADAS) {
    const o = OPCIONES[tarifa];
    const sec = o.tipo === 'demanda'
      ? crearSeccionConDemanda(tarifa, o)
      : crearSeccionDomestica(tarifa, o);
    cont.append(sec);
  }
}

export function mostrarFormularioTarifa(tarifa) {
  for (const t of TARIFAS_SOPORTADAS) {
    const sec = $(`tarjeta_${t}`);
    if (sec) sec.hidden = (t !== tarifa);
  }
}

function leerGridHistorial(prefijo, n) {
  const valores = [];
  for (let i = 1; i <= n; i++) {
    const v = $(`${prefijo}hist_${i}`)?.value;
    valores.push(v === '' || v == null ? null : v);
  }
  return valores;
}

function aplicarGridHistorial(prefijo, n, valores) {
  for (let i = 1; i <= n; i++) {
    const inp = $(`${prefijo}hist_${i}`);
    if (inp) inp.value = (valores && valores[i - 1] != null) ? valores[i - 1] : '';
  }
}

// Lee el formulario de la tarifa indicada y regresa la forma comun que usa el envio a
// Supabase (envios_cliente) y el motor de calculo -- cada tarifa sabe traducir sus
// propios campos a esta forma, en vez de que quien llama tenga que saber si es
// domestica, si tiene demanda o si la energia viene dividida.
//
// IMPORTANTE: "escalones" se regresa como objeto {basicoKwh,basicoRate,interKwh,
// interRate,excedRate} -- NO como arreglo de tramos -- porque asi es como
// formularioDesdeEnvio() en app.js (panel interno, bandeja de clientes) ya lee
// envio.escalones al asignar un envio a una cotizacion; cambiar esta forma aqui
// rompería esa asignacion en silencio. Para DAC (tarifa plana, sin escalones reales)
// se usa el mismo truco que ya soporta ese pipeline: limites en 0 para que Básico/
// Intermedio no consuman kWh y Excedente cargue el 100% al precio único -- ver
// construirInvoiceDomestica() en motor.js, que SÍ usa el arreglo de tramos (lo arma
// resultado.js a partir de este mismo objeto, no aqui).
export function leerFormularioTarifa(tarifa) {
  const o = OPCIONES[tarifa];
  const p = `${tarifa}_`;
  if (o.tipo === 'domestica') {
    const escalones = o.conEscalones
      ? {
          basicoKwh: Number($(`${p}basicoKwh`)?.value) || 0, basicoRate: Number($(`${p}basicoRate`)?.value) || 0,
          interKwh: Number($(`${p}interKwh`)?.value) || 0, interRate: Number($(`${p}interRate`)?.value) || 0,
          excedRate: Number($(`${p}excedRate`)?.value) || 0,
        }
      : (() => {
          const flat = Number($(`${p}flatRate`)?.value) || 0;
          return { basicoKwh: 0, basicoRate: flat, interKwh: 0, interRate: flat, excedRate: flat };
        })();
    return {
      periodoDias: $(`${p}periodoDias`)?.value, periodoKwh: $(`${p}periodoKwh`)?.value, dap: $(`${p}dap`)?.value,
      cargos: null, rateKw: null, traeBt: false, btMonto: 0, traeBonus: false, bonusMonto: 0,
      escalones, historial: leerGridHistorial(p, 6),
    };
  }
  const cargos = {
    suministro: $(`${p}c_suministro`)?.value, distribucion: $(`${p}c_distribucion`)?.value,
    transmision: $(`${p}c_transmision`)?.value, cenace: $(`${p}c_cenace`)?.value,
    capacidad: $(`${p}c_capacidad`)?.value, scnmem: $(`${p}c_scnmem`)?.value,
  };
  if (o.energiaDividida) {
    cargos.energiaBase = $(`${p}c_energia_base`)?.value;
    cargos.energiaIntermedia = $(`${p}c_energia_intermedia`)?.value;
    cargos.energiaPunta = $(`${p}c_energia_punta`)?.value;
  } else {
    cargos.energia = $(`${p}c_energia`)?.value;
  }
  const traeBt = !!$(`${p}traeBt`)?.checked;
  const traeBonus = !!$(`${p}traeBonus`)?.checked;
  return {
    periodoDias: $(`${p}periodoDias`)?.value, periodoKwh: $(`${p}periodoKwh`)?.value, dap: $(`${p}dap`)?.value,
    cargos,
    rateKw: {
      distribucion: document.querySelector(`input[name="${p}rkDist"]:checked`)?.value === 'demanda' ? 1 : 0,
      capacidad: document.querySelector(`input[name="${p}rkCap"]:checked`)?.value === 'demanda' ? 1 : 0,
    },
    traeBt, btMonto: $(`${p}btMonto`)?.value, traeBonus, bonusMonto: $(`${p}bonusMonto`)?.value,
    escalones: null, historial: leerGridHistorial(p, 12),
  };
}

// Mapa campo-extraido -> id de input, PARA LA TARIFA DADA -- usado para resaltar en
// naranja lo que el lector de recibo no detecto solo. Devuelve undefined para un campo
// que no tiene input en esa tarifa (ej. "energia" en GDMTH, que usa los 3 divididos).
export function idDeCampo(tarifa, campo) {
  const o = OPCIONES[tarifa];
  const p = `${tarifa}_`;
  if (!o) return undefined;
  if (o.tipo === 'domestica') {
    return { periodo_dias: `${p}periodoDias`, periodo_kwh: `${p}periodoKwh`, dap: `${p}dap` }[campo];
  }
  const mapa = {
    periodo_dias: `${p}periodoDias`, periodo_kwh: `${p}periodoKwh`, dap: `${p}dap`,
    suministro: `${p}c_suministro`, distribucion: `${p}c_distribucion`, transmision: `${p}c_transmision`,
    cenace: `${p}c_cenace`, capacidad: `${p}c_capacidad`, scnmem: `${p}c_scnmem`,
  };
  if (o.energiaDividida) {
    mapa.energia_base = `${p}c_energia_base`; mapa.energia_intermedia = `${p}c_energia_intermedia`; mapa.energia_punta = `${p}c_energia_punta`;
  } else {
    mapa.energia = `${p}c_energia`;
  }
  return mapa[campo];
}

// Autollena el formulario de la tarifa dada a partir de lo que extraerCampos()
// (recibo.js) detecto solo en un recibo subido.
export function llenarFormularioTarifaDesdeRecibo(tarifa, c) {
  const o = OPCIONES[tarifa];
  const p = `${tarifa}_`;
  if (o.tipo === 'domestica') {
    if (c.periodo_dias != null) $(`${p}periodoDias`).value = c.periodo_dias;
    if (c.periodo_kwh != null) $(`${p}periodoKwh`).value = c.periodo_kwh;
    if (c.dap != null) $(`${p}dap`).value = c.dap;
    // recibo.js devuelve los periodos en orden cronologico ascendente (el mas reciente al
    // final) -- con slice(-n) se mantienen siempre los N periodos MAS RECIENTES cuando el
    // historial trae mas periodos que casillas disponibles (mismo fix que en
    // formularioRecibo.js, 2026-11-01).
    if (c.historial && c.historial.length) aplicarGridHistorial(p, 6, c.historial.slice(-6).map(h => h.kwh));
    return;
  }
  if (c.periodo_dias != null) $(`${p}periodoDias`).value = c.periodo_dias;
  if (c.periodo_kwh != null) $(`${p}periodoKwh`).value = c.periodo_kwh;
  if (c.dap != null) $(`${p}dap`).value = c.dap;
  for (const k of ['suministro', 'distribucion', 'transmision', 'cenace', 'capacidad', 'scnmem']) {
    if (c[k] != null) $(`${p}c_${k}`).value = c[k];
  }
  if (o.energiaDividida) {
    if (c.energia_base != null) $(`${p}c_energia_base`).value = c.energia_base;
    if (c.energia_intermedia != null) $(`${p}c_energia_intermedia`).value = c.energia_intermedia;
    if (c.energia_punta != null) $(`${p}c_energia_punta`).value = c.energia_punta;
  } else if (c.energia != null) {
    $(`${p}c_energia`).value = c.energia;
  }
  if (c.rate_kw_detectado) {
    const rd = document.querySelector(`input[name="${p}rkDist"][value="${c.rate_kw_detectado.distribucion > 0 ? 'demanda' : 'mercado'}"]`);
    if (rd) rd.checked = true;
    const rc = document.querySelector(`input[name="${p}rkCap"][value="${c.rate_kw_detectado.capacidad > 0 ? 'demanda' : 'mercado'}"]`);
    if (rc) rc.checked = true;
  }
  if (c.bt_monto) { $(`${p}traeBt`).checked = true; $(`${p}btMonto`).disabled = false; $(`${p}btMonto`).value = c.bt_monto; }
  if (c.bonus_monto) { $(`${p}traeBonus`).checked = true; $(`${p}bonusMonto`).disabled = false; $(`${p}bonusMonto`).value = Math.abs(c.bonus_monto); }
  // Mismo fix que arriba: quedarse con los 12 periodos MAS RECIENTES, no los primeros 12.
  if (c.historial && c.historial.length) aplicarGridHistorial(p, 12, c.historial.slice(-12).map(h => h.kwh));
}
