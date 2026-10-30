// Interfaz: lee el recibo (PDF/foto, con OCR de respaldo) o permite captura manual,
// llama al motor portado en motor.js, y muestra los resultados.
import {
  construirInvoice, construirInvoiceDomestica, pisoDeAhorro, flujoMensualAnual,
  dimensionarHorasSol, normalizarConsumoMensual, presupuestar, costoInversor,
  flujo25Anios, COSTOS_RESIDENCIAL, COSTOS_COMERCIAL, ErrorDeClasificacion,
} from './motor.js';
import { leerRecibo } from './leerRecibo.js';

window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

const M = (x) => `$${x.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PCT = (x) => `${(100 * x).toFixed(1)}%`;
const $ = (id) => document.getElementById(id);

const DOMESTICAS = new Set(['01', 'DAC']);

$('tarifa').addEventListener('change', () => {
  const esDomestica = DOMESTICAS.has($('tarifa').value);
  $('bloqueNoDomestica').hidden = esDomestica;
  $('bloqueDomestica').hidden = !esDomestica;
});

const TARIFAS_SOPORTADAS = new Set(['GDMTO', 'GDMTH', 'GDBT', 'PDBT', '01', 'DAC']);

$('archivoRecibo').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const estadoEl = $('estadoRecibo');
  const avisoEl = $('avisoReconciliacion');
  avisoEl.hidden = true;
  estadoEl.className = 'nota';
  estadoEl.textContent = 'Leyendo el recibo (puede tardar hasta 1 minuto si usa OCR)...';
  $('archivoRecibo').disabled = true;
  try {
    const campos = await leerRecibo(file);
    llenarFormularioDesdeRecibo(campos);
    const faltantes = campos.campos_no_encontrados.filter(k => k !== 'demanda_contratada_kw');
    estadoEl.className = campos.uso_ocr ? 'nota' : 'nota ok';
    estadoEl.textContent = (campos.uso_ocr
      ? 'Se usó OCR (el PDF no traía texto aprovechable, o era una foto/escaneo). Revisa con más cuidado los datos.'
      : 'Se leyó el texto del recibo directamente.')
      + (faltantes.length ? ` No se encontraron solos (complétalos abajo): ${faltantes.join(', ')}.` : '');
    if (campos.reconciliacion_advertencia) {
      avisoEl.hidden = false;
      avisoEl.textContent = '🛑 ' + campos.reconciliacion_advertencia;
    }
  } catch (err) {
    estadoEl.className = 'nota';
    estadoEl.textContent = 'Error al leer el recibo: ' + err.message;
    console.error(err);
  } finally {
    $('archivoRecibo').disabled = false;
  }
});

function llenarFormularioDesdeRecibo(c) {
  if (c.titular) $('titular').value = c.titular;
  if (c.domicilio) $('domicilio').value = c.domicilio;
  if (c.no_servicio) $('noServicio').value = c.no_servicio;
  if (c.tarifa && TARIFAS_SOPORTADAS.has(c.tarifa)) {
    $('tarifa').value = c.tarifa;
    $('tarifa').dispatchEvent(new Event('change'));
  }
  const esDomestica = DOMESTICAS.has($('tarifa').value);
  if (!esDomestica) {
    if (c.periodo_dias != null) $('periodoDias').value = c.periodo_dias;
    if (c.periodo_kwh != null) $('periodoKwh').value = c.periodo_kwh;
    if (c.dap != null) $('dap').value = c.dap;
    for (const k of ['suministro', 'distribucion', 'transmision', 'cenace', 'energia', 'capacidad', 'scnmem']) {
      if (c[k] != null) $('c_' + k).value = c[k];
    }
    if (c.rate_kw_detectado) {
      document.querySelector(`input[name="rkDist"][value="${c.rate_kw_detectado.distribucion > 0 ? 'demanda' : 'mercado'}"]`).checked = true;
      document.querySelector(`input[name="rkCap"][value="${c.rate_kw_detectado.capacidad > 0 ? 'demanda' : 'mercado'}"]`).checked = true;
    }
  } else {
    if (c.periodo_dias != null) $('d_periodoDias').value = c.periodo_dias;
    if (c.periodo_kwh != null) $('d_periodoKwh').value = c.periodo_kwh;
    if (c.dap != null) $('d_dap').value = c.dap;
  }
}

$('btnCalcular').addEventListener('click', () => {
  const resultadoEl = $('resultado');
  try {
    const r = calcular();
    mostrarResultado(r);
    resultadoEl.hidden = false;
    resultadoEl.scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    if (e instanceof ErrorDeClasificacion) {
      alert('No se puede calcular con estos datos:\n\n' + e.message);
    } else {
      alert('Error al calcular: ' + e.message);
      console.error(e);
    }
  }
});

function calcular() {
  const tarifa = $('tarifa').value;
  const moduloWp = Number($('moduloWp').value);
  const cobertura = Number($('cobertura').value);
  const horasUtiles = Number($('horasUtiles').value);
  const costos = $('escalaCostos').value === 'residencial' ? COSTOS_RESIDENCIAL : COSTOS_COMERCIAL;
  const escalamientoPct = Number($('escalamiento').value);
  const esDomestica = DOMESTICAS.has(tarifa);

  let invoice, meta, periodoDias, periodoKwh, pagoRecurrente, piso, ahorroMax, pctMax;

  if (!esDomestica) {
    periodoDias = Number($('periodoDias').value);
    periodoKwh = Number($('periodoKwh').value);
    const dap = Number($('dap').value);
    const cargos = {
      suministro: Number($('c_suministro').value), distribucion: Number($('c_distribucion').value),
      transmision: Number($('c_transmision').value), cenace: Number($('c_cenace').value),
      energia: Number($('c_energia').value), capacidad: Number($('c_capacidad').value),
      scnmem: Number($('c_scnmem').value),
    };
    const rateKw = {
      distribucion: document.querySelector('input[name="rkDist"]:checked').value === 'demanda' ? 1.0 : 0.0,
      capacidad: document.querySelector('input[name="rkCap"]:checked').value === 'demanda' ? 1.0 : 0.0,
    };
    ({ invoice, meta } = construirInvoice(tarifa, periodoDias, periodoKwh, cargos, rateKw, dap, 0.0, 0.0));
    pagoRecurrente = invoice(periodoDias, periodoKwh, false).total;
    ({ piso, ahorroMax, pct: pctMax } = pisoDeAhorro(periodoDias, pagoRecurrente, invoice));
  } else {
    periodoDias = Number($('d_periodoDias').value);
    periodoKwh = Number($('d_periodoKwh').value);
    const escalones = [
      [Number($('d_basicoKwh').value), Number($('d_basicoRate').value)],
      [Number($('d_interKwh').value), Number($('d_interRate').value)],
      [null, Number($('d_excedRate').value)],
    ];
    invoice = construirInvoiceDomestica(escalones, periodoDias, Number($('d_dap').value));
    meta = { tieneDemandaContratada: false, reducibles: ['energia'], noReducibles: [] };
    pagoRecurrente = invoice(periodoDias, periodoKwh, false).total;
    piso = invoice(periodoDias, 0, true).total;
    ahorroMax = pagoRecurrente - piso;
    pctMax = pagoRecurrente ? ahorroMax / pagoRecurrente : 0;
  }

  const dailyKwh = periodoKwh / periodoDias;
  const consumoMensual = normalizarConsumoMensual(periodoKwh, periodoDias);
  const { n, kwp, genAnual } = dimensionarHorasSol(consumoMensual, moduloWp, cobertura, horasUtiles);
  const monthlyE = Array(12).fill(genAnual / kwp);
  const pres = presupuestar(n, kwp, moduloWp, costos);
  const rows = flujoMensualAnual(invoice, dailyKwh, monthlyE, kwp, 1);
  const annualbefore = Math.round(rows.reduce((s, x) => s + x.pagoSinSolarMxn, 0) * 100) / 100;
  const annualafter = Math.round(rows.reduce((s, x) => s + x.pagoConSolarEstimadoMxn, 0) * 100) / 100;
  const ahorroAnual = Math.round((annualbefore - annualafter) * 100) / 100;
  const pctAhorro = annualbefore ? ahorroAnual / annualbefore : 0;
  const costoInv = costoInversor(pres.materiales);
  const flujo25 = flujo25Anios(pres.inversion, ahorroAnual, 0.10, 25, escalamientoPct / 100, 0.01, 0.03, 0.005, costoInv);
  const payback = ahorroAnual > 0 ? pres.inversion / ahorroAnual : null;

  return { n, kwp, moduloWp, investment: pres.inversion, payback, ahorroAnual, pctAhorro,
           annualbefore, annualafter, van: flujo25.van, tir: flujo25.tir,
           recuperacionAcumulada: flujo25.recuperacionAcumulada, meta, piso, ahorroMax, pctMax,
           pagoRecurrente };
}

function tarjetaMetrica(valor, etiqueta) {
  const div = document.createElement('div');
  div.className = 'metrica';
  div.innerHTML = `<div class="valor">${valor}</div><div class="etiqueta">${etiqueta}</div>`;
  return div;
}

function mostrarResultado(r) {
  const cont = $('metricas');
  cont.innerHTML = '';
  cont.append(
    tarjetaMetrica(`${r.n} (${r.kwp.toFixed(2)} kWp)`, 'Paneles'),
    tarjetaMetrica(M(r.investment), 'Inversion estimada'),
    tarjetaMetrica(r.payback ? `${r.payback.toFixed(2)} anos` : 'N/D', 'Recuperacion simple'),
    tarjetaMetrica(M(r.annualbefore), 'Pagaria sin paneles / ano'),
    tarjetaMetrica(M(r.annualafter), 'Pagaria con paneles / ano'),
    tarjetaMetrica(`${M(r.ahorroAnual)} (${PCT(r.pctAhorro)})`, 'Ahorro ano 1'),
    tarjetaMetrica(M(r.van), 'VAN a 25 anos (10% desc.)'),
    tarjetaMetrica(r.tir ? PCT(r.tir) : 'N/D', 'TIR'),
  );
  $('notaClasificacion').textContent = r.meta.tieneDemandaContratada
    ? 'Clasificacion aplicada: CON demanda contratada (Distribucion+Capacidad no reducibles).'
    : 'Clasificacion aplicada: SIN demanda contratada (casi todo reducible).';
}

// --- PWA: registro de service worker + boton de instalar ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $('btnInstalar').hidden = false;
});
$('btnInstalar').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('btnInstalar').hidden = true;
});
window.addEventListener('appinstalled', () => { $('btnInstalar').hidden = true; });
