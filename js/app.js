// Orquestacion de la app: Clientes (agrupados gobierno/particular) -> Cotizaciones de
// ese cliente (puede tener varias) -> captura de datos/recibo de una cotizacion -> 21
// secciones navegables -> exportar PDF / WhatsApp. Toda la logica de calculo vive en
// resultado.js/motor.js; este archivo solo lee/escribe el DOM y el almacenamiento.
import {
  obtenerCliente, crearCliente, guardarCliente, eliminarCliente, clientesAgrupadosPorTipo, tiposClienteUsados, listarClientes,
  recuperarTextosEditadosOrfanados,
  listarProyectos, obtenerProyecto, crearProyecto, guardarProyecto, eliminarProyecto, moverProyecto, alGuardar,
  aplicarMachoteAProyecto, clonarProyectoCongelado, crearProyectoDesdeOrigen, detectarTextosConNumerosSospechosos,
  desbloquearProyecto, bloquearProyecto,
  asegurarPasos, sincronizarPasoActivoDesdeFlat, aplicarPaso, crearPasoDesdeActual, renombrarPaso, eliminarPaso,
} from './clientes.js';
import { renderSeccion, TITULOS_SECCIONES, seccionesActivasEnOrden, seccionTieneDatos, ordenSeccionesEfectivo } from './secciones.js';
import { guardarTextoGlobal, quitarTextoGlobal, TARIFAS_PLANTILLA, resumenPlantillasPorTarifa, guardarPlantillaTarifa, eliminarPlantillaTarifa } from './textosGlobales.js';
import { construirResultado } from './resultado.js';
import { generarPdf, generarPdfCompletaDesdeVista } from './propuesta.js';
import { descargarExcelCotizacion } from './excel.js';
import { generarGuiaPresentacion } from './resumen.js';
import { leerReciboMultiple } from './leerRecibo.js';
import { archivoAImagenComprimida } from './imagenes.js';
import { ErrorDeClasificacion, COSTOS_RESIDENCIAL, COSTOS_COMERCIAL, escalaCostosParaTarifa, recalcularDesdeMateriales, pagoMensualCredito } from './motor.js';
import { todosLosBloques, bloqueDeSeccion, seccionesDelBloque, BLOQUES_COTIZACION } from './bloques.js';
import { M, PCT } from './util.js';
import {
  TARIFAS_SOPORTADAS, esDomestica, conectarEventosFormularioRecibo,
  leerFormularioRecibo, aplicarFormularioRecibo, llenarFormularioDesdeReciboCampos,
} from './formularioRecibo.js';
import {
  SUPABASE_URL, supabaseListar, supabaseActualizar, supabaseEliminar, supabaseSubirArchivo,
  supabaseEliminarArchivo, supabaseListarArchivos, supabaseUpsertar, supabaseEliminarPorFiltro,
} from './supabase.js';
import { subirANube, bajarDeNube, eliminarClienteDeNube, listarClientesEnNube } from './nube.js';
import { panelesEnTecho, esquinasDelTecho, crearEditorPaneles, hornearImagenSembrado, PANEL_ANCHO_M, PANEL_ALTO_M } from './sembrador.js';

window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

const $ = (id) => document.getElementById(id);
// Numero de WhatsApp al que apunta "Enviar por WhatsApp" (dado por el usuario). 52 =
// Mexico; WhatsApp no permite adjuntar archivos desde un enlace wa.me, solo texto.
const WHATSAPP_NUMERO = '522218367792';

// Aviso visible de guardado fallido -- UN SOLO hook (alGuardar, clientes.js) que se
// entera del resultado de CADA guardado real a localStorage, venga de donde venga
// (guardarCliente/guardarProyecto, pero tambien crearCliente/crearProyecto/
// eliminarCliente/eliminarProyecto, que escriben directo) -- asi no hace falta que
// cada uno de los 36+ call sites de este archivo revise el valor de retorno por su
// cuenta, y el aviso se oculta solo en cuanto CUALQUIER guardado posterior tenga
// exito, sin importar por que funcion haya pasado. Bug real reportado por el usuario,
// 2026-11-05 (de una auditoria de scripts aparte): antes un guardado fallido solo
// quedaba en consola (console.error dentro de guardarTodos) -- el admin podia editar
// toda una cotizacion, creer que el autoguardado de cada calculo funciono, y perderlo
// todo sin ver jamas un error. Tambien afectaba "Guardar copia en la nube" (nube.js),
// que sube lo que haya en localStorage en ese momento -- si el guardado local ya habia
// fallado en silencio, el respaldo en la nube salia incompleto sin que nadie se
// enterara. No se resuelve el limite real de 5-10MB de localStorage (eso es una
// limitacion del navegador, no de esta app) -- solo que el fallo deje de ser silencioso
// y el admin pueda actuar (borrar fotos/archivos viejos).
function mostrarAvisoErrorGuardado() {
  const el = $('avisoErrorGuardado');
  if (el) el.hidden = false;
}
function ocultarAvisoErrorGuardado() {
  const el = $('avisoErrorGuardado');
  if (el) el.hidden = true;
}
alGuardar((ok) => (ok ? ocultarAvisoErrorGuardado() : mostrarAvisoErrorGuardado()));

let clienteActual = null;
let proyectoActual = null;
// 'crear' | 'renombrar' -- que accion hace btnConfirmarNuevoPaso, segun si se abrio el
// formulario desde "+ Nuevo paso desde aqui" o desde "✏️ Renombrar" (mismo formulario
// chico reutilizado para las 2 acciones, ver conectarEventosPasosEntrega).
let modoFormularioPaso = 'crear';
// Copia completa (deep clone) de proyectoActual tal como estaba AL ABRIRLO -- ver
// guardarProyectoRespetandoRenombre() mas abajo. Necesaria porque Calcular ya autoguarda
// (guardarProyecto dentro de calcularYRenderizar) ANTES de que el usuario llegue a
// renombrar -- comparar contra lo que hay en disco en ese momento ya no sirve, porque
// disco ya tiene los datos nuevos bajo el nombre viejo. Comparar contra esta copia (la
// version real "de antes de tocar nada en esta sesion de edicion") si sirve.
let snapshotProyectoAlAbrir = null;
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
// `tipo` ya no esta limitado a "gobierno"/"particular" (pedido explicito del usuario,
// 2026-11-11) -- estas 2 funciones centralizan como se muestra CUALQUIER valor que se
// haya escrito, en vez de repetir el ternario viejo en cada lugar que lo usaba.
function etiquetaTipo(tipo) {
  const t = (tipo || 'Particular').toString();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function claseTipo(tipo) {
  const t = (tipo || '').toString().toLowerCase();
  if (t === 'gobierno') return 'chip-tipo-gobierno';
  if (t === 'particular') return 'chip-tipo-particular';
  return 'chip-tipo-otro';
}
// Aviso de nombre duplicado -- pedido explicito del usuario, 2026-11-11: "avísame si
// ya hay alguna con ese mismo nombre y cliente" (tras encontrarse con 4 cotizaciones
// "Carreteras de Cuota" sin saber por que). No bloquea nada (puede ser intencional),
// solo avisa para que no se repita sin querer.
function revisarDuplicadoCliente() {
  if (!clienteActual) return;
  const otro = listarClientes().some(c => c.id !== clienteActual.id && c.nombre.trim().toLowerCase() === clienteActual.nombre.trim().toLowerCase());
  const texto = otro ? `⚠️ Ya hay otro cliente llamado "${clienteActual.nombre}"` : '';
  const a = $('avisoNombreClienteDup'); if (a) { a.hidden = !otro; a.textContent = texto; }
  const b = $('avisoNombreClienteDupProyectos'); if (b) { b.hidden = !otro; b.textContent = texto; }
}
function revisarDuplicadoProyecto(nombre, idExcluir) {
  if (!clienteActual) return false;
  const otro = (clienteActual.proyectos || []).some(p => p.id !== idExcluir && p.nombre.trim().toLowerCase() === nombre.trim().toLowerCase());
  const a = $('avisoNombreProyectoDup');
  if (a) { a.hidden = !otro; a.textContent = otro ? `⚠️ "${clienteActual.nombre}" ya tiene otra cotización llamada "${nombre}"` : ''; }
  return otro;
}
function poblarDatalistTipos() {
  const dl = $('listaTiposCliente');
  if (!dl) return;
  dl.innerHTML = tiposClienteUsados().map(t => `<option value="${escapeHtml(t)}">`).join('');
}

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
  const cont = $('listaClientesAgrupados');
  cont.innerHTML = '';
  poblarDatalistTipos();
  const grupos = clientesAgrupadosPorTipo();
  if (!grupos.length) {
    cont.append(Object.assign(document.createElement('p'), { className: 'nota', textContent: 'Todavía no hay clientes guardados.' }));
    return;
  }
  for (const { tipo, clientes } of grupos) {
    const wrap = document.createElement('div');
    wrap.className = 'grupo-clientes';
    const h3 = document.createElement('h3');
    h3.textContent = `${etiquetaTipo(tipo)} (${clientes.length})`;
    wrap.append(h3);
    const listaEl = document.createElement('div');
    listaEl.className = 'lista-clientes';
    for (const c of clientes) listaEl.append(tarjetaCliente(c));
    wrap.append(listaEl);
    cont.append(wrap);
  }
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
  $('pantallaDashboard').hidden = true;
  $('pantallaDefinitivasPorTarifa').hidden = true;
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

// ---------------- Opciones avanzadas de la nube: eliminar UN cliente del respaldo
// compartido, o archivos sueltos ya subidos -- pedido explicito del usuario,
// 2026-11-06. A proposito, separado de "Guardar copia en la nube" (que sube/pisa TODO
// lo de este dispositivo): el punto de esto es poder limpiar un residuo especifico
// (algo subido por accidente, o que ya se borro aqui) sin arrastrar el resto de los
// cambios locales. Mas "especial"/protegido que el resto de los borrados de esta app
// (que solo usan confirm()) porque esto afecta el respaldo COMPARTIDO -- cualquier
// otro dispositivo que lo use lo pierde tambien -- asi que ademas de confirm() pide
// escribir el nombre exacto antes de dejar hacer clic.
$('btnMostrarAvanzadoNube').addEventListener('click', () => {
  const panel = $('panelAvanzadoNube');
  panel.hidden = !panel.hidden;
  if (!panel.hidden) cargarSelectClientesNube();
});

async function cargarSelectClientesNube() {
  const sel = $('selectClienteEliminarNube');
  sel.innerHTML = '<option value="">Cargando...</option>';
  try {
    const clientes = await listarClientesEnNube();
    sel.innerHTML = clientes.length ? '<option value="">-- elige --</option>' : '<option value="">(no hay ningún cliente en la nube todavía)</option>';
    clientes.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.dataset.nombre = c.nombre;
      opt.textContent = `${c.nombre} (${(c.proyectos || []).length} cotización(es))`;
      sel.append(opt);
    });
  } catch (err) {
    sel.innerHTML = '<option value="">Error al leer la nube</option>';
    console.error(err);
  }
}

$('btnRefrescarClientesNube').addEventListener('click', cargarSelectClientesNube);

$('btnEliminarClienteNube').addEventListener('click', async () => {
  const sel = $('selectClienteEliminarNube');
  const estadoEl = $('estadoEliminarClienteNube');
  const clienteId = sel.value;
  if (!clienteId) { alert('Elige primero a qué cliente quitar de la nube.'); return; }
  const nombreEsperado = sel.options[sel.selectedIndex].dataset.nombre;
  const escrito = $('inputConfirmarEliminarNube').value.trim();
  if (escrito !== nombreEsperado) {
    alert(`El nombre que escribiste no coincide exactamente con "${nombreEsperado}". Cópialo tal cual para confirmar.`);
    return;
  }
  if (!confirm(`¿Eliminar a "${nombreEsperado}" del respaldo en la nube? Esto NO se puede deshacer y afecta ` +
               'a cualquier otro dispositivo que use ese respaldo (no solo este).')) return;
  $('btnEliminarClienteNube').disabled = true;
  estadoEl.className = 'nota';
  estadoEl.textContent = 'Eliminando de la nube...';
  try {
    const { numClientesRestantes } = await eliminarClienteDeNube(clienteId);
    estadoEl.className = 'nota ok';
    estadoEl.textContent = `✓ Eliminado de la nube. Quedan ${numClientesRestantes} cliente(s) en el respaldo.`;
    $('inputConfirmarEliminarNube').value = '';
    await cargarSelectClientesNube();
  } catch (err) {
    estadoEl.className = 'nota aviso';
    estadoEl.textContent = 'No se pudo eliminar: ' + err.message;
    console.error(err);
  } finally {
    $('btnEliminarClienteNube').disabled = false;
  }
});

// Las 3 carpetas que usa supabaseSubirArchivo en todo el proyecto (recibo de la
// cotizacion, verificacion en sitio, y los archivos que sube un cliente via
// cliente.html) -- ver supabase.js, el listado de Storage no es recursivo.
const CARPETAS_ARCHIVOS_NUBE = ['cotizaciones', 'envios', 'verificaciones'];

$('btnListarArchivosNube').addEventListener('click', async () => {
  const estadoEl = $('estadoArchivosNube');
  const cont = $('listaArchivosNube');
  $('btnListarArchivosNube').disabled = true;
  estadoEl.className = 'nota';
  estadoEl.textContent = 'Leyendo archivos de la nube...';
  cont.innerHTML = '';
  try {
    const listas = await Promise.all(CARPETAS_ARCHIVOS_NUBE.map((carpeta) =>
      supabaseListarArchivos(carpeta).then((items) => items.map((it) => ({ ...it, carpeta })))));
    const archivos = listas.flat().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (!archivos.length) {
      estadoEl.className = 'nota';
      estadoEl.textContent = 'No hay ningún archivo subido a la nube.';
      return;
    }
    estadoEl.className = 'nota ok';
    estadoEl.textContent = `${archivos.length} archivo(s) encontrados.`;
    archivos.forEach((archivo) => {
      const ruta = `${archivo.carpeta}/${archivo.name}`;
      const div = document.createElement('div');
      div.className = 'fila-archivo-nube';
      const a = document.createElement('a');
      a.href = `${SUPABASE_URL}/storage/v1/object/public/recibos/${ruta}`;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = archivo.name;
      const tamKb = archivo.metadata && archivo.metadata.size ? Math.round(archivo.metadata.size / 1024) : null;
      const span = document.createElement('span');
      span.className = 'carpeta-archivo-nube';
      span.textContent = `${archivo.carpeta}${tamKb ? ' · ' + tamKb + ' KB' : ''}`;
      const btnBorrar = document.createElement('button');
      btnBorrar.className = 'btn-peligro';
      btnBorrar.textContent = '🗑️ Eliminar';
      btnBorrar.addEventListener('click', async () => {
        if (!confirm(`¿Eliminar "${archivo.name}" de la nube? No se puede deshacer. Si alguna cotización ` +
                     'guardada todavía lo referencia, ese enlace dejará de funcionar.')) return;
        btnBorrar.disabled = true;
        try {
          await supabaseEliminarArchivo(ruta);
          div.remove();
        } catch (err) {
          alert('No se pudo eliminar: ' + err.message);
          btnBorrar.disabled = false;
        }
      });
      div.append(a, span, btnBorrar);
      cont.append(div);
    });
  } catch (err) {
    estadoEl.className = 'nota aviso';
    estadoEl.textContent = 'No se pudo leer: ' + err.message;
    console.error(err);
  } finally {
    $('btnListarArchivosNube').disabled = false;
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
  $('pantallaDashboard').hidden = true;
  $('pantallaDefinitivasPorTarifa').hidden = true;
  $('pantallaProyectos').hidden = true;
  $('pantallaCliente').hidden = true;
  $('pantallaEnvios').hidden = false;
  renderListaEnvios();
}
$('btnAbrirEnvios').addEventListener('click', mostrarPantallaEnvios);
$('btnVolverClientesDesdeEnvios').addEventListener('click', mostrarPantallaClientes);
$('btnRefrescarEnvios').addEventListener('click', renderListaEnvios);

// =====================================================================
// Pantalla: Dashboard (agregado de TODOS los clientes) -- pedido explicito del
// usuario, 2026-11-05 (auditoria de scripts): "no existe ningun dashboard agregado
// entre todos los clientes". Mismo espiritu que el dashboard de "Ingresos" de
// administradorinvitamx (otro proyecto del usuario) -- total cotizado, conteo por
// etapa, exportar CSV -- adaptado a lo que ya existe aqui (no hay pagos/abonos en
// este proyecto, solo proyecto.etapa y los totales cacheados en calcularYRenderizar,
// ver ultimaInversionTotal/ultimoAhorroAnual).
function datosDashboard() {
  const filas = [];
  for (const c of listarClientes()) {
    for (const p of (c.proyectos || [])) filas.push({ cliente: c, proyecto: p });
  }
  // Orden de creacion (mas nueva primero) para que esta pantalla sirva de "historial
  // general" -- pedido explicito del usuario, 2026-11-07 -- en vez del orden por
  // cliente que daba listarClientes() antes.
  filas.sort((a, b) => (b.proyecto.creadoEn || '').localeCompare(a.proyecto.creadoEn || ''));
  return filas;
}

function renderDashboardTotales(filas) {
  const totalInversion = filas.reduce((s, f) => s + (f.proyecto.ultimaInversionTotal || 0), 0);
  const totalAhorro = filas.reduce((s, f) => s + (f.proyecto.ultimoAhorroAnual || 0), 0);
  const nCalculadas = filas.filter(f => f.proyecto.ultimaInversionTotal != null).length;
  const cont = $('dashboardTotales');
  cont.innerHTML = '';
  const metricas = [
    [M(totalInversion), `Total cotizado (${nCalculadas} de ${filas.length} ya calculadas)`],
    [M(totalAhorro), 'Ahorro anual proyectado (suma de todas)'],
    [String(listarClientes().length), 'Clientes'],
    [String(filas.length), 'Cotizaciones'],
  ];
  for (const [valor, etiqueta] of metricas) {
    const m = document.createElement('div');
    m.className = 'metrica';
    m.innerHTML = `<div class="valor">${valor}</div><div class="etiqueta">${etiqueta}</div>`;
    cont.append(m);
  }
}

function renderDashboardEtapas(filas) {
  const cont = $('dashboardEtapas');
  cont.innerHTML = '';
  for (const etapa of Object.keys(ETAPAS_PROYECTO)) {
    const n = filas.filter(f => (f.proyecto.etapa || 'cotizado') === etapa).length;
    const chip = document.createElement('div');
    chip.className = `chip-etapa chip-etapa-${etapa} dashboard-etapa-chip`;
    chip.textContent = `${ETAPAS_PROYECTO[etapa]}: ${n}`;
    cont.append(chip);
  }
}

function renderDashboardTabla(filas) {
  const cont = $('dashboardTabla');
  cont.innerHTML = '';
  if (!filas.length) {
    cont.append(Object.assign(document.createElement('p'), {
      className: 'nota',
      textContent: $('chkSoloDefinitivasDashboard').checked ? 'Ninguna cotización marcada como definitiva todavía.' : 'Sin clientes/cotizaciones todavía.',
    }));
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'tabla-wrap';
  const t = document.createElement('table');
  t.className = 'tabla-seccion tabla-chica';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Cliente</th><th>Tipo</th><th>Cotización</th><th>Definitiva</th><th>Etapa</th><th>Tarifa</th>' +
    '<th class="num">Inversión</th><th class="num">Ahorro anual</th><th>Creada</th><th>Actualizado</th><th></th></tr>';
  t.append(thead);
  const tbody = document.createElement('tbody');
  for (const { cliente, proyecto } of filas) {
    const etapa = proyecto.etapa || 'cotizado';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${escapeHtml(cliente.nombre)}</td><td>${escapeHtml(etiquetaTipo(cliente.tipo))}</td>` +
      `<td>${escapeHtml(proyecto.nombre)}</td><td>${proyecto.definitiva ? '✅' : ''}</td>` +
      `<td>${ETAPAS_PROYECTO[etapa]}</td><td>${escapeHtml(proyecto.formulario?.tarifa || '—')}</td>` +
      `<td class="num">${proyecto.ultimaInversionTotal != null ? M(proyecto.ultimaInversionTotal) : '—'}</td>` +
      `<td class="num">${proyecto.ultimoAhorroAnual != null ? M(proyecto.ultimoAhorroAnual) : '—'}</td>` +
      `<td>${new Date(proyecto.creadoEn).toLocaleDateString('es-MX')}</td>` +
      `<td>${new Date(proyecto.actualizadoEn).toLocaleDateString('es-MX')}</td><td></td>`;
    const btnAbrir = document.createElement('button');
    btnAbrir.className = 'btn-link';
    btnAbrir.textContent = 'Abrir';
    btnAbrir.addEventListener('click', () => abrirProyecto(cliente.id, proyecto.id));
    tr.lastElementChild.append(btnAbrir);
    tbody.append(tr);
  }
  t.append(tbody);
  wrap.append(t);
  cont.append(wrap);
}

function renderDashboard() {
  const todas = datosDashboard();
  const filas = $('chkSoloDefinitivasDashboard').checked ? todas.filter(f => f.proyecto.definitiva) : todas;
  renderDashboardTotales(todas);
  renderDashboardEtapas(todas);
  renderDashboardTabla(filas);
}
$('chkSoloDefinitivasDashboard').addEventListener('change', renderDashboard);

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportarDashboardCsv() {
  const todas = datosDashboard();
  const filas = $('chkSoloDefinitivasDashboard').checked ? todas.filter(f => f.proyecto.definitiva) : todas;
  const lineas = [['Cliente', 'Tipo', 'Cotización', 'Definitiva', 'Etapa', 'Tarifa', 'Inversión', 'Ahorro anual', 'Creada', 'Actualizado'].join(',')];
  for (const { cliente, proyecto } of filas) {
    const etapa = proyecto.etapa || 'cotizado';
    lineas.push([
      csvEscape(cliente.nombre), csvEscape(cliente.tipo), csvEscape(proyecto.nombre), proyecto.definitiva ? 'Sí' : 'No',
      csvEscape(ETAPAS_PROYECTO[etapa]), csvEscape(proyecto.formulario?.tarifa || ''),
      proyecto.ultimaInversionTotal ?? '', proyecto.ultimoAhorroAnual ?? '',
      csvEscape(new Date(proyecto.creadoEn).toLocaleDateString('es-MX')),
      csvEscape(new Date(proyecto.actualizadoEn).toLocaleDateString('es-MX')),
    ].join(','));
  }
  // BOM al inicio para que Excel detecte UTF-8 solo (sin esto, acentos/ñ salen mal al
  // abrir el CSV directo en Excel en Windows).
  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cotizaciones_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function mostrarPantallaDashboard() {
  $('pantallaClientes').hidden = true;
  $('pantallaEnvios').hidden = true;
  $('pantallaDefinitivasPorTarifa').hidden = true;
  $('pantallaProyectos').hidden = true;
  $('pantallaCliente').hidden = true;
  $('pantallaDashboard').hidden = false;
  renderDashboard();
}
$('btnAbrirDashboard').addEventListener('click', mostrarPantallaDashboard);
$('btnVolverClientesDesdeDashboard').addEventListener('click', mostrarPantallaClientes);
$('btnRefrescarDashboard').addEventListener('click', renderDashboard);
$('btnExportarDashboardCsv').addEventListener('click', exportarDashboardCsv);

// =====================================================================
// Pantalla: Definitivas por tarifa -- pedido explicito del usuario, 2026-11-07:
// "otro lugar donde estan las definitivas por tarifa, que puede haber uno o varios
// ejemplos... abro una tarifa y se me despliega un ejemplo de cotizacion definitiva".
// Distinto de "Plantilla final revisada por tarifa" (textosGlobales.js), que solo
// guarda texto/tablas sueltas -- aqui se ven las cotizaciones COMPLETAS ya marcadas
// como definitiva, de cualquier cliente, agrupadas por su propia tarifa real
// (proyecto.formulario.tarifa), reutilizando datosDashboard() (misma fuente que el
// historial) en vez de mantener un indice aparte.
function renderDefinitivasPorTarifa() {
  const tarifa = $('selectTarifaDefinitivas').value;
  const cont = $('listaDefinitivasPorTarifa');
  cont.innerHTML = '';
  if (!tarifa) return;
  const filas = datosDashboard().filter(f => f.proyecto.definitiva && f.proyecto.formulario?.tarifa === tarifa);
  if (!filas.length) {
    cont.append(Object.assign(document.createElement('p'), {
      className: 'nota', textContent: `Todavía no hay ninguna cotización definitiva con tarifa ${tarifa}.`,
    }));
    return;
  }
  for (const { cliente, proyecto } of filas) {
    const div = document.createElement('div');
    div.className = 'tarjeta-cliente';
    div.innerHTML = `<div class="tarjeta-cliente-info"><strong>${escapeHtml(proyecto.nombre)}</strong>` +
      (proyecto.propositoDefinitiva === 'muestra' ? ' <span class="chip-definitiva">📋 muestra</span>' : ' <span class="chip-definitiva">👤 entrega de cliente</span>') +
      `<span class="nota">Cliente: ${escapeHtml(cliente.nombre)} · ` +
      `${proyecto.ultimaInversionTotal != null ? 'Inversión ' + M(proyecto.ultimaInversionTotal) : 'sin calcular'}` +
      (proyecto.ultimoAhorroAnual != null ? ` · Ahorro anual ${M(proyecto.ultimoAhorroAnual)}` : '') +
      ` · creada ${new Date(proyecto.creadoEn).toLocaleDateString('es-MX')}</span></div>`;
    const btnAbrir = document.createElement('button');
    btnAbrir.className = 'btn-link';
    btnAbrir.textContent = 'Abrir';
    btnAbrir.addEventListener('click', () => abrirProyecto(cliente.id, proyecto.id));
    div.append(btnAbrir);
    cont.append(div);
  }
}

function mostrarPantallaDefinitivasPorTarifa() {
  $('pantallaClientes').hidden = true;
  $('pantallaEnvios').hidden = true;
  $('pantallaDashboard').hidden = true;
  $('pantallaProyectos').hidden = true;
  $('pantallaCliente').hidden = true;
  $('pantallaDefinitivasPorTarifa').hidden = false;
  renderDefinitivasPorTarifa();
}
$('btnAbrirDefinitivasPorTarifa').addEventListener('click', mostrarPantallaDefinitivasPorTarifa);
$('btnVolverClientesDesdeDefinitivas').addEventListener('click', mostrarPantallaClientes);
$('selectTarifaDefinitivas').addEventListener('change', renderDefinitivasPorTarifa);

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
    (envio.campos_leidos?.reconciliacion_advertencia ? '<span class="nota aviso-chico">🛑 Tenía una advertencia de reconciliación al leer el recibo -- revisar con cuidado.</span>' : '') +
    (envio.campos_leidos?.titular_domicilio_advertencia ? '<span class="nota aviso-chico">🛑 El titular o el domicilio leídos del recibo parecen incorrectos -- revisar con cuidado antes de asignar.</span>' : '');
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
  // Mismo bug/fix que poblarSelectClienteGuardar() -- clientesAgrupadosPorTipo() ya no
  // regresa {gobierno, particular} fijos (ver commit 9668ac9).
  for (const { tipo, clientes: lista } of clientesAgrupadosPorTipo()) {
    if (!lista.length) continue;
    const og = document.createElement('optgroup');
    og.label = etiquetaTipo(tipo);
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
    traeRecargoFp: !!envio.recargo_fp_monto, recargoFpMonto: envio.recargo_fp_monto || 0,
    dBasicoKwh: esc.basicoKwh ?? 150, dBasicoRate: esc.basicoRate ?? 1.140,
    dInterKwh: esc.interKwh ?? 130, dInterRate: esc.interRate ?? 1.385,
    dExcedRate: esc.excedRate ?? 4.054,
    dDap: envio.es_domestica ? (envio.dap || 0) : 0,
    dPeriodoDias: envio.es_domestica ? envio.periodo_dias : 60,
    dPeriodoKwh: envio.es_domestica ? envio.periodo_kwh : 400,
    historialNoDom: envio.es_domestica ? [] : (envio.historial || []),
    historialDom: envio.es_domestica ? (envio.historial || []) : [],
    moduloWp: 605, cobertura: 1.0, horasUtiles: 4.5, escalaCostos: escalaCostosParaTarifa(envio.tarifa), escalamiento: 4.0,
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
  // Pedido explicito del usuario, 2026-11-11: "cotizaciones por tarifa para verlas...
  // ordena todo con coherencia y logica" -- chip visible de la tarifa (si ya se
  // capturo) en cada tarjeta, independiente del chip de estado (definitiva/muestra/
  // editando, que ya existia) -- renderListaProyectos() las ordena por tarifa dentro
  // de cada grupo para que las de la misma tarifa queden juntas.
  const chipTarifa = p.formulario?.tarifa ? `<span class="chip-etapa chip-tarifa-proyecto">${escapeHtml(p.formulario.tarifa)}</span>` : '';
  div.innerHTML = `<div class="tarjeta-cliente-info"><strong>${escapeHtml(p.nombre)}</strong>` +
    chipTarifa +
    (p.definitiva ? `<span class="chip-definitiva">✅ Definitiva${p.bloqueada ? ' 🔒' : ''}${p.propositoDefinitiva === 'muestra' ? ' 📋 muestra' : ''}</span>` : '') +
    (p.plantillaOrigen && !p.plantillaVerificada ? `<span class="chip-etapa chip-etapa-cotizado">📋 desde plantilla, sin verificar</span>` : '') +
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

// Pedido explicito del usuario, 2026-11-11: tenia 4 cotizaciones "Carreteras de
// Cuota" con el mismo nombre sin saber por que (congelar una definitiva SIEMPRE crea
// una copia nueva aparte, nunca reemplaza la anterior -- si se congela varias veces se
// van acumulando). Pidio "un lugar donde ponga las que se estan trabajando, otro donde
// se guardan las definitivas... y la cantidad, en otro las muestras que van por
// tarifa... y las que se generen sin querer en otro lado". Se agrupan en 4 categorias
// con su propio conteo, para ver de un vistazo cuantas hay de cada tipo y detectar
// duplicados/borradores sueltos que conviene borrar (ya se confirmo que eliminar
// cualquiera, incluida una congelada, funciona sin restriccion).
function renderListaProyectos() {
  const cont = $('listaProyectos');
  cont.innerHTML = '';
  const proyectos = listarProyectos(clienteActual);
  if (!proyectos.length) {
    cont.append(Object.assign(document.createElement('p'), { className: 'nota', textContent: 'Todavía no hay cotizaciones para este cliente. Sube un recibo o arranca una en blanco.' }));
    return;
  }
  // Ordenadas por tarifa DENTRO de cada grupo (pedido explicito del usuario: "cotizaciones
  // por tarifa para verlas... ordena todo con coherencia y logica") -- asi, si un cliente
  // tiene cotizaciones de varias tarifas, las de la misma tarifa quedan juntas en vez de
  // mezcladas por fecha. Sin tarifa capturada todavia van al final.
  const porTarifa = (a, b) => (a.formulario?.tarifa || '￿').localeCompare(b.formulario?.tarifa || '￿');
  const enTrabajo = proyectos.filter(p => !p.definitiva && p.formulario).sort(porTarifa);
  const borradoresVacios = proyectos.filter(p => !p.definitiva && !p.formulario);
  const definitivasCliente = proyectos.filter(p => p.definitiva && p.propositoDefinitiva !== 'muestra').sort(porTarifa);
  const muestras = proyectos.filter(p => p.definitiva && p.propositoDefinitiva === 'muestra').sort(porTarifa);

  function grupo(titulo, lista, notaExtra) {
    if (!lista.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'grupo-proyectos';
    const h4 = document.createElement('h4');
    h4.textContent = `${titulo} (${lista.length})`;
    wrap.append(h4);
    if (notaExtra) wrap.append(Object.assign(document.createElement('p'), { className: 'nota', textContent: notaExtra }));
    const listaEl = document.createElement('div');
    listaEl.className = 'lista-clientes';
    for (const p of lista) listaEl.append(tarjetaProyecto(p));
    wrap.append(listaEl);
    cont.append(wrap);
  }

  grupo('🛠️ En trabajo', enTrabajo);
  grupo('🗒️ Borradores vacíos (sin datos capturados todavía)', borradoresVacios,
    'Revisa si se crearon sin querer -- bórralos si no los necesitas.');
  grupo('✅ Definitivas entregadas al cliente', definitivasCliente);
  grupo('📋 Muestras (machote reusable por tarifa)', muestras,
    'Estas también aparecen en "✅ Definitivas por tarifa" para usarlas con cualquier cliente de esa tarifa.');
}

function mostrarPantallaProyectos(clienteId) {
  clienteActual = obtenerCliente(clienteId);
  if (!clienteActual) { mostrarPantallaClientes(); return; }
  proyectoActual = null; ultimoResultado = null; ultimoLeido = null; ultimoInputJSON = null;
  ocultarAvisoCambiosSinCalcular();
  archivosReciboAcumulados = []; // empieza limpio -- no arrastrar fotos de otro cliente/proyecto
  $('pantallaClientes').hidden = true;
  $('pantallaEnvios').hidden = true;
  $('pantallaDashboard').hidden = true;
  $('pantallaDefinitivasPorTarifa').hidden = true;
  $('pantallaProyectos').hidden = false;
  $('pantallaCliente').hidden = true;
  $('clienteNombreBarraProyectos').value = clienteActual.nombre;
  $('clienteTipoBarraProyectos').textContent = etiquetaTipo(clienteActual.tipo);
  $('clienteTipoBarraProyectos').className = `chip-tipo ${claseTipo(clienteActual.tipo)}`;
  $('estadoReciboNuevoProyecto').textContent = '';
  revisarDuplicadoCliente();
  renderListaProyectos();
}

$('btnVolverClientesDesdeProyectos').addEventListener('click', mostrarPantallaClientes);
$('btnVolverProyectos').addEventListener('click', () => mostrarPantallaProyectos(clienteActual.id));

// Pedido explicito del usuario, 2026-11-11: "permite editar nombre del cliente" --
// mismo patron ya probado con el nombre de la cotizacion (inputNombreProyecto): se
// guarda al perder el foco, no en cada tecla. Un solo handler para las 2 barras (la de
// "Cotizaciones de este cliente" y la de dentro de una cotizacion abierta), ambas
// terminan renombrando el mismo clienteActual.
function renombrarClienteActual(nuevoNombreCrudo) {
  if (!clienteActual) return;
  const nuevo = nuevoNombreCrudo.trim();
  if (!nuevo || nuevo === clienteActual.nombre) { sincronizarInputsNombreCliente(); return; }
  clienteActual.nombre = nuevo;
  guardarCliente(clienteActual);
  sincronizarInputsNombreCliente();
  revisarDuplicadoCliente();
}
function sincronizarInputsNombreCliente() {
  if (!clienteActual) return;
  $('clienteNombreBarraProyectos').value = clienteActual.nombre;
  $('clienteNombreBarra').value = clienteActual.nombre;
}
$('clienteNombreBarraProyectos').addEventListener('blur', () => renombrarClienteActual($('clienteNombreBarraProyectos').value));
$('clienteNombreBarra').addEventListener('blur', () => renombrarClienteActual($('clienteNombreBarra').value));

$('btnNuevoProyectoBlanco').addEventListener('click', () => {
  const nombre = $('inputNombreNuevoProyecto').value.trim();
  if (!nombre) { alert('Escribe primero un nombre para esta cotización.'); return; }
  if (revisarDuplicadoProyecto(nombre, null) && !confirm(`"${clienteActual.nombre}" ya tiene otra cotización llamada "${nombre}" -- ¿crear otra con el mismo nombre de todos modos?`)) return;
  const proyecto = crearProyecto(clienteActual, { nombre });
  $('inputNombreNuevoProyecto').value = '';
  abrirProyecto(clienteActual.id, proyecto.id);
});

// Busca, de CUALQUIER cliente, la mejor cotización ✅ definitiva con esta tarifa para
// usarla como ejemplo al dar de alta un estudio nuevo -- pedido explicito del usuario,
// 2026-11-11: "ponle un botón para que elija la tarifa y el análisis definitivo que
// hayamos puesto ahí en esa tarifa como ejemplo... para que trabajemos sobre ese
// machote y ya le subo los datos que le correspondan". Prioriza las marcadas
// `propositoDefinitiva: 'muestra'` (pensadas justo para esto); si no hay ninguna
// todavía, cae a la definitiva más reciente de esa tarifa que exista (aunque sea la
// entrega real de otro cliente) -- `esFallback` avisa de esto en la UI, para que no
// se confunda con un ejemplo curado a propósito.
function mejorDefinitivaPorTarifa(tarifa) {
  const todas = [];
  for (const c of listarClientes()) {
    for (const p of (c.proyectos || [])) {
      if (!p.definitiva || !p.formulario || p.formulario.tarifa !== tarifa) continue;
      todas.push({ cliente: c, proyecto: p });
    }
  }
  if (!todas.length) return null;
  todas.sort((a, b) => (b.proyecto.actualizadoEn || '').localeCompare(a.proyecto.actualizadoEn || ''));
  const muestra = todas.find(f => f.proyecto.propositoDefinitiva === 'muestra');
  return muestra ? { ...muestra, esFallback: false } : { ...todas[0], esFallback: true };
}

$('btnNuevoProyectoDesdeDefinitiva').addEventListener('click', () => {
  const nombre = $('inputNombreNuevoProyecto').value.trim();
  const estadoEl = $('estadoNuevoProyectoDesdeDefinitiva');
  if (!nombre) {
    estadoEl.className = 'nota aviso';
    estadoEl.textContent = 'Escribe primero un nombre para esta cotización (arriba).';
    return;
  }
  const tarifa = $('selectTarifaNuevoProyecto').value;
  if (!tarifa) {
    estadoEl.className = 'nota aviso';
    estadoEl.textContent = 'Elige primero una tarifa.';
    return;
  }
  const candidato = mejorDefinitivaPorTarifa(tarifa);
  if (!candidato) {
    estadoEl.className = 'nota aviso';
    estadoEl.textContent = `Todavía no hay ninguna cotización ✅ definitiva con tarifa ${tarifa} guardada en ningún cliente -- usa "+ Cotización en blanco" y captura los datos a mano, o marca una cotización como "Definitiva para MUESTRA" primero para poder reusarla después.`;
    return;
  }
  if (revisarDuplicadoProyecto(nombre, null) && !confirm(`"${clienteActual.nombre}" ya tiene otra cotización llamada "${nombre}" -- ¿crear otra con el mismo nombre de todos modos?`)) return;
  const nuevo = crearProyectoDesdeOrigen(clienteActual, candidato, { nombre });
  $('inputNombreNuevoProyecto').value = '';
  if (candidato.esFallback) {
    estadoEl.className = 'nota aviso';
    estadoEl.textContent = `No hay ninguna definitiva marcada como "muestra" para ${tarifa} todavía -- se usó como base la definitiva de "${candidato.cliente.nombre}" (se limpiaron sus datos de identidad/período/historial). Revisa los cargos antes de confiar en ellos.`;
  }
  abrirProyecto(clienteActual.id, nuevo.id);
});

// ---------------- Machote: aplicar una cotizacion ya validada SOBRE la que esta
// abierta (pedido explicito del usuario, 2026-11-06: "usar la tarifa ya validada o la
// cotizacion ya validada"; reubicado 2026-11-09 al panel "Guardar cotizacion" -- "ya
// hay un boton de nuevo cliente al final de la cotizacion donde se trabaja... permite
// elegir que cliente, el nombre de la cotizacion y que cotizacion final usar como
// machote", quitando el flujo aparte "Desde cotizacion ya validada" por redundante) ----------------
// Lista TODOS los proyectos de TODOS los clientes (no solo los de clienteActual) --
// el punto es poder reusar la tarifa de CUALQUIER cotizacion de confianza ya hecha
// antes, no solo las de este cliente en particular. Se excluye la cotizacion ABIERTA
// (no tendria sentido usarse a si misma como su propio machote).
function candidatosMachote() {
  const soloDefinitivas = $('chkSoloDefinitivasMachote').checked;
  const tarifaFiltro = $('filtroTarifaMachote').value;
  const filas = [];
  for (const c of listarClientes()) {
    for (const p of (c.proyectos || [])) {
      if (proyectoActual && p.id === proyectoActual.id) continue;
      if (!p.formulario || !p.formulario.tarifa) continue; // sin datos capturados, nada que clonar
      if (soloDefinitivas && !p.definitiva) continue;
      if (tarifaFiltro && p.formulario.tarifa !== tarifaFiltro) continue;
      filas.push({ cliente: c, proyecto: p });
    }
  }
  return filas.sort((a, b) => (b.proyecto.actualizadoEn || '').localeCompare(a.proyecto.actualizadoEn || ''));
}

function renderListaMachotes() {
  const select = $('filtroTarifaMachote');
  if (!select.dataset.listo) {
    select.innerHTML = '<option value="">Todas las tarifas</option>' +
      [...TARIFAS_SOPORTADAS].map(t => `<option value="${t}">${t}</option>`).join('');
    select.dataset.listo = '1';
  }
  const cont = $('listaMachotes');
  if (!clienteActual || !proyectoActual) { cont.innerHTML = ''; return; }
  const candidatos = candidatosMachote();
  cont.innerHTML = '';
  if (!candidatos.length) {
    cont.append(Object.assign(document.createElement('p'), {
      className: 'nota',
      textContent: 'No hay ninguna otra cotización guardada que coincida con este filtro (prueba quitar "solo definitivas" o cambiar la tarifa).',
    }));
    return;
  }
  for (const { cliente, proyecto } of candidatos) {
    const div = document.createElement('div');
    div.className = 'tarjeta-cliente';
    div.style.cursor = 'pointer';
    div.innerHTML = `<strong>${escapeHtml(proyecto.nombre)}</strong> ${proyecto.definitiva ? `<span class="chip-definitiva">✅ Definitiva${proyecto.bloqueada ? ' 🔒' : ''}${proyecto.propositoDefinitiva === 'muestra' ? ' 📋 muestra' : ''}</span>` : ''}` +
      `<div class="nota">Cliente: ${escapeHtml(cliente.nombre)} · Tarifa: ${escapeHtml(proyecto.formulario.tarifa)} · ` +
      `${new Date(proyecto.actualizadoEn).toLocaleDateString('es-MX')}</div>`;
    div.addEventListener('click', () => {
      if (!confirm(`¿Aplicar "${proyecto.nombre}" (${cliente.nombre}) como machote sobre esta cotización? Se reemplazan tarifa/cargos/pasos y TODOS los textos/apagados editados (se quedan igual que en el machote) -- el titular/domicilio/historial de este cliente se quedan en blanco, hay que capturarlos de su recibo real.`)) return;
      aplicarMachoteAProyecto(proyectoActual, { cliente, proyecto });
      guardarProyecto(clienteActual, proyectoActual);
      aplicarFormulario(proyectoActual.formulario);
      ultimoResultado = null; ultimoLeido = null; ultimoInputJSON = null;
      $('contenedorSecciones').innerHTML = '';
      $('tabEditorPrecios').hidden = true;
      $('tabFinanciamiento').hidden = true;
      $('estadoCalculo').className = 'nota aviso';
      $('estadoCalculo').textContent = 'Machote aplicado -- revisa los datos (sobre todo titular/domicilio/período/historial, que quedaron en blanco) y pulsa "Calcular".';
      $('tabPdf').hidden = true;
      renderAvisoPlantillaOrigen();
      renderListaMachotes();
      $('tabCaptura').scrollIntoView({ behavior: 'smooth' });
    });
    cont.append(div);
  }
}

function renderAvisoPlantillaOrigen() {
  const o = proyectoActual.plantillaOrigen;
  const avisoEl = $('avisoPlantillaOrigen');
  if (!o || proyectoActual.plantillaVerificada) { avisoEl.hidden = true; return; }
  avisoEl.hidden = false;
  $('txtPlantillaOrigen').textContent = `${o.clienteNombre} — ${o.proyectoNombre}${o.tarifa ? ' (' + o.tarifa + ')' : ''}`;
  // Pedido explicito del usuario, 2026-11-11: los textos editados del machote se
  // quedan igual "a excepcion si vienen del calculo del nuevo servicio" -- un texto
  // que el usuario tecleo con un numero/monto/% pegado (no una celda calculada, esas
  // ya estan protegidas) nunca se actualiza solo al cambiar de cliente. No se puede
  // bloquear ni corregir solo -- se señala para que el usuario lo revise.
  const sospechosos = detectarTextosConNumerosSospechosos(proyectoActual.textosEditados);
  const cajaEl = $('listaTextosSospechososMachote');
  if (sospechosos.length) {
    cajaEl.hidden = false;
    cajaEl.innerHTML = '<p class="nota aviso">⚠️ Estos textos editados tienen un número/monto/% pegado -- revisa si venían del cálculo del cliente anterior:</p><ul>' +
      sospechosos.map(s => `<li><code>${escapeHtml(s.id)}</code>: "${escapeHtml(s.texto)}"</li>`).join('') + '</ul>';
  } else {
    cajaEl.hidden = true;
    cajaEl.innerHTML = '';
  }
}
$('btnMarcarPlantillaVerificada').addEventListener('click', () => {
  proyectoActual.plantillaVerificada = true;
  guardarProyecto(clienteActual, proyectoActual);
  renderAvisoPlantillaOrigen();
});

// Candado de definitivas -- pedido explicito del usuario, 2026-11-11: "realmente son
// etiquetas, si quiero que se puedan editar y volver a guardar los cambios... pero asi
// identifico cual es la buena y cual puedo usar como machote... basicamente la que
// quiero que no se pueda sobre escribir tan facil es la muestra o machote". Por
// default sigue sin poder tocarse (protege de ediciones accidentales, sobre todo a las
// muestras que otros clientes reusan), pero con un boton explicito para desbloquearla
// cuando de verdad haga falta corregir algo -- la etiqueta (✅ Definitiva/📋 muestra) no
// se toca, solo si esta protegida contra escritura o no.
function renderAvisoBloqueo() {
  $('avisoProyectoBloqueado').hidden = !proyectoActual.bloqueada;
  $('avisoProyectoDesbloqueado').hidden = !(proyectoActual.definitiva && !proyectoActual.bloqueada);
}
$('btnDesbloquearProyecto').addEventListener('click', () => {
  if (!confirm(`¿Desbloquear "${proyectoActual.nombre}" para editarla? Mientras esté desbloqueada, cualquier cambio que hagas (y "Calcular") SÍ se guarda -- vuelve a bloquearla cuando termines.`)) return;
  // desbloquearProyecto() muta proyectoActual EN SITIO (es el mismo objeto dentro de
  // clienteActual.proyectos) y devuelve solo true/false (ver guardarCliente) -- bug
  // real encontrado en la propia prueba de este cambio: reasignar clienteActual/
  // proyectoActual desde ese valor los dejaba rotos (true.proyectos no existe),
  // abortando el resto del handler en silencio.
  desbloquearProyecto(clienteActual, proyectoActual.id);
  renderAvisoBloqueo();
  if (ultimoResultado) { ultimoResultado.bloqueada = false; renderSecciones(ultimoResultado); }
});
$('btnBloquearProyecto').addEventListener('click', () => {
  bloquearProyecto(clienteActual, proyectoActual.id);
  renderAvisoBloqueo();
  if (ultimoResultado) { ultimoResultado.bloqueada = true; renderSecciones(ultimoResultado); }
});
// (el aviso de "plantilla sin verificar" se consolido en avisosPendientesParaDocumento(),
// mas abajo en este archivo, junto con los demas avisos antes de generar un documento)

$('chkSoloDefinitivasMachote').addEventListener('change', renderListaMachotes);
$('filtroTarifaMachote').addEventListener('change', renderListaMachotes);

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
  // clientesAgrupadosPorTipo() ya no regresa {gobierno, particular} fijos -- ver
  // commit 9668ac9 (tipo de cliente libre) -- ahora es un arreglo de {tipo, clientes}
  // dinamico. Bug real encontrado 2026-11-11: este call site se quedo usando la forma
  // vieja, lo que rompia abrirProyecto() ENTERO con una excepcion no atrapada (tiraba
  // ANTES de llegar al recalculo automatico al reabrir una cotizacion guardada) --
  // exactamente el reporte del usuario, "ya no se despliegan, se quedan como si se
  // tuviera que volver a calcular".
  for (const { tipo, clientes: lista } of clientesAgrupadosPorTipo()) {
    const og = document.createElement('optgroup');
    og.label = etiquetaTipo(tipo);
    for (const c of lista) {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nombre;
      og.append(opt);
    }
    sel.append(og);
  }
  // Opcion para crear un cliente nuevo sin tener que salir de la cotizacion abierta --
  // pedido explicito del usuario, 2026-11-05: "cuando guardes tambien permite crear
  // clientes". Elegirla abre el mini-formulario de abajo (filaNuevoClienteGuardar) en
  // vez de guardar directo -- mismo patron de "mini-formulario inline" que ya usa este
  // archivo para asignar un envio de cliente a uno nuevo, en vez de un prompt() nativo.
  const optNuevo = document.createElement('option');
  optNuevo.value = '__nuevo__';
  optNuevo.textContent = '+ Nuevo cliente...';
  sel.append(optNuevo);
  sel.value = clienteActual.id;
}

function abrirProyecto(clienteId, proyectoId, { camposIniciales } = {}) {
  clienteActual = obtenerCliente(clienteId);
  proyectoActual = clienteActual ? obtenerProyecto(clienteActual, proyectoId) : null;
  if (!clienteActual || !proyectoActual) { mostrarPantallaProyectos(clienteId); return; }
  // Pasos de entrega: proyectos guardados antes de que esto existiera se migran solos
  // aqui (ver asegurarPasos en clientes.js) -- nunca pierden lo que ya tuvieran apagado.
  asegurarPasos(proyectoActual);
  renderSelectorPasos();
  // Si esta cotizacion ya tenia un link de vista previa compartida activo de una
  // sesion anterior, mostrar la caja con el link de nuevo (en vez de empezar oculta
  // como si nunca se hubiera compartido).
  if (proyectoActual.compartirToken) mostrarCajaLinkCompartido(proyectoActual.compartirToken);
  else { $('cajaLinkCompartido').hidden = true; $('btnDejarDeCompartir').hidden = true; }
  renderListaMachotes();
  $('pantallaClientes').hidden = true;
  $('pantallaEnvios').hidden = true;
  $('pantallaDashboard').hidden = true;
  $('pantallaDefinitivasPorTarifa').hidden = true;
  $('pantallaProyectos').hidden = true;
  $('pantallaCliente').hidden = false;
  $('clienteNombreBarra').value = clienteActual.nombre;
  $('clienteTipoBarra').textContent = etiquetaTipo(clienteActual.tipo);
  $('clienteTipoBarra').className = `chip-tipo ${claseTipo(clienteActual.tipo)}`;
  sincronizarInputsNombreProyecto();
  renderAvisoPlantillaOrigen();
  renderAvisoBloqueo();
  revisarDuplicadoCliente();
  revisarDuplicadoProyecto(proyectoActual.nombre, proyectoActual.id);
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
  // Snapshot DESPUES del recalculo automatico de arriba (si aplico) -- ese recalculo ya
  // normaliza el formulario a como lo devuelve leerFormulario() (todo string, ej.
  // periodoKwh "2400" en vez del numero 2400 que a veces trae lo guardado de antes) y
  // ya lo autoguarda (calcularYRenderizar hace guardarProyecto). Si el snapshot se
  // tomara ANTES de esto, compararia formas distintas del MISMO dato (numero vs
  // string) y marcaria "los datos cambiaron" aunque el usuario no haya tocado nada --
  // bug real encontrado probando esta misma sesion.
  snapshotProyectoAlAbrir = JSON.parse(JSON.stringify(proyectoActual));
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
  // Si el snapshot ya trae una escala guardada (proyecto previo) se respeta tal cual;
  // si no (proyecto nuevo, o uno de antes de que esto se derivara solo), se deriva de
  // la tarifa que acaba de aplicar aplicarFormularioRecibo() arriba.
  $('escalaCostos').value = f?.escalaCostos || escalaCostosParaTarifa($('tarifa').value);
  $('escalamiento').value = f?.escalamiento ?? 4.0;
  $('aplicaIsr').checked = f?.aplicaIsr || false; $('tasaIsr').value = f?.tasaIsr ?? 30;
  $('tasaIsr').disabled = !$('aplicaIsr').checked;
  $('vigenciaDias').value = f?.vigenciaDias ?? 15;
}
$('aplicaIsr').addEventListener('change', () => { $('tasaIsr').disabled = !$('aplicaIsr').checked; });
// Escala de costos: se deriva sola de la tarifa (ya no se pide a mano) -- gran demanda
// (GDMTO/GDMTH/GDBT) = comercial, pequeña demanda/domestica (PDBT/01/DAC) = residencial.
$('tarifa').addEventListener('change', () => { $('escalaCostos').value = escalaCostosParaTarifa($('tarifa').value); });

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
  // Hallazgo de auditoria (revision de guardado), 2026-11-07: si la subida fallaba
  // (sin internet, Supabase caido) solo se veia en la consola -- el usuario pensaba
  // que el archivo ya habia quedado adjunto cuando en realidad nunca llego a
  // proyectoActual.archivosRecibo ni a Supabase Storage.
  if (subidos.length < files.length) {
    const el = $('estadoRecibo');
    el.className = 'nota aviso';
    el.textContent = subidos.length
      ? `⚠ Se subieron ${subidos.length} de ${files.length} archivo(s) del recibo -- revisa tu conexión e intenta subir el resto de nuevo.`
      : '⚠ No se pudo subir el archivo del recibo (revisa tu conexión a internet) -- no quedó adjuntado a esta cotización, intenta subirlo de nuevo.';
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
  // Mismo fix que agregarArchivosReciboAProyecto (hallazgo de auditoria,
  // 2026-11-07) -- esta seccion no tiene un elemento "estado" propio, se usa
  // alert() en vez de inventar un elemento nuevo en el DOM.
  if (subidos.length < files.length) {
    alert(subidos.length
      ? `Se subieron ${subidos.length} de ${files.length} archivo(s) de verificación -- revisa tu conexión e intenta subir el resto de nuevo.`
      : 'No se pudo subir el archivo de verificación (revisa tu conexión a internet) -- no quedó adjuntado a esta cotización, intenta subirlo de nuevo.');
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
  titular: 'titular', domicilio: 'domicilio',
};
const ETIQUETA_CAMPO = {
  tarifa: 'Tarifa', periodoDias: 'Días del período', periodoKwh: 'kWh del período', dap: 'DAP',
  c_suministro: 'Suministro', c_distribucion: 'Distribución', c_transmision: 'Transmisión',
  c_cenace: 'CENACE', c_energia: 'Energía', c_capacidad: 'Capacidad', c_scnmem: 'SCnMEM',
  c_energia_base: 'Energía Base', c_energia_intermedia: 'Energía Intermedia', c_energia_punta: 'Energía Punta',
  grupoRateKw: 'Columna "$/kW" (Distribución/Capacidad)',
  titular: 'Titular / inmueble', domicilio: 'Domicilio',
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
  // Dos fuentes de aviso independientes (reconciliación aritmética de los $ y
  // plausibilidad de titular/domicilio) -- se muestran juntas si ambas aplican, en
  // vez de que la segunda pise a la primera.
  const avisos = [campos.reconciliacion_advertencia, campos.titular_domicilio_advertencia].filter(Boolean);
  avisoEl.hidden = !avisos.length;
  if (avisos.length) avisoEl.textContent = avisos.map(a => '🛑 ' + a).join(' ');
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
    const traeBt = $('traeBt').checked, traeBonus = $('traeBonus').checked, traeRecargoFp = $('traeRecargoFp').checked;
    const btMonto = Number($('btMonto').value), bonusMonto = Number($('bonusMonto').value), recargoFpMonto = Number($('recargoFpMonto').value);
    const btPct = traeBt ? btMonto / baseAprox : 0.0;
    const fpBonusPct = traeBonus ? bonusMonto / (baseAprox + btMonto) : 0.0;
    // Recargo por FP bajo (hallazgo 6, auditoria 2026-11-06): se suma al cobro en
    // motor.js, nunca se resta -- independiente de fpBonusPct (un recibo real nunca
    // trae los dos a la vez, pero si por algun motivo se marcaran ambos, el motor
    // simplemente aplica los dos efectos, no se asume que son mutuamente excluyentes).
    const recargoFpPct = traeRecargoFp ? recargoFpMonto / (baseAprox + btMonto) : 0.0;
    input = { titular, domicilio, noServicio, tarifa, esDomestica: false, periodoDias, periodoKwh, dap, cargos,
      rateKw, btPct, fpBonusPct, recargoFpPct, moduloWp, cobertura, horasUtiles, costos, escalamientoPct, leido: ultimoLeido, inmueble,
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
      dapDomestica: Number($('d_dap').value), cargoFijoDomestica: Number($('d_cargoFijo').value),
      moduloWp, cobertura, horasUtiles, costos, escalamientoPct, leido: ultimoLeido, inmueble,
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
$('btnCerrarAvisoErrorGuardado').addEventListener('click', ocultarAvisoErrorGuardado);

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
  // tablaColumnasOcultas/tablaFilasOcultas: columnas/filas ocultas POR TABLA (mismo id
  // que graficosExcluidos usa para la tabla completa) -- ver nota en crearProyecto()
  // (clientes.js). Pedido explicito del usuario, 2026-11-05.
  r.tablaColumnasOcultas = proyectoActual.tablaColumnasOcultas || {};
  r.tablaFilasOcultas = proyectoActual.tablaFilasOcultas || {};
  r.calculosActivos = proyectoActual.calculosActivos || todosLosBloques();
  r.ordenSecciones = proyectoActual.ordenSecciones || null;
  // Recupera texto editado que quedo huerfano por los fixes de id-fijo de hoy (ver
  // recuperarTextosEditadosOrfanados en clientes.js) -- no se pisa nada, solo se
  // completa lo que el id nuevo todavia no tenga, usando el id viejo si existe.
  r.textosEditados = recuperarTextosEditadosOrfanados(proyectoActual.textosEditados || {}, r);
  // Copiado para que secciones.js sepa si debe desactivar la edicion de texto (ver
  // _bloqueadaActual en secciones.js) -- bug real encontrado 2026-11-11, esta linea
  // nunca se habia agregado, asi que el candado de una definitiva nunca desactivaba de
  // verdad los campos de texto (aunque guardarProyecto() si rechazaba el guardado).
  r.bloqueada = !!proyectoActual.bloqueada;
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
    sincronizarInputsNombreProyecto();
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
  // Cache del ultimo resultado calculado -- SOLO para el dashboard agregado de todos
  // los clientes (ver renderDashboard()). r.investment/r.ahorroAnual son transitorios
  // (viven en ultimoResultado, en memoria), no se guardaban antes en el proyecto; sin
  // esto, sumar "total cotizado" de TODOS los clientes habria requerido re-correr
  // construirResultado() para cada proyecto de cada cliente solo para abrir el
  // dashboard -- mas lento y mas fragil (depende de que el formulario guardado siga
  // teniendo exactamente la forma que espera el motor). Pedido explicito del usuario,
  // 2026-11-05 (auditoria de scripts): dashboard agregado entre todos los clientes.
  proyectoActual.ultimaInversionTotal = r.investment;
  proyectoActual.ultimoAhorroAnual = r.ahorroAnual;
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
conectarEventosPasosEntrega();

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

// ---------------- Pasos de entrega (ver asegurarPasos/aplicarPaso/crearPasoDesdeActual/
// renombrarPaso/eliminarPaso en clientes.js) ----------------
function _reflejarPasoEnResultado() {
  if (!ultimoResultado || !proyectoActual) return;
  ultimoResultado.seccionesExcluidas = proyectoActual.seccionesExcluidas;
  ultimoResultado.graficosExcluidos = proyectoActual.graficosExcluidos;
  ultimoResultado.tablaColumnasOcultas = proyectoActual.tablaColumnasOcultas;
  ultimoResultado.tablaFilasOcultas = proyectoActual.tablaFilasOcultas;
  renderSecciones(ultimoResultado);
}

function renderSelectorPasos() {
  if (!proyectoActual) return;
  const sel = $('selectorPasoEntrega');
  const pasos = proyectoActual.pasos || {};
  sel.innerHTML = '';
  Object.entries(pasos).forEach(([id, paso]) => {
    const op = document.createElement('option');
    op.value = id;
    op.textContent = paso.nombre + (id === 'completo' ? ' (no se puede borrar)' : '');
    sel.appendChild(op);
  });
  sel.value = proyectoActual.pasoActivo;
  const activo = pasos[proyectoActual.pasoActivo];
  const nApagadas = (proyectoActual.seccionesExcluidas || []).length;
  const nGraficos = (proyectoActual.graficosExcluidos || []).length;
  $('notaPasoActivo').textContent = activo
    ? `Paso activo: "${activo.nombre}" -- ${nApagadas} sección(es) apagada(s) suelta(s) y ${nGraficos} gráfica(s)/tabla(s) apagada(s) dentro de secciones activas en este paso (además de lo que esté apagado por bloque completo en el índice).`
    : '';
  $('btnEliminarPasoEntrega').disabled = proyectoActual.pasoActivo === 'completo' || Object.keys(pasos).length <= 1;
  const etiquetaPdf = $('etiquetaPasoActivoPdf');
  if (etiquetaPdf) {
    etiquetaPdf.textContent = activo
      ? `📑 Vas a generar: "${activo.nombre}". Cambia el paso activo arriba si necesitas entregar otra versión (ej. preliminar vs. completa).`
      : '';
  }
}

function conectarEventosPasosEntrega() {
  $('selectorPasoEntrega').addEventListener('change', () => {
    if (!proyectoActual) return;
    aplicarPaso(proyectoActual, $('selectorPasoEntrega').value);
    guardarProyecto(clienteActual, proyectoActual);
    renderSelectorPasos();
    _reflejarPasoEnResultado();
  });
  $('btnNuevoPasoEntrega').addEventListener('click', () => {
    modoFormularioPaso = 'crear';
    $('formNuevoPasoEntrega').hidden = false;
    $('inputNombreNuevoPaso').value = '';
    $('btnConfirmarNuevoPaso').textContent = 'Crear y activar';
    $('inputNombreNuevoPaso').focus();
  });
  $('btnRenombrarPasoEntrega').addEventListener('click', () => {
    if (!proyectoActual) return;
    modoFormularioPaso = 'renombrar';
    $('formNuevoPasoEntrega').hidden = false;
    $('inputNombreNuevoPaso').value = proyectoActual.pasos?.[proyectoActual.pasoActivo]?.nombre || '';
    $('btnConfirmarNuevoPaso').textContent = 'Renombrar';
    $('inputNombreNuevoPaso').focus();
  });
  $('btnCancelarNuevoPaso').addEventListener('click', () => { $('formNuevoPasoEntrega').hidden = true; });
  $('btnConfirmarNuevoPaso').addEventListener('click', () => {
    if (!proyectoActual) return;
    const nombre = $('inputNombreNuevoPaso').value.trim();
    if (!nombre) { $('inputNombreNuevoPaso').focus(); return; }
    if (modoFormularioPaso === 'renombrar') {
      renombrarPaso(proyectoActual, proyectoActual.pasoActivo, nombre);
    } else {
      crearPasoDesdeActual(proyectoActual, nombre);
    }
    guardarProyecto(clienteActual, proyectoActual);
    $('formNuevoPasoEntrega').hidden = true;
    renderSelectorPasos();
    _reflejarPasoEnResultado();
  });
  $('btnEliminarPasoEntrega').addEventListener('click', () => {
    if (!proyectoActual || proyectoActual.pasoActivo === 'completo') return;
    if (!confirm(`¿Eliminar el paso "${proyectoActual.pasos[proyectoActual.pasoActivo]?.nombre}"? No se borra ningún texto ni cálculo, solo esta combinación de qué se muestra.`)) return;
    eliminarPaso(proyectoActual, proyectoActual.pasoActivo);
    guardarProyecto(clienteActual, proyectoActual);
    renderSelectorPasos();
    _reflejarPasoEnResultado();
  });
}

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
  sincronizarPasoActivoDesdeFlat(proyectoActual);
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
  sincronizarPasoActivoDesdeFlat(proyectoActual);
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
  sincronizarPasoActivoDesdeFlat(proyectoActual);
  guardarProyecto(clienteActual, proyectoActual);
  if (ultimoResultado) { ultimoResultado.graficosExcluidos = proyectoActual.graficosExcluidos; renderSecciones(ultimoResultado); }
}

// Oculta/reactiva UNA columna o UNA fila de una tabla (tablaId = mismo id que ya
// identifica esa tabla para graficoToggle/celdaEditable) -- pedido explicito del
// usuario, 2026-11-05: "permite eliminar columnas o renglones de las tablas". Mismo
// patron que onToggleGrafico: nunca borra de verdad, solo marca oculto; la pantalla
// sigue mostrando la columna/fila atenuada (ver tabla() en secciones.js), el PDF
// (propuesta.js, tablaF()) es el unico lugar que de verdad la quita.
function onToggleColumna(tablaId, indice, activa) {
  const mapa = { ...(proyectoActual.tablaColumnasOcultas || {}) };
  const set = new Set(mapa[tablaId] || []);
  if (activa) set.delete(indice); else set.add(indice);
  mapa[tablaId] = [...set];
  proyectoActual.tablaColumnasOcultas = mapa;
  sincronizarPasoActivoDesdeFlat(proyectoActual);
  guardarProyecto(clienteActual, proyectoActual);
  if (ultimoResultado) { ultimoResultado.tablaColumnasOcultas = proyectoActual.tablaColumnasOcultas; renderSecciones(ultimoResultado); }
}

function onToggleFila(tablaId, indice, activa) {
  const mapa = { ...(proyectoActual.tablaFilasOcultas || {}) };
  const set = new Set(mapa[tablaId] || []);
  if (activa) set.delete(indice); else set.add(indice);
  mapa[tablaId] = [...set];
  proyectoActual.tablaFilasOcultas = mapa;
  sincronizarPasoActivoDesdeFlat(proyectoActual);
  guardarProyecto(clienteActual, proyectoActual);
  if (ultimoResultado) { ultimoResultado.tablaFilasOcultas = proyectoActual.tablaFilasOcultas; renderSecciones(ultimoResultado); }
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

// "💾 Guardar" unificado -- pedido explicito del usuario, 2026-11-09: "la edicion de
// cualquier cosa solo tenga dos botones uno de apagar y otro de guardar... el de
// guardar pues se guardan los cambios los textos nuevos y esa version se pueda usar
// como machote para nuevas cotizaciones". Reemplaza los 2 controles que existian
// (✓/✕ "aplicar a todas" + ↺ "restaurar a predeterminado") -- un solo clic hace las
// 2 cosas: (1) deja el texto guardado para ESTA cotizacion (mismo efecto que ya hacia
// perder el foco, por si no se habia disparado todavia) y (2) lo promueve como
// predeterminado global para las cotizaciones futuras (el machote). Vaciar el texto y
// guardar quita ambos (local y global), vuelve al texto de fábrica en todos lados.
function onGuardarTextoGlobal(id, texto, textoDefecto) {
  proyectoActual.textosEditados = proyectoActual.textosEditados || {};
  if (texto == null || !texto.trim() || texto.trim() === textoDefecto.trim()) {
    delete proyectoActual.textosEditados[id];
  } else {
    proyectoActual.textosEditados[id] = texto;
  }
  guardarProyecto(clienteActual, proyectoActual);
  const limpio = (texto || '').trim();
  if (!limpio) { quitarTextoGlobal(id); } else { guardarTextoGlobal(id, texto); }
  if (ultimoResultado) {
    ultimoResultado.textosEditados = proyectoActual.textosEditados;
    renderSecciones(ultimoResultado);
  }
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
    const art = renderSeccion(n, r, ultimoLeido, onToggleSeccion, onEditarTexto, onToggleCalculo, onGuardarTextoGlobal, onQuitarTextoGlobal, onOcultarTexto, onToggleGrafico, onToggleColumna, onToggleFila);
    agregarNavegacionSeccion(art, numeros[i - 1] ?? null, numeros[i + 1] ?? null);
    cont.append(art);
  });
  renderIndice(r);
  renderPlantillasTarifa(r);
  renderSelectorPasos();
  numerarContenidoEditable();
  observarSecciones();
  // Si hay un link de vista previa compartida activo para esta cotizacion, empuja el
  // estado nuevo a Supabase (con debounce, para no mandar una fila por cada clic/tecla
  // seguidos) -- no hace nada si nunca se activo "Compartir" (ver mas abajo).
  empujarVistaCompartidaConDebounce();
}

// ---------------- Numeracion de TODO el contenido editable (pedido explicito del
// usuario, 2026-11-09: "ponle numeracion a cada texto editable... para poder revisar
// que todo este bien o decirte cual no esta funcionando") ----------------
// BUG REAL encontrado y corregido 2026-11-11: la version original numeraba por POSICION
// en pantalla (№1, №2, №3... contando de arriba hacia abajo, recalculado desde cero en
// cada render). El usuario reporto "el texto del N13 es viejo" comparando el N13 de la
// cotizacion ORIGEN (machote) contra el N13 de la cotizacion NUEVA -- pero como el
// conteo depende de CUANTOS elementos editables hay antes de ese punto (que varia entre
// cotizaciones -- distinto historial, distintas secciones activas, etc.), "№13" en una
// cotizacion y "№13" en otra pueden ser dos parrafos completamente distintos. No era que
// el texto editado se perdiera (confirmado aparte): era que el numero nunca referencio
// al MISMO parrafo entre dos cotizaciones -- la propia funcion original ya avisaba esto
// en su comentario ("el numero... se recalcula... no es un indice fijo"), pero en la
// practica el usuario SI lo estaba usando como si fuera fijo para comparar entre
// cotizaciones, que es justo el caso que no estaba cubierto.
// Fix: la etiqueta ya NO cuenta nada -- se arma leyendo directo el id interno ESTABLE
// que cada elemento ya tiene (dataset.textoId, el mismo que se guarda en
// proyecto.textosEditados) y dandole un formato corto y legible. Con esto, el mismo
// parrafo SIEMPRE muestra la MISMA etiqueta sin importar que otras secciones esten
// activas, que cliente sea, o si se aplico un machote -- justo lo que se necesita para
// poder decir "modifica el texto de la etiqueta tal" de forma confiable.
function etiquetaLegibleDeId(id) {
  let m;
  if ((m = id.match(/^s(\d+)-t(\d+)$/))) return `S${m[1]}.${Number(m[2]) + 1}`;
  if ((m = id.match(/^s(\d+)-titulo$/))) return `S${m[1]}.Título`;
  if ((m = id.match(/^s(\d+)-pregunta$/))) return `S${m[1]}.Pregunta`;
  if ((m = id.match(/^s(\d+)-sub-(.+)$/))) return `S${m[1]}.Sub-${m[2]}`;
  if ((m = id.match(/^s(\d+)-card(\d+)$/))) return `S${m[1]}.C${Number(m[2]) + 1}`;
  if ((m = id.match(/^(.+)-nota-alt$/))) return `${m[1]}·Nota`;
  if ((m = id.match(/^(.+)-h(\d+)$/))) return `${m[1]}·H${Number(m[2]) + 1}`;
  if ((m = id.match(/^(.+)-r(\d+)c(\d+)$/))) return `${m[1]}·F${Number(m[2]) + 1}C${Number(m[3]) + 1}`;
  return id; // id con forma no reconocida -- se muestra tal cual, nunca se oculta
}
function numerarContenidoEditable() {
  const cont = $('contenedorSecciones');
  if (!cont) return;
  cont.querySelectorAll('.badge-num-editable').forEach((b) => b.remove());
  const nodos = cont.querySelectorAll('[data-texto-id]');
  nodos.forEach((nodo) => {
    const id = nodo.dataset.textoId;
    const etiqueta = etiquetaLegibleDeId(id);
    const badge = document.createElement('span');
    badge.className = 'badge-num-editable';
    badge.textContent = etiqueta;
    badge.title = `Etiqueta fija "${etiqueta}" (id interno "${id}") -- SIEMPRE es la misma para este párrafo/celda, sin importar qué más esté prendido/apagado o de qué cliente sea. Úsala si necesitas avisar que algo aquí no funciona o decirme qué modificar.`;
    nodo.parentNode.insertBefore(badge, nodo);
  });
  const contador = $('contadorEditables');
  if (contador) {
    contador.textContent = nodos.length
      ? `${nodos.length} elementos editables, cada uno con su propia etiqueta fija (ej. "S4.2") -- esa etiqueta nunca cambia para ese párrafo, pase lo que pase en el resto de la cotización.`
      : '';
  }
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

function nombreArchivoProyecto(prefijo, extension = 'pdf') {
  const base = `${clienteActual.nombre}_${proyectoActual.nombre}`.replace(/[^a-z0-9]+/gi, '_');
  return `${prefijo}_${base}.${extension}`;
}

// Confirma antes de exportar si el formulario tiene cambios desde el ultimo "Calcular" -- sin
// esto, el PDF salia silenciosamente con los numeros de ANTES de esos cambios (el unico
// guardia que existia era "nunca calculaste", no "calculaste y luego cambiaste algo"). 2026-11-02.
function confirmarSiHayCambiosSinCalcular() {
  if (!hayCambiosSinCalcular()) return true;
  return confirm('Hiciste cambios en el formulario después de la última vez que calculaste -- este PDF saldría con ' +
    'los datos de ANTES de esos cambios. ¿Generar de todos modos?\n\n(Cancelar para volver y presionar "Calcular" primero)');
}

// Antes, generar cualquiera de los 3 documentos (Cotizacion completa/Resumen
// ejecutivo/Anexo tramite) podia disparar HASTA 4 confirm() nativos uno detras de
// otro (cambios sin calcular, texto editado, reconciliacion, plantilla sin verificar)
// -- cada uno solo con botones genericos "Aceptar/Cancelar" del navegador, sin
// distinguirse entre si. Pedido explicito del usuario, 2026-11-07 ("permiteme generar
// los pdf... y guardar los cambios", tras reportar "sale un aviso/confirm y no se que
// hacer"): un solo aviso, con TODO lo pendiente listado de una vez, en vez de una fila
// de popups indistinguibles. "Aceptar" siempre significa "generar de todos modos";
// "Cancelar" siempre significa "déjame revisar primero".
// `incluyeEdiciones`: true para "Cotizacion completa" (btnGenerarPdf), que desde
// 2026-11-07 SI lee las ediciones de texto/tablas reales (ver
// generarPdfCompletaDesdeVista en propuesta.js) -- Resumen ejecutivo/Anexo tramite CFE
// (resumen.js) siguen usando texto fijo, sin tocar, asi que para esos 2 el aviso de
// "tus ediciones no salen aqui" sigue aplicando.
function avisosPendientesParaDocumento(incluyeEdiciones = false) {
  const avisos = [];
  if (hayCambiosSinCalcular()) {
    avisos.push('• Hiciste cambios en el formulario después de la última vez que calculaste -- este documento ' +
      'saldría con los datos de ANTES de esos cambios.');
  }
  const nEditados = Object.keys(proyectoActual.textosEditados || {}).length;
  if (nEditados && !incluyeEdiciones) {
    avisos.push(`• Editaste ${nEditados} párrafo(s)/aviso(s)/celda(s) en pantalla para esta cotización -- este ` +
      'documento NO incluye esas ediciones (sigue usando el texto original de la app).');
  }
  // Hallazgo 10, auditoria 2026-11-06: la reconciliacion aritmetica del recibo
  // (campos.reconciliacion_advertencia, ver recibo.js) solo se mostraba como aviso
  // dismissible -- se podia generar un documento con un recibo mal leido (caso real:
  // $128,429 de diferencia en el fixture secfinanzas) sin ningun freno.
  const adv = ultimoLeido && ultimoLeido.reconciliacion_advertencia;
  if (adv) avisos.push('• El recibo leído tiene una advertencia de reconciliación sin resolver:\n  ' + adv);
  if (proyectoActual.plantillaOrigen && !proyectoActual.plantillaVerificada) {
    avisos.push('• Esta cotización se creó desde otra ya guardada y todavía no marcaste que verificaste los ' +
      'datos contra el recibo real de este cliente.');
  }
  return avisos;
}
function confirmarAntesDeGenerarDocumento(incluyeEdiciones = false) {
  const avisos = avisosPendientesParaDocumento(incluyeEdiciones);
  if (!avisos.length) return true;
  return confirm('Antes de generar, revisa esto:\n\n' + avisos.join('\n\n') +
    '\n\n¿Generar de todos modos?\n(Cancelar para revisar primero)');
}

// Convierte un archivo adjunto YA SUBIDO (Supabase Storage -- {nombre,tipo,url,ruta})
// en {dataUrl,ancho,alto} listo para doc.addImage(). Reusa archivoAImagenComprimida()
// (misma funcion que ya convierte imagen-o-PDF-de-1-pagina a JPEG para la foto del
// sembrado/inmueble) -- solo hace falta bajar el archivo real primero porque esa
// funcion espera un File/Blob local, no una URL remota.
async function archivoAdjuntoAImagenPdf(archivo) {
  const resp = await fetch(archivo.url);
  if (!resp.ok) throw new Error(`No se pudo descargar "${archivo.nombre}" (HTTP ${resp.status}).`);
  const blob = await resp.blob();
  const file = new File([blob], archivo.nombre || 'documento', { type: archivo.tipo || blob.type });
  return archivoAImagenComprimida(file, { maxAncho: 1800, calidad: 0.8 });
}

// Prepara r._archivosReciboImgs/_archivosVerificacionImgs ANTES de generarPdf() -- esas
// 2 secciones (17/18 en pantalla: "Documento: recibo original"/"Documento: verificación
// en sitio") nunca tuvieron página propia en "Cotización completa" (hueco documentado
// desde el 2026-10-31, cerrado recien el 2026-11-07 agregando paginaDocumentoRecibo/
// paginaDocumentoVerificacion en propuesta.js). Si un archivo no se puede descargar
// (sin internet, url vencida, etc.) se omite ese archivo puntual -- nunca bloquea la
// generacion del resto del documento.
async function prepararDocumentosAdjuntosParaPdf(r) {
  async function convertirTodos(archivos) {
    const out = [];
    for (const a of archivos || []) {
      try { out.push(await archivoAdjuntoAImagenPdf(a)); }
      catch (err) { console.error('No se pudo preparar un documento adjunto para el PDF:', err); }
    }
    return out;
  }
  r._archivosReciboImgs = await convertirTodos(proyectoActual.archivosRecibo);
  r._archivosVerificacionImgs = await convertirTodos(proyectoActual.archivosVerificacion);
}

// Abre vista-previa.html en una ventana con nombre fijo -- pedido explicito del
// usuario, 2026-11-09: "uso dos pantallas... que se abra y se vea la pagina de
// previsualizacion". Usar el MISMO nombre de ventana ("vistaPreviaCFE") en cada clic
// hace que, si ya esta abierta (ej. en el segundo monitor), el navegador reuse esa
// misma ventana y solo navegue a la cotizacion nueva, en vez de abrir una ventana
// distinta cada vez.
$('btnAbrirVistaPrevia').addEventListener('click', () => {
  if (!clienteActual || !proyectoActual) return;
  const url = `vista-previa.html?cliente=${encodeURIComponent(clienteActual.id)}&proyecto=${encodeURIComponent(proyectoActual.id)}`;
  window.open(url, 'vistaPreviaCFE', 'width=760,height=900');
});

// ---------------- Vista previa compartida por LINK (para un colaborador en OTRO
// dispositivo, no la segunda pantalla de Isaac -- esa es btnAbrirVistaPrevia de
// arriba) -- pedido explicito del usuario, 2026-11-09: "puedes hacer un link para
// compartir y que tambien vea el colaborador la vista previa en tiempo real". La
// pagina publica (vista-previa-compartida.html) hace polling de la tabla Supabase
// `vista_compartida`; aqui solo hace falta EMPUJAR el proyecto completo ahi cada vez
// que algo cambia. Mismo modelo de seguridad que el resto de este proyecto (sin
// autenticacion, cualquiera con el link ve los datos) -- decision consciente, ya
// aceptada por el usuario al pedir esto.
function urlVistaCompartida(token) {
  return `${location.origin}${location.pathname.replace(/index\.html$/, '')}vista-previa-compartida.html?token=${encodeURIComponent(token)}`;
}

function tokenCompartirAleatorio() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID().replace(/-/g, '').slice(0, 14);
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function mostrarCajaLinkCompartido(token) {
  $('cajaLinkCompartido').hidden = false;
  $('btnDejarDeCompartir').hidden = false;
  const url = urlVistaCompartida(token);
  $('inputLinkCompartido').value = url;
}

// Empuja el proyecto actual (completo) a la fila de vista_compartida de este token --
// se llama una vez al activar "Compartir", y despues en automatico desde
// renderSecciones() cada vez que algo cambia (ver mas abajo, con debounce para no
// mandar una fila por cada clic/tecla seguidos).
async function empujarVistaCompartida() {
  if (!proyectoActual?.compartirToken || !clienteActual) return;
  try {
    await supabaseUpsertar('vista_compartida', {
      token: proyectoActual.compartirToken,
      cliente_id: clienteActual.id,
      proyecto_id: proyectoActual.id,
      cliente_nombre: clienteActual.nombre,
      proyecto: proyectoActual,
      actualizado_en: new Date().toISOString(),
    }, 'token');
  } catch (err) {
    console.error('No se pudo actualizar la vista previa compartida:', err);
  }
}

let _debounceCompartir = null;
function empujarVistaCompartidaConDebounce() {
  if (!proyectoActual?.compartirToken) return;
  clearTimeout(_debounceCompartir);
  _debounceCompartir = setTimeout(empujarVistaCompartida, 900);
}

$('btnCompartirVistaPrevia').addEventListener('click', async () => {
  if (!clienteActual || !proyectoActual) return;
  const boton = $('btnCompartirVistaPrevia');
  if (proyectoActual.compartirToken) { mostrarCajaLinkCompartido(proyectoActual.compartirToken); return; }
  boton.disabled = true;
  const textoOriginal = boton.textContent;
  boton.textContent = 'Generando link…';
  try {
    const token = tokenCompartirAleatorio();
    proyectoActual.compartirToken = token;
    guardarProyecto(clienteActual, proyectoActual);
    await empujarVistaCompartida();
    mostrarCajaLinkCompartido(token);
  } catch (err) {
    alert('No se pudo crear el link de la vista compartida: ' + err.message);
    delete proyectoActual.compartirToken;
    guardarProyecto(clienteActual, proyectoActual);
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
});

$('btnDejarDeCompartir').addEventListener('click', async () => {
  if (!proyectoActual?.compartirToken) return;
  if (!confirm('¿Dejar de compartir esta cotización? El link dejará de funcionar para quien lo tenga.')) return;
  try { await supabaseEliminarPorFiltro('vista_compartida', `token=eq.${encodeURIComponent(proyectoActual.compartirToken)}`); }
  catch (err) { console.error('No se pudo borrar la vista compartida en Supabase:', err); }
  delete proyectoActual.compartirToken;
  guardarProyecto(clienteActual, proyectoActual);
  $('cajaLinkCompartido').hidden = true;
  $('btnDejarDeCompartir').hidden = true;
});

$('btnCopiarLinkCompartido').addEventListener('click', async () => {
  const input = $('inputLinkCompartido');
  input.select();
  try { await navigator.clipboard.writeText(input.value); $('btnCopiarLinkCompartido').textContent = '✓ Copiado'; }
  catch { document.execCommand('copy'); $('btnCopiarLinkCompartido').textContent = '✓ Copiado'; }
  setTimeout(() => { $('btnCopiarLinkCompartido').textContent = '📋 Copiar link'; }, 2000);
});

$('btnWhatsappLinkCompartido').addEventListener('click', () => {
  const url = $('inputLinkCompartido').value;
  const texto = encodeURIComponent(`Te comparto la vista previa en vivo de esta cotización -- se va actualizando sola:\n${url}`);
  window.open(`https://wa.me/?text=${texto}`, '_blank');
});

$('btnGenerarPdf').addEventListener('click', async () => {
  if (!ultimoResultado) { alert('Calcula primero.'); return; }
  if (!confirmarAntesDeGenerarDocumento(true)) return;
  const boton = $('btnGenerarPdf');
  boton.disabled = true;
  const textoOriginal = boton.textContent;
  boton.textContent = 'Generando…';
  try {
    await prepararDocumentosAdjuntosParaPdf(ultimoResultado);
    // generarPdfCompletaDesdeVista (no generarPdf) -- lee el contenido YA renderizado
    // en #contenedorSecciones, con las ediciones de texto/tablas aplicadas. Pedido
    // explicito del usuario, 2026-11-07. generarPdf() (el generador de texto fijo de
    // siempre) se deja sin usar pero intacta en propuesta.js, por si hace falta volver.
    const doc = generarPdfCompletaDesdeVista(ultimoResultado);
    mostrarPdfEnVisor(doc, nombreArchivoProyecto('Cotizacion'));
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
});

// Pedido explicito del usuario, 2026-11-11: "un boton para descargar la cotizacion no
// solo en pdf tambien en excel". Lee las TABLAS ya visibles en pantalla (una hoja por
// tabla, mismo respeto a secciones/graficos/columnas/filas apagadas que el PDF) -- ver
// js/excel.js.
$('btnGenerarExcel').addEventListener('click', async () => {
  if (!ultimoResultado) { alert('Calcula primero.'); return; }
  const boton = $('btnGenerarExcel');
  boton.disabled = true;
  const textoOriginal = boton.textContent;
  boton.textContent = 'Generando…';
  try {
    await descargarExcelCotizacion(ultimoResultado, nombreArchivoProyecto('Cotizacion', 'xlsx'));
  } catch (err) {
    alert('No se pudo generar el Excel: ' + err.message);
    console.error(err);
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
});

// (el boton "Cotizacion editada" / window.print() se quito 2026-11-07, pedido
// explicito del usuario: "los botones que no sirvan o esten redudantes quitalos" --
// quedo redundante en cuanto "Cotizacion completa" empezo a leer la pantalla real
// con sus ediciones de verdad, confirmado con la auditoria automatizada de cobertura
// de texto. El bloque CSS "body.modo-impresion" que usaba tambien se quito de
// styles.css.)

// Renombrar + guardar sin pisar una cotizacion ya guardada con datos distintos --
// pedido explicito del usuario, 2026-11-07, tras un bug real: abrio "Casa del Abue"
// (ya guardada como definitiva), cargo el recibo de "Carretera de Cuota" en la MISMA
// pantalla (mismo proyectoActual.id), calculo (esto YA autoguarda -- ver
// calcularYRenderizar, "guardarProyecto(clienteActual, proyectoActual)" tras cada
// Calcular) y al renombrar+guardar se quedo con los datos de Carretera bajo el mismo
// id que antes tenia Casa del Abue -- la version vieja ya no existia en ningun lado.
//
// Por eso NO sirve comparar contra lo que hay en disco en este momento (ya esta
// contaminado por el autoguardado de Calcular) -- se compara contra
// snapshotProyectoAlAbrir, una copia completa tomada en abrirProyecto() ANTES de que
// el usuario tocara nada en esta sesion de edicion. Si el nombre cambio Y el
// formulario (recibo/cargos) ya es distinto al que tenia esa cotizacion al abrirla, se
// trata como "Guardar como": se RESTAURA el registro original (mismo id) a como
// estaba al abrirlo, y se crea una cotizacion NUEVA (id nuevo) con los datos de
// ahorita bajo el nombre nuevo. Si solo cambio el nombre (mismo recibo/datos, ej.
// corrigiendo un error de dedo) se renombra la misma, sin duplicar -- de otro modo,
// renombrar justo despues del primer "Marcar como definitiva" (comun: guardar
// primero, ponerle el nombre real despues) crearia un duplicado vacio de si misma.
function guardarProyectoRespetandoRenombre(cliente, proyecto) {
  const snap = snapshotProyectoAlAbrir;
  const esElMismoQueSeAbrio = snap && snap.id === proyecto.id;
  const nombreCambio = esElMismoQueSeAbrio && snap.nombre.trim() !== proyecto.nombre.trim();
  // snap.formulario null = la cotizacion estaba en blanco al abrirla (recien creada,
  // "+ Cotizacion en blanco" o similar) -- llenarla por primera vez y ponerle nombre
  // real despues NO es un "Guardar como", es la captura normal. Solo cuenta como
  // "los datos cambiaron" si YA habia datos reales antes y ahora son otros.
  const datosCambiaron = esElMismoQueSeAbrio && !!snap.formulario &&
    JSON.stringify(snap.formulario) !== JSON.stringify(proyecto.formulario);
  if (!esElMismoQueSeAbrio || !nombreCambio || !datosCambiaron) {
    guardarProyecto(cliente, proyecto);
    return { proyecto, esNuevo: false, nombreAnterior: null };
  }
  const datosDeAhorita = JSON.parse(JSON.stringify(proyecto));
  // Restaura el registro original (mismo id) a como estaba al abrirlo -- deshace el
  // autoguardado de Calcular que ya lo habia pisado con los datos nuevos.
  Object.assign(proyecto, snap);
  guardarProyecto(cliente, proyecto);
  // Crea la cotizacion nueva con los datos de ahorita (los que se iban a guardar).
  const nuevo = crearProyecto(cliente, { nombre: datosDeAhorita.nombre });
  Object.assign(nuevo, datosDeAhorita, { id: nuevo.id, creadoEn: nuevo.creadoEn });
  guardarProyecto(cliente, nuevo);
  snapshotProyectoAlAbrir = JSON.parse(JSON.stringify(nuevo));
  return { proyecto: nuevo, esNuevo: true, nombreAnterior: snap.nombre };
}

// Renombrar la cotizacion -- pedido explicito del usuario, 2026-11-05: poder
// "ponerle nombre con su proyecto y su cliente" antes de guardarla como definitiva.
// Se guarda en blur (igual que los campos editables de texto), no en cada tecla.
// Pedido explicito del usuario, 2026-11-11 ("no veo donde se puede editar... la
// cotización"): antes SOLO se podia renombrar desde este input, escondido dentro de la
// pestaña "Guardar cotización" -- la barra de arriba (visible SIEMPRE) solo mostraba el
// nombre como texto fijo. Ahora esa misma barra tambien es editable (mismo patron que
// el nombre del cliente), sincronizada con este input via sincronizarInputsNombreProyecto().
function sincronizarInputsNombreProyecto() {
  if (!proyectoActual) return;
  $('inputNombreProyecto').value = proyectoActual.nombre || '';
  $('proyectoNombreBarraInput').value = proyectoActual.nombre || '';
}
function renombrarProyectoActual(nuevoNombreCrudo) {
  if (!proyectoActual) return;
  const nuevo = nuevoNombreCrudo.trim();
  if (!nuevo || nuevo === proyectoActual.nombre) { sincronizarInputsNombreProyecto(); return; }
  proyectoActual.nombre = nuevo;
  sincronizarInputsNombreProyecto();
  revisarDuplicadoProyecto(nuevo, proyectoActual.id);
  const resultado = guardarProyectoRespetandoRenombre(clienteActual, proyectoActual);
  if (resultado.esNuevo) {
    proyectoActual = resultado.proyecto;
    sincronizarInputsNombreProyecto();
    $('estadoGuardadoCotizacion').className = 'nota aviso';
    $('estadoGuardadoCotizacion').textContent =
      `✓ Se creó una cotización NUEVA llamada "${nuevo}" con los datos de ahorita -- ` +
      `"${resultado.nombreAnterior}" se quedó intacta tal como estaba guardada.`;
  }
}
$('inputNombreProyecto').addEventListener('blur', () => renombrarProyectoActual($('inputNombreProyecto').value));
$('proyectoNombreBarraInput').addEventListener('blur', () => renombrarProyectoActual($('proyectoNombreBarraInput').value));

// Logica compartida de "Guardar cotización" y "Marcar como definitiva" -- ambos
// botones guardan/mueven la cotizacion al cliente elegido en el selector.
//
// "Marcar como definitiva y guardar" YA NO marca proyecto.definitiva=true sobre el
// MISMO registro que se sigue editando -- pedido explicito del usuario, 2026-11-11:
// "que la que ya se guardo para entregar al cliente no se toque ya" + que esa version
// quede disponible "en un boton solo para reusar" (el machote, ver
// candidatosMachote()) "y en otro lado como parte del proyecto que se esta haciendo"
// (la cotizacion sigue en el historial de este cliente, editable con normalidad). En
// vez de eso: se CLONA el estado completo de ahorita en un registro nuevo y aparte
// (clonarProyectoCongelado(), en clientes.js), marcado definitiva+bloqueada -- ese
// clon es "lo que se le entrego al cliente", nunca se vuelve a tocar (guardarProyecto()
// lo rechaza aunque alguien lo intente). La cotizacion que se sigue viendo en pantalla
// (proyectoActual) se queda exactamente como estaba, sin el badge de definitiva, lista
// para seguir ajustandose sin riesgo de pisar lo ya entregado.
//
// "Marcar como definitiva" ademas sube un respaldo a la nube automaticamente (pedido
// explicito 2026-11-06: "checa que cuando se guarde la cotizacion validada se guarde
// en la nube") -- a diferencia de "Traer de la nube" (bajarDeNube, SIEMPRE manual con
// confirmacion porque reemplaza datos locales, ver nube.js), subir NUNCA pisa nada de
// otro dispositivo, solo empuja lo de este -- es seguro automatizarlo solo en esta
// direccion. "Guardar cotización" (borrador, no definitiva) se queda solo local, igual
// que antes -- el respaldo automatico es solo para la version ya validada.
//
// `proposito` ('muestra' | 'cliente') -- pedido explicito del usuario, 2026-11-11:
// "cuando se genere ya decido si este nuevo lo guardo como definitivo PARA MUESTRA o
// definitivo PARA EL CLIENTE". Solo importa cuando definitiva=true, se le pasa tal
// cual a clonarProyectoCongelado().
async function guardarCotizacionConCliente({ definitiva, proposito } = {}) {
  if (!ultimoResultado) { alert('Calcula primero.'); return false; }
  if ($('selectClienteGuardar').value === '__nuevo__') {
    alert('Primero crea el cliente nuevo con el botón "Crear cliente" (o cancélalo) antes de guardar.');
    return false;
  }
  const clienteDestinoId = $('selectClienteGuardar').value;
  // Pedido explicito del usuario, 2026-11-11: "independientemente de que esté congelada
  // o definitiva, sí deja guardarla con el cliente que yo haya creado -- el nombre de
  // la cotización no cambia, solo con qué cliente va a estar guardada". Una definitiva
  // congelada se queda protegida contra EDITAR su contenido o volver a congelarse, pero
  // mover A QUÉ CLIENTE pertenece no cambia ni el nombre ni el contenido -- es solo
  // organizativo, asi que esto SÍ se permite incluso bloqueada.
  if (proyectoActual.bloqueada) {
    const estaMoviendoDeCliente = clienteDestinoId && clienteDestinoId !== clienteActual.id;
    if (definitiva || !estaMoviendoDeCliente) {
      alert('Esta cotización ya se marcó como definitiva y quedó congelada (es la versión que se le entregó al cliente) -- no se puede volver a guardar ni modificar su contenido. Elige un cliente distinto arriba para solo moverla, o desbloquéala primero si necesitas editarla.');
      return false;
    }
  }
  proyectoActual.cotizacionGuardadaEn = new Date().toISOString();
  let seMovioDeCliente = false;
  if (clienteDestinoId && clienteDestinoId !== clienteActual.id) {
    seMovioDeCliente = true;
    const destino = moverProyecto(clienteActual.id, clienteDestinoId, proyectoActual);
    if (!destino) { alert('No se pudo mover la cotización a ese cliente.'); return false; }
    clienteActual = destino;
    $('clienteNombreBarra').value = clienteActual.nombre;
    $('clienteTipoBarra').textContent = etiquetaTipo(clienteActual.tipo);
    $('clienteTipoBarra').className = `chip-tipo ${claseTipo(clienteActual.tipo)}`;
    poblarSelectClienteGuardar();
  }
  let avisoSeparada = '';
  if (!seMovioDeCliente) {
    // Solo aqui (no se movio de cliente arriba) puede aplicar el "Guardar como" --
    // ver guardarProyectoRespetandoRenombre() mas abajo para el criterio completo.
    const resultado = guardarProyectoRespetandoRenombre(clienteActual, proyectoActual);
    if (resultado.esNuevo) {
      proyectoActual = resultado.proyecto;
      avisoSeparada = ` (se creó como cotización NUEVA -- "${resultado.nombreAnterior}" se quedó intacta.)`;
    }
  }
  // Clona el estado de ahorita en un registro aparte y congelado (ver
  // clonarProyectoCongelado en clientes.js) -- ESE clon es "lo que se le entrega al
  // cliente" y nunca se vuelve a tocar. proyectoActual (lo que se sigue viendo en
  // pantalla) se queda igual, sin badge de definitiva, listo para seguir editandose.
  let avisoDefinitiva = '';
  if (definitiva) {
    guardarProyecto(clienteActual, proyectoActual); // asegura que el clon parta del estado mas reciente
    const clon = clonarProyectoCongelado(clienteActual, proyectoActual, proposito);
    const etiquetaProposito = clon.propositoDefinitiva === 'muestra' ? 'MUESTRA (ejemplo reusable por tarifa)' : 'ENTREGA del cliente';
    avisoDefinitiva = ` Se creó "${clon.nombre}" como versión DEFINITIVA para ${etiquetaProposito} y quedó congelada (ya no se puede modificar) -- disponible en el historial de este cliente${clon.propositoDefinitiva === 'muestra' ? ' y para usarse como ejemplo al dar de alta un cliente nuevo' : ''}. Esta cotización que ves ahora sigue editable con normalidad.`;
  }
  const etiqueta = definitiva ? 'Versión definitiva creada' : 'Guardada';
  $('estadoGuardadoCotizacion').className = 'nota ok';
  $('estadoGuardadoCotizacion').textContent =
    `✓ ${etiqueta} con "${clienteActual.nombre}", cotización "${proyectoActual.nombre}". Subiendo respaldo a la nube...` + avisoSeparada + avisoDefinitiva;
  // Pedido explicito del usuario, 2026-11-08 ("tambien se tiene que guardar en la
  // nube"): antes SOLO "Marcar como definitiva" subia a la nube automaticamente --
  // "Guardar cotización" (borrador) se quedaba solo local a proposito, para no subir
  // cada cambio chico mientras se sigue editando. Eso generaba confusion (¿cual guarda
  // en la nube y cual no?) -- ahora los dos suben, simplificando el flujo a "Guarda
  // (local + nube) -> Genera el PDF".
  try {
    await subirANube();
    $('estadoGuardadoCotizacion').textContent =
      `✓ ${etiqueta} con "${clienteActual.nombre}", cotización "${proyectoActual.nombre}". ` +
      'Respaldo en la nube actualizado.' + avisoSeparada + avisoDefinitiva;
  } catch (err) {
    $('estadoGuardadoCotizacion').className = 'nota aviso';
    $('estadoGuardadoCotizacion').textContent =
      `✓ ${etiqueta} en este dispositivo, pero NO se pudo subir el respaldo a la nube ` +
      `(${err.message}). Usa "Guardar copia en la nube" más tarde para intentarlo de nuevo.` + avisoSeparada + avisoDefinitiva;
    console.error(err);
  }
  return true;
}

$('btnGuardarCotizacion').addEventListener('click', () => guardarCotizacionConCliente({ definitiva: false }));
$('btnMarcarDefinitivaMuestra').addEventListener('click', () => guardarCotizacionConCliente({ definitiva: true, proposito: 'muestra' }));
$('btnMarcarDefinitivaCliente').addEventListener('click', () => guardarCotizacionConCliente({ definitiva: true, proposito: 'cliente' }));

// Crear un cliente nuevo sin salir de la cotizacion abierta -- elegir "+ Nuevo
// cliente..." en el selector abre este mini-formulario en vez de guardar directo.
$('selectClienteGuardar').addEventListener('change', () => {
  $('filaNuevoClienteGuardar').hidden = $('selectClienteGuardar').value !== '__nuevo__';
  if ($('selectClienteGuardar').value === '__nuevo__') $('inputNuevoClienteGuardarNombre').focus();
});

$('btnCancelarClienteGuardar').addEventListener('click', () => {
  $('filaNuevoClienteGuardar').hidden = true;
  $('inputNuevoClienteGuardarNombre').value = '';
  $('selectClienteGuardar').value = clienteActual.id;
});

$('btnCrearClienteGuardar').addEventListener('click', () => {
  const nombre = $('inputNuevoClienteGuardarNombre').value.trim();
  if (!nombre) { alert('Falta el nombre del cliente nuevo.'); return; }
  const tipo = $('selectNuevoClienteGuardarTipo').value;
  const nuevo = crearCliente({ nombre, tipo });
  $('filaNuevoClienteGuardar').hidden = true;
  $('inputNuevoClienteGuardarNombre').value = '';
  poblarSelectClienteGuardar();
  $('selectClienteGuardar').value = nuevo.id;
  $('estadoGuardadoCotizacion').className = 'nota ok';
  $('estadoGuardadoCotizacion').textContent =
    `✓ Cliente "${nuevo.nombre}" creado -- ahora dale clic a "Guardar cotización" o "Marcar como definitiva" para pasarle esta cotización.`;
});

// El PDF de verdad se intenta adjuntar via Web Share API (navigator.share con un
// File) -- funciona en celular Android/Chrome y algunos navegadores de escritorio
// recientes que soportan compartir archivos; ahi el usuario elige WhatsApp del menu
// de compartir del sistema y el PDF ya sale adjunto. wa.me/api.whatsapp.com NUNCA
// permite adjuntar un archivo desde un link (limite real de WhatsApp, no de esta
// app) -- si el navegador no soporta compartir archivos, cae al link de siempre
// (abre el chat de un numero fijo con el texto, el PDF se adjunta a mano).
$('btnEnviarWhatsapp').addEventListener('click', async () => {
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
  try {
    const doc = generarPdf(ultimoResultado, { secciones: proyectoActual.seccionesActivas, seccionesExcluidas: proyectoActual.seccionesExcluidas });
    const blob = doc.output('blob');
    const archivo = new File([blob], nombreArchivoProyecto('Cotizacion'), { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      await navigator.share({ files: [archivo], text: mensaje, title: `Cotización ${r.titular}` });
      return; // el PDF ya salio adjunto -- no abrir ademas el link de solo texto
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return; // el usuario cancelo el menu de compartir a proposito
    console.error('No se pudo compartir el PDF directo, cae al link de WhatsApp con solo texto:', err);
  }
  const url = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank');
});

// ---------------- Actualizar (topbar, visible en toda la app) ----------------
// Pedido explicito del usuario, 2026-11-10: "para que no cierre y abra la app, con el
// boton actualizar que recargue los cambios". Antes este boton solo volvia a
// RENDERIZAR con el codigo JS que ya estaba cargado en esta misma apertura de la
// pagina -- si se desplegaba una version nueva de app.js/secciones.js/etc. (sin tocar
// service-worker.js), nada forzaba a traer ese codigo nuevo; solo se reflejaba si el
// usuario cerraba y volvia a abrir la app instalada (una navegacion nueva de verdad).
// Ahora "Actualizar" SIEMPRE hace una recarga real de la pagina (location.reload()) --
// junto con el fetch "cache: no-store" del propio service worker (ver
// service-worker.js), esto garantiza traer el codigo mas reciente desplegado sin tener
// que cerrar/reabrir la app. Se guarda primero el formulario en pantalla (si hay un
// proyecto abierto) para no perder lo que se este escribiendo -- mismo cuidado que ya
// tenia esta funcion desde el 2026-11-06.
// Pedido explicito del usuario, 2026-11-11: "no necesariamente me mandes al inicio,
// igual que se actualice donde este si estoy en la cotizacion" -- location.reload()
// siempre volvia a la pantalla de Clientes (es el <main> visible por default en el
// HTML), perdiendo en qué cliente/cotización se estaba trabajando. Se guarda un
// marcador de una sola vez en sessionStorage (no localStorage -- es solo para
// sobrevivir ESTE refresh, no para reabrir la app días después en otro lado) y se
// restaura al arrancar, más abajo en este archivo.
const CLAVE_REANUDAR = 'cfe_reanudar_tras_refrescar_v1';
function guardarPantallaParaReanudar() {
  if (!$('pantallaCliente').hidden && clienteActual && proyectoActual) {
    sessionStorage.setItem(CLAVE_REANUDAR, JSON.stringify({ clienteId: clienteActual.id, proyectoId: proyectoActual.id }));
  } else if (!$('pantallaProyectos').hidden && clienteActual) {
    sessionStorage.setItem(CLAVE_REANUDAR, JSON.stringify({ clienteId: clienteActual.id }));
  } else {
    sessionStorage.removeItem(CLAVE_REANUDAR);
  }
}
async function actualizarApp() {
  if (!$('pantallaCliente').hidden && clienteActual && proyectoActual) {
    try { proyectoActual.formulario = leerFormulario(); guardarProyecto(clienteActual, proyectoActual); } catch (e) { /* no bloquea la recarga si falla */ }
  }
  guardarPantallaParaReanudar();
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.update();
  } catch (e) { /* no bloquea la recarga si falla */ }
  location.reload();
}
$('btnRefrescar').addEventListener('click', actualizarApp);
// Pedido explicito del usuario, 2026-11-11: el mismo boton tambien hasta abajo de la
// cotizacion -- es una pantalla larga (25 secciones + PDF/Excel) y volver arriba solo
// para actualizar era incomodo. Mismo handler, ningun comportamiento nuevo que mantener
// por separado.
$('btnRefrescarAbajo').addEventListener('click', actualizarApp);

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
// Herramienta de diagnostico: ¿el PDF realmente refleja mis ediciones/apagados?
// =====================================================================
// Pedido explicito del usuario (2026-11-09), tras reportar que al editar un texto y
// apagar una seccion, el PDF generado no traia esos cambios. La reproduccion manual
// (cliente de prueba, editar + apagar + generar) SI reflejo todo correctamente -- la
// hipotesis mas probable es cache vieja de la PWA en su navegador (ya paso antes en
// este proyecto). Esta funcion queda como herramienta reusable para la proxima vez:
// genera el PDF real con el estado actual, lo lee con pdf.js (ya vendorizado, mismo
// patron de otras auditorias de este proyecto), y compara contra lo que
// proyectoActual dice que deberia estar editado/apagado. Se corre a mano desde la
// consola del navegador: verificarEdicionesEnPdf()  (requiere haber calculado antes).
async function verificarEdicionesEnPdf() {
  if (!ultimoResultado) { console.error('Calcula primero.'); return; }
  const problemas = [];
  const ok = [];

  // 1) Generar el PDF real (mismo camino que el boton "Cotizacion completa") y leer
  // su texto completo con pdf.js.
  await prepararDocumentosAdjuntosParaPdf(ultimoResultado);
  const doc = generarPdfCompletaDesdeVista(ultimoResultado);
  const buffer = doc.output('arraybuffer');
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  let textoPdf = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const pagina = await pdf.getPage(p);
    const contenido = await pagina.getTextContent();
    textoPdf += contenido.items.map((it) => it.str).join(' ') + '\n';
  }

  // 2) Textos editados (proyectoActual.textosEditados): cada uno deberia aparecer
  // literal en el PDF, A MENOS que su seccion este completamente apagada (ahi es
  // correcto que no aparezca). Limitacion conocida: el id solo trae el numero de
  // seccion cuando empieza con "sN-" (parrafos/titulos); las celdas de tabla usan el
  // id de la propia tabla (ej. "g04-calc-clasificacion-h0", sin el prefijo "sN-"), asi
  // que esta exencion no aplica ahi -- si editas una celda DENTRO de una seccion
  // apagada, esta funcion la va a reportar como "problema" aunque sea el
  // comportamiento correcto. No se resolvio por tiempo -- revisar a mano si pasa.
  const seccionesApagadas = new Set(proyectoActual.seccionesExcluidas || []);
  Object.entries(proyectoActual.textosEditados || {}).forEach(([id, texto]) => {
    const numeroSeccion = Number((id.match(/^s(\d+)-/) || [])[1]);
    if (seccionesApagadas.has(numeroSeccion)) return; // su seccion esta apagada, correcto que no salga
    const extracto = String(texto).slice(0, 60);
    if (textoPdf.includes(extracto)) {
      ok.push(`✓ Texto editado "${id}" SI aparece en el PDF: "${extracto}…"`);
    } else {
      problemas.push(`✗ Texto editado "${id}" NO aparece en el PDF: "${extracto}…"`);
    }
  });

  // 3) Parrafos ocultos a mano (textosOcultos) -- su texto actual en pantalla NO
  // deberia aparecer en el PDF.
  Object.keys(proyectoActual.textosOcultos || {}).forEach((id) => {
    const nodo = document.querySelector(`[data-texto-id="${id}"]`);
    if (!nodo) return;
    const extracto = nodo.textContent.trim().slice(0, 60);
    if (extracto && textoPdf.includes(extracto)) {
      problemas.push(`✗ Parrafo oculto "${id}" SI aparece en el PDF (no debería): "${extracto}…"`);
    } else if (extracto) {
      ok.push(`✓ Parrafo oculto "${id}" correctamente ausente del PDF.`);
    }
  });

  // 4) Secciones apagadas por completo -- su titulo NO deberia aparecer.
  // OJO: TITULOS_SECCIONES es un arreglo 0-indexado (TITULOS_SECCIONES[0] es la
  // seccion 1) -- hay que restar 1 al numero de seccion, si no se compara contra el
  // titulo de la seccion siguiente.
  (proyectoActual.seccionesExcluidas || []).forEach((numero) => {
    const titulo = TITULOS_SECCIONES[numero - 1];
    if (!titulo) return;
    if (textoPdf.includes(titulo)) {
      problemas.push(`✗ Sección ${numero} ("${titulo}") está apagada pero SÍ aparece en el PDF.`);
    } else {
      ok.push(`✓ Sección ${numero} ("${titulo}") correctamente ausente del PDF.`);
    }
  });

  // 5) Graficas/tablas apagadas individualmente (graficosExcluidos) -- el wrapper que
  // arma graficoToggle() no trae un id/data-attr propio en el DOM (solo existe dentro
  // de un closure de secciones.js), asi que no se puede ubicar por id. En vez de eso:
  // se cuentan los contenedores .grafico-togglable.grafico-apagado que SI estan en el
  // DOM ahora mismo y se confirma que ninguno de sus textos aparece en el PDF -- un
  // chequeo mas tosco (no dice CUAL id especifico), pero cubre el caso real sin
  // inventar un selector que no existe.
  const apagadosEnDom = Array.from(document.querySelectorAll('.grafico-togglable.grafico-apagado'));
  if ((proyectoActual.graficosExcluidos || []).length !== apagadosEnDom.length) {
    problemas.push(`✗ proyectoActual.graficosExcluidos tiene ${(proyectoActual.graficosExcluidos || []).length} id(s), pero el DOM solo muestra ${apagadosEnDom.length} gráfica(s)/tabla(s) atenuada(s) -- revisar si el toggle se guardó pero no se volvió a renderizar (o viceversa).`);
  } else {
    ok.push(`✓ ${apagadosEnDom.length} gráfica(s)/tabla(s) apagada(s) coinciden entre proyectoActual y el DOM renderizado.`);
  }
  apagadosEnDom.forEach((nodo, i) => {
    const texto = nodo.textContent.trim().slice(0, 40).replace(/\s+/g, ' ');
    if (!texto) return;
    if (textoPdf.includes(texto)) {
      problemas.push(`✗ Una gráfica/tabla apagada (#${i + 1} en el DOM) SÍ aparece en el PDF: "${texto}…"`);
    } else {
      ok.push(`✓ Gráfica/tabla apagada #${i + 1} correctamente ausente del PDF.`);
    }
  });

  // 6) Columnas/filas ocultas de tablas -- su encabezado no deberia aparecer en el
  // PDF. La tabla no trae un id propio en el DOM (solo lo usan internamente las
  // celdas editables, ver celdaEditable()), asi que se ubica por la celda del
  // encabezado de la columna 0 (siempre editable cuando la tabla tiene id), con el
  // patron de id real `${tablaId}-h0` que usa celdaEditable().
  Object.entries(proyectoActual.tablaColumnasOcultas || {}).forEach(([tablaId, indices]) => {
    if (!indices.length) return;
    const celdaH0 = document.querySelector(`[data-texto-id="${tablaId}-h0"]`);
    const tabla = celdaH0 ? celdaH0.closest('table') : null;
    if (!tabla) { ok.push(`(sin verificar) tabla "${tablaId}" con columnas ocultas, no se encontró en el DOM actual.`); return; }
    const ths = tabla.querySelectorAll('thead th');
    indices.forEach((i) => {
      const th = ths[i];
      if (!th) return;
      const texto = th.textContent.trim().replace(/[✓✕↺🌐]/g, '').trim();
      if (!texto) return;
      if (textoPdf.includes(texto)) {
        problemas.push(`✗ Columna oculta "${texto}" de la tabla "${tablaId}" SÍ aparece en el PDF.`);
      } else {
        ok.push(`✓ Columna oculta "${texto}" de la tabla "${tablaId}" correctamente ausente del PDF.`);
      }
    });
  });

  console.log(`%cVerificación de ediciones/apagados en el PDF (${ok.length} ok, ${problemas.length} problemas)`, 'font-weight:bold');
  ok.forEach((l) => console.log(l));
  if (problemas.length) {
    console.warn('--- PROBLEMAS ENCONTRADOS ---');
    problemas.forEach((l) => console.warn(l));
  } else {
    console.log('%cTodo lo editado/apagado en pantalla se refleja correctamente en el PDF.', 'color:green;font-weight:bold');
  }
  return { ok, problemas };
}
window.verificarEdicionesEnPdf = verificarEdicionesEnPdf;

// Boton visible (ademas de la consola) -- pedido implicito del usuario, 2026-11-09:
// pedir "correlo en la consola" no es realista para alguien sin conocimientos
// tecnicos. Mismo resultado de verificarEdicionesEnPdf(), mostrado en una lista
// legible en pantalla en vez de requerir abrir las herramientas de desarrollador.
$('btnVerificarPdf').addEventListener('click', async () => {
  if (!ultimoResultado) { alert('Calcula primero.'); return; }
  const boton = $('btnVerificarPdf');
  const panel = $('panelVerificacionPdf');
  boton.disabled = true;
  const textoOriginal = boton.textContent;
  boton.textContent = 'Verificando…';
  panel.hidden = false;
  panel.innerHTML = '<p class="nota">Generando el PDF y comparando contra tus ediciones/apagados…</p>';
  try {
    const { ok, problemas } = await verificarEdicionesEnPdf();
    const resumen = problemas.length
      ? `<p class="aviso" style="color:var(--rojo, #b3413a); font-weight:600;">⚠️ ${problemas.length} problema(s) encontrado(s) -- esto NO deberías verlo en el PDF que generes:</p>
         <ul>${problemas.map((l) => `<li>${l}</li>`).join('')}</ul>`
      : '<p class="aviso" style="color:var(--verde, #3a7d5c); font-weight:600;">✓ Todo lo que editaste/ocultaste en pantalla se refleja correctamente en el PDF.</p>';
    panel.innerHTML = resumen +
      `<details><summary>Ver también lo que sí está correcto (${ok.length})</summary><ul>${ok.map((l) => `<li>${l}</li>`).join('')}</ul></details>`;
  } catch (err) {
    panel.innerHTML = `<p class="aviso" style="color:var(--rojo, #b3413a);">No se pudo verificar: ${err.message}</p>`;
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
});

// =====================================================================
// Arranque
// =====================================================================
(function arrancar() {
  let reanudar = null;
  try { reanudar = JSON.parse(sessionStorage.getItem(CLAVE_REANUDAR) || 'null'); } catch (e) { /* ignorar marcador corrupto */ }
  sessionStorage.removeItem(CLAVE_REANUDAR); // de una sola vez -- no reaparece en un refresh normal del navegador
  if (reanudar && reanudar.proyectoId) {
    const cliente = obtenerCliente(reanudar.clienteId);
    const proyecto = cliente ? obtenerProyecto(cliente, reanudar.proyectoId) : null;
    if (cliente && proyecto) { abrirProyecto(reanudar.clienteId, reanudar.proyectoId); return; }
  } else if (reanudar && reanudar.clienteId) {
    const cliente = obtenerCliente(reanudar.clienteId);
    if (cliente) { mostrarPantallaProyectos(reanudar.clienteId); return; }
  }
  renderListaClientes();
})();
