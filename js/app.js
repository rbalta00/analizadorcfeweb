// Interfaz minima: lee los campos de entrada manual (paridad con la ruta de captura a
// mano que ya existe en cotizador_app.py cuando no hay OCR), llama al motor portado en
// motor.js, y muestra los resultados. Primera version sin lectura de recibo (OCR) --
// ver web/ESTADO.md para lo que falta.
import {
  construirInvoice, construirInvoiceDomestica, pisoDeAhorro, flujoMensualAnual,
  dimensionarHorasSol, normalizarConsumoMensual, presupuestar, costoInversor,
  flujo25Anios, COSTOS_RESIDENCIAL, COSTOS_COMERCIAL, ErrorDeClasificacion,
} from './motor.js';

const M = (x) => `$${x.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PCT = (x) => `${(100 * x).toFixed(1)}%`;
const $ = (id) => document.getElementById(id);

const DOMESTICAS = new Set(['01', 'DAC']);

$('tarifa').addEventListener('change', () => {
  const esDomestica = DOMESTICAS.has($('tarifa').value);
  $('bloqueNoDomestica').hidden = esDomestica;
  $('bloqueDomestica').hidden = !esDomestica;
});

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
