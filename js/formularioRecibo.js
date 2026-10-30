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

// Conecta los listeners de tarifa (muestra/oculta el bloque domestico vs. no domestico)
// y de los checkboxes de cargos extra (2% BT / bonificacion FP). onCambioTarifa(dom) es
// opcional, para que quien use este modulo reaccione al cambio (ej. mostrar/ocultar
// otras secciones de su propio formulario).
export function conectarEventosFormularioRecibo(onCambioTarifa) {
  $('tarifa').addEventListener('change', () => {
    const dom = esDomestica($('tarifa').value);
    $('bloqueNoDomestica').hidden = dom;
    $('bloqueDomestica').hidden = !dom;
    if (onCambioTarifa) onCambioTarifa(dom);
  });
  $('traeBt').addEventListener('change', () => { $('btMonto').disabled = !$('traeBt').checked; });
  $('traeBonus').addEventListener('change', () => { $('bonusMonto').disabled = !$('traeBonus').checked; });
}

export function leerFormularioRecibo() {
  return {
    tarifa: $('tarifa').value,
    periodoDias: $('periodoDias').value, periodoKwh: $('periodoKwh').value, dap: $('dap').value,
    cargos: {
      suministro: $('c_suministro').value, distribucion: $('c_distribucion').value, transmision: $('c_transmision').value,
      cenace: $('c_cenace').value, energia: $('c_energia').value, capacidad: $('c_capacidad').value, scnmem: $('c_scnmem').value,
    },
    rkDist: document.querySelector('input[name="rkDist"]:checked')?.value || 'demanda',
    rkCap: document.querySelector('input[name="rkCap"]:checked')?.value || 'demanda',
    traeBt: $('traeBt').checked, btMonto: $('btMonto').value,
    traeBonus: $('traeBonus').checked, bonusMonto: $('bonusMonto').value,
    dBasicoKwh: $('d_basicoKwh').value, dBasicoRate: $('d_basicoRate').value,
    dInterKwh: $('d_interKwh').value, dInterRate: $('d_interRate').value,
    dExcedRate: $('d_excedRate').value, dDap: $('d_dap').value,
    dPeriodoDias: $('d_periodoDias').value, dPeriodoKwh: $('d_periodoKwh').value,
  };
}

export function aplicarFormularioRecibo(f) {
  $('tarifa').value = f?.tarifa || 'GDMTO';
  $('tarifa').dispatchEvent(new Event('change'));
  $('periodoDias').value = f?.periodoDias ?? 30;
  $('periodoKwh').value = f?.periodoKwh ?? 1000;
  $('dap').value = f?.dap ?? 197;
  const cargos = f?.cargos || {};
  for (const k of ['suministro', 'distribucion', 'transmision', 'cenace', 'energia', 'capacidad', 'scnmem']) {
    $('c_' + k).value = cargos[k] ?? 0;
  }
  const rkDistEl = document.querySelector(`input[name="rkDist"][value="${f?.rkDist || 'demanda'}"]`);
  if (rkDistEl) rkDistEl.checked = true;
  const rkCapEl = document.querySelector(`input[name="rkCap"][value="${f?.rkCap || 'demanda'}"]`);
  if (rkCapEl) rkCapEl.checked = true;
  $('traeBt').checked = !!f?.traeBt; $('btMonto').disabled = !f?.traeBt; $('btMonto').value = f?.btMonto ?? 0;
  $('traeBonus').checked = !!f?.traeBonus; $('bonusMonto').disabled = !f?.traeBonus; $('bonusMonto').value = f?.bonusMonto ?? 0;
  $('d_basicoKwh').value = f?.dBasicoKwh ?? 150; $('d_basicoRate').value = f?.dBasicoRate ?? 1.140;
  $('d_interKwh').value = f?.dInterKwh ?? 130; $('d_interRate').value = f?.dInterRate ?? 1.385;
  $('d_excedRate').value = f?.dExcedRate ?? 4.054; $('d_dap').value = f?.dDap ?? 0;
  $('d_periodoDias').value = f?.dPeriodoDias ?? 60; $('d_periodoKwh').value = f?.dPeriodoKwh ?? 400;
}

// Autollena el formulario a partir de lo que extraerCampos() (recibo.js) detecto solo
// en un recibo subido. NO toca titular/domicilio/no_servicio -- eso lo maneja quien use
// este modulo (la app interna los tiene, la pagina publica no).
export function llenarFormularioDesdeReciboCampos(c) {
  if (c.tarifa && TARIFAS_SOPORTADAS.has(c.tarifa)) {
    $('tarifa').value = c.tarifa;
    $('tarifa').dispatchEvent(new Event('change'));
  }
  const dom = esDomestica($('tarifa').value);
  if (!dom) {
    if (c.periodo_dias != null) $('periodoDias').value = c.periodo_dias;
    if (c.periodo_kwh != null) $('periodoKwh').value = c.periodo_kwh;
    if (c.dap != null) $('dap').value = c.dap;
    for (const k of ['suministro', 'distribucion', 'transmision', 'cenace', 'energia', 'capacidad', 'scnmem']) {
      if (c[k] != null) $('c_' + k).value = c[k];
    }
    if (c.rate_kw_detectado) {
      const rkDistEl = document.querySelector(`input[name="rkDist"][value="${c.rate_kw_detectado.distribucion > 0 ? 'demanda' : 'mercado'}"]`);
      if (rkDistEl) rkDistEl.checked = true;
      const rkCapEl = document.querySelector(`input[name="rkCap"][value="${c.rate_kw_detectado.capacidad > 0 ? 'demanda' : 'mercado'}"]`);
      if (rkCapEl) rkCapEl.checked = true;
    }
    if (c.bt_monto) { $('traeBt').checked = true; $('btMonto').disabled = false; $('btMonto').value = c.bt_monto; }
    if (c.bonus_monto) { $('traeBonus').checked = true; $('bonusMonto').disabled = false; $('bonusMonto').value = Math.abs(c.bonus_monto); }
  } else {
    if (c.periodo_dias != null) $('d_periodoDias').value = c.periodo_dias;
    if (c.periodo_kwh != null) $('d_periodoKwh').value = c.periodo_kwh;
    if (c.dap != null) $('d_dap').value = c.dap;
  }
}
