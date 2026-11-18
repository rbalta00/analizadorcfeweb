// Logica compartida de captura de datos del recibo (tarifa, periodo, cargos, columna
// "$/kW", cargos extra, escalones domesticos) -- usada tanto por la app principal
// (js/app.js, dentro de una cotizacion) como por la pagina publica donde un cliente
// carga sus propios datos (cliente.html / js/clienteForm.js). Las DOS paginas usan los
// MISMOS ids de campo a proposito, para que esta logica no tenga que duplicarse ni
// arriesgarse a desincronizar.
export const DOMESTICAS = new Set(['01', 'DAC']);
export const TARIFAS_SOPORTADAS = new Set(['GDMTO', 'GDMTH', 'GDBT', 'PDBT', '01', 'DAC']);

// cliente.html usa un subconjunto mas chico de campos que index.html (sin los
// escalones de la tarifa domestica -- "no hace falta llenarlos", se usan los valores
// de fabrica). $() devuelve un elemento "vacio" seguro cuando el id no existe en la
// pagina actual, en vez de reventar -- asi este modulo sirve para cualquier pagina que
// use un subconjunto de estos campos, sin tener que acordarse de cuales le tocan a cual.
const elementoVacio = () => ({ value: '', checked: false, disabled: false });
const $ = (id) => document.getElementById(id) || elementoVacio();

export function esDomestica(tarifa) {
  return DOMESTICAS.has(tarifa);
}

// Genera los campos numericos del historial de consumo -- 12 periodos para tarifas que
// se facturan mensual, 6 para domesticas/01/DAC que se facturan bimestral (ver
// motor.js consumoMensualDesdeHistorial). Se generan por JS en vez de escribirlos a
// mano en el HTML para no mantener 18 inputs casi identicos duplicados entre
// index.html y cliente.html -- ambas paginas solo ponen el contenedor vacio
// (#gridHistorialNoDom / #gridHistorialDom) y llaman esta funcion una vez al cargar.
export function inicializarGridsHistorial() {
  const specs = [['gridHistorialNoDom', 'hist_nd_', 12], ['gridHistorialDom', 'hist_d_', 6]];
  for (const [contId, prefijo, n] of specs) {
    const cont = document.getElementById(contId);
    if (!cont || cont.childElementCount) continue;
    for (let i = 1; i <= n; i++) {
      const label = document.createElement('label');
      label.textContent = `P${i}`;
      const input = document.createElement('input');
      input.type = 'number'; input.step = '0.01'; input.min = '0';
      input.id = prefijo + i;
      input.placeholder = 'kWh';
      label.append(input);
      cont.append(label);
    }
  }
}

function leerGridHistorial(prefijo, n) {
  const valores = [];
  for (let i = 1; i <= n; i++) {
    const v = $(prefijo + i).value;
    valores.push(v === '' ? null : v);
  }
  return valores;
}

function aplicarGridHistorial(prefijo, n, valores) {
  for (let i = 1; i <= n; i++) {
    const el2 = document.getElementById(prefijo + i);
    if (el2) el2.value = (valores && valores[i - 1] != null) ? valores[i - 1] : '';
  }
}

// Si el usuario eligio la tarifa A MANO (clic real en el <select>, no un cambio
// programatico via dispatchEvent) y DESPUES carga un recibo que el OCR detecta como
// una tarifa DISTINTA, antes esto se pisaba en silencio (ver llenarFormularioDesdeReciboCampos
// mas abajo) -- bug real reportado en el encargo del usuario, 2026-11-12: "si la tarifa
// detectada difiere de la seleccionada, muestra ambas y permite confirmar". Se usa
// `event.isTrusted` para distinguir un clic real del usuario (true) de los
// `dispatchEvent(new Event('change'))` que este mismo modulo y aplicarFormularioRecibo()
// disparan para propagar un cambio de estado (false) -- asi NO se pregunta en el caso
// normal (proyecto nuevo, que arranca con 'GDMTO' como valor de fabrica sin que el
// usuario lo haya tocado). aplicarFormularioRecibo() resetea esta bandera cada vez que
// se carga el estado completo de un proyecto (abrir, crear nuevo, aplicar machote).
let tarifaTocadaPorUsuario = false;
export function resetearTarifaTocadaPorUsuario() { tarifaTocadaPorUsuario = false; }

// Conecta los listeners de tarifa (muestra/oculta el bloque domestico vs. no domestico)
// y de los checkboxes de cargos extra (2% BT / bonificacion FP). onCambioTarifa(dom) es
// opcional, para que quien use este modulo reaccione al cambio (ej. mostrar/ocultar
// otras secciones de su propio formulario).
export function conectarEventosFormularioRecibo(onCambioTarifa) {
  inicializarGridsHistorial();
  $('tarifa').addEventListener('change', (e) => {
    if (e && e.isTrusted) tarifaTocadaPorUsuario = true;
    const dom = esDomestica($('tarifa').value);
    $('bloqueNoDomestica').hidden = dom;
    $('bloqueDomestica').hidden = !dom;
    // GDMTH trae la Energia partida en 3 renglones (Base/Intermedia/Punta) en vez de
    // uno solo -- ver motor.js (CONCEPTO_PUNTA no es reducible, a diferencia de un
    // campo "energia" generico). Las demas tarifas usan el campo unico de siempre.
    const esGdmth = $('tarifa').value === 'GDMTH';
    $('grupoEnergiaUnica').hidden = esGdmth;
    $('grupoEnergiaGDMTH').hidden = !esGdmth;
    if (onCambioTarifa) onCambioTarifa(dom);
  });
  $('traeBt').addEventListener('change', () => { $('btMonto').disabled = !$('traeBt').checked; });
  $('traeBonus').addEventListener('change', () => { $('bonusMonto').disabled = !$('traeBonus').checked; });
  // Recargo por factor de potencia (hallazgo 6, auditoria 2026-11-06): antes solo
  // existia "bonificacion" -- CFE tambien aplica un RECARGO cuando el FP cae debajo de
  // 90% (Acuerdo SHCP 2000), y no habia ningun campo pensado para capturarlo como un
  // AUMENTO del cobro. Mismo patron checkbox+monto que traeBonus, pero en motor.js se
  // SUMA en vez de restarse -- nunca se reusa el campo de bonificacion con signo
  // invertido, para que quien captura a mano elija explicitamente cual de los dos es.
  $('traeRecargoFp').addEventListener('change', () => { $('recargoFpMonto').disabled = !$('traeRecargoFp').checked; });
}

export function leerFormularioRecibo() {
  return {
    tarifa: $('tarifa').value,
    periodoDias: $('periodoDias').value, periodoKwh: $('periodoKwh').value, dap: $('dap').value,
    cargos: {
      suministro: $('c_suministro').value, distribucion: $('c_distribucion').value, transmision: $('c_transmision').value,
      cenace: $('c_cenace').value, energia: $('c_energia').value, capacidad: $('c_capacidad').value, scnmem: $('c_scnmem').value,
      energiaBase: $('c_energia_base').value, energiaIntermedia: $('c_energia_intermedia').value, energiaPunta: $('c_energia_punta').value,
    },
    rkDist: document.querySelector('input[name="rkDist"]:checked')?.value || 'demanda',
    rkCap: document.querySelector('input[name="rkCap"]:checked')?.value || 'demanda',
    traeBt: $('traeBt').checked, btMonto: $('btMonto').value,
    traeBonus: $('traeBonus').checked, bonusMonto: $('bonusMonto').value,
    traeRecargoFp: $('traeRecargoFp').checked, recargoFpMonto: $('recargoFpMonto').value,
    dBasicoKwh: $('d_basicoKwh').value, dBasicoRate: $('d_basicoRate').value,
    dInterKwh: $('d_interKwh').value, dInterRate: $('d_interRate').value,
    dExcedRate: $('d_excedRate').value, dDap: $('d_dap').value, dCargoFijo: $('d_cargoFijo').value,
    dPeriodoDias: $('d_periodoDias').value, dPeriodoKwh: $('d_periodoKwh').value,
    historialNoDom: leerGridHistorial('hist_nd_', 12), historialDom: leerGridHistorial('hist_d_', 6),
  };
}

export function aplicarFormularioRecibo(f) {
  resetearTarifaTocadaPorUsuario();
  $('tarifa').value = f?.tarifa || 'GDMTO';
  $('tarifa').dispatchEvent(new Event('change'));
  $('periodoDias').value = f?.periodoDias ?? 30;
  $('periodoKwh').value = f?.periodoKwh ?? 1000;
  $('dap').value = f?.dap ?? 197;
  const cargos = f?.cargos || {};
  for (const k of ['suministro', 'distribucion', 'transmision', 'cenace', 'energia', 'capacidad', 'scnmem']) {
    $('c_' + k).value = cargos[k] ?? 0;
  }
  $('c_energia_base').value = cargos.energiaBase ?? 0;
  $('c_energia_intermedia').value = cargos.energiaIntermedia ?? 0;
  $('c_energia_punta').value = cargos.energiaPunta ?? 0;
  const esGdmth = (f?.tarifa || 'GDMTO') === 'GDMTH';
  $('grupoEnergiaUnica').hidden = esGdmth;
  $('grupoEnergiaGDMTH').hidden = !esGdmth;
  const rkDistEl = document.querySelector(`input[name="rkDist"][value="${f?.rkDist || 'demanda'}"]`);
  if (rkDistEl) rkDistEl.checked = true;
  const rkCapEl = document.querySelector(`input[name="rkCap"][value="${f?.rkCap || 'demanda'}"]`);
  if (rkCapEl) rkCapEl.checked = true;
  $('traeBt').checked = !!f?.traeBt; $('btMonto').disabled = !f?.traeBt; $('btMonto').value = f?.btMonto ?? 0;
  $('traeBonus').checked = !!f?.traeBonus; $('bonusMonto').disabled = !f?.traeBonus; $('bonusMonto').value = f?.bonusMonto ?? 0;
  $('traeRecargoFp').checked = !!f?.traeRecargoFp; $('recargoFpMonto').disabled = !f?.traeRecargoFp; $('recargoFpMonto').value = f?.recargoFpMonto ?? 0;
  $('d_basicoKwh').value = f?.dBasicoKwh ?? 150; $('d_basicoRate').value = f?.dBasicoRate ?? 1.140;
  $('d_interKwh').value = f?.dInterKwh ?? 130; $('d_interRate').value = f?.dInterRate ?? 1.385;
  $('d_excedRate').value = f?.dExcedRate ?? 4.054; $('d_dap').value = f?.dDap ?? 0;
  $('d_cargoFijo').value = f?.dCargoFijo ?? 0;
  $('d_periodoDias').value = f?.dPeriodoDias ?? 60; $('d_periodoKwh').value = f?.dPeriodoKwh ?? 400;
  aplicarGridHistorial('hist_nd_', 12, f?.historialNoDom);
  aplicarGridHistorial('hist_d_', 6, f?.historialDom);
}

// Autollena el formulario a partir de lo que extraerCampos() (recibo.js) detecto solo
// en un recibo subido. NO toca titular/domicilio/no_servicio -- eso lo maneja quien use
// este modulo (la app interna los tiene, la pagina publica no).
export function llenarFormularioDesdeReciboCampos(c) {
  if (c.tarifa && TARIFAS_SOPORTADAS.has(c.tarifa)) {
    const tarifaActual = $('tarifa').value;
    const hayConflicto = tarifaTocadaPorUsuario && tarifaActual && tarifaActual !== c.tarifa;
    const usarDetectada = !hayConflicto || confirm(
      `Tarifa seleccionada: ${tarifaActual} -- Tarifa detectada en el recibo: ${c.tarifa}.\n\n` +
      `Aceptar = usar ${c.tarifa} (la del recibo, recalcula con sus reglas).\n` +
      `Cancelar = quedarte con ${tarifaActual} (la que ya tenías elegida) y no tocarla.`
    );
    if (usarDetectada) {
      $('tarifa').value = c.tarifa;
      $('tarifa').dispatchEvent(new Event('change'));
    }
  }
  const dom = esDomestica($('tarifa').value);
  if (!dom) {
    if (c.periodo_dias != null) $('periodoDias').value = c.periodo_dias;
    if (c.periodo_kwh != null) $('periodoKwh').value = c.periodo_kwh;
    if (c.dap != null) $('dap').value = c.dap;
    for (const k of ['suministro', 'distribucion', 'transmision', 'cenace', 'energia', 'capacidad', 'scnmem']) {
      if (c[k] != null) $('c_' + k).value = c[k];
    }
    // GDMTH: si el recibo trae Energia partida en Base/Intermedia/Punta, se detecta
    // aparte (ver recibo.js) y hay que llenar esos 3 campos, no el "Energia" unico.
    if (c.energia_base != null || c.energia_intermedia != null || c.energia_punta != null) {
      $('grupoEnergiaUnica').hidden = true;
      $('grupoEnergiaGDMTH').hidden = false;
      if (c.energia_base != null) $('c_energia_base').value = c.energia_base;
      if (c.energia_intermedia != null) $('c_energia_intermedia').value = c.energia_intermedia;
      if (c.energia_punta != null) $('c_energia_punta').value = c.energia_punta;
    } else {
      // Este recibo NO viene partido en Base/Intermedia/Punta (no es GDMTH) -- limpia
      // cualquier monto viejo de un recibo GDMTH anterior en estos 3 campos ocultos.
      // leerInputCalculo() ya los ignora para cualquier tarifa que no sea GDMTH (los
      // excluye del objeto `cargos` que recibe el motor), asi que hoy no corrompen un
      // calculo que no sea GDMTH -- pero si quedaban con un monto viejo y luego alguien
      // vuelve a elegir GDMTH a mano SIN subir un recibo nuevo, ese monto viejo (de un
      // cliente distinto) reaparecia como si fuera real.
      $('c_energia_base').value = 0; $('c_energia_intermedia').value = 0; $('c_energia_punta').value = 0;
    }
    if (c.rate_kw_detectado) {
      const rkDistEl = document.querySelector(`input[name="rkDist"][value="${c.rate_kw_detectado.distribucion > 0 ? 'demanda' : 'mercado'}"]`);
      if (rkDistEl) rkDistEl.checked = true;
      const rkCapEl = document.querySelector(`input[name="rkCap"][value="${c.rate_kw_detectado.capacidad > 0 ? 'demanda' : 'mercado'}"]`);
      if (rkCapEl) rkCapEl.checked = true;
    }
    // Bug real encontrado en auditoria 2026-11-18: estos 3 solo se ENCENDIAN cuando el
    // recibo nuevo SI trae el cargo -- si el recibo nuevo NO lo trae (null), el checkbox
    // y el monto se quedaban tal cual estaban (ej. "trae bonificacion" de un recibo
    // ANTERIOR, ya reemplazado), cobrando/descontando un monto que no tiene nada que ver
    // con este recibo. A diferencia de los campos numericos de arriba, estos 3 nunca
    // tienen marca naranja ("campo-no-detectado") que bloquee el calculo -- sin un
    // "else" explicito que los apague, no hay ninguna red de seguridad que lo atrape.
    if (c.bt_monto) { $('traeBt').checked = true; $('btMonto').disabled = false; $('btMonto').value = c.bt_monto; }
    else { $('traeBt').checked = false; $('btMonto').disabled = true; $('btMonto').value = 0; }
    if (c.bonus_monto) { $('traeBonus').checked = true; $('bonusMonto').disabled = false; $('bonusMonto').value = Math.abs(c.bonus_monto); }
    else { $('traeBonus').checked = false; $('bonusMonto').disabled = true; $('bonusMonto').value = 0; }
    if (c.recargo_fp_monto) { $('traeRecargoFp').checked = true; $('recargoFpMonto').disabled = false; $('recargoFpMonto').value = Math.abs(c.recargo_fp_monto); }
    else { $('traeRecargoFp').checked = false; $('recargoFpMonto').disabled = true; $('recargoFpMonto').value = 0; }
  } else {
    if (c.periodo_dias != null) $('d_periodoDias').value = c.periodo_dias;
    if (c.periodo_kwh != null) $('d_periodoKwh').value = c.periodo_kwh;
    if (c.dap != null) $('d_dap').value = c.dap;
  }
  // Si el recibo trae impresa la grafica/tabla de historial, precarga los campos de
  // historial para que se vea y se pueda corregir a mano -- no solo quede guardado
  // internamente. recibo.js devuelve los periodos en orden CRONOLOGICO ASCENDENTE (el mas
  // antiguo primero, el mas reciente al final -- el ultimo normalmente coincide con el
  // periodo que se esta facturando ahora). Bug real encontrado probando con un recibo real
  // de 13 periodos (2026-11-01): esta funcion llenaba las primeras N casillas del arreglo
  // (la comprension anterior, "los mas recientes van primero", era incorrecta) -- con un
  // historial MAS LARGO que las casillas disponibles (12 para no domesticas, 6 para
  // domesticas), eso descartaba en silencio los periodos MAS RECIENTES (los del final del
  // arreglo), justo los mas importantes, en vez de los mas viejos. Se usa slice(-n) para
  // quedarse siempre con los N periodos MAS RECIENTES cuando hay mas de los que caben.
  if (c.historial && c.historial.length) {
    const n = dom ? 6 : 12;
    aplicarGridHistorial(dom ? 'hist_d_' : 'hist_nd_', n, c.historial.slice(-n).map(h => h.kwh));
  }
}
