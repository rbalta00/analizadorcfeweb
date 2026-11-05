// Orquestacion de la app: Clientes (agrupados gobierno/particular) -> Cotizaciones de
// ese cliente (puede tener varias) -> captura de datos/recibo de una cotizacion -> 21
// secciones navegables -> exportar PDF / WhatsApp. Toda la logica de calculo vive en
// resultado.js/motor.js; este archivo solo lee/escribe el DOM y el almacenamiento.
import {
  obtenerCliente, crearCliente, guardarCliente, eliminarCliente, clientesAgrupadosPorTipo,
  listarProyectos, obtenerProyecto, crearProyecto, guardarProyecto, eliminarProyecto, moverProyecto,
} from './clientes.js';
import { renderSeccion, TITULOS_SECCIONES, seccionesActivasEnOrden, seccionTieneDatos, ordenSeccionesEfectivo } from './secciones.js';
import { guardarTextoGlobal, quitarTextoGlobal, TARIFAS_PLANTILLA, resumenPlantillasPorTarifa, guardarPlantillaTarifa, eliminarPlantillaTarifa } from './textosGlobales.js';
import { construirResultado } from './resultado.js';
import { generarPdf } from './propuesta.js';
import { generarResumenEjecutivo, generarGuiaPresentacion, generarAnexoInterconexion } from './resumen.js';
import { leerReciboMultiple } from './leerRecibo.js';
import { archivoAImagenComprimida } from './imagenes.js';
import { ErrorDeClasificacion, COSTOS_RESIDENCIAL, COSTOS_COMERCIAL, recalcularDesdeMateriales, pagoMensualCredito } from './motor.js';
import { todosLosBloques, bloqueDeSeccion, seccionesDelBloque, BLOQUES_COTIZACION, BLOQUES_SECCIONES_9, BLOQUES_SECCIONES_14 } from './bloques.js';
import { M, PCT } from './util.js';
import {
  TARIFAS_SOPORTADAS, esDomestica, conectarEventosFormularioRecibo,
  leerFormularioRecibo, aplicarFormularioRecibo, llenarFormularioDesdeReciboCampos,
} from './formularioRecibo.js';
import { supabaseListar, supabaseActualizar, supabaseEliminar, supabaseSubirArchivo, supabaseEliminarArchivo } from './supabase.js';
import { subirANube, bajarDeNube } from './nube.js';
import { panelesEnTecho, esquinasDelTecho, crearEditorPaneles, hornearImagenSembrado, PANEL_ANCHO_M, PANEL_ALTO_M } from './sembrador.js';

window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

const $ = (id) => document.getElementById(id);
// Numero de WhatsApp al que apunta "Enviar por WhatsApp" (dado por el usuario). 52 =
// Mexico; WhatsApp no permite adjuntar archivos desde un enlace wa.me, solo texto.
const WHATSAPP_NUMERO = '522218367792';

let clienteActual = null;
let proyectoActual = null;
let ultimoResultado = null;
let ultimoLeido = null;
// Snapshot JSON del formulario que produjo ultimoResultado -- ver hayCambiosSinCalcular().
let ultimoInputJSON = null;
let seccionObserver = null;
// Fotos del recibo acumuladas entre varias selecciones -- un <input type="file"> normal
// REEMPLAZA la seleccion anterior cada vez que se usa de nuevo (no la suma), lo cual
// rompia el caso real "el cliente saca la foto 1, luego decide que falta la foto 2 y la
// agrega aparte": la 2a foto se procesaba sola y perdia los datos que solo traia la 1a.
// Pedido explicito del usuario tras encontrar esto probando la app. Se resetea al abrir
// un proyecto distinto (abrirProyecto) o uno en blanco -- ver mas abajo.
let archivosReciboAcumulados = [];

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

// Comparte el link de la pagina publica (cliente.html) por WhatsApp, para CUALQUIER
// cliente -- pedido explicito del usuario. Sin numero fijo (wa.me/?text=...), para que
// Isaac elija el contacto desde su propio WhatsApp en vez de mandarlo siempre al mismo
// numero (a diferencia del boton de WhatsApp de una cotizacion ya calculada, que si
// tiene un numero fijo -- ver mas abajo).
const URL_FORMULARIO_PUBLICO = 'https://cotizador-fv-cfe-web.vercel.app/cliente.html';
$('btnEnviarFormularioWhatsapp').addEventListener('click', () => {
  const mensaje = 'Hola 👋 Para preparar tu cotización de paneles solares, carga los datos de tu recibo ' +
    `de CFE aquí (elige tu tarifa y sube una foto o el PDF de tu recibo, o llénalo a mano):\n${URL_FORMULARIO_PUBLICO}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank');
});

function mostrarPantallaClientes() {
  $('pantallaClientes').hidden = false;
  $('pantallaEnvios').hidden = true;
  $('pantallaProyectos').hidden = true;
  $('pantallaCliente').hidden = true;
  clienteActual = null; proyectoActual = null; ultimoResultado = null; ultimoLeido = null; ultimoInputJSON = null;
  ocultarAvisoCambiosSinCalcular();
  renderListaClientes();
}

// ---------------- Respaldo manual en la nube (subir/bajar, NO sincronizacion
// automatica -- ver nube.js para la razon) ----------------
$('btnSubirNube').addEventListener('click', async () => {
  const estadoEl = $('estadoNube');
  $('btnSubirNube').disabled = true;
  estadoEl.className = 'nota';
  estadoEl.textContent = 'Subiendo...';
  try {
    const { numClientes } = await subirANube();
    estadoEl.className = 'nota ok';
    estadoEl.textContent = `Listo: se guardó una copia de ${numClientes} cliente(s) en la nube. Ya puedes ` +
      '"Traer de la nube" desde otro dispositivo.';
  } catch (err) {
    estadoEl.className = 'nota aviso';
    estadoEl.textContent = 'No se pudo subir: ' + err.message;
    console.error(err);
  } finally {
    $('btnSubirNube').disabled = false;
  }
});
$('btnBajarNube').addEventListener('click', async () => {
  const estadoEl = $('estadoNube');
  if (!confirm('Esto va a REEMPLAZAR los clientes/cotizaciones guardados en ESTE dispositivo por lo último ' +
               'que se subió a la nube desde cualquier otro. Lo que tengas aquí y no esté en la nube se pierde. ' +
               '¿Continuar?')) return;
  $('btnBajarNube').disabled = true;
  estadoEl.className = 'nota';
  estadoEl.textContent = 'Trayendo de la nube...';
  try {
    const { numClientes, actualizadoEn } = await bajarDeNube();
    estadoEl.className = 'nota ok';
    estadoEl.textContent = `Listo: ${numClientes} cliente(s) traídos de la nube ` +
      `(subidos por última vez ${new Date(actualizadoEn).toLocaleString('es-MX')}).`;
    mostrarPantallaClientes();
  } catch (err) {
    estadoEl.className = 'nota aviso';
    estadoEl.textContent = 'No se pudo traer: ' + err.message;
    console.error(err);
  } finally {
    $('btnBajarNube').disabled = false;
  }
});

// =====================================================================
// Pantalla: Envios de clientes (bandeja de entrada de cliente.html)
// =====================================================================
function actualizarContadorEnvios(n) {
  $('contadorEnvios').textContent = n ? `(${n})` : '';
}

// Al arrancar, consulta cuantos envios pendientes hay para mostrar el contador en el
// boton de la pantalla de Clientes, sin tener que entrar a la bandeja.
supabaseListar('envios_cliente', 'estado=eq.pendiente&select=id')
  .then(filas => actualizarContadorEnvios(filas.length))
  .catch(err => console.error('No se pudo consultar envios pendientes:', err));

async function renderListaEnvios() {
  const cont = $('listaEnvios');
  cont.innerHTML = '<p class="nota">Cargando...</p>';
  try {
    const envios = await supabaseListar('envios_cliente', 'estado=eq.pendiente&order=creado_en.desc');
    cont.innerHTML = '';
    if (!envios.length) cont.append(Object.assign(document.createElement('p'), { className: 'nota', textContent: 'Sin envíos pendientes.' }));
    for (const envio of envios) cont.append(tarjetaEnvio(envio));
    actualizarContadorEnvios(envios.length);
  } catch (err) {
    cont.innerHTML = '';
    cont.append(Object.assign(document.createElement('p'), { className: 'nota aviso', textContent: 'No se pudo cargar: ' + err.message }));
    console.error(err);
  }
}

function mostrarPantallaEnvios() {
  $('pantallaClientes').hidden = true;
  $('pantallaProyectos').hidden = true;
  $('pantallaCliente').hidden = true;
  $('pantallaEnvios').hidden = false;
  renderListaEnvios();
}
$('btnAbrirEnvios').addEventListener('click', mostrarPantallaEnvios);
$('btnVolverClientesDesdeEnvios').addEventListener('click', mostrarPantallaClientes);
$('btnRefrescarEnvios').addEventListener('click', renderListaEnvios);

function tarjetaEnvio(envio) {
  const div = document.createElement('div');
  div.className = 'tarjeta-cliente tarjeta-envio';
  const fecha = new Date(envio.creado_en).toLocaleString('es-MX');
  const resumen = `Tarifa ${envio.tarifa} · ${envio.periodo_kwh ?? '?'} kWh en ${envio.periodo_dias ?? '?'} días · ${fecha}`;
  const info = document.createElement('div');
  info.className = 'tarjeta-cliente-info';
  info.innerHTML = `<strong>${escapeHtml(envio.nombre_declarado || 'Sin nombre')}</strong><span class="nota">${resumen}</span>` +
    (envio.telefono_declarado ? `<span class="nota">Tel/WhatsApp: ${escapeHtml(envio.telefono_declarado)}</span>` : '') +
    (envio.notas_cliente ? `<span class="nota">Nota del cliente: ${escapeHtml(envio.notas_cliente)}</span>` : '') +
    (envio.campos_leidos?.reconciliacion_advertencia ? '<span class="nota aviso-chico">🛑 Tenía una advertencia de reconciliación al leer el recibo -- revisar con cuidado.</span>' : '');
  div.append(info);

  if (envio.archivos && envio.archivos.length) {
    const archivos = document.createElement('div');
    archivos.className = 'lista-archivos-recibo';
    for (const a of envio.archivos) {
      const link = document.createElement('a');
      link.href = a.url; link.target = '_blank'; link.rel = 'noopener';
      link.textContent = '📎 ' + a.nombre;
      archivos.append(link);
    }
    div.append(archivos);
  }

  const acciones = document.createElement('div');
  acciones.className = 'acciones-envio';
  const selectCliente = document.createElement('select');
  const optNuevo = document.createElement('option');
  optNuevo.value = '__nuevo__';
  optNuevo.textContent = '+ Crear cliente nuevo';
  selectCliente.append(optNuevo);
  const { gobierno, particular } = clientesAgrupadosPorTipo();
  for (const [etiqueta, lista] of [['Gobierno', gobierno], ['Particulares', particular]]) {
    if (!lista.length) continue;
    const og = document.createElement('optgroup');
    og.label = etiqueta;
    for (const c of lista) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nombre;
      og.append(opt);
    }
    selectCliente.append(og);
  }

  const filaNuevo = document.createElement('div');
  filaNuevo.className = 'fila fila-nuevo-cliente-envio';
  filaNuevo.innerHTML = `<label>Nombre del cliente nuevo<input type="text" class="input-nombre-nuevo" value="${escapeHtml(envio.nombre_declarado || '')}" /></label>
    <label>Tipo<select class="select-tipo-nuevo"><option value="particular">Particular</option><option value="gobierno">Gobierno</option></select></label>`;
  filaNuevo.hidden = false; // "+ Crear cliente nuevo" es la opcion por defecto del select
  selectCliente.addEventListener('change', () => { filaNuevo.hidden = selectCliente.value !== '__nuevo__'; });

  const btnAsignar = document.createElement('button');
  btnAsignar.className = 'btn-primario';
  btnAsignar.textContent = 'Asignar';
  btnAsignar.addEventListener('click', () => asignarEnvio(envio, selectCliente, filaNuevo, btnAsignar));

  const btnDescartar = document.createElement('button');
  btnDescartar.className = 'btn-link';
  btnDescartar.textContent = '🗑 Descartar';
  btnDescartar.addEventListener('click', () => descartarEnvio(envio));

  acciones.append(selectCliente, filaNuevo, btnAsignar, btnDescartar);
  div.append(acciones);
  return div;
}

function formularioDesdeEnvio(envio) {
  const esc = envio.escalones || {};
  return {
    titular: envio.nombre_declarado || 'Cliente', domicilio: '', noServicio: '',
    tarifa: envio.tarifa,
    periodoDias: envio.periodo_dias, periodoKwh: envio.periodo_kwh, dap: envio.dap || 0,
    cargos: envio.cargos || {},
    rkDist: envio.rate_kw?.distribucion ? 'demanda' : 'mercado',
    rkCap: envio.rate_kw?.capacidad ? 'demanda' : 'mercado',
    traeBt: !!envio.bt_monto, btMonto: envio.bt_monto || 0,
    traeBonus: !!envio.bonus_monto, bonusMonto: envio.bonus_monto || 0,
    dBasicoKwh: esc.basicoKwh ?? 150, dBasicoRate: esc.basicoRate ?? 1.140,
    dInterKwh: esc.interKwh ?? 130, dInterRate: esc.interRate ?? 1.385,
    dExcedRate: esc.excedRate ?? 4.054,
    dDap: envio.es_domestica ? (envio.dap || 0) : 0,
    dPeriodoDias: envio.es_domestica ? envio.periodo_dias : 60,
    dPeriodoKwh: envio.es_domestica ? envio.periodo_kwh : 400,
    historialNoDom: envio.es_domestica ? [] : (envio.historial || []),
    historialDom: envio.es_domestica ? (envio.historial || []) : [],
    moduloWp: 605, cobertura: 1.0, horasUtiles: 4.5, escalaCostos: 'residencial', escalamiento: 4.0,
  };
}

async function asignarEnvio(envio, selectCliente, filaNuevo, btnAsignar) {
  let cliente;
  if (selectCliente.value === '__nuevo__') {
    const nombre = filaNuevo.querySelector('.input-nombre-nuevo').value.trim();
    if (!nombre) { alert('Escribe el nombre del cliente nuevo.'); return; }
    const tipo = filaNuevo.querySelector('.select-tipo-nuevo').value;
    cliente = crearCliente({ nombre, tipo });
  } else {
    cliente = obtenerCliente(selectCliente.value);
  }
  if (!cliente) { alert('No se encontró el cliente seleccionado.'); return; }

  btnAsignar.disabled = true;
  try {
    const proyecto = crearProyecto(cliente, { nombre: envio.nombre_declarado || undefined });
    proyecto.formulario = formularioDesdeEnvio(envio);
    proyecto.campos = envio.campos_leidos || null;
    proyecto.archivosRecibo = envio.archivos || null;
    guardarProyecto(cliente, proyecto);

    await supabaseActualizar('envios_cliente', envio.id, {
      estado: 'asignado', asignado_cliente_id: cliente.id, asignado_proyecto_id: proyecto.id,
      asignado_en: new Date().toISOString(),
    });

    abrirProyecto(cliente.id, proyecto.id);
  } catch (err) {
    alert('No se pudo asignar: ' + err.message);
    console.error(err);
    btnAsignar.disabled = false;
  }
}

async function descartarEnvio(envio) {
  if (!confirm(`¿Descartar el envío de "${envio.nombre_declarado || 'sin nombre'}"? No se puede deshacer.`)) return;
  try {
    await supabaseActualizar('envios_cliente', envio.id, { estado: 'descartado' });
    renderListaEnvios();
  } catch (err) {
    alert('No se pudo descartar: ' + err.message);
    console.error(err);
  }
}

// =====================================================================
// Pantalla: Cotizaciones/proyectos de un cliente
// =====================================================================
const ETAPAS_PROYECTO = {
  cotizado: 'Cotizado', negociando: 'Negociando', ganado: 'Ganado', perdido: 'Perdido', instalado: 'Instalado',
};

function tarjetaProyecto(p) {
  const div = document.createElement('div');
  div.className = 'tarjeta-cliente';
  const estado = p.cotizacionGuardadaEn
    ? `✓ cotización guardada el ${new Date(p.cotizacionGuardadaEn).toLocaleDateString('es-MX')}`
    : (p.formulario ? 'con datos capturados, cotización sin guardar todavía' : 'sin datos capturados todavía');
  const etapa = p.etapa || 'cotizado';
  div.innerHTML = `<div class="tarjeta-cliente-info"><strong>${escapeHtml(p.nombre)}</strong>` +
    `<span class="chip-etapa chip-etapa-${etapa}">${ETAPAS_PROYECTO[etapa]}</span>` +
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
  proyectoActual = null; ultimoResultado = null; ultimoLeido = null; ultimoInputJSON = null;
  ocultarAvisoCambiosSinCalcular();
  archivosReciboAcumulados = []; // empieza limpio -- no arrastrar fotos de otro cliente/proyecto
  $('pantallaClientes').hidden = true;
  $('pantallaEnvios').hidden = true;
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
  const nuevos = Array.from(e.target.files || []);
  if (!nuevos.length) return;
  e.target.value = ''; // permite volver a usar el mismo input para agregar otra foto despues
  archivosReciboAcumulados = archivosReciboAcumulados.concat(nuevos);
  const files = archivosReciboAcumulados;
  const estadoEl = $('estadoReciboNuevoProyecto');
  estadoEl.className = 'nota';
  estadoEl.textContent = files.length > 1
    ? `Leyendo ${files.length} archivos del recibo (puede tardar hasta 1 minuto por foto si usa OCR)... Si te falta otra foto del mismo recibo, puedes seguir agregándolas con este mismo botón.`
    : 'Leyendo el recibo (puede tardar hasta 1 minuto si usa OCR)... Si el recibo viene en más fotos, agrégalas con este mismo botón antes de seguir.';
  $('archivoReciboNuevoProyecto').disabled = true;
  try {
    const campos = await leerReciboMultiple(files);
    if (!proyectoActual) {
      const proyecto = crearProyecto(clienteActual, { nombre: campos.titular || undefined });
      abrirProyecto(clienteActual.id, proyecto.id, { camposIniciales: campos });
    } else {
      // Ya se habia creado el proyecto con una foto anterior -- esta foto nueva se suma,
      // no se crea un proyecto aparte. Actualiza el mismo proyecto ya abierto.
      ultimoLeido = campos;
      llenarFormularioDesdeRecibo(campos);
      mostrarEstadoLecturaRecibo(campos);
      intentarAutoCalcular(campos);
    }
    agregarArchivosReciboAProyecto(nuevos);
  } catch (err) {
    estadoEl.className = 'nota';
    estadoEl.textContent = 'Error al leer el recibo: ' + err.message;
    console.error(err);
  } finally {
    $('archivoReciboNuevoProyecto').disabled = false;
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
  $('pantallaEnvios').hidden = true;
  $('pantallaProyectos').hidden = true;
  $('pantallaCliente').hidden = false;
  $('clienteNombreBarra').textContent = clienteActual.nombre;
  $('clienteTipoBarra').textContent = clienteActual.tipo === 'gobierno' ? 'Gobierno' : 'Particular';
  $('clienteTipoBarra').className = `chip-tipo chip-tipo-${clienteActual.tipo}`;
  $('proyectoNombreBarra').textContent = proyectoActual.nombre;
  // Si se abre con camposIniciales, viene de subir una foto nueva (nuevo proyecto o
  // "nuevo proyecto en blanco" sin fotos) -- se conserva lo acumulado para poder seguir
  // agregando fotos del mismo recibo aqui dentro. Si se abre SIN camposIniciales (un
  // proyecto ya guardado, o uno en blanco recien creado), se empieza limpio.
  if (!camposIniciales) archivosReciboAcumulados = [];
  ultimoLeido = proyectoActual.campos || null;
  ultimoResultado = null;
  ultimoInputJSON = null;
  ocultarAvisoCambiosSinCalcular();
  $('contenedorSecciones').innerHTML = '';
  $('ayudaEdicion').hidden = true;
  $('tabPdf').hidden = true;
  $('tabEditorPrecios').hidden = true;
  $('tabFinanciamiento').hidden = true;
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
  aplicarFuenteSembrado(proyectoActual.sembradoFuente);
  mostrarSembradorAuto(proyectoActual.sembradorAuto);
  renderArchivosRecibo();
  renderArchivosVerificacion();
  renderFotosInmueble();
  renderIndice(null);
  renderComparacion();
  aplicarEstadoPanel('chkPanelSeguimiento', 'contenidoSeguimiento', 'seguimiento');
  $('etapaProyecto').value = proyectoActual.etapa || 'cotizado';
  renderNotasSeguimiento();
  if (camposIniciales) {
    ultimoLeido = camposIniciales;
    llenarFormularioDesdeRecibo(camposIniciales);
    mostrarEstadoLecturaRecibo(camposIniciales);
    intentarAutoCalcular(camposIniciales);
  } else if (proyectoActual.formulario) {
    // Restaura las marcas naranja guardadas (si el proyecto viene de un recibo leido,
    // o de un envio de cliente asignado desde la bandeja) antes de decidir si se
    // puede recalcular solo al reabrir -- mismo criterio que al leer un recibo nuevo.
    if (proyectoActual.campos) marcarCamposNoDetectados(proyectoActual.campos);
    const faltan = faltantesVisiblesParaCalcular();
    if (faltan.length) {
      $('estadoCalculo').className = 'nota aviso';
      $('estadoCalculo').textContent = 'Faltan datos para calcular (marcados en naranja arriba): ' +
        faltan.map(f => f.label).join(', ') + '. Complétalos y pulsa "Calcular".';
    } else {
      try { calcularYRenderizar(); } catch (e) { console.error('No se pudo recalcular automáticamente al reabrir:', e); }
    }
  }
}

conectarEventosFormularioRecibo();

// ---------------- Formulario: leer/aplicar (snapshot persistido por proyecto) ----------------
// leerFormulario/aplicarFormulario = los campos compartidos con la pagina publica
// (formularioRecibo.js) MAS los campos que solo existen en la app interna (datos del
// cliente, sistema propuesto -- la pagina publica del cliente no los pide).
function leerFormulario() {
  return {
    titular: $('titular').value, domicilio: $('domicilio').value, noServicio: $('noServicio').value,
    ...leerFormularioRecibo(),
    moduloWp: $('moduloWp').value, cobertura: $('cobertura').value, horasUtiles: $('horasUtiles').value,
    escalaCostos: $('escalaCostos').value, escalamiento: $('escalamiento').value,
    aplicaIsr: $('aplicaIsr').checked, tasaIsr: $('tasaIsr').value,
    vigenciaDias: $('vigenciaDias').value,
  };
}

function aplicarFormulario(f) {
  $('titular').value = f?.titular || '';
  $('domicilio').value = f?.domicilio || '';
  $('noServicio').value = f?.noServicio || '';
  aplicarFormularioRecibo(f);
  $('moduloWp').value = f?.moduloWp ?? 605; $('cobertura').value = f?.cobertura ?? 1.0; $('horasUtiles').value = f?.horasUtiles ?? 4.5;
  $('escalaCostos').value = f?.escalaCostos || 'residencial'; $('escalamiento').value = f?.escalamiento ?? 4.0;
  $('aplicaIsr').checked = f?.aplicaIsr || false; $('tasaIsr').value = f?.tasaIsr ?? 30;
  $('tasaIsr').disabled = !$('aplicaIsr').checked;
  $('vigenciaDias').value = f?.vigenciaDias ?? 15;
}
$('aplicaIsr').addEventListener('change', () => { $('tasaIsr').disabled = !$('aplicaIsr').checked; });

function leerInmueble() {
  return {
    actividad: $('inmActividad').value, horarios: $('inmHorarios').value, equipos: $('inmEquipos').value,
    tensionFases: $('inmTensionFases').value, tablero: $('inmTablero').value, transformador: $('inmTransformador').value,
    tierraFisica: $('inmTierraFisica').value, puntoConexion: $('inmPuntoConexion').value, cubierta: $('inmCubierta').value,
    areaDisponible: $('inmAreaDisponible').value,
    areaFuente: document.querySelector('input[name="inmAreaFuente"]:checked').value,
    sombras: $('inmSombras').value, sistemasExistentes: $('inmSistemasExistentes').value,
    fechaVisita: $('inmFechaVisita').value, notas: $('inmNotas').value,
    panelesVerificacion: $('inmPanelesVerificacion').value ? Number($('inmPanelesVerificacion').value) : null,
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
  $('inmPanelesVerificacion').value = inm?.panelesVerificacion ?? '';
}

// ---------------- Archivos originales del recibo (PDF/fotos tal cual se subieron) ----------------
// Antes solo se leian con OCR y se descartaban -- ahora se suben al bucket publico
// "recibos" de Supabase Storage (ver supabase.js) y se guarda {nombre,tipo,url,ruta}
// en proyectoActual.archivosRecibo, para poder verlos/descargarlos despues desde
// cualquier dispositivo (igual que fotoSembrado, viaja con el respaldo en la nube
// porque es parte del objeto proyecto). La subida nunca bloquea la lectura/calculo del
// recibo: si falla (sin internet, etc.) solo se avisa en consola, no se interrumpe nada.
function renderArchivosRecibo() {
  const cont = $('listaArchivosRecibo');
  const archivos = (proyectoActual && proyectoActual.archivosRecibo) || [];
  cont.innerHTML = '';
  cont.hidden = !archivos.length;
  archivos.forEach((a, i) => {
    const fila = document.createElement('div');
    fila.className = 'fila-archivo-recibo';
    const link = document.createElement('a');
    link.href = a.url; link.target = '_blank'; link.rel = 'noopener';
    link.textContent = '📎 ' + a.nombre;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn-link'; btn.textContent = '🗑';
    btn.title = 'Quitar este archivo';
    btn.addEventListener('click', () => quitarArchivoRecibo(i));
    fila.append(link, btn);
    cont.append(fila);
  });
}

async function agregarArchivosReciboAProyecto(files) {
  if (!proyectoActual || !files || !files.length) return;
  const subidos = [];
  for (const f of files) {
    try {
      subidos.push(await supabaseSubirArchivo('cotizaciones', f));
    } catch (err) {
      console.error('No se pudo subir el archivo del recibo:', err);
    }
  }
  if (!subidos.length) return;
  proyectoActual.archivosRecibo = (proyectoActual.archivosRecibo || []).concat(subidos);
  guardarProyecto(clienteActual, proyectoActual);
  renderArchivosRecibo();
}

async function quitarArchivoRecibo(indice) {
  const archivos = proyectoActual.archivosRecibo || [];
  const archivo = archivos[indice];
  if (!archivo) return;
  if (!confirm(`¿Quitar "${archivo.nombre}"? No se puede deshacer.`)) return;
  proyectoActual.archivosRecibo = archivos.filter((_, i) => i !== indice);
  guardarProyecto(clienteActual, proyectoActual);
  renderArchivosRecibo();
  try { await supabaseEliminarArchivo(archivo.ruta); } catch (err) { console.error(err); }
}

// ---------------- Archivos de verificacion en sitio (evidencia, no se lee/extrae nada) ----------------
// Mismo patron que archivosRecibo arriba, pero para el formato de verificacion en
// sitio del gobierno (u otro emisor) -- pedido explicito del usuario: mostrarlo junto
// al recibo en la seccion 2 de la cotizacion, como evidencia adjunta, sin extraer
// ningun dato de el.
function renderArchivosVerificacion() {
  const cont = $('listaArchivosVerificacion');
  const archivos = (proyectoActual && proyectoActual.archivosVerificacion) || [];
  cont.innerHTML = '';
  cont.hidden = !archivos.length;
  archivos.forEach((a, i) => {
    const fila = document.createElement('div');
    fila.className = 'fila-archivo-recibo';
    const link = document.createElement('a');
    link.href = a.url; link.target = '_blank'; link.rel = 'noopener';
    link.textContent = '📎 ' + a.nombre;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn-link'; btn.textContent = '🗑';
    btn.title = 'Quitar este archivo';
    btn.addEventListener('click', () => quitarArchivoVerificacion(i));
    fila.append(link, btn);
    cont.append(fila);
  });
}

async function agregarArchivosVerificacionAProyecto(files) {
  if (!proyectoActual || !files || !files.length) return;
  const subidos = [];
  for (const f of files) {
    try {
      subidos.push(await supabaseSubirArchivo('verificaciones', f));
    } catch (err) {
      console.error('No se pudo subir el archivo de verificación:', err);
    }
  }
  if (!subidos.length) return;
  proyectoActual.archivosVerificacion = (proyectoActual.archivosVerificacion || []).concat(subidos);
  guardarProyecto(clienteActual, proyectoActual);
  renderArchivosVerificacion();
}

async function quitarArchivoVerificacion(indice) {
  const archivos = proyectoActual.archivosVerificacion || [];
  const archivo = archivos[indice];
  if (!archivo) return;
  if (!confirm(`¿Quitar "${archivo.nombre}"? No se puede deshacer.`)) return;
  proyectoActual.archivosVerificacion = archivos.filter((_, i) => i !== indice);
  guardarProyecto(clienteActual, proyectoActual);
  renderArchivosVerificacion();
  try { await supabaseEliminarArchivo(archivo.ruta); } catch (err) { console.error(err); }
}

$('archivoVerificacion').addEventListener('change', async (e) => {
  const nuevos = Array.from(e.target.files || []);
  if (!nuevos.length) return;
  e.target.value = '';
  await agregarArchivosVerificacionAProyecto(nuevos);
  if (ultimoResultado) { ultimoResultado.archivosVerificacion = proyectoActual.archivosVerificacion; renderSecciones(ultimoResultado); }
});

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

// ---------------- Fotos de condiciones GENERALES del inmueble (seccion 5 del formulario,
// se ven en la seccion 6 de la cotizacion/PDF) ----------------
// Distinto de fotoSembrado (que es SOLO la distribucion de paneles sobre el techo):
// aqui se guardan VARIAS fotos (sombras, cubierta, tablero, etc.), cada una con una
// etiqueta corta opcional. Mismo mecanismo de compresion que fotoSembrado (ver
// imagenes.js) pero mas agresivo (menor ancho/calidad) porque aqui puede haber varias
// a la vez compartiendo la misma cuota de localStorage. Tope de 6 fotos por proyecto,
// pedido explicito del usuario (hueco declarado desde 2026-10-29, "no hay captura de
// fotografias en esta version").
const MAX_FOTOS_INMUEBLE = 6;

function renderFotosInmueble() {
  const cont = $('galeriaFotosInmueble');
  const fotos = (proyectoActual && proyectoActual.fotosInmueble) || [];
  cont.innerHTML = '';
  cont.hidden = !fotos.length;
  fotos.forEach((foto, i) => {
    const item = document.createElement('div');
    item.className = 'foto-inmueble-item';
    const img = document.createElement('img');
    img.src = foto.dataUrl;
    img.alt = foto.etiqueta || `Foto del inmueble ${i + 1}`;
    const etiqueta = document.createElement('input');
    etiqueta.type = 'text';
    etiqueta.placeholder = 'Etiqueta (ej. Cubierta)';
    etiqueta.value = foto.etiqueta || '';
    etiqueta.addEventListener('change', () => {
      proyectoActual.fotosInmueble[i].etiqueta = etiqueta.value.trim();
      guardarProyecto(clienteActual, proyectoActual);
      if (ultimoResultado) { ultimoResultado.fotosInmueble = proyectoActual.fotosInmueble; renderSecciones(ultimoResultado); }
    });
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn-link'; btn.textContent = '🗑 Quitar';
    btn.addEventListener('click', () => quitarFotoInmueble(i));
    item.append(img, etiqueta, btn);
    cont.append(item);
  });
}

async function quitarFotoInmueble(indice) {
  proyectoActual.fotosInmueble = (proyectoActual.fotosInmueble || []).filter((_, i) => i !== indice);
  guardarProyecto(clienteActual, proyectoActual);
  renderFotosInmueble();
  if (ultimoResultado) { ultimoResultado.fotosInmueble = proyectoActual.fotosInmueble; renderSecciones(ultimoResultado); }
}

$('archivoFotoInmueble').addEventListener('change', async (e) => {
  const nuevos = Array.from(e.target.files || []);
  e.target.value = '';
  if (!nuevos.length) return;
  const actuales = proyectoActual.fotosInmueble || [];
  const cupo = MAX_FOTOS_INMUEBLE - actuales.length;
  if (cupo <= 0) {
    alert(`Ya hay ${MAX_FOTOS_INMUEBLE} fotos del inmueble -- quita alguna antes de agregar otra.`);
    return;
  }
  const porProcesar = nuevos.slice(0, cupo);
  if (nuevos.length > cupo) {
    alert(`Solo se agregaron ${porProcesar.length} foto(s) -- el máximo son ${MAX_FOTOS_INMUEBLE} por cotización.`);
  }
  $('archivoFotoInmueble').disabled = true;
  try {
    for (const file of porProcesar) {
      try {
        const foto = await archivoAImagenComprimida(file, { maxAncho: 900, calidad: 0.6 });
        actuales.push({ ...foto, etiqueta: '' });
      } catch (err) {
        console.error('No se pudo procesar una foto del inmueble:', err);
      }
    }
    proyectoActual.fotosInmueble = actuales;
    guardarProyecto(clienteActual, proyectoActual);
    renderFotosInmueble();
    if (ultimoResultado) { ultimoResultado.fotosInmueble = proyectoActual.fotosInmueble; renderSecciones(ultimoResultado); }
  } finally {
    $('archivoFotoInmueble').disabled = false;
  }
});

// ---------------- Sembrador automatico de paneles (beta) ----------------
// Segunda forma de conseguir la imagen de fotoSembrado (la primera es subir la foto ya
// armada a mano, arriba). El usuario sube SU captura (satelital o la que sea, no se
// descarga ninguna aqui -- sin Google Maps ni llaves de API, decision explicita del
// usuario 2026-11-02 "lo dejamos asi"), marca escala y techo con 2 clics cada uno, y se
// siembra en rejilla el mismo r.n ya calculado (ver sembrador.js). Guardar "hornea" el
// resultado en un canvas y lo deja en proyectoActual.fotoSembrado -- MISMA variable que
// usa la foto manual, asi que solo hay una imagen "activa" a la vez (la ultima que se
// guarde), tal como se pidio.
let modoMarcadoSembrador = null; // null | 'escala' | 'techo'
let puntosMarcadosSembrador = [];
const editorSembrador = crearEditorPaneles($('svgSembradorAuto'));
editorSembrador.onCambio((paneles) => {
  if (proyectoActual && proyectoActual.sembradorAuto) {
    proyectoActual.sembradorAuto.paneles = paneles;
    guardarProyecto(clienteActual, proyectoActual);
  }
});

function dibujarMarcadoresSembrador() {
  const svg = $('svgMarcadoresAuto');
  svg.innerHTML = '';
  const est = proyectoActual && proyectoActual.sembradorAuto;
  function linea(p1, p2, color) {
    if (!p1 || !p2) return;
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', p1[0]); l.setAttribute('y1', p1[1]);
    l.setAttribute('x2', p2[0]); l.setAttribute('y2', p2[1]);
    l.setAttribute('stroke', color); l.setAttribute('stroke-width', 3); l.setAttribute('stroke-dasharray', '6 4');
    svg.appendChild(l);
  }
  function punto(p, color) {
    if (!p) return;
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); c.setAttribute('r', 6);
    c.setAttribute('fill', color); c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', 2);
    svg.appendChild(c);
  }
  const colorEscala = '#c99a2e', colorTecho = '#0f8b8d';
  linea(est && est.cotaP1, est && est.cotaP2, colorEscala);
  punto(est && est.cotaP1, colorEscala); punto(est && est.cotaP2, colorEscala);
  // El techo son 3 puntos (no 2): p1->p2 es el lado del techo tal como se ve en la foto
  // (da el angulo real, no el de la pantalla), p3 marca el lado opuesto -- ver
  // panelesEnTecho()/esquinasDelTecho() en sembrador.js. Se dibuja el rectangulo real
  // detectado (sus 4 esquinas) como guia visual, para que lo marcado coincida exacto con
  // lo que se va a sembrar.
  if (est && est.techoP1 && est.techoP2 && est.techoP3) {
    const esquinas = esquinasDelTecho(est.techoP1, est.techoP2, est.techoP3);
    if (esquinas) esquinas.forEach((esq, i) => linea(esq, esquinas[(i + 1) % 4], colorTecho));
  } else if (est && est.techoP1 && est.techoP2) {
    linea(est.techoP1, est.techoP2, colorTecho);
  }
  punto(est && est.techoP1, colorTecho); punto(est && est.techoP2, colorTecho); punto(est && est.techoP3, colorTecho);
  if (modoMarcadoSembrador) {
    const color = modoMarcadoSembrador === 'escala' ? colorEscala : colorTecho;
    puntosMarcadosSembrador.forEach((p) => punto(p, color));
  }
}

function terminarMarcadoSembrador() {
  modoMarcadoSembrador = null;
  puntosMarcadosSembrador = [];
  delete $('svgSembradorAuto').dataset.modoMarcado;
  $('estadoSembradorAuto').textContent = '';
}

function empezarMarcadoSembrador(tipo) {
  if (!proyectoActual || !proyectoActual.sembradorAuto) return;
  modoMarcadoSembrador = tipo;
  puntosMarcadosSembrador = [];
  $('svgSembradorAuto').dataset.modoMarcado = tipo;
  $('estadoSembradorAuto').textContent = tipo === 'escala'
    ? 'Haz clic en 2 puntos de distancia real conocida sobre la imagen (ej. el ancho de una banqueta, un auto, un predio vecino).'
    : 'Haz clic en 2 puntos a lo largo de UN lado del techo tal como se ve en la foto (1→2, define el ángulo real) y luego 1 punto sobre el lado opuesto (3, define el ancho).';
  dibujarMarcadoresSembrador();
}

$('svgSembradorAuto').addEventListener('click', (e) => {
  if (!modoMarcadoSembrador || !proyectoActual || !proyectoActual.sembradorAuto) return;
  const svg = $('svgSembradorAuto');
  const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  puntosMarcadosSembrador.push([Math.round(p.x), Math.round(p.y)]);
  dibujarMarcadoresSembrador();
  const necesarios = modoMarcadoSembrador === 'escala' ? 2 : 3;
  if (puntosMarcadosSembrador.length === necesarios) {
    const est = proyectoActual.sembradorAuto;
    if (modoMarcadoSembrador === 'escala') { est.cotaP1 = puntosMarcadosSembrador[0]; est.cotaP2 = puntosMarcadosSembrador[1]; }
    else { est.techoP1 = puntosMarcadosSembrador[0]; est.techoP2 = puntosMarcadosSembrador[1]; est.techoP3 = puntosMarcadosSembrador[2]; }
    guardarProyecto(clienteActual, proyectoActual);
    terminarMarcadoSembrador();
    dibujarMarcadoresSembrador();
  }
});

$('btnMarcarEscala').addEventListener('click', () => empezarMarcadoSembrador('escala'));
$('btnMarcarTecho').addEventListener('click', () => empezarMarcadoSembrador('techo'));

$('archivoAutoSembrado').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $('archivoAutoSembrado').disabled = true;
  try {
    const foto = await archivoAImagenComprimida(file, { maxAncho: 1600, calidad: 0.85 });
    proyectoActual.sembradorAuto = {
      imagenDataUrl: foto.dataUrl, anchoImg: foto.ancho, altoImg: foto.alto,
      cotaP1: null, cotaP2: null, cotaMetros: null, techoP1: null, techoP2: null, techoP3: null, angulo: 0, paneles: [],
    };
    guardarProyecto(clienteActual, proyectoActual);
    mostrarSembradorAuto(proyectoActual.sembradorAuto);
  } catch (err) {
    alert('No se pudo procesar la imagen: ' + err.message);
    console.error(err);
  } finally {
    $('archivoAutoSembrado').disabled = false;
    e.target.value = '';
  }
});

// Abre Google Maps (la pagina normal, gratis, sin llave ni facturacion) con la direccion
// del recibo ya puesta -- el usuario cambia a vista satelital con el boton de capas de
// Maps y toma su propia captura de pantalla para subirla abajo. Decision explicita del
// usuario, 2026-11-02: nada de API de pago, el sembrado se arma a partir de una captura
// que el propio Isaac toma (igual que sembrar_paneles.py/planear_techo.py del repo
// cotizador-fv-cfe, que reciben cualquier imagen + su escala, sin depender de Maps API).
$('btnAbrirMaps').addEventListener('click', () => {
  const direccion = $('autoDireccionMaps').value.trim();
  if (!direccion) { alert('Escribe o confirma la dirección a buscar.'); return; }
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`, '_blank');
});

$('btnSembrarAuto').addEventListener('click', () => {
  const est = proyectoActual && proyectoActual.sembradorAuto;
  if (!est || !est.imagenDataUrl) return;
  if (!ultimoResultado || !ultimoResultado.n) {
    alert('Calcula primero la cotización (botón "Calcular") para saber cuántos paneles sembrar.');
    return;
  }
  const cotaMetros = Number($('autoCotaMetros').value);
  if (!est.cotaP1 || !est.cotaP2 || !(cotaMetros > 0)) {
    alert('Falta marcar la escala (2 puntos) y su distancia real en metros.');
    return;
  }
  if (!est.techoP1 || !est.techoP2 || !est.techoP3) {
    alert('Falta marcar el techo: 2 puntos a lo largo de un lado y 1 punto del lado opuesto (3 clics).');
    return;
  }
  est.cotaMetros = cotaMetros;
  // "Ángulo del bloque" ahora es un AJUSTE fino encima del ángulo que ya se detecta solo
  // del lado marcado (ejesDelTecho/panelesEnTecho) -- antes era el único ángulo y
  // siempre sembraba sin rotar salvo que el usuario lo escribiera a mano. Pedido
  // explícito del usuario, 2026-11-02: "intenta tú primero poner los paneles sobre la
  // azotea" -- el primer intento ya sale alineado a como se ve el techo en la foto.
  const anguloManualExtra = Number($('autoAngulo').value) || 0;
  const ppm = Math.hypot(est.cotaP2[0] - est.cotaP1[0], est.cotaP2[1] - est.cotaP1[1]) / est.cotaMetros;
  const panelWpx = PANEL_ANCHO_M * ppm, panelHpx = PANEL_ALTO_M * ppm;
  const gapPx = Math.max(1, panelWpx * 0.04);
  const { paneles, cabenTodos, colocados, anguloDetectado } = panelesEnTecho({
    p1: est.techoP1, p2: est.techoP2, p3: est.techoP3,
    n: ultimoResultado.n, panelWpx, panelHpx, gapPx, anguloManualExtra,
  });
  est.angulo = anguloManualExtra;
  est.paneles = paneles;
  guardarProyecto(clienteActual, proyectoActual);
  editorSembrador.cargar(paneles);
  const anguloTxt = `(alineados ${anguloDetectado.toFixed(1)}° al techo marcado${anguloManualExtra ? ` + ${anguloManualExtra}° extra` : ''})`;
  $('estadoSembradorAuto').textContent = cabenTodos
    ? `${colocados} paneles sembrados ${anguloTxt}. Arrastra, gira o borra (tecla Supr) a mano si hace falta ajustar.`
    : `Aviso: el techo marcado solo alcanza para ${colocados} de ${ultimoResultado.n} paneles ${anguloTxt} -- agranda el techo marcado o ajusta a mano.`;
});

$('btnGuardarSembradoAuto').addEventListener('click', () => {
  const paneles = editorSembrador.obtener();
  if (!paneles.length) { alert('Todavía no hay paneles sembrados -- usa "③ Sembrar paneles" primero.'); return; }
  const foto = hornearImagenSembrado($('imgSembradorAuto'), paneles);
  proyectoActual.fotoSembrado = foto;
  proyectoActual.sembradoFuente = 'auto';
  guardarProyecto(clienteActual, proyectoActual);
  mostrarPreviaSembrado(foto);
  if (ultimoResultado) { ultimoResultado.fotoSembrado = foto; renderSecciones(ultimoResultado); }
  alert('Guardado -- esta imagen es ahora la activa en la sección 6 y el PDF.');
});

$('btnQuitarSembradoAuto').addEventListener('click', () => {
  if (!proyectoActual) return;
  proyectoActual.sembradorAuto = null;
  guardarProyecto(clienteActual, proyectoActual);
  mostrarSembradorAuto(null);
});

function aplicarFuenteSembrado(valor) {
  const val = valor === 'auto' ? 'auto' : 'manual';
  const radio = document.querySelector(`input[name="fuenteSembrado"][value="${val}"]`);
  if (radio) radio.checked = true;
  $('panelSembradoManual').hidden = val !== 'manual';
  $('panelSembradoAuto').hidden = val !== 'auto';
}

document.querySelectorAll('input[name="fuenteSembrado"]').forEach((r) => {
  r.addEventListener('change', () => {
    const val = document.querySelector('input[name="fuenteSembrado"]:checked').value;
    $('panelSembradoManual').hidden = val !== 'manual';
    $('panelSembradoAuto').hidden = val !== 'auto';
    if (val === 'auto' && !$('autoDireccionMaps').value) {
      $('autoDireccionMaps').value = $('domicilio').value || '';
    }
    if (proyectoActual) { proyectoActual.sembradoFuente = val; guardarProyecto(clienteActual, proyectoActual); }
  });
});

function mostrarSembradorAuto(estado) {
  terminarMarcadoSembrador();
  const panel = $('editorAutoSembrado');
  if (!estado || !estado.imagenDataUrl) {
    panel.hidden = true;
    $('imgSembradorAuto').src = '';
    $('svgMarcadoresAuto').innerHTML = '';
    editorSembrador.cargar([]);
    return;
  }
  panel.hidden = false;
  const img = $('imgSembradorAuto');
  img.onload = () => {
    $('svgMarcadoresAuto').setAttribute('viewBox', `0 0 ${img.naturalWidth} ${img.naturalHeight}`);
    $('svgSembradorAuto').setAttribute('viewBox', `0 0 ${img.naturalWidth} ${img.naturalHeight}`);
    dibujarMarcadoresSembrador();
    editorSembrador.cargar(estado.paneles || []);
  };
  img.src = estado.imagenDataUrl;
  $('autoCotaMetros').value = estado.cotaMetros || '';
  $('autoAngulo').value = estado.angulo || 0;
  $('sembradorAutoN').textContent = ultimoResultado ? ultimoResultado.n : '--';
  if (!$('autoDireccionMaps').value) $('autoDireccionMaps').value = $('domicilio').value || '';
}

// ---------------- Recibo: leer + autollenar + auto-calcular ----------------
// Campos que el lector de recibo puede marcar como "no detectado" y que SI tienen un
// input propio en el formulario manual (no_medidor/multiplicador/demanda_contratada_kw
// no tienen campo propio todavia, se quedan fuera del resaltado).
const CAMPO_A_INPUT = {
  tarifa: 'tarifa', no_servicio: 'noServicio', periodo_dias: 'periodoDias', periodo_kwh: 'periodoKwh',
  dap: 'dap', suministro: 'c_suministro', distribucion: 'c_distribucion', transmision: 'c_transmision',
  cenace: 'c_cenace', energia: 'c_energia', capacidad: 'c_capacidad', scnmem: 'c_scnmem',
  energia_base: 'c_energia_base', energia_intermedia: 'c_energia_intermedia', energia_punta: 'c_energia_punta',
};
const ETIQUETA_CAMPO = {
  tarifa: 'Tarifa', periodoDias: 'Días del período', periodoKwh: 'kWh del período', dap: 'DAP',
  c_suministro: 'Suministro', c_distribucion: 'Distribución', c_transmision: 'Transmisión',
  c_cenace: 'CENACE', c_energia: 'Energía', c_capacidad: 'Capacidad', c_scnmem: 'SCnMEM',
  c_energia_base: 'Energía Base', c_energia_intermedia: 'Energía Intermedia', c_energia_punta: 'Energía Punta',
  grupoRateKw: 'Columna "$/kW" (Distribución/Capacidad)',
};

// Marca en naranja los campos del formulario que el recibo NO trajo solos -- pedido
// explicito del usuario: "me marcas los datos que no se leyeron" en vez de solo un
// texto plano. Ademas de los inputs normales, marca el grupo de radios "$/kW"
// (#grupoRateKw) cuando no se detecto esa columna -- es el unico dato que no es un
// <input>/<select> simple. Se limpia la marca de un campo en cuanto el usuario
// escribe/elige algo ahi (ver los listeners delegados mas abajo). Estas marcas son
// ahora la fuente de verdad para decidir si se puede calcular (ver
// `faltantesVisiblesParaCalcular`) -- no solo cosmeticas.
function marcarCamposNoDetectados(campos) {
  document.querySelectorAll('#tabCaptura .campo-no-detectado').forEach(el2 => el2.classList.remove('campo-no-detectado'));
  for (const campo of campos.campos_no_encontrados || []) {
    const inputId = CAMPO_A_INPUT[campo];
    const el2 = inputId && $(inputId);
    if (el2) el2.classList.add('campo-no-detectado');
  }
  if (!esDomestica($('tarifa').value) && !campos.rate_kw_detectado) {
    $('grupoRateKw').classList.add('campo-no-detectado');
  }
  // GDMTH: 'energia_base'/'energia_intermedia'/'energia_punta' NO se inicializan en
  // null dentro de extraerCampos() salvo que se detecten de verdad (ver recibo.js) --
  // por eso NO aparecen en campos_no_encontrados cuando simplemente no se detectaron
  // (a diferencia del resto de los campos). Hay que revisarlos aparte contra `campos`
  // directamente, si no, un recibo GDMTH que no se pudo leer se quedaria sin marcar
  // nada (el "Energia" generico esta oculto para esta tarifa) y calcularia con $0.
  if ($('tarifa').value === 'GDMTH') {
    for (const campo of ['energia_base', 'energia_intermedia', 'energia_punta']) {
      if (campos[campo] == null) $(CAMPO_A_INPUT[campo]).classList.add('campo-no-detectado');
    }
  }
}
// Quita de campos_no_encontrados (y apaga rate_kw_detectado si aplica) cualquier campo
// que YA NO este marcado en naranja en el DOM en este momento -- usado al calcular con
// exito para que la confirmacion de Isaac quede guardada de forma permanente en el
// proyecto, no solo en esta sesion (ver comentario en calcularYRenderizar).
function sincronizarCamposConfirmados(leido) {
  if (!leido) return leido;
  const actualizado = { ...leido };
  if (Array.isArray(actualizado.campos_no_encontrados)) {
    actualizado.campos_no_encontrados = actualizado.campos_no_encontrados.filter((campo) => {
      const inputId = CAMPO_A_INPUT[campo];
      const el2 = inputId && $(inputId);
      return el2 && el2.classList.contains('campo-no-detectado');
    });
  }
  if (!$('grupoRateKw').classList.contains('campo-no-detectado')) {
    actualizado.rate_kw_detectado = true;
  }
  // GDMTH: energia_base/intermedia/punta se re-marcan comparando campos[campo] == null
  // directamente (no via campos_no_encontrados, ver marcarCamposNoDetectados) -- si ya
  // se confirmaron (no estan en naranja), hay que dejar de verlos como null aqui tambien.
  if ($('tarifa').value === 'GDMTH') {
    for (const campo of ['energia_base', 'energia_intermedia', 'energia_punta']) {
      const inputId = CAMPO_A_INPUT[campo];
      const el2 = inputId && $(inputId);
      if (el2 && !el2.classList.contains('campo-no-detectado') && actualizado[campo] == null) {
        actualizado[campo] = Number(el2.value) || 0;
      }
    }
  }
  return actualizado;
}
$('tabCaptura').addEventListener('input', (e) => {
  if (e.target.classList && e.target.classList.contains('campo-no-detectado')) {
    e.target.classList.remove('campo-no-detectado');
  }
});
// Si el campo marcado YA tiene un valor (ej. se llenó a mano en una sesión anterior,
// o se trajo de la nube), no hay que borrarlo y volver a escribirlo para que cuente
// como revisado -- un clic/tab hacia el campo (focusin, dispara con clic Y con Tab)
// ya basta para confirmar que Isaac lo vio. Si está vacío, 'input' de arriba sigue
// siendo lo que lo limpia cuando de verdad se captura un valor nuevo.
$('tabCaptura').addEventListener('focusin', (e) => {
  if (e.target.classList && e.target.classList.contains('campo-no-detectado') && e.target.value) {
    e.target.classList.remove('campo-no-detectado');
  }
});
// Las radios no disparan 'input' de forma confiable en todos los navegadores, y si el
// usuario deja la opcion por defecto (ya marcada) un 'change' tampoco dispara -- por
// eso se limpia con 'click', que siempre dispara aunque no cambie el valor: con eso
// basta para considerar que Isaac ya revisó esa columna.
$('grupoRateKw').addEventListener('click', () => {
  $('grupoRateKw').classList.remove('campo-no-detectado');
});

// Datos obligatorios para que el calculo sea correcto -- si el recibo no los trajo
// Y siguen marcados en naranja (el usuario no los llenó a mano todavía), NO se debe
// calcular con el valor por defecto ($0.00 u otro) porque el resultado saldria mal.
// Pedido explicito del usuario: "debes pedir todo completo para que no hagas mal los
// cálculos" + "lo que sí tienes que marcar en la app los datos que faltan". Si nunca
// se leyó un recibo (captura 100% manual desde cero), no hay nada marcado y esto no
// bloquea nada -- solo protege el caso real: un recibo SE leyó, algo no se detectó, y
// el formulario se habría quedado con un valor por defecto sin que nadie lo notara.
function faltantesVisiblesParaCalcular() {
  if (!$('tarifa').value) return [{ id: 'tarifa', label: ETIQUETA_CAMPO.tarifa }];
  return Array.from(document.querySelectorAll('#tabCaptura .campo-no-detectado'))
    .filter(el2 => el2.offsetParent !== null)
    .map(el2 => ({ id: el2.id, label: ETIQUETA_CAMPO[el2.id] || el2.id }));
}

function mostrarEstadoLecturaRecibo(campos) {
  const estadoEl = $('estadoRecibo');
  const avisoEl = $('avisoReconciliacion');
  // Solo contar como "faltante" lo que de verdad tiene una casilla que marcar --
  // campos_no_encontrados tambien trae cosas internas sin input propio (multiplicador,
  // demanda_contratada_kw, historial_anual_kwh/meses_cubiertos) que antes se colaban
  // en este mensaje diciendo "quedaron marcados en naranja" sin que nada se marcara
  // de verdad. Bug real encontrado por el usuario probando un recibo real.
  const faltantes = campos.campos_no_encontrados.filter(k => CAMPO_A_INPUT[k]);
  estadoEl.className = campos.uso_ocr ? 'nota' : 'nota ok';
  estadoEl.textContent = (campos.uso_ocr
    ? 'Se usó OCR (el PDF no traía texto aprovechable, o era una foto/escaneo). Revisa con más cuidado los datos.'
    : 'Se leyó el texto del recibo directamente.')
    + (faltantes.length ? ` No se encontraron solos (quedaron marcados en naranja abajo): ${faltantes.map(k => ETIQUETA_CAMPO[CAMPO_A_INPUT[k]] || k).join(', ')}.` : '');
  avisoEl.hidden = !campos.reconciliacion_advertencia;
  if (campos.reconciliacion_advertencia) avisoEl.textContent = '🛑 ' + campos.reconciliacion_advertencia;
  marcarCamposNoDetectados(campos);
}

function intentarAutoCalcular(campos) {
  const tarifaOk = campos.tarifa && TARIFAS_SOPORTADAS.has(campos.tarifa);
  const faltan = tarifaOk ? faltantesVisiblesParaCalcular() : [{ id: 'tarifa', label: ETIQUETA_CAMPO.tarifa }];
  if (!faltan.length) {
    try {
      calcularYRenderizar();
      $('estadoCalculo').className = 'nota ok';
      $('estadoCalculo').textContent = 'Calculado automáticamente a partir del recibo. Revisa las secciones abajo.';
      return true;
    } catch (err) {
      $('estadoCalculo').className = 'nota aviso';
      $('estadoCalculo').textContent = 'Se leyó el recibo pero no se pudo calcular automáticamente: ' +
        err.message + ' Revisa el formulario y pulsa Calcular.';
      return false;
    }
  }
  $('estadoCalculo').className = 'nota aviso';
  $('estadoCalculo').textContent = 'No se calculó automáticamente: faltan datos marcados en naranja arriba (' +
    faltan.map(f => f.label).join(', ') + '). Complétalos a mano y pulsa "Calcular".';
  return false;
}

$('archivoRecibo').addEventListener('change', async (e) => {
  const nuevos = Array.from(e.target.files || []);
  if (!nuevos.length) return;
  e.target.value = ''; // permite volver a usar el mismo input para agregar otra foto despues
  archivosReciboAcumulados = archivosReciboAcumulados.concat(nuevos);
  const files = archivosReciboAcumulados;
  const estadoEl = $('estadoRecibo');
  $('avisoReconciliacion').hidden = true;
  estadoEl.className = 'nota';
  estadoEl.textContent = files.length > 1
    ? `Leyendo ${files.length} archivos del recibo (puede tardar hasta 1 minuto por foto si usa OCR)... Si te falta otra foto del mismo recibo, puedes seguir agregándolas con este mismo botón.`
    : 'Leyendo el recibo (puede tardar hasta 1 minuto si usa OCR)... Si el recibo viene en más fotos, agrégalas con este mismo botón antes de seguir.';
  $('archivoRecibo').disabled = true;
  try {
    const campos = await leerReciboMultiple(files);
    ultimoLeido = campos;
    llenarFormularioDesdeRecibo(campos);
    mostrarEstadoLecturaRecibo(campos);
    intentarAutoCalcular(campos);
    agregarArchivosReciboAProyecto(nuevos);
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
  llenarFormularioDesdeReciboCampos(c);
}

// ---------------- Calcular ----------------
$('btnCalcular').addEventListener('click', () => {
  const faltan = faltantesVisiblesParaCalcular();
  if (faltan.length) {
    $('estadoCalculo').className = 'nota aviso';
    $('estadoCalculo').textContent = 'Faltan datos para calcular (marcados en naranja arriba): ' +
      faltan.map(f => f.label).join(', ') + '. Complétalos antes de calcular -- si se calcula con un dato ' +
      'que falta, el resultado sale mal.';
    const primero = document.getElementById(faltan[0].id);
    if (primero) primero.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  try {
    calcularYRenderizar();
    $('estadoCalculo').className = 'nota ok';
    $('estadoCalculo').textContent = 'Calculado. Desplázate hacia abajo para ver las secciones, o usa el índice.';
    $('contenedorSecciones').scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    $('estadoCalculo').className = 'nota aviso';
    $('estadoCalculo').textContent = (e instanceof ErrorDeClasificacion ? 'No se puede calcular con estos datos: ' : 'Error al calcular: ') + e.message;
    console.error(e);
  }
});

// Proyectos guardados ANTES de que existieran los bloques 'documentos' y
// 'comparativo_verificacion' (secciones 17-20, agregadas 2026-10-31) se quedaron con un
// seccionesActivas que nunca los incluyo -- se veian siempre "Desactivada" en el indice
// sin que el usuario los hubiera apagado nunca (no existia ni el checkbox todavia).
// Pedido explicito del usuario (2026-11-01): esas secciones deben contar numeradas por
// default, igual que cualquier otra -- el apagarlas manualmente es justo para lo que
// sirve el indice, no algo que el sistema deba decidir por un hueco de migracion.
function migrarSeccionesActivasBloquesNuevos(seccionesActivas) {
  if (!seccionesActivas) return todosLosBloques();
  const faltantes = ['documentos', 'comparativo_verificacion'].filter((b) => !seccionesActivas.includes(b));
  return faltantes.length ? [...seccionesActivas, ...faltantes] : seccionesActivas;
}

// Lee SOLO el formulario (sin calcular ni tocar proyectoActual) -- separado de
// calcularYRenderizar() para poder comparar "lo que hay en el formulario ahora mismo" contra
// "lo que se uso en el ultimo calculo" y avisar si hay cambios sin aplicar antes de descargar
// el PDF o generar la invitacion (ver hayCambiosSinCalcular/ultimoInputJSON). 2026-11-02.
function leerInputCalculo() {
  const tarifa = $('tarifa').value;
  const esDom = esDomestica(tarifa);
  const costos = $('escalaCostos').value === 'residencial' ? COSTOS_RESIDENCIAL : COSTOS_COMERCIAL;
  const moduloWp = Number($('moduloWp').value);
  const cobertura = Number($('cobertura').value);
  const horasUtiles = Number($('horasUtiles').value);
  const escalamientoPct = Number($('escalamiento').value);
  const titular = $('titular').value || 'Cliente';
  const domicilio = $('domicilio').value;
  const noServicio = $('noServicio').value;
  const inmueble = leerInmueble();
  const aplicaIsr = $('aplicaIsr').checked;
  const tasaIsrPct = Number($('tasaIsr').value);
  const vigenciaDias = Number($('vigenciaDias').value) || 15;
  const historialCrudo = esDom ? leerFormularioRecibo().historialDom : leerFormularioRecibo().historialNoDom;
  const historialManual = historialCrudo.filter(v => v != null).map(Number);

  let input;
  if (!esDom) {
    const periodoDias = Number($('periodoDias').value);
    const periodoKwh = Number($('periodoKwh').value);
    const dap = Number($('dap').value);
    const cargos = {
      suministro: Number($('c_suministro').value), distribucion: Number($('c_distribucion').value),
      transmision: Number($('c_transmision').value), cenace: Number($('c_cenace').value),
      capacidad: Number($('c_capacidad').value), scnmem: Number($('c_scnmem').value),
    };
    // GDMTH: Energia va partida en Base/Intermedia/Punta (Punta NO es reducible -- el
    // sol no genera en horario punta, ver motor.js CONCEPTO_PUNTA). Las demas tarifas
    // usan un solo campo "Energia", completamente reducible.
    if (tarifa === 'GDMTH') {
      cargos.energia_base = Number($('c_energia_base').value);
      cargos.energia_intermedia = Number($('c_energia_intermedia').value);
      cargos.energia_punta = Number($('c_energia_punta').value);
    } else {
      cargos.energia = Number($('c_energia').value);
    }
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
      rateKw, btPct, fpBonusPct, moduloWp, cobertura, horasUtiles, costos, escalamientoPct, leido: ultimoLeido, inmueble,
      aplicaIsr, tasaIsrPct, historialManual, vigenciaDias };
  } else {
    const periodoDias = Number($('d_periodoDias').value);
    const periodoKwh = Number($('d_periodoKwh').value);
    const escalones = [
      [Number($('d_basicoKwh').value), Number($('d_basicoRate').value)],
      [Number($('d_interKwh').value), Number($('d_interRate').value)],
      [null, Number($('d_excedRate').value)],
    ];
    input = { titular, domicilio, noServicio, tarifa, esDomestica: true, periodoDias, periodoKwh, escalones,
      dapDomestica: Number($('d_dap').value), moduloWp, cobertura, horasUtiles, costos, escalamientoPct, leido: ultimoLeido, inmueble,
      aplicaIsr, tasaIsrPct, historialManual, vigenciaDias };
  }
  return input;
}

// Compara el formulario AHORA MISMO contra el que produjo ultimoResultado -- si no coinciden,
// el usuario edito algo (tarifa, cargos, inmueble, etc.) despues de calcular y no ha vuelto a
// pulsar "Calcular": lo que ve en pantalla y lo que descargaria en PDF siguen siendo de la
// version anterior. Antes no existia ningun aviso para este caso (solo habia bloqueo para
// "nunca calculaste"). 2026-11-02.
function hayCambiosSinCalcular() {
  if (!ultimoResultado || !ultimoInputJSON) return false;
  try {
    return JSON.stringify(leerInputCalculo()) !== ultimoInputJSON;
  } catch (e) {
    return false; // no bloquear con un falso positivo si la lectura falla a medio-editar
  }
}

function mostrarAvisoCambiosSinCalcular() {
  const el = $('avisoCambiosSinCalcular');
  if (el) el.hidden = false;
}
function ocultarAvisoCambiosSinCalcular() {
  const el = $('avisoCambiosSinCalcular');
  if (el) el.hidden = true;
}
// Delegado en #tabCaptura (solo el formulario de captura, NO las secciones del reporte que se
// insertan debajo -- esas tienen su propio texto editable/toggles que NO requieren recalcular,
// y marcarlas como "cambio sin calcular" habria sido un falso positivo constante).
$('tabCaptura').addEventListener('input', () => { if (hayCambiosSinCalcular()) mostrarAvisoCambiosSinCalcular(); });
$('tabCaptura').addEventListener('change', () => { if (hayCambiosSinCalcular()) mostrarAvisoCambiosSinCalcular(); });
$('btnIrACalcular').addEventListener('click', () => $('btnCalcular').scrollIntoView({ behavior: 'smooth', block: 'center' }));

function calcularYRenderizar() {
  const input = leerInputCalculo();
  const { titular, inmueble } = input;

  const r = construirResultado(input);
  // Snapshot del formulario que se acaba de usar -- si el usuario sigue editando campos
  // despues de este punto sin volver a pulsar "Calcular", hayCambiosSinCalcular() lo detecta
  // comparando contra esto y se muestra un aviso flotante (antes no habia ningun aviso: el
  // PDF/pantalla podian quedarse con numeros de la version anterior del formulario sin que
  // nada lo dijera). 2026-11-02.
  ultimoInputJSON = JSON.stringify(input);
  ocultarAvisoCambiosSinCalcular();
  // Persistir la migracion en proyectoActual (no solo en r) -- antes solo se escribia en r,
  // asi que el PDF (generarPdf lee proyectoActual.seccionesActivas) y onToggleSeccion (tambien
  // lee de proyectoActual) seguian viendo la version SIN migrar: el indice en pantalla
  // mostraba "Documentos"/"Comparativo verificacion" como incluidas (leia r.seccionesActivas)
  // pero el PDF las excluia en silencio. Hallazgo real, 2026-11-02.
  proyectoActual.seccionesActivas = migrarSeccionesActivasBloquesNuevos(proyectoActual.seccionesActivas);
  r.seccionesActivas = proyectoActual.seccionesActivas;
  // seccionesExcluidas (por seccion individual, numeros 1-25) y graficosExcluidos (por
  // grafico/tabla visual dentro de cada seccion) -- mismo patron que seccionesActivas/
  // calculosActivos: se guardan en proyectoActual (persisten por cliente/proyecto) y se
  // copian aqui a `r` para que secciones.js y propuesta.js (pantalla y PDF) lean la misma
  // fuente. Pedido explicito del usuario, 2026-11-05.
  r.seccionesExcluidas = proyectoActual.seccionesExcluidas || [];
  r.graficosExcluidos = proyectoActual.graficosExcluidos || [];
  r.calculosActivos = proyectoActual.calculosActivos || todosLosBloques();
  r.ordenSecciones = proyectoActual.ordenSecciones || null;
  r.textosEditados = proyectoActual.textosEditados || {};
  r.textosOcultos = proyectoActual.textosOcultos || {};
  r.fotoSembrado = proyectoActual.fotoSembrado || null;
  r.fotosInmueble = proyectoActual.fotosInmueble || [];
  r.archivosRecibo = proyectoActual.archivosRecibo || null;
  r.archivosVerificacion = proyectoActual.archivosVerificacion || null;
  // Nota cliente-facing (no solo interna) cuando todavia no hay verificacion en sitio
  // adjunta -- pedido explicito del usuario: decirle al cliente que esta propuesta se
  // calculo SOLO con su recibo, y que falta la visita/verificacion en sitio como
  // siguiente paso (de ahi sale, si se captura, el escenario y comparativo de las
  // secciones 24/25 -- se le avisa que esa comparacion todavia no existe para este caso).
  if (!r.archivosVerificacion || !r.archivosVerificacion.length) {
    r.notas = [
      ...(r.notas || []),
      'Esta cotización se calculó únicamente con base en su consumo real de CFE (su recibo). Pendiente, como ' +
      'siguiente paso: agendar la verificación en sitio (visita técnica) para confirmar el espacio disponible, la ' +
      'instalación eléctrica y las condiciones del inmueble antes de contratar -- hasta que esa visita se realice ' +
      'y se capture aquí, no existe todavía una sección de comparación contra una propuesta basada en la visita.',
    ];
  }
  ultimoResultado = r;

  // Si el proyecto todavia tiene su nombre generico de creacion ("Cotización N"), se
  // renombra solo al titular detectado -- asi la lista de cotizaciones del cliente se
  // identifica sin tener que abrir cada una.
  if (/^Cotización \d+$/.test(proyectoActual.nombre) && titular && titular !== 'Cliente') {
    proyectoActual.nombre = titular;
    $('proyectoNombreBarra').textContent = proyectoActual.nombre;
  }

  proyectoActual.formulario = leerFormulario();
  // Una vez que se logra calcular, los campos que seguian marcados "no detectado" ya
  // fueron confirmados por Isaac (si no, faltantesVisiblesParaCalcular() habria
  // bloqueado este calculo) -- hay que quitarlos de campos_no_encontrados de forma
  // PERMANENTE aqui, no solo en el DOM de esta sesion. Si no se hace esto, cada vez
  // que se reabre el proyecto (otra sesion, otra pestaña, recargar la pagina)
  // marcarCamposNoDetectados() vuelve a leer el mismo campos_no_encontrados original
  // de la lectura del recibo y repinta las mismas marcas naranja para siempre, aunque
  // ya se hayan confirmado y calculado bien una vez -- bug real reportado por el
  // usuario, 2026-11-01 ("no aparece el indice" se repetia sesion tras sesion).
  proyectoActual.campos = sincronizarCamposConfirmados(ultimoLeido);
  proyectoActual.inmueble = inmueble;
  guardarProyecto(clienteActual, proyectoActual);

  renderSecciones(r);
  renderEditorPrecios(r);
  renderFinanciamiento(r);
  renderComparacion();
  $('tabPdf').hidden = false;
  // El sembrador automatico siembra exactamente r.n (el mismo numero ya calculado,
  // nunca un segundo criterio de dimensionamiento aparte) -- se actualiza aqui para que
  // quede al dia si se recalcula con datos distintos mientras esa pestaña esta abierta.
  $('sembradorAutoN').textContent = r.n;
  return r;
}

// ---------------- Editor de precios de materiales (puerto de la seccion "Ajustar
// precios de materiales" de Streamlit) ----------------
// ---------------- Mostrar/ocultar los paneles que NO son una de las 21 secciones
// (editor de precios, financiamiento, comparacion, seguimiento) -- pedido explicito
// del usuario: "las secciones creadas despues del numero 21 no se pueden apagar". No
// son parte del PDF (son herramientas de pantalla), asi que "apagar" aqui es solo
// ocultarlas de la vista si no se necesitan -- se guarda por PROYECTO, igual que
// seccionesActivas.
function panelActivo(nombre) {
  if (!proyectoActual) return true;
  proyectoActual.panelesActivos = proyectoActual.panelesActivos || {};
  return proyectoActual.panelesActivos[nombre] !== false;
}
function conectarTogglePanel(chkId, contenidoId, nombre) {
  $(chkId).addEventListener('change', () => {
    const activo = $(chkId).checked;
    $(contenidoId).hidden = !activo;
    if (proyectoActual) {
      proyectoActual.panelesActivos = proyectoActual.panelesActivos || {};
      proyectoActual.panelesActivos[nombre] = activo;
      guardarProyecto(clienteActual, proyectoActual);
    }
  });
}
function aplicarEstadoPanel(chkId, contenidoId, nombre) {
  const activo = panelActivo(nombre);
  $(chkId).checked = activo;
  $(contenidoId).hidden = !activo;
}
conectarTogglePanel('chkPanelEditorPrecios', 'contenidoEditorPrecios', 'editorPrecios');
conectarTogglePanel('chkPanelFinanciamiento', 'contenidoFinanciamiento', 'financiamiento');
conectarTogglePanel('chkPanelComparacion', 'contenidoComparacion', 'comparacion');
conectarTogglePanel('chkPanelSeguimiento', 'contenidoSeguimiento', 'seguimiento');

function renderEditorPrecios(r) {
  aplicarEstadoPanel('chkPanelEditorPrecios', 'contenidoEditorPrecios', 'editorPrecios');
  $('tabEditorPrecios').hidden = false;
  $('estadoEditorPrecios').textContent = '';
  const tbody = $('filasEditorPrecios');
  tbody.innerHTML = '';
  r.materiales.forEach((m, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${m.partida}</td><td>${m.cantidad.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>` +
      `<td>${m.unidad}</td><td><input type="number" step="0.01" class="input-precio-material" data-idx="${i}" value="${m.importeMxn.toFixed(2)}" /></td>`;
    tbody.append(tr);
  });
}
$('btnRecalcularPrecios').addEventListener('click', () => {
  if (!ultimoResultado) return;
  const nuevosMateriales = ultimoResultado.materiales.map((m, i) => {
    const input = document.querySelector(`.input-precio-material[data-idx="${i}"]`);
    return { ...m, importeMxn: Number(input.value) };
  });
  const aplicaIsr = $('aplicaIsr').checked;
  const tasaIsrPct = Number($('tasaIsr').value);
  const recalculo = recalcularDesdeMateriales(nuevosMateriales, ultimoResultado.ahorroAnual,
    ultimoResultado.escalamientoTarifaPct, aplicaIsr, tasaIsrPct);
  ultimoResultado.materiales = nuevosMateriales;
  Object.assign(ultimoResultado, recalculo);
  if (!aplicaIsr) {
    Object.assign(ultimoResultado, { ahorroFiscalIsr: 0, inversionNetaIsr: recalculo.investment,
      vanNetoIsr: null, tirNetoIsr: null, paybackNetoIsr: null });
  }
  renderSecciones(ultimoResultado);
  renderEditorPrecios(ultimoResultado);
  renderFinanciamiento(ultimoResultado);
  $('estadoEditorPrecios').className = 'nota ok';
  $('estadoEditorPrecios').textContent = 'Recalculado con los precios editados. Genera el PDF de nuevo para que lo incluya.';
});

// ---------------- Simulador de financiamiento (puerto de Streamlit) ----------------
function renderFinanciamiento(r) {
  aplicarEstadoPanel('chkPanelFinanciamiento', 'contenidoFinanciamiento', 'financiamiento');
  $('tabFinanciamiento').hidden = false;
  const enganchePct = Number($('finEnganche').value);
  const tasaPct = Number($('finTasa').value);
  const plazoAnios = Number($('finPlazo').value);
  const montoFinanciado = r.investment * (1 - enganchePct / 100);
  const pagoMensual = pagoMensualCredito(montoFinanciado, tasaPct / 100, plazoAnios);
  const ahorroMensual = r.ahorroAnual / 12;
  $('resultadoFinanciamiento').innerHTML = `
    <div class="metrica"><div class="valor">${M(r.investment * enganchePct / 100)}</div><div class="etiqueta">Enganche</div></div>
    <div class="metrica"><div class="valor">${M(pagoMensual)}</div><div class="etiqueta">Pago mensual del crédito</div></div>
    <div class="metrica"><div class="valor">${M(ahorroMensual)}</div><div class="etiqueta">Ahorro mensual estimado</div></div>`;
  const veredicto = $('veredictoFinanciamiento');
  if (pagoMensual <= ahorroMensual) {
    veredicto.className = 'nota ok';
    veredicto.textContent = `El ahorro mensual estimado (${M(ahorroMensual)}) cubre el pago mensual del crédito ` +
      `(${M(pagoMensual)}) desde el primer mes, con ${M(ahorroMensual - pagoMensual)} de margen -- el sistema se pagaría prácticamente solo.`;
  } else {
    veredicto.className = 'nota aviso';
    veredicto.textContent = `El pago mensual del crédito (${M(pagoMensual)}) sería mayor que el ahorro mensual ` +
      `estimado (${M(ahorroMensual)}) por ${M(pagoMensual - ahorroMensual)} -- con estos supuestos, el cliente pondría dinero extra cada mes mientras dure el crédito.`;
  }
}
['finEnganche', 'finTasa', 'finPlazo'].forEach(id => {
  $(id).addEventListener('input', () => { if (ultimoResultado) renderFinanciamiento(ultimoResultado); });
});

// ---------------- Comparar escenarios (guardado por cliente, no por cotizacion --
// pedido del usuario: "si el cliente duda entre varios tamanos... poder compararlos
// uno junto al otro") ----------------
function renderComparacion() {
  aplicarEstadoPanel('chkPanelComparacion', 'contenidoComparacion', 'comparacion');
  const lista = (clienteActual && clienteActual.escenariosComparacion) || [];
  const tabla = $('tablaComparacion');
  tabla.hidden = !lista.length;
  const tbody = $('filasComparacion');
  tbody.innerHTML = lista.map((e, i) => `<tr>
    <td>${e.etiqueta}</td><td>${e.paneles}</td><td class="num">${e.kwp.toFixed(2)}</td>
    <td class="num">${M(e.inversion)}</td><td class="num">${M(e.ahorroAnual)}</td>
    <td class="num">${PCT(e.pctAhorro)}</td><td class="num">${e.payback ? e.payback.toFixed(1) + ' años' : 'N/D'}</td>
    <td class="num">${e.van != null ? M(e.van) : 'N/D'}</td><td class="num">${e.tir != null ? PCT(e.tir) : 'N/D'}</td>
  </tr>`).join('');
}
$('btnAgregarComparacion').addEventListener('click', () => {
  if (!ultimoResultado || !clienteActual) return;
  const r = ultimoResultado;
  clienteActual.escenariosComparacion = clienteActual.escenariosComparacion || [];
  clienteActual.escenariosComparacion.push({
    etiqueta: `${proyectoActual.nombre} (${new Date().toLocaleDateString('es-MX')})`,
    paneles: r.n, kwp: r.kwp, inversion: r.investment, ahorroAnual: r.ahorroAnual,
    pctAhorro: r.pctAhorro, payback: r.payback, van: r.van, tir: r.tir,
  });
  guardarCliente(clienteActual);
  renderComparacion();
  $('estadoComparacion').className = 'nota ok';
  $('estadoComparacion').textContent = `Agregado. Llevas ${clienteActual.escenariosComparacion.length} escenario(s) guardados para este cliente.`;
});
$('btnLimpiarComparacion').addEventListener('click', () => {
  if (!clienteActual) return;
  if (!confirm('¿Borrar todos los escenarios guardados en la comparación de este cliente? No se puede deshacer.')) return;
  clienteActual.escenariosComparacion = [];
  guardarCliente(clienteActual);
  renderComparacion();
  $('estadoComparacion').textContent = '';
});

// ---------------- Seguimiento tipo CRM (etapa + notas por cotizacion) ----------------
function renderNotasSeguimiento() {
  const notas = (proyectoActual && proyectoActual.notasSeguimiento) || [];
  $('listaNotasSeguimiento').innerHTML = notas.slice().reverse().map(n => `
    <div class="nota-seguimiento"><span class="nota-fecha">${new Date(n.fecha).toLocaleString('es-MX')}</span>${escapeHtml(n.texto)}</div>
  `).join('') || '<p class="nota">Sin notas de seguimiento todavía.</p>';
}
$('etapaProyecto').addEventListener('change', () => {
  if (!proyectoActual) return;
  proyectoActual.etapa = $('etapaProyecto').value;
  guardarProyecto(clienteActual, proyectoActual);
});
$('btnAgregarNotaSeguimiento').addEventListener('click', () => {
  const texto = $('nuevaNotaSeguimiento').value.trim();
  if (!texto || !proyectoActual) return;
  proyectoActual.notasSeguimiento = proyectoActual.notasSeguimiento || [];
  proyectoActual.notasSeguimiento.push({ fecha: new Date().toISOString(), texto });
  guardarProyecto(clienteActual, proyectoActual);
  $('nuevaNotaSeguimiento').value = '';
  renderNotasSeguimiento();
});

// ---------------- 21 secciones: render + navegacion ----------------
// Apaga/prende UNA seccion individual (numero 1-25), no el bloque completo -- pedido
// explicito del usuario, 2026-11-05: "todo todo, secciones... se puedan apagar".
// r.seccionesExcluidas guarda numeros de seccion excluidos DENTRO de un bloque que
// sigue activo. Encender una seccion individual tambien enciende su bloque si estaba
// apagado (si no, el checkbox se veria "prendido" sin que la seccion de verdad
// aparezca) -- apagar una seccion individual NO toca el bloque, solo resta esa seccion.
function onToggleSeccion(numero, activo) {
  const bloque = bloqueDeSeccion(numero);
  const excl = new Set(proyectoActual.seccionesExcluidas || []);
  if (activo) {
    excl.delete(numero);
    const setBloques = new Set(proyectoActual.seccionesActivas);
    setBloques.add(bloque);
    proyectoActual.seccionesActivas = [...setBloques];
  } else {
    excl.add(numero);
  }
  proyectoActual.seccionesExcluidas = [...excl];
  guardarProyecto(clienteActual, proyectoActual);
  if (ultimoResultado) {
    ultimoResultado.seccionesActivas = proyectoActual.seccionesActivas;
    ultimoResultado.seccionesExcluidas = proyectoActual.seccionesExcluidas;
    renderSecciones(ultimoResultado);
  }
}

// Atajo de "bloques rapidos" del indice (ver renderIndice) -- prende/apaga TODAS las
// secciones de un bloque de una sola vez, sin tener que entrar a cada una. Prender
// limpia tambien las exclusiones individuales de esas secciones (si no, "prender todo
// el bloque" podria parecer que no hizo nada si alguna seccion seguia excluida a
// mano). Apagar el bloque no toca seccionesExcluidas -- ya basta con que el bloque
// este apagado, y asi si se vuelve a prender el bloque despues, las exclusiones
// individuales que el usuario puso a mano antes de apagar el bloque se conservan.
function onToggleBloqueCompleto(bloque, activo) {
  const setBloques = new Set(proyectoActual.seccionesActivas);
  if (activo) {
    setBloques.add(bloque);
    const excl = new Set(proyectoActual.seccionesExcluidas || []);
    seccionesDelBloque(bloque).forEach((n) => excl.delete(n));
    proyectoActual.seccionesExcluidas = [...excl];
  } else {
    setBloques.delete(bloque);
  }
  proyectoActual.seccionesActivas = [...setBloques];
  guardarProyecto(clienteActual, proyectoActual);
  if (ultimoResultado) {
    ultimoResultado.seccionesActivas = proyectoActual.seccionesActivas;
    ultimoResultado.seccionesExcluidas = proyectoActual.seccionesExcluidas;
    renderSecciones(ultimoResultado);
  }
}

// Apaga/prende UN grafico o tabla visual dentro de una seccion (independiente del
// toggle de la seccion completa y del de "Como se calculo") -- pedido explicito del
// usuario, 2026-11-05. Mismo patron que onToggleCalculo. El mismo id se lee tambien
// en propuesta.js (generarPdf), asi que apagar un grafico aqui lo quita del PDF
// tambien, sin ningun paso extra.
function onToggleGrafico(id, activo) {
  const set = new Set(proyectoActual.graficosExcluidos || []);
  if (activo) set.delete(id); else set.add(id);
  proyectoActual.graficosExcluidos = [...set];
  guardarProyecto(clienteActual, proyectoActual);
  if (ultimoResultado) { ultimoResultado.graficosExcluidos = proyectoActual.graficosExcluidos; renderSecciones(ultimoResultado); }
}

// Reordenar secciones a mano -- pedido explicito del usuario ("permite arrastrar las
// secciones"). Se implementa con botones ↑/↓ en vez de arrastrar con el mouse: mas
// confiable en touch/trackpad y no depende de soportar drag-and-drop real, con el
// mismo resultado para quien lo usa. Mueve el numero `numero` un lugar en la direccion
// indicada DENTRO del orden visible actual (ordenSeccionesEfectivo), y guarda el
// resultado completo en el proyecto como `ordenSecciones` para que sobreviva recargas.
function onMoverSeccion(numero, direccion) {
  if (!ultimoResultado) return;
  const orden = ordenSeccionesEfectivo(ultimoResultado);
  const pos = orden.indexOf(numero);
  const destino = pos + direccion;
  if (pos < 0 || destino < 0 || destino >= orden.length) return;
  [orden[pos], orden[destino]] = [orden[destino], orden[pos]];
  proyectoActual.ordenSecciones = orden;
  guardarProyecto(clienteActual, proyectoActual);
  ultimoResultado.ordenSecciones = orden;
  renderSecciones(ultimoResultado);
}

// "Cómo se calculó" -- bloque de formulas/cargos/tarifa dentro de cada seccion,
// independiente del toggle de "incluir esta seccion" (onToggleSeccion arriba). Pedido
// explicito del usuario: deben poder apagarse aparte, para que al generar la
// cotizacion que se le manda al cliente solo entren las que el decida dejar
// encendidas -- mismo patron que seccionesActivas, estado paralelo propio.
function onToggleCalculo(bloque, activo) {
  const set = new Set(proyectoActual.calculosActivos || todosLosBloques());
  if (activo) set.add(bloque); else set.delete(bloque);
  proyectoActual.calculosActivos = [...set];
  guardarProyecto(clienteActual, proyectoActual);
  if (ultimoResultado) { ultimoResultado.calculosActivos = proyectoActual.calculosActivos; renderSecciones(ultimoResultado); }
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

// Predeterminado GLOBAL de un texto -- aplica a TODAS las cotizaciones, no solo a
// este cliente (ver textosGlobales.js) -- pedido explicito del usuario: poder
// cambiar la redaccion de la app el mismo, sin pedirmelo por codigo.
function onGuardarTextoGlobal(id, texto, textoDefecto) {
  const limpio = (texto || '').trim();
  if (!limpio || limpio === (textoDefecto || '').trim()) { quitarTextoGlobal(id); } else { guardarTextoGlobal(id, texto); }
  if (ultimoResultado) renderSecciones(ultimoResultado);
}

function onQuitarTextoGlobal(id) {
  quitarTextoGlobal(id);
  if (ultimoResultado) renderSecciones(ultimoResultado);
}

// Apagar/prender UN parrafo suelto sin borrar su texto -- mismo patron que
// onToggleCalculo pero a nivel de parrafo (pedido explicito del usuario, 2026-11-02).
// Override de ESTE proyecto/cliente nada mas (no hay version global de esto, a
// diferencia del texto -- apagar un parrafo es una decision por cotizacion, no algo
// que tenga sentido heredar a clientes futuros).
function onOcultarTexto(id, oculto) {
  proyectoActual.textosOcultos = proyectoActual.textosOcultos || {};
  if (oculto) proyectoActual.textosOcultos[id] = true; else delete proyectoActual.textosOcultos[id];
  guardarProyecto(clienteActual, proyectoActual);
  if (ultimoResultado) {
    ultimoResultado.textosOcultos = proyectoActual.textosOcultos;
    renderSecciones(ultimoResultado);
  }
}

// anteriorN/siguienteN: numero de la seccion REALMENTE renderizada antes/despues de
// esta (no simplemente n-1/n+1) -- secciones sin datos (23/24/25 sin verificacion en
// sitio, ver seccionTieneDatos en secciones.js) ni siquiera se renderizan, así que
// apuntar a n±1 a ciegas podria mandar a un id que no existe en el DOM.
function agregarNavegacionSeccion(art, anteriorN, siguienteN) {
  const nav = document.createElement('div');
  nav.className = 'seccion-nav';
  const anterior = document.createElement('button');
  anterior.className = 'btn-link';
  anterior.textContent = '← Anterior';
  anterior.hidden = anteriorN == null;
  if (anteriorN != null) anterior.addEventListener('click', () => document.getElementById(`seccion-${anteriorN}`).scrollIntoView({ behavior: 'smooth', block: 'start' }));
  const siguiente = document.createElement('button');
  siguiente.className = 'btn-link';
  siguiente.textContent = 'Siguiente →';
  siguiente.hidden = siguienteN == null;
  if (siguienteN != null) siguiente.addEventListener('click', () => document.getElementById(`seccion-${siguienteN}`).scrollIntoView({ behavior: 'smooth', block: 'start' }));
  nav.append(anterior, siguiente);
  art.append(nav);
}

function renderSecciones(r) {
  const cont = $('contenedorSecciones');
  cont.innerHTML = '';
  $('ayudaEdicion').hidden = false;
  const numeros = ordenSeccionesEfectivo(r).filter(n => seccionTieneDatos(n, r));
  numeros.forEach((n, i) => {
    const art = renderSeccion(n, r, ultimoLeido, onToggleSeccion, onEditarTexto, onToggleCalculo, onGuardarTextoGlobal, onQuitarTextoGlobal, onOcultarTexto, onToggleGrafico);
    agregarNavegacionSeccion(art, numeros[i - 1] ?? null, numeros[i + 1] ?? null);
    cont.append(art);
  });
  renderIndice(r);
  renderPlantillasTarifa(r);
  observarSecciones();
}

// Plantilla final revisada POR TARIFA (GDMTO/GDMTH/GDBT/PDBT/01/DAC) -- pedido
// explicito del usuario, 2026-11-05: "al final poder guardar como formato final
// revisado para ya así hacer todas las cotizaciones, aunque puede variar por
// tarifa se va a ir guardando y corrigiendo y eliminando por tarifa". Guarda/
// reemplaza TODO proyecto.textosEditados de la cotizacion abierta como el
// snapshot completo de esa tarifa (ver nota de diseño en textosGlobales.js) --
// solo se puede guardar/actualizar la plantilla de la MISMA tarifa del proyecto
// que se esta viendo (no tendria sentido guardar texto de GDMTO como plantilla
// de GDMTH). Las otras 5 tarifas se listan de solo lectura + boton de eliminar.
function renderPlantillasTarifa(r) {
  const cont = $('plantillasLista');
  cont.innerHTML = '';
  const resumen = resumenPlantillasPorTarifa();
  const nEditados = Object.keys(proyectoActual.textosEditados || {}).length;
  for (const tarifa of TARIFAS_PLANTILLA) {
    const esTarifaActual = tarifa === r.tarifa;
    const n = resumen[tarifa];
    const fila = document.createElement('div');
    fila.className = 'indice-fila fila-plantilla-tarifa' + (esTarifaActual ? ' fila-plantilla-tarifa-actual' : '');
    const etiqueta = document.createElement('span');
    etiqueta.className = 'indice-item';
    etiqueta.textContent = `${esTarifaActual ? '➡ ' : ''}${tarifa}: ${n ? `${n} texto(s)/tabla(s) guardados` : 'sin plantilla todavía'}`;
    fila.append(etiqueta);
    if (esTarifaActual) {
      const btnGuardar = document.createElement('button');
      btnGuardar.type = 'button';
      btnGuardar.className = 'btn-bloque-rapido';
      btnGuardar.textContent = n ? '💾 Actualizar con este proyecto' : '💾 Guardar este proyecto como plantilla';
      btnGuardar.disabled = nEditados === 0;
      btnGuardar.title = nEditados === 0
        ? 'Este proyecto todavía no tiene ningún texto/tabla editado -- edita lo que quieras corregir primero.'
        : `Reemplaza la plantilla de ${tarifa} con los ${nEditados} texto(s)/tabla(s) editados de ESTE proyecto.`;
      btnGuardar.addEventListener('click', () => onGuardarPlantillaTarifa(tarifa));
      fila.append(btnGuardar);
    }
    if (n) {
      const btnEliminar = document.createElement('button');
      btnEliminar.type = 'button';
      btnEliminar.className = 'btn-bloque-rapido';
      btnEliminar.textContent = '🗑️ Eliminar plantilla';
      btnEliminar.addEventListener('click', () => onEliminarPlantillaTarifa(tarifa));
      fila.append(btnEliminar);
    }
    cont.append(fila);
  }
  const nota = document.createElement('p');
  nota.className = 'nota';
  nota.textContent = 'Una cotización nueva de una tarifa con plantilla guardada arranca con esos textos/tablas en vez de los de fábrica -- editar algo en un proyecto específico siempre gana sobre la plantilla.';
  cont.append(nota);
}

function onGuardarPlantillaTarifa(tarifa) {
  guardarPlantillaTarifa(tarifa, proyectoActual.textosEditados || {});
  if (ultimoResultado) renderSecciones(ultimoResultado);
}

function onEliminarPlantillaTarifa(tarifa) {
  eliminarPlantillaTarifa(tarifa);
  if (ultimoResultado) renderSecciones(ultimoResultado);
}

$('btnTogglePlantillas').addEventListener('click', () => $('plantillasTarifa').classList.toggle('indice-abierto'));

// Indice de las 21 secciones con un checkbox de "incluir" por cada una (ademas del
// link para saltar a esa seccion) -- pedido explicito del usuario: poder apagar las
// secciones que no va a presentar desde un solo lugar, sin tener que bajar hasta cada
// seccion a buscar su propio toggle. El checkbox controla el MISMO estado
// (seccionesExcluidas, numero de seccion) que el toggle de cada seccion individual
// (toggleSeccionIndividual en secciones.js) -- son dos controles para el mismo
// interruptor, no un estado aparte, así que siempre quedan sincronizados.
// Ademas de la lista por seccion, un control de "bloques rapidos" arriba permite
// prender/apagar VARIAS secciones de un bloque de una sola vez (onToggleBloqueCompleto)
// -- pedido explicito del usuario, 2026-11-05, para no tener que entrar una por una
// cuando de verdad se quiere apagar un bloque completo.
function renderBloquesRapidos(cont, r) {
  const fila = document.createElement('div');
  fila.className = 'indice-bloques-rapidos';
  const select = document.createElement('select');
  select.className = 'select-bloque-rapido';
  BLOQUES_COTIZACION.filter(([clave]) => clave !== 'resumen').forEach(([clave, etiqueta]) => {
    const opt = document.createElement('option');
    opt.value = clave;
    opt.textContent = etiqueta;
    select.append(opt);
  });
  const btnApagar = document.createElement('button');
  btnApagar.type = 'button';
  btnApagar.className = 'btn-bloque-rapido';
  btnApagar.textContent = 'Apagar bloque completo';
  btnApagar.addEventListener('click', () => onToggleBloqueCompleto(select.value, false));
  const btnPrender = document.createElement('button');
  btnPrender.type = 'button';
  btnPrender.className = 'btn-bloque-rapido';
  btnPrender.textContent = 'Prender bloque completo';
  btnPrender.addEventListener('click', () => onToggleBloqueCompleto(select.value, true));
  fila.append(select, btnPrender, btnApagar);
  cont.append(fila);
}

function renderIndice(r) {
  const cont = $('indiceLista');
  cont.innerHTML = '';
  if (!r) {
    cont.innerHTML = '<p class="nota">Calcula primero (sección "Datos y recibo") para ver el índice de secciones.</p>';
    return;
  }
  renderBloquesRapidos(cont, r);
  const activos = seccionesActivasEnOrden(r);
  const orden = ordenSeccionesEfectivo(r).filter(n => seccionTieneDatos(n, r));
  orden.forEach((n, i) => {
    const titulo = TITULOS_SECCIONES[n - 1];
    const bloque = bloqueDeSeccion(n);
    const bloqueEtiqueta = (BLOQUES_COTIZACION.find(([clave]) => clave === bloque) || [, bloque])[1];
    const pos = activos.indexOf(n) + 1;
    const activo = pos > 0;
    const fila = document.createElement('div');
    fila.className = 'indice-fila' + (activo ? '' : ' indice-item-apagado');
    const check = document.createElement('input');
    check.type = 'checkbox';
    // Reflejar el estado REAL (bloque activo Y no excluida individualmente), no solo
    // el override individual -- si no, un bloque apagado via "bloques rapidos" dejaba
    // el checkbox de cada seccion marcado pese a decir "(desactivada)" al lado,
    // confuso visualmente (encontrado probando en navegador, 2026-11-05). Clic en un
    // checkbox desmarcado-por-bloque-apagado prende esa seccion Y su bloque (ver
    // onToggleSeccion); clic en uno marcado la excluye sin tocar el bloque.
    check.checked = activo;
    check.disabled = bloque === 'resumen';
    check.title = bloque === 'resumen' ? 'Siempre incluida' : `Incluir en la cotización final (pantalla y PDF) — bloque: ${bloqueEtiqueta}`;
    check.addEventListener('change', () => onToggleSeccion(n, check.checked));
    fila.append(check);
    // Botones de mover arriba/abajo -- pedido explicito del usuario ("permite
    // arrastrar las secciones"), implementado como flechas en vez de arrastre real
    // del mouse: mismo resultado, mas confiable en cualquier dispositivo/navegador.
    const subir = document.createElement('button');
    subir.type = 'button'; subir.className = 'btn-mover-seccion'; subir.textContent = '↑';
    subir.title = 'Mover esta sección hacia arriba';
    subir.disabled = i === 0;
    subir.addEventListener('click', () => onMoverSeccion(n, -1));
    const bajar = document.createElement('button');
    bajar.type = 'button'; bajar.className = 'btn-mover-seccion'; bajar.textContent = '↓';
    bajar.title = 'Mover esta sección hacia abajo';
    bajar.disabled = i === orden.length - 1;
    bajar.addEventListener('click', () => onMoverSeccion(n, 1));
    fila.append(subir, bajar);
    const a = document.createElement('a');
    a.href = `#seccion-${n}`;
    a.className = 'indice-item';
    a.textContent = activo ? `${String(pos).padStart(2, '0')}. ${titulo}` : `—. ${titulo} (desactivada)`;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById(`seccion-${n}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('indiceSecciones').classList.remove('indice-abierto');
    });
    fila.append(a);
    cont.append(fila);
  });
  // Boton de guardado explicito del orden de secciones -- aunque onMoverSeccion ya
  // guarda solo en cada movimiento (guardarProyecto), el usuario pidio ademas un
  // boton visible para confirmar que ese orden quedo guardado para ESTE
  // cliente/proyecto (2026-11-01), no solo en memoria de la pestaña abierta.
  const pie = document.createElement('div');
  pie.className = 'indice-pie';
  const btnGuardar = document.createElement('button');
  btnGuardar.type = 'button';
  btnGuardar.className = 'btn-guardar-orden-secciones';
  btnGuardar.textContent = '💾 Guardar este orden para este cliente/proyecto';
  const estadoGuardado = document.createElement('span');
  estadoGuardado.className = 'indice-pie-estado';
  btnGuardar.addEventListener('click', () => {
    if (!clienteActual || !proyectoActual) return;
    proyectoActual.ordenSecciones = orden;
    r.ordenSecciones = orden;
    guardarProyecto(clienteActual, proyectoActual);
    const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    estadoGuardado.textContent = `✓ Guardado para "${proyectoActual.nombre}" (${clienteActual.nombre}) a las ${hora}`;
  });
  pie.append(btnGuardar, estadoGuardado);
  cont.append(pie);
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

// Confirma antes de exportar si el formulario tiene cambios desde el ultimo "Calcular" -- sin
// esto, el PDF salia silenciosamente con los numeros de ANTES de esos cambios (el unico
// guardia que existia era "nunca calculaste", no "calculaste y luego cambiaste algo"). 2026-11-02.
function confirmarSiHayCambiosSinCalcular() {
  if (!hayCambiosSinCalcular()) return true;
  return confirm('Hiciste cambios en el formulario después de la última vez que calculaste -- este PDF saldría con ' +
    'los datos de ANTES de esos cambios. ¿Generar de todos modos?\n\n(Cancelar para volver y presionar "Calcular" primero)');
}

// La edicion de texto en pantalla (textoEditable en secciones.js) NO se refleja en el
// PDF -- propuesta.js arma sus propios parrafos fijos, independientes de
// proyecto.textosEditados (ver ESTADO.md: conectar las dos fuentes es un trabajo
// aparte, con riesgo real de desalinear texto entre las 22+ paginas del generador, no
// hecho todavia). Antes esto solo quedaba documentado en ESTADO.md -- nadie que
// generara un PDF se enteraba de que sus ediciones no iban a salir ahi. Se avisa aqui,
// en el momento en que de verdad importa, en vez de dejarlo como una nota enterrada.
function confirmarSiHayTextoEditadoSinReflejarEnPdf() {
  const n = Object.keys(proyectoActual.textosEditados || {}).length;
  if (!n) return true;
  return confirm(`Editaste ${n} párrafo(s)/aviso(s) en pantalla para esta cotización -- el PDF todavía NO incluye ` +
    'esas ediciones (sigue usando el texto original de la app). ¿Generar el PDF de todos modos?\n\n(Cancelar para revisar primero qué se editó)');
}

$('btnGenerarPdf').addEventListener('click', () => {
  if (!ultimoResultado) { alert('Calcula primero.'); return; }
  if (!confirmarSiHayCambiosSinCalcular()) return;
  if (!confirmarSiHayTextoEditadoSinReflejarEnPdf()) return;
  const doc = generarPdf(ultimoResultado, { secciones: proyectoActual.seccionesActivas, seccionesExcluidas: proyectoActual.seccionesExcluidas });
  mostrarPdfEnVisor(doc, nombreArchivoProyecto('Cotizacion'));
});

$('btnResumenEjecutivo').addEventListener('click', () => {
  if (!ultimoResultado) { alert('Calcula primero.'); return; }
  if (!confirmarSiHayCambiosSinCalcular()) return;
  const doc = generarResumenEjecutivo(ultimoResultado);
  mostrarPdfEnVisor(doc, nombreArchivoProyecto('Resumen_ejecutivo'));
});

$('btnAnexoInterconexion').addEventListener('click', () => {
  if (!ultimoResultado) { alert('Calcula primero.'); return; }
  if (!confirmarSiHayCambiosSinCalcular()) return;
  const doc = generarAnexoInterconexion(ultimoResultado);
  mostrarPdfEnVisor(doc, nombreArchivoProyecto('Anexo_interconexion_CFE'));
});

// Dos versiones mas cortas de la MISMA cotizacion completa (mismo formato de 24/25
// secciones, no un resumen aparte) -- pedido explicito del usuario, 2026-11-03: "un
// poco mas cortas para que las entienda mas el cliente". Usan el mismo generarPdf()
// de la "Cotizacion completa", solo con un subconjunto fijo de bloques distinto al que
// el usuario haya activado/desactivado a mano (BLOQUES_SECCIONES_9/14, ver bloques.js)
// -- no tocan proyectoActual.seccionesActivas, son generaciones puntuales aparte.
$('btnCotizacion9').addEventListener('click', () => {
  if (!ultimoResultado) { alert('Calcula primero.'); return; }
  if (!confirmarSiHayCambiosSinCalcular()) return;
  if (!confirmarSiHayTextoEditadoSinReflejarEnPdf()) return;
  const doc = generarPdf(ultimoResultado, { secciones: BLOQUES_SECCIONES_9 });
  mostrarPdfEnVisor(doc, nombreArchivoProyecto('Cotizacion_corta_9_secciones'));
});

$('btnCotizacion14').addEventListener('click', () => {
  if (!ultimoResultado) { alert('Calcula primero.'); return; }
  if (!confirmarSiHayCambiosSinCalcular()) return;
  if (!confirmarSiHayTextoEditadoSinReflejarEnPdf()) return;
  const doc = generarPdf(ultimoResultado, { secciones: BLOQUES_SECCIONES_14 });
  mostrarPdfEnVisor(doc, nombreArchivoProyecto('Cotizacion_media_14_secciones'));
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
  if (!confirmarSiHayCambiosSinCalcular()) return;
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

// ---------------- Actualizar (topbar, visible en toda la app) ----------------
// Antes era "Refrescar" y solo volvia a renderizar con lo que ya estaba en memoria --
// si se subia un recibo/verificacion/envio nuevo desde otro lado (otra pestaña, un
// cliente via cliente.html, "Traer de la nube") no se reflejaba hasta recargar la
// pagina a mano. Ahora "Actualizar" vuelve a LEER de localStorage/Supabase (no solo
// re-pintar lo ya cargado) y ademas revisa si hay una version nueva de la app
// desplegada -- pedido explicito del usuario, 2026-11-01: "tanto a la aplicacion como
// a los proyectos y cotizaciones... si les subo algo nuevo tiene que actualizarse".
$('btnRefrescar').addEventListener('click', () => {
  if (!$('pantallaClientes').hidden) {
    renderListaClientes();
  } else if (!$('pantallaEnvios').hidden) {
    renderListaEnvios();
  } else if (!$('pantallaProyectos').hidden) {
    renderListaProyectos();
  } else if (!$('pantallaCliente').hidden && clienteActual && proyectoActual) {
    // Re-abre el MISMO cliente/proyecto releyendolo de localStorage (no solo
    // recalcula con los valores que ya estaban en el formulario) -- asi si algo
    // externo cambio el proyecto guardado (otra pestaña, nube) se refleja.
    try {
      abrirProyecto(clienteActual.id, proyectoActual.id);
      $('estadoCalculo').className = 'nota ok';
      $('estadoCalculo').textContent = 'Actualizado con los datos guardados más recientes.';
    } catch (e) {
      $('estadoCalculo').className = 'nota aviso';
      $('estadoCalculo').textContent = 'Error al actualizar: ' + e.message;
    }
  }
  revisarVersionNuevaApp();
});

// Revisa en segundo plano si hay una version nueva de la app ya desplegada. El propio
// service-worker.js ya activa cualquier version nueva sola (self.skipWaiting() +
// self.clients.claim(), sin esperar a que se cierren las pestañas viejas) -- aqui solo
// se fuerza la revision inmediata (reg.update(), en vez de esperar a que el navegador
// la haga por su cuenta cada ~24h) y se escucha cuando esa version toma el control
// para recargar sola, guardando antes el formulario de captura actual si hay uno
// abierto para no perder lo escrito.
let yaEscuchandoControllerChange = false;
async function revisarVersionNuevaApp() {
  if (!('serviceWorker' in navigator)) return;
  if (!yaEscuchandoControllerChange) {
    yaEscuchandoControllerChange = true;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!$('pantallaCliente').hidden && clienteActual && proyectoActual) {
        try { proyectoActual.formulario = leerFormulario(); guardarProyecto(clienteActual, proyectoActual); } catch (e) {}
      }
      location.reload();
    });
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.update();
  } catch (e) { /* revision en segundo plano, sin interrumpir al usuario si falla */ }
}

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
