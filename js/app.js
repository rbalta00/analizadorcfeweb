// Orquestacion de la app: pantalla de clientes (agrupados gobierno/particular) ->
// pantalla de un cliente (captura de datos + recibo -> 21 secciones navegables ->
// exportar PDF). Toda la logica de calculo vive en resultado.js/motor.js; este archivo
// solo lee/escribe el DOM y el almacenamiento del cliente.
import {
  obtenerCliente, crearCliente, guardarCliente, eliminarCliente, clientesAgrupadosPorTipo,
} from './clientes.js';
import { renderSeccion, TITULOS_SECCIONES } from './secciones.js';
import { construirResultado } from './resultado.js';
import { generarPdf } from './propuesta.js';
import { generarResumenEjecutivo, generarGuiaPresentacion } from './resumen.js';
import { leerRecibo } from './leerRecibo.js';
import { ErrorDeClasificacion, COSTOS_RESIDENCIAL, COSTOS_COMERCIAL } from './motor.js';
import { todosLosBloques, bloqueDeSeccion } from './bloques.js';

window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

const $ = (id) => document.getElementById(id);
const DOMESTICAS = new Set(['01', 'DAC']);
const TARIFAS_SOPORTADAS = new Set(['GDMTO', 'GDMTH', 'GDBT', 'PDBT', '01', 'DAC']);

let clienteActual = null;
let ultimoResultado = null;
let ultimoLeido = null;
let seccionObserver = null;

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

// =====================================================================
// Pantalla: Clientes
// =====================================================================
function tarjetaCliente(c) {
  const div = document.createElement('div');
  div.className = 'tarjeta-cliente';
  const estado = c.formulario ? 'con datos capturados' : 'sin datos capturados todavía';
  div.innerHTML = `<div class="tarjeta-cliente-info"><strong>${escapeHtml(c.nombre)}</strong>` +
    `<span class="nota">${estado} · actualizado ${new Date(c.actualizadoEn).toLocaleDateString('es-MX')}</span></div>`;
  div.addEventListener('click', () => abrirCliente(c.id));
  const btnBorrar = document.createElement('button');
  btnBorrar.className = 'btn-link btn-borrar-cliente';
  btnBorrar.textContent = '🗑';
  btnBorrar.title = 'Eliminar cliente';
  btnBorrar.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm(`¿Eliminar a "${c.nombre}"? Esto borra sus datos guardados en este navegador, no se puede deshacer.`)) {
      eliminarCliente(c.id);
      renderListaClientes();
    }
  });
  div.append(btnBorrar);
  return div;
}

function renderListaClientes() {
  const { gobierno, particular } = clientesAgrupadosPorTipo();
  const contG = $('listaGobierno'), contP = $('listaParticular');
  contG.innerHTML = '';
  contP.innerHTML = '';
  if (!gobierno.length) contG.append(Object.assign(document.createElement('p'), { className: 'nota', textContent: 'Sin clientes de gobierno todavía.' }));
  for (const c of gobierno) contG.append(tarjetaCliente(c));
  if (!particular.length) contP.append(Object.assign(document.createElement('p'), { className: 'nota', textContent: 'Sin clientes particulares todavía.' }));
  for (const c of particular) contP.append(tarjetaCliente(c));
}

$('btnCrearCliente').addEventListener('click', () => {
  const nombre = $('nuevoClienteNombre').value.trim();
  if (!nombre) { alert('Escribe un nombre o inmueble para el cliente.'); return; }
  const tipo = $('nuevoClienteTipo').value;
  const c = crearCliente({ nombre, tipo });
  $('nuevoClienteNombre').value = '';
  abrirCliente(c.id);
});

$('btnVolverClientes').addEventListener('click', mostrarPantallaClientes);

function mostrarPantallaClientes() {
  $('pantallaClientes').hidden = false;
  $('pantallaCliente').hidden = true;
  clienteActual = null; ultimoResultado = null; ultimoLeido = null;
  renderListaClientes();
}

// =====================================================================
// Pantalla: Cliente (captura + 21 secciones)
// =====================================================================
function abrirCliente(id) {
  clienteActual = obtenerCliente(id);
  if (!clienteActual) { mostrarPantallaClientes(); return; }
  $('pantallaClientes').hidden = true;
  $('pantallaCliente').hidden = false;
  $('clienteNombreBarra').textContent = clienteActual.nombre;
  $('clienteTipoBarra').textContent = clienteActual.tipo === 'gobierno' ? 'Gobierno' : 'Particular';
  $('clienteTipoBarra').className = `chip-tipo chip-tipo-${clienteActual.tipo}`;
  ultimoLeido = clienteActual.campos || null;
  ultimoResultado = null;
  $('contenedorSecciones').innerHTML = '';
  $('tabPdf').hidden = true;
  $('visorPdf').innerHTML = '';
  $('estadoRecibo').textContent = '';
  $('avisoReconciliacion').hidden = true;
  $('estadoCalculo').textContent = '';
  aplicarFormulario(clienteActual.formulario);
  aplicarInmueble(clienteActual.inmueble);
  renderIndice(null);
  if (clienteActual.formulario) {
    try { calcularYRenderizar(); } catch (e) { console.error('No se pudo recalcular automáticamente al reabrir:', e); }
  }
}

$('tarifa').addEventListener('change', () => {
  const esDomestica = DOMESTICAS.has($('tarifa').value);
  $('bloqueNoDomestica').hidden = esDomestica;
  $('bloqueDomestica').hidden = !esDomestica;
});
$('traeBt').addEventListener('change', () => { $('btMonto').disabled = !$('traeBt').checked; });
$('traeBonus').addEventListener('change', () => { $('bonusMonto').disabled = !$('traeBonus').checked; });

// ---------------- Formulario: leer/aplicar (snapshot persistido por cliente) ----------------
function leerFormulario() {
  return {
    titular: $('titular').value, domicilio: $('domicilio').value, noServicio: $('noServicio').value,
    tarifa: $('tarifa').value,
    periodoDias: $('periodoDias').value, periodoKwh: $('periodoKwh').value, dap: $('dap').value,
    cargos: {
      suministro: $('c_suministro').value, distribucion: $('c_distribucion').value, transmision: $('c_transmision').value,
      cenace: $('c_cenace').value, energia: $('c_energia').value, capacidad: $('c_capacidad').value, scnmem: $('c_scnmem').value,
    },
    rkDist: document.querySelector('input[name="rkDist"]:checked').value,
    rkCap: document.querySelector('input[name="rkCap"]:checked').value,
    traeBt: $('traeBt').checked, btMonto: $('btMonto').value,
    traeBonus: $('traeBonus').checked, bonusMonto: $('bonusMonto').value,
    dBasicoKwh: $('d_basicoKwh').value, dBasicoRate: $('d_basicoRate').value,
    dInterKwh: $('d_interKwh').value, dInterRate: $('d_interRate').value,
    dExcedRate: $('d_excedRate').value, dDap: $('d_dap').value,
    dPeriodoDias: $('d_periodoDias').value, dPeriodoKwh: $('d_periodoKwh').value,
    moduloWp: $('moduloWp').value, cobertura: $('cobertura').value, horasUtiles: $('horasUtiles').value,
    escalaCostos: $('escalaCostos').value, escalamiento: $('escalamiento').value,
  };
}

function aplicarFormulario(f) {
  $('titular').value = f?.titular || '';
  $('domicilio').value = f?.domicilio || '';
  $('noServicio').value = f?.noServicio || '';
  $('tarifa').value = f?.tarifa || 'GDMTO';
  $('tarifa').dispatchEvent(new Event('change'));
  $('periodoDias').value = f?.periodoDias ?? 30;
  $('periodoKwh').value = f?.periodoKwh ?? 1000;
  $('dap').value = f?.dap ?? 197;
  const cargos = f?.cargos || {};
  for (const k of ['suministro', 'distribucion', 'transmision', 'cenace', 'energia', 'capacidad', 'scnmem']) {
    $('c_' + k).value = cargos[k] ?? 0;
  }
  document.querySelector(`input[name="rkDist"][value="${f?.rkDist || 'demanda'}"]`).checked = true;
  document.querySelector(`input[name="rkCap"][value="${f?.rkCap || 'demanda'}"]`).checked = true;
  $('traeBt').checked = !!f?.traeBt; $('btMonto').disabled = !f?.traeBt; $('btMonto').value = f?.btMonto ?? 0;
  $('traeBonus').checked = !!f?.traeBonus; $('bonusMonto').disabled = !f?.traeBonus; $('bonusMonto').value = f?.bonusMonto ?? 0;
  $('d_basicoKwh').value = f?.dBasicoKwh ?? 150; $('d_basicoRate').value = f?.dBasicoRate ?? 1.140;
  $('d_interKwh').value = f?.dInterKwh ?? 130; $('d_interRate').value = f?.dInterRate ?? 1.385;
  $('d_excedRate').value = f?.dExcedRate ?? 4.054; $('d_dap').value = f?.dDap ?? 0;
  $('d_periodoDias').value = f?.dPeriodoDias ?? 60; $('d_periodoKwh').value = f?.dPeriodoKwh ?? 400;
  $('moduloWp').value = f?.moduloWp ?? 605; $('cobertura').value = f?.cobertura ?? 1.0; $('horasUtiles').value = f?.horasUtiles ?? 4.5;
  $('escalaCostos').value = f?.escalaCostos || 'residencial'; $('escalamiento').value = f?.escalamiento ?? 4.0;
}

function leerInmueble() {
  return {
    actividad: $('inmActividad').value, horarios: $('inmHorarios').value, equipos: $('inmEquipos').value,
    tensionFases: $('inmTensionFases').value, tablero: $('inmTablero').value, transformador: $('inmTransformador').value,
    tierraFisica: $('inmTierraFisica').value, puntoConexion: $('inmPuntoConexion').value, cubierta: $('inmCubierta').value,
    areaDisponible: $('inmAreaDisponible').value,
    areaFuente: document.querySelector('input[name="inmAreaFuente"]:checked').value,
    sombras: $('inmSombras').value, sistemasExistentes: $('inmSistemasExistentes').value,
    fechaVisita: $('inmFechaVisita').value, notas: $('inmNotas').value,
  };
}

function aplicarInmueble(inm) {
  $('inmActividad').value = inm?.actividad || '';
  $('inmHorarios').value = inm?.horarios || '';
  $('inmEquipos').value = inm?.equipos || '';
  $('inmTensionFases').value = inm?.tensionFases || '';
  $('inmTablero').value = inm?.tablero || '';
  $('inmTransformador').value = inm?.transformador || '';
  $('inmTierraFisica').value = inm?.tierraFisica || '';
  $('inmPuntoConexion').value = inm?.puntoConexion || '';
  $('inmCubierta').value = inm?.cubierta || '';
  $('inmAreaDisponible').value = inm?.areaDisponible || '';
  document.querySelector(`input[name="inmAreaFuente"][value="${inm?.areaFuente || 'estimada'}"]`).checked = true;
  $('inmSombras').value = inm?.sombras || '';
  $('inmSistemasExistentes').value = inm?.sistemasExistentes || '';
  $('inmFechaVisita').value = inm?.fechaVisita || '';
  $('inmNotas').value = inm?.notas || '';
}

// ---------------- Recibo: leer + autollenar + auto-calcular ----------------
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
    ultimoLeido = campos;
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

    const esDomestica = DOMESTICAS.has($('tarifa').value);
    const tarifaOk = campos.tarifa && TARIFAS_SOPORTADAS.has(campos.tarifa);
    const datosOk = esDomestica
      ? (campos.periodo_dias && campos.periodo_kwh)
      : (campos.periodo_dias && campos.periodo_kwh && campos.rate_kw_detectado);
    if (tarifaOk && datosOk) {
      try {
        calcularYRenderizar();
        $('estadoCalculo').className = 'nota ok';
        $('estadoCalculo').textContent = 'Calculado automáticamente a partir del recibo. Revisa las 21 secciones abajo.';
      } catch (err) {
        $('estadoCalculo').className = 'nota aviso';
        $('estadoCalculo').textContent = 'Se leyó el recibo pero no se pudo calcular automáticamente: ' +
          err.message + ' Revisa el formulario y pulsa Calcular.';
      }
    } else {
      $('estadoCalculo').className = 'nota';
      $('estadoCalculo').textContent = 'No se detectaron automáticamente todos los datos necesarios (tarifa y/o ' +
        'columna "$/kW"); revisa el formulario y pulsa Calcular.';
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
    if (c.bt_monto) { $('traeBt').checked = true; $('btMonto').disabled = false; $('btMonto').value = c.bt_monto; }
    if (c.bonus_monto) { $('traeBonus').checked = true; $('bonusMonto').disabled = false; $('bonusMonto').value = Math.abs(c.bonus_monto); }
  } else {
    if (c.periodo_dias != null) $('d_periodoDias').value = c.periodo_dias;
    if (c.periodo_kwh != null) $('d_periodoKwh').value = c.periodo_kwh;
    if (c.dap != null) $('d_dap').value = c.dap;
  }
}

// ---------------- Calcular ----------------
$('btnCalcular').addEventListener('click', () => {
  try {
    calcularYRenderizar();
    $('estadoCalculo').className = 'nota ok';
    $('estadoCalculo').textContent = 'Calculado. Desplázate hacia abajo para ver las 21 secciones, o usa el índice.';
    $('contenedorSecciones').scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    $('estadoCalculo').className = 'nota aviso';
    $('estadoCalculo').textContent = (e instanceof ErrorDeClasificacion ? 'No se puede calcular con estos datos: ' : 'Error al calcular: ') + e.message;
    console.error(e);
  }
});

function calcularYRenderizar() {
  const tarifa = $('tarifa').value;
  const esDomestica = DOMESTICAS.has(tarifa);
  const costos = $('escalaCostos').value === 'residencial' ? COSTOS_RESIDENCIAL : COSTOS_COMERCIAL;
  const moduloWp = Number($('moduloWp').value);
  const cobertura = Number($('cobertura').value);
  const horasUtiles = Number($('horasUtiles').value);
  const escalamientoPct = Number($('escalamiento').value);
  const titular = $('titular').value || 'Cliente';
  const domicilio = $('domicilio').value;
  const noServicio = $('noServicio').value;
  const inmueble = leerInmueble();

  let input;
  if (!esDomestica) {
    const periodoDias = Number($('periodoDias').value);
    const periodoKwh = Number($('periodoKwh').value);
    const dap = Number($('dap').value);
    const cargos = {
      suministro: Number($('c_suministro').value), distribucion: Number($('c_distribucion').value),
      transmision: Number($('c_transmision').value), cenace: Number($('c_cenace').value),
      energia: Number($('c_energia').value), capacidad: Number($('c_capacidad').value), scnmem: Number($('c_scnmem').value),
    };
    const rateKw = {
      distribucion: document.querySelector('input[name="rkDist"]:checked').value === 'demanda' ? 1.0 : 0.0,
      capacidad: document.querySelector('input[name="rkCap"]:checked').value === 'demanda' ? 1.0 : 0.0,
    };
    const baseAprox = Object.values(cargos).reduce((a, b) => a + b, 0) || 1.0;
    const traeBt = $('traeBt').checked, traeBonus = $('traeBonus').checked;
    const btMonto = Number($('btMonto').value), bonusMonto = Number($('bonusMonto').value);
    const btPct = traeBt ? btMonto / baseAprox : 0.0;
    const fpBonusPct = traeBonus ? bonusMonto / (baseAprox + btMonto) : 0.0;
    input = { titular, domicilio, noServicio, tarifa, esDomestica: false, periodoDias, periodoKwh, dap, cargos,
      rateKw, btPct, fpBonusPct, moduloWp, cobertura, horasUtiles, costos, escalamientoPct, leido: ultimoLeido, inmueble };
  } else {
    const periodoDias = Number($('d_periodoDias').value);
    const periodoKwh = Number($('d_periodoKwh').value);
    const escalones = [
      [Number($('d_basicoKwh').value), Number($('d_basicoRate').value)],
      [Number($('d_interKwh').value), Number($('d_interRate').value)],
      [null, Number($('d_excedRate').value)],
    ];
    input = { titular, domicilio, noServicio, tarifa, esDomestica: true, periodoDias, periodoKwh, escalones,
      dapDomestica: Number($('d_dap').value), moduloWp, cobertura, horasUtiles, costos, escalamientoPct, leido: ultimoLeido, inmueble };
  }

  const r = construirResultado(input);
  r.seccionesActivas = clienteActual.seccionesActivas || todosLosBloques();
  ultimoResultado = r;

  clienteActual.formulario = leerFormulario();
  clienteActual.campos = ultimoLeido;
  clienteActual.inmueble = inmueble;
  guardarCliente(clienteActual);

  renderSecciones(r);
  $('tabPdf').hidden = false;
  return r;
}

// ---------------- 21 secciones: render + navegacion ----------------
function onToggleBloque(bloque, activo) {
  const set = new Set(clienteActual.seccionesActivas);
  if (activo) set.add(bloque); else set.delete(bloque);
  clienteActual.seccionesActivas = [...set];
  guardarCliente(clienteActual);
  if (ultimoResultado) { ultimoResultado.seccionesActivas = clienteActual.seccionesActivas; renderSecciones(ultimoResultado); }
}

function agregarNavegacionSeccion(art, n) {
  const nav = document.createElement('div');
  nav.className = 'seccion-nav';
  const anterior = document.createElement('button');
  anterior.className = 'btn-link';
  anterior.textContent = '← Anterior';
  anterior.hidden = n <= 1;
  anterior.addEventListener('click', () => document.getElementById(`seccion-${n - 1}`).scrollIntoView({ behavior: 'smooth', block: 'start' }));
  const siguiente = document.createElement('button');
  siguiente.className = 'btn-link';
  siguiente.textContent = 'Siguiente →';
  siguiente.hidden = n >= 21;
  siguiente.addEventListener('click', () => document.getElementById(`seccion-${n + 1}`).scrollIntoView({ behavior: 'smooth', block: 'start' }));
  nav.append(anterior, siguiente);
  art.append(nav);
}

function renderSecciones(r) {
  const cont = $('contenedorSecciones');
  cont.innerHTML = '';
  for (let n = 1; n <= 21; n++) {
    const art = renderSeccion(n, r, ultimoLeido, onToggleBloque);
    agregarNavegacionSeccion(art, n);
    cont.append(art);
  }
  renderIndice(r);
  observarSecciones();
}

function renderIndice(r) {
  const cont = $('indiceLista');
  cont.innerHTML = '';
  if (!r) {
    cont.innerHTML = '<p class="nota">Calcula primero (sección "Datos y recibo") para ver el índice de las 21 secciones.</p>';
    return;
  }
  TITULOS_SECCIONES.forEach((titulo, i) => {
    const n = i + 1;
    const activo = r.seccionesActivas.includes(bloqueDeSeccion(n));
    const a = document.createElement('a');
    a.href = `#seccion-${n}`;
    a.className = 'indice-item' + (activo ? '' : ' indice-item-apagado');
    a.textContent = `${String(n).padStart(2, '0')}. ${titulo}`;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById(`seccion-${n}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('indiceSecciones').classList.remove('indice-abierto');
    });
    cont.append(a);
  });
}

function observarSecciones() {
  if (seccionObserver) seccionObserver.disconnect();
  seccionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const n = entry.target.id.replace('seccion-', '');
      document.querySelectorAll('.indice-item').forEach(a => a.classList.remove('indice-item-activo'));
      const link = document.querySelector(`.indice-item[href="#seccion-${n}"]`);
      if (link) link.classList.add('indice-item-activo');
    }
  }, { rootMargin: '-15% 0px -70% 0px' });
  document.querySelectorAll('.seccion').forEach(s => seccionObserver.observe(s));
}

$('btnToggleIndice').addEventListener('click', () => $('indiceSecciones').classList.toggle('indice-abierto'));

// ---------------- PDF ----------------
function mostrarPdfEnVisor(doc, nombreArchivo) {
  const blobUrl = doc.output('bloburl');
  const visor = $('visorPdf');
  visor.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.src = blobUrl;
  iframe.className = 'iframe-pdf';
  const btnDescargar = document.createElement('button');
  btnDescargar.className = 'btn-primario';
  btnDescargar.textContent = 'Descargar PDF';
  btnDescargar.addEventListener('click', () => doc.save(nombreArchivo));
  const acciones = document.createElement('div');
  acciones.className = 'acciones';
  acciones.append(btnDescargar);
  visor.append(acciones, iframe);
  visor.scrollIntoView({ behavior: 'smooth' });
}

function nombreArchivoCliente(prefijo) {
  return `${prefijo}_${(clienteActual.nombre || 'cliente').replace(/[^a-z0-9]+/gi, '_')}.pdf`;
}

$('btnGenerarPdf').addEventListener('click', () => {
  if (!ultimoResultado) { alert('Calcula primero.'); return; }
  const doc = generarPdf(ultimoResultado, { secciones: clienteActual.seccionesActivas });
  mostrarPdfEnVisor(doc, nombreArchivoCliente('Cotizacion'));
});

$('btnResumenEjecutivo').addEventListener('click', () => {
  if (!ultimoResultado) { alert('Calcula primero.'); return; }
  const doc = generarResumenEjecutivo(ultimoResultado);
  mostrarPdfEnVisor(doc, nombreArchivoCliente('Resumen_ejecutivo'));
});

$('btnGuiaPresentacion').addEventListener('click', () => {
  const doc = generarGuiaPresentacion();
  mostrarPdfEnVisor(doc, 'Guia_para_presentar_cotizacion.pdf');
});

// =====================================================================
// PWA: service worker + boton de instalar + deteccion de ya-instalada
// =====================================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('service-worker.js').catch(() => {}); });
}
function yaInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function actualizarEstadoInstalacion() {
  $('estadoInstalado').hidden = !yaInstalada();
  if (yaInstalada()) $('btnInstalar').hidden = true;
}
actualizarEstadoInstalacion();
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!yaInstalada()) $('btnInstalar').hidden = false;
});
$('btnInstalar').addEventListener('click', async () => {
  if (!deferredPrompt) {
    alert('Para instalar manualmente: abre el menú del navegador (⋮ en Chrome/Edge) y elige "Instalar aplicación" o "Agregar a pantalla de inicio". Si no aparece esa opción, recarga la página e inténtalo de nuevo.');
    return;
  }
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('btnInstalar').hidden = true;
});
window.addEventListener('appinstalled', () => { $('btnInstalar').hidden = true; actualizarEstadoInstalacion(); });

// =====================================================================
// Arranque
// =====================================================================
renderListaClientes();
