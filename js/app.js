// Orquestacion de la app: Clientes (agrupados gobierno/particular) -> Cotizaciones de
// ese cliente (puede tener varias) -> captura de datos/recibo de una cotizacion -> 21
// secciones navegables -> exportar PDF / WhatsApp. Toda la logica de calculo vive en
// resultado.js/motor.js; este archivo solo lee/escribe el DOM y el almacenamiento.
import {
  obtenerCliente, crearCliente, guardarCliente, eliminarCliente, clientesAgrupadosPorTipo,
  listarProyectos, obtenerProyecto, crearProyecto, guardarProyecto, eliminarProyecto, moverProyecto,
} from './clientes.js';
import { renderSeccion, TITULOS_SECCIONES } from './secciones.js';
import { construirResultado } from './resultado.js';
import { generarPdf } from './propuesta.js';
import { generarResumenEjecutivo, generarGuiaPresentacion } from './resumen.js';
import { leerReciboMultiple } from './leerRecibo.js';
import { archivoAImagenComprimida } from './imagenes.js';
import { ErrorDeClasificacion, COSTOS_RESIDENCIAL, COSTOS_COMERCIAL } from './motor.js';
import { todosLosBloques, bloqueDeSeccion } from './bloques.js';
import { M, PCT } from './util.js';

window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

const $ = (id) => document.getElementById(id);
const DOMESTICAS = new Set(['01', 'DAC']);
const TARIFAS_SOPORTADAS = new Set(['GDMTO', 'GDMTH', 'GDBT', 'PDBT', '01', 'DAC']);
// Numero de WhatsApp al que apunta "Enviar por WhatsApp" (dado por el usuario). 52 =
// Mexico; WhatsApp no permite adjuntar archivos desde un enlace wa.me, solo texto.
const WHATSAPP_NUMERO = '522218367792';

let clienteActual = null;
let proyectoActual = null;
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
  const n = (c.proyectos || []).length;
  const estado = n ? `${n} cotización${n === 1 ? '' : 'es'}` : 'sin cotizaciones todavía';
  div.innerHTML = `<div class="tarjeta-cliente-info"><strong>${escapeHtml(c.nombre)}</strong>` +
    `<span class="nota">${estado} · actualizado ${new Date(c.actualizadoEn).toLocaleDateString('es-MX')}</span></div>`;
  div.addEventListener('click', () => mostrarPantallaProyectos(c.id));
  const btnBorrar = document.createElement('button');
  btnBorrar.className = 'btn-link btn-borrar-cliente';
  btnBorrar.textContent = '🗑';
  btnBorrar.title = 'Eliminar cliente (y todas sus cotizaciones)';
  btnBorrar.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm(`¿Eliminar a "${c.nombre}" y sus ${n} cotización(es)? Esto borra todo lo guardado en este navegador, no se puede deshacer.`)) {
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
  mostrarPantallaProyectos(c.id);
});

// Guia generica (no depende de ningun cliente/cotizacion) -- vive aqui, no en la
// pestana de PDF de una cotizacion especifica, porque no cambia de un caso a otro.
// Se descarga directo (no hay un visor de PDF en esta pantalla).
$('btnGuiaPresentacionGeneral').addEventListener('click', () => {
  const doc = generarGuiaPresentacion();
  doc.save('Guia_para_presentar_cotizacion.pdf');
});

function mostrarPantallaClientes() {
  $('pantallaClientes').hidden = false;
  $('pantallaProyectos').hidden = true;
  $('pantallaCliente').hidden = true;
  clienteActual = null; proyectoActual = null; ultimoResultado = null; ultimoLeido = null;
  renderListaClientes();
}

// =====================================================================
// Pantalla: Cotizaciones/proyectos de un cliente
// =====================================================================
function tarjetaProyecto(p) {
  const div = document.createElement('div');
  div.className = 'tarjeta-cliente';
  const estado = p.cotizacionGuardadaEn
    ? `✓ cotización guardada el ${new Date(p.cotizacionGuardadaEn).toLocaleDateString('es-MX')}`
    : (p.formulario ? 'con datos capturados, cotización sin guardar todavía' : 'sin datos capturados todavía');
  div.innerHTML = `<div class="tarjeta-cliente-info"><strong>${escapeHtml(p.nombre)}</strong>` +
    `<span class="nota">${estado} · actualizado ${new Date(p.actualizadoEn).toLocaleDateString('es-MX')}</span></div>`;
  div.addEventListener('click', () => abrirProyecto(clienteActual.id, p.id));
  const btnBorrar = document.createElement('button');
  btnBorrar.className = 'btn-link btn-borrar-cliente';
  btnBorrar.textContent = '🗑';
  btnBorrar.title = 'Eliminar esta cotización';
  btnBorrar.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm(`¿Eliminar la cotización "${p.nombre}"? No se puede deshacer.`)) {
      eliminarProyecto(clienteActual, p.id);
      renderListaProyectos();
    }
  });
  div.append(btnBorrar);
  return div;
}

function renderListaProyectos() {
  const cont = $('listaProyectos');
  cont.innerHTML = '';
  const proyectos = listarProyectos(clienteActual);
  if (!proyectos.length) {
    cont.append(Object.assign(document.createElement('p'), { className: 'nota', textContent: 'Todavía no hay cotizaciones para este cliente. Sube un recibo o arranca una en blanco.' }));
  }
  for (const p of proyectos) cont.append(tarjetaProyecto(p));
}

function mostrarPantallaProyectos(clienteId) {
  clienteActual = obtenerCliente(clienteId);
  if (!clienteActual) { mostrarPantallaClientes(); return; }
  proyectoActual = null; ultimoResultado = null; ultimoLeido = null;
  $('pantallaClientes').hidden = true;
  $('pantallaProyectos').hidden = false;
  $('pantallaCliente').hidden = true;
  $('clienteNombreBarraProyectos').textContent = clienteActual.nombre;
  $('clienteTipoBarraProyectos').textContent = clienteActual.tipo === 'gobierno' ? 'Gobierno' : 'Particular';
  $('clienteTipoBarraProyectos').className = `chip-tipo chip-tipo-${clienteActual.tipo}`;
  $('estadoReciboNuevoProyecto').textContent = '';
  renderListaProyectos();
}

$('btnVolverClientesDesdeProyectos').addEventListener('click', mostrarPantallaClientes);
$('btnVolverProyectos').addEventListener('click', () => mostrarPantallaProyectos(clienteActual.id));

$('btnNuevoProyectoBlanco').addEventListener('click', () => {
  const proyecto = crearProyecto(clienteActual, {});
  abrirProyecto(clienteActual.id, proyecto.id);
});

// Subir un recibo aquí (antes de abrir ninguna cotización) crea una cotización nueva
// con los datos ya detectados -- pedido explícito del usuario. Si en cambio se sube un
// recibo DENTRO de una cotización ya abierta (sección 1 más abajo), eso actualiza esa
// MISMA cotización -- no crea una nueva cada vez que se corrige un dato.
$('archivoReciboNuevoProyecto').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  const estadoEl = $('estadoReciboNuevoProyecto');
  estadoEl.className = 'nota';
  estadoEl.textContent = files.length > 1
    ? `Leyendo ${files.length} archivos del recibo (puede tardar hasta 1 minuto por foto si usa OCR)...`
    : 'Leyendo el recibo (puede tardar hasta 1 minuto si usa OCR)...';
  $('archivoReciboNuevoProyecto').disabled = true;
  try {
    const campos = await leerReciboMultiple(files);
    const proyecto = crearProyecto(clienteActual, { nombre: campos.titular || undefined });
    abrirProyecto(clienteActual.id, proyecto.id, { camposIniciales: campos });
  } catch (err) {
    estadoEl.className = 'nota';
    estadoEl.textContent = 'Error al leer el recibo: ' + err.message;
    console.error(err);
  } finally {
    $('archivoReciboNuevoProyecto').disabled = false;
    e.target.value = '';
  }
});

// =====================================================================
// Pantalla: una cotizacion/proyecto (captura + 21 secciones)
// =====================================================================
// Llena el selector de "con qué cliente registrado guardar esta cotización" --
// pedido explícito del usuario, para poder reasignarla a otro cliente ya registrado
// en vez de que quede fija al cliente desde el que se abrió.
function poblarSelectClienteGuardar() {
  const sel = $('selectClienteGuardar');
  sel.innerHTML = '';
  const { gobierno, particular } = clientesAgrupadosPorTipo();
  const agregarGrupo = (etiqueta, lista) => {
    if (!lista.length) return;
    const og = document.createElement('optgroup');
    og.label = etiqueta;
    for (const c of lista) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nombre;
      og.append(opt);
    }
    sel.append(og);
  };
  agregarGrupo('Gobierno', gobierno);
  agregarGrupo('Particulares', particular);
  sel.value = clienteActual.id;
}

function abrirProyecto(clienteId, proyectoId, { camposIniciales } = {}) {
  clienteActual = obtenerCliente(clienteId);
  proyectoActual = clienteActual ? obtenerProyecto(clienteActual, proyectoId) : null;
  if (!clienteActual || !proyectoActual) { mostrarPantallaProyectos(clienteId); return; }
  $('pantallaClientes').hidden = true;
  $('pantallaProyectos').hidden = true;
  $('pantallaCliente').hidden = false;
  $('clienteNombreBarra').textContent = clienteActual.nombre;
  $('clienteTipoBarra').textContent = clienteActual.tipo === 'gobierno' ? 'Gobierno' : 'Particular';
  $('clienteTipoBarra').className = `chip-tipo chip-tipo-${clienteActual.tipo}`;
  $('proyectoNombreBarra').textContent = proyectoActual.nombre;
  ultimoLeido = proyectoActual.campos || null;
  ultimoResultado = null;
  $('contenedorSecciones').innerHTML = '';
  $('ayudaEdicion').hidden = true;
  $('tabPdf').hidden = true;
  $('visorPdf').innerHTML = '';
  $('estadoRecibo').textContent = '';
  $('avisoReconciliacion').hidden = true;
  $('estadoCalculo').textContent = '';
  document.querySelectorAll('#tabCaptura .campo-no-detectado').forEach(el2 => el2.classList.remove('campo-no-detectado'));
  $('estadoGuardadoCotizacion').textContent = '';
  poblarSelectClienteGuardar();
  aplicarFormulario(proyectoActual.formulario);
  aplicarInmueble(proyectoActual.inmueble);
  mostrarPreviaSembrado(proyectoActual.fotoSembrado);
  renderIndice(null);
  if (camposIniciales) {
    ultimoLeido = camposIniciales;
    llenarFormularioDesdeRecibo(camposIniciales);
    mostrarEstadoLecturaRecibo(camposIniciales);
    intentarAutoCalcular(camposIniciales);
  } else if (proyectoActual.formulario) {
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

// ---------------- Formulario: leer/aplicar (snapshot persistido por proyecto) ----------------
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

// ---------------- Foto del sembrado de paneles (se agrega a la seccion 6 y al PDF) ----------------
// Se guarda como {dataUrl, ancho, alto} -- no solo el data URL -- porque el PDF
// (propuesta.js) necesita las dimensiones reales para calcular el tamano de la imagen
// en la pagina sin deformarla, y jsPDF no las puede leer solo de un data URL.
function mostrarPreviaSembrado(foto) {
  $('imgPreviaSembrado').src = foto ? foto.dataUrl : '';
  $('previsualizacionSembrado').hidden = !foto;
}

$('archivoSembrado').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $('archivoSembrado').disabled = true;
  try {
    const foto = await archivoAImagenComprimida(file);
    proyectoActual.fotoSembrado = foto;
    guardarProyecto(clienteActual, proyectoActual);
    mostrarPreviaSembrado(foto);
    if (ultimoResultado) { ultimoResultado.fotoSembrado = foto; renderSecciones(ultimoResultado); }
  } catch (err) {
    alert('No se pudo procesar la imagen: ' + err.message);
    console.error(err);
  } finally {
    $('archivoSembrado').disabled = false;
    e.target.value = '';
  }
});

$('btnQuitarSembrado').addEventListener('click', () => {
  proyectoActual.fotoSembrado = null;
  guardarProyecto(clienteActual, proyectoActual);
  mostrarPreviaSembrado(null);
  if (ultimoResultado) { ultimoResultado.fotoSembrado = null; renderSecciones(ultimoResultado); }
});

// ---------------- Recibo: leer + autollenar + auto-calcular ----------------
// Campos que el lector de recibo puede marcar como "no detectado" y que SI tienen un
// input propio en el formulario manual (no_medidor/multiplicador/demanda_contratada_kw
// no tienen campo propio todavia, se quedan fuera del resaltado).
const CAMPO_A_INPUT = {
  tarifa: 'tarifa', no_servicio: 'noServicio', periodo_dias: 'periodoDias', periodo_kwh: 'periodoKwh',
  dap: 'dap', suministro: 'c_suministro', distribucion: 'c_distribucion', transmision: 'c_transmision',
  cenace: 'c_cenace', energia: 'c_energia', capacidad: 'c_capacidad', scnmem: 'c_scnmem',
};

// Marca en naranja los campos del formulario que el recibo NO trajo solos -- pedido
// explicito del usuario: "me marcas los datos que no se leyeron" en vez de solo un
// texto plano. Se limpia la marca de un campo en cuanto el usuario escribe algo ahi
// (ver el listener de 'input' delegado mas abajo).
function marcarCamposNoDetectados(campos) {
  document.querySelectorAll('#tabCaptura .campo-no-detectado').forEach(el2 => el2.classList.remove('campo-no-detectado'));
  for (const campo of campos.campos_no_encontrados || []) {
    const inputId = CAMPO_A_INPUT[campo];
    const el2 = inputId && $(inputId);
    if (el2) el2.classList.add('campo-no-detectado');
  }
}
$('tabCaptura').addEventListener('input', (e) => {
  if (e.target.classList && e.target.classList.contains('campo-no-detectado')) {
    e.target.classList.remove('campo-no-detectado');
  }
});

function mostrarEstadoLecturaRecibo(campos) {
  const estadoEl = $('estadoRecibo');
  const avisoEl = $('avisoReconciliacion');
  const faltantes = campos.campos_no_encontrados.filter(k => k !== 'demanda_contratada_kw');
  estadoEl.className = campos.uso_ocr ? 'nota' : 'nota ok';
  estadoEl.textContent = (campos.uso_ocr
    ? 'Se usó OCR (el PDF no traía texto aprovechable, o era una foto/escaneo). Revisa con más cuidado los datos.'
    : 'Se leyó el texto del recibo directamente.')
    + (faltantes.length ? ` No se encontraron solos (quedaron marcados en naranja abajo): ${faltantes.join(', ')}.` : '');
  avisoEl.hidden = !campos.reconciliacion_advertencia;
  if (campos.reconciliacion_advertencia) avisoEl.textContent = '🛑 ' + campos.reconciliacion_advertencia;
  marcarCamposNoDetectados(campos);
}

function intentarAutoCalcular(campos) {
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
      return true;
    } catch (err) {
      $('estadoCalculo').className = 'nota aviso';
      $('estadoCalculo').textContent = 'Se leyó el recibo pero no se pudo calcular automáticamente: ' +
        err.message + ' Revisa el formulario y pulsa Calcular.';
      return false;
    }
  }
  $('estadoCalculo').className = 'nota';
  $('estadoCalculo').textContent = 'No se detectaron automáticamente todos los datos necesarios (tarifa y/o ' +
    'columna "$/kW"); revisa el formulario y pulsa Calcular.';
  return false;
}

$('archivoRecibo').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  const estadoEl = $('estadoRecibo');
  $('avisoReconciliacion').hidden = true;
  estadoEl.className = 'nota';
  estadoEl.textContent = files.length > 1
    ? `Leyendo ${files.length} archivos del recibo (puede tardar hasta 1 minuto por foto si usa OCR)...`
    : 'Leyendo el recibo (puede tardar hasta 1 minuto si usa OCR)...';
  $('archivoRecibo').disabled = true;
  try {
    const campos = await leerReciboMultiple(files);
    ultimoLeido = campos;
    llenarFormularioDesdeRecibo(campos);
    mostrarEstadoLecturaRecibo(campos);
    intentarAutoCalcular(campos);
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
  r.seccionesActivas = proyectoActual.seccionesActivas || todosLosBloques();
  r.textosEditados = proyectoActual.textosEditados || {};
  r.fotoSembrado = proyectoActual.fotoSembrado || null;
  ultimoResultado = r;

  // Si el proyecto todavia tiene su nombre generico de creacion ("Cotización N"), se
  // renombra solo al titular detectado -- asi la lista de cotizaciones del cliente se
  // identifica sin tener que abrir cada una.
  if (/^Cotización \d+$/.test(proyectoActual.nombre) && titular && titular !== 'Cliente') {
    proyectoActual.nombre = titular;
    $('proyectoNombreBarra').textContent = proyectoActual.nombre;
  }

  proyectoActual.formulario = leerFormulario();
  proyectoActual.campos = ultimoLeido;
  proyectoActual.inmueble = inmueble;
  guardarProyecto(clienteActual, proyectoActual);

  renderSecciones(r);
  $('tabPdf').hidden = false;
  return r;
}

// ---------------- 21 secciones: render + navegacion ----------------
function onToggleBloque(bloque, activo) {
  const set = new Set(proyectoActual.seccionesActivas);
  if (activo) set.add(bloque); else set.delete(bloque);
  proyectoActual.seccionesActivas = [...set];
  guardarProyecto(clienteActual, proyectoActual);
  if (ultimoResultado) { ultimoResultado.seccionesActivas = proyectoActual.seccionesActivas; renderSecciones(ultimoResultado); }
}

function onEditarTexto(id, valor, textoDefecto) {
  proyectoActual.textosEditados = proyectoActual.textosEditados || {};
  if (valor == null || !valor.trim() || valor.trim() === textoDefecto.trim()) {
    delete proyectoActual.textosEditados[id];
  } else {
    proyectoActual.textosEditados[id] = valor;
  }
  guardarProyecto(clienteActual, proyectoActual);
  if (ultimoResultado) {
    ultimoResultado.textosEditados = proyectoActual.textosEditados;
    renderSecciones(ultimoResultado);
  }
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
  $('ayudaEdicion').hidden = false;
  for (let n = 1; n <= 21; n++) {
    const art = renderSeccion(n, r, ultimoLeido, onToggleBloque, onEditarTexto);
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

function nombreArchivoProyecto(prefijo) {
  const base = `${clienteActual.nombre}_${proyectoActual.nombre}`.replace(/[^a-z0-9]+/gi, '_');
  return `${prefijo}_${base}.pdf`;
}

$('btnGenerarPdf').addEventListener('click', () => {
  if (!ultimoResultado) { alert('Calcula primero.'); return; }
  const doc = generarPdf(ultimoResultado, { secciones: proyectoActual.seccionesActivas });
  mostrarPdfEnVisor(doc, nombreArchivoProyecto('Cotizacion'));
});

$('btnResumenEjecutivo').addEventListener('click', () => {
  if (!ultimoResultado) { alert('Calcula primero.'); return; }
  const doc = generarResumenEjecutivo(ultimoResultado);
  mostrarPdfEnVisor(doc, nombreArchivoProyecto('Resumen_ejecutivo'));
});

// Marca esta cotizacion como guardada/confirmada para el cliente elegido en el
// selector -- los datos ya se autoguardan en cada calculo (guardarProyecto), esto
// deja ademas un registro visible (fecha) de que la cotizacion se reviso y se dio
// por buena, mostrado en la lista de cotizaciones del cliente en vez del generico
// "con datos capturados". Si se elige un cliente DISTINTO al que la tenia abierta,
// la cotizacion se MUEVE a ese cliente (pedido explicito del usuario: poder elegir
// con que cliente registrado se guarda, no solo el que estaba abierto).
$('btnGuardarCotizacion').addEventListener('click', () => {
  if (!ultimoResultado) { alert('Calcula primero.'); return; }
  proyectoActual.cotizacionGuardadaEn = new Date().toISOString();
  const clienteDestinoId = $('selectClienteGuardar').value;
  if (clienteDestinoId && clienteDestinoId !== clienteActual.id) {
    const destino = moverProyecto(clienteActual.id, clienteDestinoId, proyectoActual);
    if (!destino) { alert('No se pudo mover la cotización a ese cliente.'); return; }
    clienteActual = destino;
    $('clienteNombreBarra').textContent = clienteActual.nombre;
    $('clienteTipoBarra').textContent = clienteActual.tipo === 'gobierno' ? 'Gobierno' : 'Particular';
    $('clienteTipoBarra').className = `chip-tipo chip-tipo-${clienteActual.tipo}`;
    poblarSelectClienteGuardar();
  } else {
    guardarProyecto(clienteActual, proyectoActual);
  }
  $('estadoGuardadoCotizacion').className = 'nota ok';
  $('estadoGuardadoCotizacion').textContent =
    `✓ Guardada con el cliente "${clienteActual.nombre}", cotización "${proyectoActual.nombre}".`;
});

// WhatsApp no permite adjuntar un archivo desde un enlace wa.me, solo abrir un chat con
// texto ya escrito -- el PDF (ya descargado con los botones de arriba) se adjunta a
// mano. El numero de destino lo dio el usuario directamente.
$('btnEnviarWhatsapp').addEventListener('click', () => {
  if (!ultimoResultado) { alert('Calcula primero.'); return; }
  const r = ultimoResultado;
  const mensaje = `Cotización ${r.titular}\n` +
    `Sistema: ${r.n} paneles (${r.kwp.toFixed(2)} kWp)\n` +
    `Inversión: ${M(r.investment)}\n` +
    `Ahorro año 1: ${M(r.ahorroAnual)} (${PCT(r.pctAhorro)})\n` +
    `Recuperación: ${r.payback ? r.payback.toFixed(1) + ' años' : 'N/D'}\n` +
    `VAN 25 años: ${M(r.van)}\n\n` +
    'Adjunto el PDF de la cotización.';
  const url = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank');
});

// ---------------- Refrescar (topbar, visible en toda la app) ----------------
$('btnRefrescar').addEventListener('click', () => {
  if (!$('pantallaClientes').hidden) {
    renderListaClientes();
  } else if (!$('pantallaProyectos').hidden) {
    renderListaProyectos();
  } else if (!$('pantallaCliente').hidden && proyectoActual) {
    if (proyectoActual.formulario) {
      try {
        calcularYRenderizar();
        $('estadoCalculo').className = 'nota ok';
        $('estadoCalculo').textContent = 'Recalculado con los datos actuales.';
      } catch (e) {
        $('estadoCalculo').className = 'nota aviso';
        $('estadoCalculo').textContent = 'Error al recalcular: ' + e.message;
      }
    }
  }
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
