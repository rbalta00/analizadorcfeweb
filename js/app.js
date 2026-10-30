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
import { ErrorDeClasificacion, COSTOS_RESIDENCIAL, COSTOS_COMERCIAL, recalcularDesdeMateriales, pagoMensualCredito } from './motor.js';
import { todosLosBloques, bloqueDeSeccion } from './bloques.js';
import { M, PCT } from './util.js';
import {
  TARIFAS_SOPORTADAS, esDomestica, conectarEventosFormularioRecibo,
  leerFormularioRecibo, aplicarFormularioRecibo, llenarFormularioDesdeReciboCampos,
} from './formularioRecibo.js';
import { supabaseListar, supabaseActualizar, supabaseEliminar } from './supabase.js';

window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

const $ = (id) => document.getElementById(id);
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
  clienteActual = null; proyectoActual = null; ultimoResultado = null; ultimoLeido = null;
  renderListaClientes();
}

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
  $('pantallaEnvios').hidden = true;
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
  renderIndice(null);
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
const ETIQUETA_CAMPO = {
  tarifa: 'Tarifa', periodoDias: 'Días del período', periodoKwh: 'kWh del período', dap: 'DAP',
  c_suministro: 'Suministro', c_distribucion: 'Distribución', c_transmision: 'Transmisión',
  c_cenace: 'CENACE', c_energia: 'Energía', c_capacidad: 'Capacidad', c_scnmem: 'SCnMEM',
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
}
$('tabCaptura').addEventListener('input', (e) => {
  if (e.target.classList && e.target.classList.contains('campo-no-detectado')) {
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
  const tarifaOk = campos.tarifa && TARIFAS_SOPORTADAS.has(campos.tarifa);
  const faltan = tarifaOk ? faltantesVisiblesParaCalcular() : [{ id: 'tarifa', label: ETIQUETA_CAMPO.tarifa }];
  if (!faltan.length) {
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
  $('estadoCalculo').className = 'nota aviso';
  $('estadoCalculo').textContent = 'No se calculó automáticamente: faltan datos marcados en naranja arriba (' +
    faltan.map(f => f.label).join(', ') + '). Complétalos a mano y pulsa "Calcular".';
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

  let input;
  if (!esDom) {
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
      rateKw, btPct, fpBonusPct, moduloWp, cobertura, horasUtiles, costos, escalamientoPct, leido: ultimoLeido, inmueble,
      aplicaIsr, tasaIsrPct };
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
      aplicaIsr, tasaIsrPct };
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
  renderEditorPrecios(r);
  renderFinanciamiento(r);
  $('tabPdf').hidden = false;
  return r;
}

// ---------------- Editor de precios de materiales (puerto de la seccion "Ajustar
// precios de materiales" de Streamlit) ----------------
function renderEditorPrecios(r) {
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
  } else if (!$('pantallaEnvios').hidden) {
    renderListaEnvios();
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
