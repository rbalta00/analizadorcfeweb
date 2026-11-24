// Orquestacion de la app: Clientes (agrupados gobierno/particular) -> Cotizaciones de
// ese cliente (puede tener varias) -> captura de datos/recibo de una cotizacion -> 21
// secciones navegables -> exportar PDF / WhatsApp. Toda la logica de calculo vive en
// resultado.js/motor.js; este archivo solo lee/escribe el DOM y el almacenamiento.
import {
  obtenerCliente, crearCliente, guardarCliente, eliminarCliente, clientesAgrupadosPorTipo, tiposClienteUsados, listarClientes,
  recuperarTextosEditadosOrfanados,
  listarProyectos, obtenerProyecto, crearProyecto, guardarProyecto, eliminarProyecto, moverProyecto, alGuardar,
  aplicarMachoteAProyecto, clonarProyectoCongelado, clonarProyectoEditable, crearProyectoDesdeOrigen, detectarTextosConNumerosSospechosos,
  desbloquearProyecto, bloquearProyecto,
  proyectosParaVerificarMachote, marcarMachotePredeterminado, crearBorradorMachote, obtenerOCrearClienteMachotes,
  asegurarPasos, sincronizarPasoActivoDesdeFlat, aplicarPaso, crearPasoDesdeActual, renombrarPaso, eliminarPaso,
  textoContieneIdentidadDe,
  agregarSeccionPersonalizada, actualizarSeccionPersonalizada, eliminarSeccionPersonalizada,
} from './clientes.js';
import { renderSeccion, TITULOS_SECCIONES, seccionesActivasEnOrden, seccionTieneDatos, ordenSeccionesEfectivo, detectarCamposDinamicosConvertibles } from './secciones.js';
import { TARIFAS_PLANTILLA, resumenPlantillasPorTarifa, guardarPlantillaTarifa, eliminarPlantillaTarifa } from './textosGlobales.js';
import { construirResultado } from './resultado.js';
import { generarPdf, generarPdfCompletaDesdeVista } from './propuesta.js';
import { descargarExcelCotizacion, excelCotizacionComoBlob } from './excel.js';
import { generarGuiaPresentacion } from './resumen.js';
import { leerFormatoFijo, hayFormatoFijo, fijarFormatoDesde, aplicarFormatoFijoAProyecto, textoVistaPrevia } from './formatoFijo.js';
import { leerReciboMultiple } from './leerRecibo.js';
import { archivoAImagenComprimida, conDataUrlResuelto, resolverImagenesRemotasEnDom } from './imagenes.js';
import { ErrorDeClasificacion, COSTOS_RESIDENCIAL, COSTOS_COMERCIAL, escalaCostosParaTarifa, recalcularDesdeMateriales, pagoMensualCredito } from './motor.js';
import { todosLosBloques, bloqueDeSeccion, seccionesDelBloque, BLOQUES_COTIZACION } from './bloques.js';
import { M, PCT, fechaEstudioEs, fechaBaseVigenciaDeProyecto } from './util.js';
import { detectarTextosTarifaCruzada, sanearTextosTarifaCruzada, sanearTextosDoctrinaDesactualizada } from './tarifaDoctrina.js';
import {
  normalizarRpu, rpuDifiere, construirSelloDesdeCampos, diferenciasIdentidadRecibo, diferenciasSinConfirmar,
} from './identidadRecibo.js';
import {
  TARIFAS_SOPORTADAS, esDomestica, conectarEventosFormularioRecibo,
  leerFormularioRecibo, aplicarFormularioRecibo, llenarFormularioDesdeReciboCampos,
} from './formularioRecibo.js';
import {
  SUPABASE_URL, supabaseListar, supabaseActualizar, supabaseEliminar, supabaseSubirArchivo,
  supabaseEliminarArchivo, supabaseListarArchivos, supabaseUpsertar, supabaseEliminarPorFiltro,
} from './supabase.js';
import { subirANube, bajarDeNube, eliminarClienteDeNube, listarClientesEnNube } from './nube.js';
import { ETIQUETAS_TARIFA, ORDEN_TARIFAS } from './tarifas.js';
import { panelesEnTecho, esquinasDelTecho, crearEditorPaneles, hornearImagenSembrado, PANEL_ANCHO_M, PANEL_ALTO_M } from './sembrador.js';

window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

const $ = (id) => document.getElementById(id);
// Numero de WhatsApp al que apunta "Enviar por WhatsApp" (dado por el usuario). 52 =
// Mexico; WhatsApp no permite adjuntar archivos desde un enlace wa.me, solo texto.
const WHATSAPP_NUMERO = '522218367792';

// Pedido explicito del usuario, 2026-11-18: el <title> de la pagina (lo que se ve en
// la pestaña del navegador) siempre decía "Analizador FV CFE" fijo, sin importar en
// qué pantalla estuviera -- con varias pestañas abiertas a la vez (ej. una en
// "Clientes" y otra dentro de una estudio) no había forma de distinguirlas desde la
// barra de pestañas de Chrome. Cada pantalla ahora fija su propio título al mostrarse.
function fijarTitulo(texto) {
  document.title = texto ? `${texto} · Analizador FV CFE` : 'Analizador FV CFE';
}

// Mismas 6 tarifas/etiquetas que ya se repiten en los 3 <select> de index.html
// (selectTarifaDefinitivas/selectTarifaNuevoProyecto/filtroTarifaMachote) -- viven en
// tarifas.js (extraidas de aqui, 2026-11-14) para que lote40Vista.js (pagina aparte)
// tambien las use sin duplicar la lista.

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
// Confirmacion visible de guardado exitoso -- se muestra brevemente y se oculta sola
// (igual que un "toast"), para no quedarse pegada en pantalla para siempre. Un guardado
// NUEVO mientras la anterior confirmacion todavia estaba visible reinicia el temporizador
// (clearTimeout), para que la hora mostrada siempre sea la del ULTIMO guardado real.
// A PROPOSITO solo se dispara desde las acciones de guardado EXPLICITAS (boton "Guardar
// cotización"/"Definitiva...", ver guardarCotizacionConCliente mas abajo) y NO desde el
// hook global alGuardar() -- ese hook se dispara en CADA escritura a localStorage, que
// incluye el autoguardado silencioso de cada edicion de texto al perder el foco (ver
// onEditarTexto); conectar el toast ahi lo haria aparecer en cada clic/tecla mientras se
// edita texto, demasiado ruidoso. El hook global se queda igual que antes, solo para el
// caso de ERROR (eso si debe avisar siempre, sin importar que accion lo disparo).
let _timeoutAvisoGuardadoOk = null;
function mostrarAvisoGuardadoOk() {
  const el = $('avisoGuardadoOk');
  if (!el) return;
  const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  $('avisoGuardadoOkHora').textContent = `(${hora})`;
  el.hidden = false;
  if (_timeoutAvisoGuardadoOk) clearTimeout(_timeoutAvisoGuardadoOk);
  _timeoutAvisoGuardadoOk = setTimeout(() => { el.hidden = true; }, 2500);
}
alGuardar((ok) => (ok ? ocultarAvisoErrorGuardado() : mostrarAvisoErrorGuardado()));

// Aviso NO bloqueante (nunca un alert()) de que el saneamiento automatico de tarifa
// cruzada (ver calcularYRenderizar) quito solo uno o mas textos editados -- Parte 1 del
// encargo 2026-11-20. Descartable con su propio boton; no se vuelve a mostrar sola en
// una apertura siguiente porque el saneamiento es idempotente (si ya no quedan
// entradas conflictivas en textosEditados, no hay nada que restaurar de nuevo).
function mostrarAvisoTextosRestauradosTarifa(restaurados) {
  const el = $('avisoTextosRestauradosTarifa');
  if (!el) return;
  const ids = restaurados.map((r) => r.id).join(', ');
  $('avisoTextosRestauradosTarifaTexto').textContent =
    `ℹ️ Se restauraron ${restaurados.length} texto(s) que traían la doctrina de otra tarifa (${ids}): ` +
    'ahora usan el texto correcto de esta tarifa.';
  el.hidden = false;
}
function ocultarAvisoTextosRestauradosTarifa() {
  const el = $('avisoTextosRestauradosTarifa');
  if (el) el.hidden = true;
}

let clienteActual = null;
let proyectoActual = null;
// 'crear' | 'renombrar' -- que accion hace btnConfirmarNuevoPaso, segun si se abrio el
// formulario desde "+ Nuevo paso desde aqui" o desde "✏️ Renombrar" (mismo formulario
// chico reutilizado para las 2 acciones, ver conectarEventosPasosEntrega).
let modoFormularioPaso = 'crear';
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

// Pedido explicito del usuario, 2026-11-18: "en vez de que pidas nombre primero pide
// adjuntar el recibo para que lo leas" -- en la pantalla de Clientes, antes había que
// escribir el nombre y crear el cliente primero, y solo DESPUÉS (ya en la pantalla de
// "Cotizaciones de este cliente") se podía subir un recibo para crear la primera
// estudio. Mismo patrón que archivoReciboNuevoProyecto (más abajo), un nivel arriba:
// se lee el recibo de una vez aquí, se autollena el nombre con el titular detectado
// (sin pisar lo que el usuario ya haya escrito a mano), y al crear el cliente se crea
// también su primera estudio, ya con los datos leídos.
let archivosReciboClienteNuevoAcumulados = [];
let camposReciboClienteNuevo = null;
$('archivoReciboClienteNuevo').addEventListener('change', async (e) => {
  const nuevos = Array.from(e.target.files || []);
  if (!nuevos.length) return;
  e.target.value = '';
  archivosReciboClienteNuevoAcumulados = archivosReciboClienteNuevoAcumulados.concat(nuevos);
  const files = archivosReciboClienteNuevoAcumulados;
  const estadoEl = $('estadoReciboClienteNuevo');
  estadoEl.className = 'nota';
  estadoEl.textContent = files.length > 1
    ? `Leyendo ${files.length} archivos del recibo (puede tardar hasta 1 minuto por foto si usa OCR)... Si te falta otra foto del mismo recibo, puedes seguir agregándolas con este mismo botón.`
    : 'Leyendo el recibo (puede tardar hasta 1 minuto si usa OCR)... Si el recibo llega en más fotos, agrégalas con este mismo botón antes de seguir.';
  $('archivoReciboClienteNuevo').disabled = true;
  try {
    const campos = await leerReciboMultiple(files);
    camposReciboClienteNuevo = campos;
    if (!$('nuevoClienteNombre').value.trim()) {
      $('nuevoClienteNombre').value = campos.titular || campos.razon_social_cfdi || '';
    }
    estadoEl.className = 'nota ok';
    estadoEl.textContent = `✓ Recibo leído (tarifa ${campos.tarifa || 'no detectada'}). Revisa/corrige el nombre y pulsa ` +
      '"+ Nuevo cliente" -- la primera estudio de este cliente nace ya con estos datos.';
  } catch (err) {
    estadoEl.className = 'nota';
    estadoEl.textContent = 'Error al leer el recibo: ' + err.message;
    console.error(err);
  } finally {
    $('archivoReciboClienteNuevo').disabled = false;
  }
});

// Normaliza para comparar texto de búsqueda sin importar acentos/mayúsculas/espacios
// extra -- hallazgo real, auditoría "gestión y revisión de estudios" 2026-11-14: la
// búsqueda de "Cotizaciones de este cliente" solo hacía .toLowerCase(), así que
// buscar "mexico" no encontraba un inmueble guardado como "México" (ni "  méxico  "
// con espacios de más). NFD + quitar diacríticos es el patrón estándar para esto en
// JS sin librerías nuevas.
function normalizarBusqueda(s) {
  return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

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
  if (a) { a.hidden = !otro; a.textContent = otro ? `⚠️ "${clienteActual.nombre}" ya tiene otra estudio llamada "${nombre}"` : ''; }
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
  const estado = n ? `${n} estudio${n === 1 ? '' : 'es'}` : 'sin cotizaciones todavía';
  div.innerHTML = `<div class="tarjeta-cliente-info"><strong>${escapeHtml(c.nombre)}</strong>` +
    `<span class="nota">${estado} · actualizado ${new Date(c.actualizadoEn).toLocaleDateString('es-MX')}</span></div>`;
  div.addEventListener('click', () => mostrarPantallaProyectos(c.id));
  const btnBorrar = document.createElement('button');
  btnBorrar.className = 'btn-link btn-borrar-cliente';
  btnBorrar.textContent = '🗑';
  btnBorrar.title = 'Eliminar cliente (y todas sus cotizaciones)';
  btnBorrar.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm(`¿Eliminar a "${c.nombre}" y sus ${n} estudio(es)? Esto borra todo lo guardado en este navegador, no se puede deshacer.`)) {
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
  if (!nombre) { alert('Escribe un nombre o inmueble para el cliente (o adjunta su recibo arriba -- autollena el nombre solo).'); return; }
  const tipo = $('nuevoClienteTipo').value;
  const c = crearCliente({ nombre, tipo });
  $('nuevoClienteNombre').value = '';
  // Si ya se leyó un recibo (ver archivoReciboClienteNuevo arriba), la primera estudio
  // de este cliente nace de una vez con esos datos, en vez de llegar a "Cotizaciones de
  // este cliente" vacío y tener que volver a subir el mismo recibo ahí.
  if (camposReciboClienteNuevo) {
    const campos = camposReciboClienteNuevo;
    const archivos = archivosReciboClienteNuevoAcumulados;
    camposReciboClienteNuevo = null;
    archivosReciboClienteNuevoAcumulados = [];
    $('archivoReciboClienteNuevo').value = '';
    $('estadoReciboClienteNuevo').textContent = '';
    const proyecto = crearProyecto(c, { nombre: campos.titular || undefined });
    abrirProyecto(c.id, proyecto.id, { camposIniciales: campos });
    agregarArchivosReciboAProyecto(archivos);
    return;
  }
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
const URL_FORMULARIO_PUBLICO = 'https://analizador-fv-cfe-web.vercel.app/cliente.html';
$('btnEnviarFormularioWhatsapp').addEventListener('click', () => {
  const mensaje = 'Hola 👋 Para preparar tu estudio de paneles solares, carga los datos de tu recibo ' +
    `de CFE aquí (elige tu tarifa y sube una foto o el PDF de tu recibo, o llénalo a mano):\n${URL_FORMULARIO_PUBLICO}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank');
});

function mostrarPantallaClientes() {
  $('pantallaClientes').hidden = false;
  $('pantallaEnvios').hidden = true;
  $('pantallaDashboard').hidden = true;
  $('pantallaDefinitivasPorTarifa').hidden = true;
  $('pantallaCotizadorMachote').hidden = true;
  $('pantallaProyectos').hidden = true;
  $('pantallaCliente').hidden = true;
  clienteActual = null; proyectoActual = null; ultimoResultado = null; ultimoLeido = null; ultimoInputJSON = null;
  ocultarAvisoCambiosSinCalcular();
  ocultarAvisoTextosRestauradosTarifa();
  renderListaClientes();
  fijarTitulo('Clientes');
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
      opt.textContent = `${c.nombre} (${(c.proyectos || []).length} estudio(es))`;
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
        if (!confirm(`¿Eliminar "${archivo.name}" de la nube? No se puede deshacer. Si alguna estudio ` +
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
  $('pantallaCotizadorMachote').hidden = true;
  $('pantallaProyectos').hidden = true;
  $('pantallaCliente').hidden = true;
  $('pantallaEnvios').hidden = false;
  renderListaEnvios();
  fijarTitulo('Envíos de clientes');
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
      textContent: $('chkSoloDefinitivasDashboard').checked ? 'Ninguna estudio marcada como definitiva todavía.' : 'Sin clientes/cotizaciones todavía.',
    }));
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'tabla-wrap';
  const t = document.createElement('table');
  t.className = 'tabla-seccion tabla-chica';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Cliente</th><th>Tipo</th><th>Estudio</th><th>Definitiva</th><th>Etapa</th><th>Tarifa</th>' +
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

// Pedido explicito del usuario, 2026-11-14: "que me abra en una ventana independiente"
// -- el visor "Estado del lote de 40 inmuebles" se movio a su propia pagina
// (lote40.html + js/lote40Vista.js), abierta en pestaña/ventana aparte desde el botón
// de abajo, en vez de ser una pantalla mas dentro de esta SPA. Toda la logica de
// datosLote40/agrupar/render que vivia aqui se fue con ella -- ver ese archivo.

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportarDashboardCsv() {
  const todas = datosDashboard();
  const filas = $('chkSoloDefinitivasDashboard').checked ? todas.filter(f => f.proyecto.definitiva) : todas;
  const lineas = [['Cliente', 'Tipo', 'Estudio', 'Definitiva', 'Etapa', 'Tarifa', 'Inversión', 'Ahorro anual', 'Creada', 'Actualizado'].join(',')];
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
  $('pantallaCotizadorMachote').hidden = true;
  $('pantallaProyectos').hidden = true;
  $('pantallaCliente').hidden = true;
  $('pantallaDashboard').hidden = false;
  renderDashboard();
  fijarTitulo('Historial / Dashboard');
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
      className: 'nota', textContent: `Todavía no hay ninguna estudio definitiva con tarifa ${tarifa}.`,
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
  $('pantallaCotizadorMachote').hidden = true;
  $('pantallaDefinitivasPorTarifa').hidden = false;
  renderDefinitivasPorTarifa();
  fijarTitulo('Definitivas por tarifa');
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
  // Pedido explicito del usuario, 2026-11-12: "no hay tipo de cliente, solo hay
  // cliente registrado, deja elegir uno" -- antes esta pantalla mostraba por default
  // el mini-formulario de "crear cliente nuevo" (con su campo Tipo), aunque el envio
  // casi siempre corresponde a un cliente que YA existe (ej. el mismo SEDIF con varios
  // inmuebles). Ahora el default es elegir de la lista de clientes YA registrados --
  // el campo Tipo solo aparece si de verdad se elige "+ Crear cliente nuevo".
  // Mismo bug/fix que poblarSelectClienteGuardar() -- clientesAgrupadosPorTipo() ya no
  // regresa {gobierno, particular} fijos (ver commit 9668ac9).
  const gruposClientes = clientesAgrupadosPorTipo();
  const hayClientesRegistrados = gruposClientes.some(g => g.clientes.length);
  if (hayClientesRegistrados) {
    const optVacio = document.createElement('option');
    optVacio.value = '';
    optVacio.textContent = '-- Elige un cliente registrado --';
    optVacio.disabled = true;
    optVacio.selected = true;
    selectCliente.append(optVacio);
  }
  for (const { tipo, clientes: lista } of gruposClientes) {
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
  const optNuevo = document.createElement('option');
  optNuevo.value = '__nuevo__';
  optNuevo.textContent = '+ Crear cliente nuevo';
  selectCliente.append(optNuevo);
  if (!hayClientesRegistrados) selectCliente.value = '__nuevo__'; // no hay nadie que elegir todavia

  const filaNuevo = document.createElement('div');
  filaNuevo.className = 'fila fila-nuevo-cliente-envio';
  filaNuevo.innerHTML = `<label>Nombre del cliente nuevo<input type="text" class="input-nombre-nuevo" value="${escapeHtml(envio.nombre_declarado || '')}" /></label>
    <label>Tipo<input type="text" class="select-tipo-nuevo" list="listaTiposCliente" placeholder="Gobierno, Particular, u otro..."></label>`;
  filaNuevo.hidden = selectCliente.value !== '__nuevo__';
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
  if (!selectCliente.value) { alert('Elige un cliente registrado, o "+ Crear cliente nuevo".'); return; }
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
    ? `✓ estudio guardada el ${new Date(p.cotizacionGuardadaEn).toLocaleDateString('es-MX')}`
    : (p.formulario ? 'con datos capturados, estudio sin guardar todavía' : 'sin datos capturados todavía');
  const etapa = p.etapa || 'cotizado';
  // Pedido explicito del usuario, 2026-11-11: "cotizaciones por tarifa para verlas...
  // ordena todo con coherencia y logica" -- chip visible de la tarifa (si ya se
  // capturo) en cada tarjeta, independiente del chip de estado (definitiva/muestra/
  // editando, que ya existia) -- renderListaProyectos() las ordena por tarifa dentro
  // de cada grupo para que las de la misma tarifa queden juntas.
  const chipTarifa = p.formulario?.tarifa ? `<span class="chip-etapa chip-tarifa-proyecto">${escapeHtml(p.formulario.tarifa)}</span>` : '';
  // RPU (numero de servicio) visible en la tarjeta -- pedido explicito del usuario,
  // 2026-11-12: "nombre del inmueble, el RPU, la tarifa y la fecha de última
  // modificación" para poder encontrar cualquier estudio rapido.
  const rpu = p.formulario?.noServicio ? `<span class="nota">RPU ${escapeHtml(p.formulario.noServicio)}</span>` : '';
  // Avance por inmueble -- pedido explicito del usuario, 2026-11-14 (auditoria "varios
  // inmuebles y periodos"): antes la lista no decia, de un vistazo, cuales estudios ya
  // tenian recibo/calculo (lo INDISPENSABLE) ni cuales traian verificacion en sitio o
  // sembrado (OPCIONALES segun el alcance -- no todo estudio los necesita). Se
  // distinguen a proposito con estilos distintos: lo indispensable faltante se marca
  // en naranja (mismo tono que "Negociando", ya existente) para que llame la atencion;
  // lo opcional presente se marca neutral (mismo tono que el chip de tarifa).
  const indicadores = [];
  if (!p.formulario) {
    indicadores.push('<span class="chip-etapa chip-etapa-negociando">⚠️ Sin recibo/datos</span>');
  } else if (p.ultimaInversionTotal == null) {
    indicadores.push('<span class="chip-etapa chip-etapa-negociando">⚠️ Sin calcular</span>');
  }
  if (p.archivosVerificacion && p.archivosVerificacion.length) indicadores.push('<span class="chip-etapa chip-tarifa-proyecto">🔍 Verificación en sitio</span>');
  if (p.fotoSembrado || p.sembradorAuto) indicadores.push('<span class="chip-etapa chip-tarifa-proyecto">🗺️ Sembrado</span>');
  div.innerHTML = `<div class="tarjeta-cliente-info"><strong>${escapeHtml(p.nombre)}</strong>` +
    chipTarifa + rpu +
    (p.definitiva ? `<span class="chip-definitiva">✅ Definitiva${p.bloqueada ? ' 🔒' : ''}${p.propositoDefinitiva === 'muestra' ? ' 📋 muestra' : ''}</span>` : '') +
    (p.plantillaOrigen && !p.plantillaVerificada ? `<span class="chip-etapa chip-etapa-cotizado">📋 desde plantilla, sin verificar</span>` : '') +
    `<span class="chip-etapa chip-etapa-${etapa}">${ETAPAS_PROYECTO[etapa]}</span>` +
    indicadores.join('') +
    `<span class="nota">${estado} · actualizado ${new Date(p.actualizadoEn).toLocaleDateString('es-MX')}</span></div>`;
  div.addEventListener('click', () => abrirProyecto(clienteActual.id, p.id));
  // "Renombrar" desde la lista -- pedido explicito del usuario, 2026-11-20 ("Guardar
  // simple y predecible"): accion propia que SOLO cambia el nombre de este registro,
  // sin tocar datos ni crear nada -- a diferencia de editar el nombre dentro del
  // editor abierto (que tambien guarda el resto del estado en pantalla al perder el
  // foco), esto sirve para corregir el nombre de una estudio que ni siquiera esta
  // abierta ahorita. Respeta el mismo candado que cualquier otro guardado (si esta
  // bloqueada, no se le puede cambiar el nombre tampoco) -- pero avisa explicito en
  // vez de fallar en silencio.
  const btnRenombrar = document.createElement('button');
  btnRenombrar.className = 'btn-link';
  btnRenombrar.textContent = '✏️';
  btnRenombrar.title = 'Renombrar esta estudio (solo el nombre, sin tocar sus datos)';
  btnRenombrar.addEventListener('click', (e) => {
    e.stopPropagation();
    if (p.bloqueada) {
      alert(`"${p.nombre}" está bloqueada (ya se entregó como definitiva) -- no se puede renombrar mientras esté así. Desbloquéala primero (abriéndola) si de verdad necesitas corregir el nombre.`);
      return;
    }
    const nuevo = prompt('Nuevo nombre para esta estudio:', p.nombre);
    if (nuevo == null) return;
    const limpio = nuevo.trim();
    if (!limpio || limpio === p.nombre) return;
    p.nombre = limpio;
    revisarDuplicadoProyecto(limpio, p.id);
    guardarProyecto(clienteActual, p);
    renderListaProyectos();
    if (proyectoActual && proyectoActual.id === p.id) sincronizarInputsNombreProyecto();
  });
  div.append(btnRenombrar);
  const btnBorrar = document.createElement('button');
  btnBorrar.className = 'btn-link btn-borrar-cliente';
  btnBorrar.textContent = '🗑';
  btnBorrar.title = 'Eliminar esta estudio';
  btnBorrar.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm(`¿Eliminar la estudio "${p.nombre}"? No se puede deshacer.`)) {
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
// Buscador (nombre o RPU) + orden alternativo del historial -- pedido explicito del
// usuario, 2026-11-12: "encontrar rápidamente cualquier estudio por inmueble o RPU" y
// "ordenar por nombre, fecha de creación o última modificación". El agrupado por estado
// (en trabajo/borradores/definitivas/muestras, ver comentario de abajo) y el orden "por
// tarifa" DENTRO de cada grupo se quedan como default (ya validados antes, pedido
// explicito del usuario 2026-11-11) -- el selector de orden solo cambia el criterio
// DENTRO de cada grupo cuando se elige algo distinto de "tarifa", nunca quita el
// agrupado por estado en si.
function ordenadorProyectos(criterio) {
  if (criterio === 'modificado') return (a, b) => (b.actualizadoEn || '').localeCompare(a.actualizadoEn || '');
  if (criterio === 'creado') return (a, b) => (b.creadoEn || '').localeCompare(a.creadoEn || '');
  if (criterio === 'nombre') return (a, b) => (a.nombre || '').localeCompare(b.nombre || '');
  return (a, b) => (a.formulario?.tarifa || '￿').localeCompare(b.formulario?.tarifa || '￿'); // default: tarifa
}
function renderListaProyectos() {
  const cont = $('listaProyectos');
  cont.innerHTML = '';
  let proyectos = listarProyectos(clienteActual);
  if (!proyectos.length) {
    cont.append(Object.assign(document.createElement('p'), { className: 'nota', textContent: 'Todavía no hay cotizaciones para este cliente. Sube un recibo o arranca una en blanco.' }));
    return;
  }
  // Hallazgo real (auditoría "gestión y revisión de estudios", 2026-11-14): la búsqueda
  // no toleraba acentos/mayúsculas distintas ni buscaba por tarifa, aunque el usuario
  // puede no recordar el nombre exacto que le puso a una cotización -- normalizarBusqueda()
  // quita esa fricción, y se agrega formulario.tarifa a los campos que se comparan.
  const textoBusquedaCrudo = ($('inputBuscarProyecto')?.value || '').trim();
  const textoBusqueda = normalizarBusqueda(textoBusquedaCrudo);
  if (textoBusqueda) {
    proyectos = proyectos.filter((p) =>
      normalizarBusqueda(p.nombre).includes(textoBusqueda) ||
      normalizarBusqueda(p.formulario?.noServicio).includes(textoBusqueda) ||
      normalizarBusqueda(p.formulario?.tarifa).includes(textoBusqueda));
    if (!proyectos.length) {
      cont.append(Object.assign(document.createElement('p'), { className: 'nota', textContent: `Ninguna cotización de este cliente coincide con "${textoBusquedaCrudo}" (nombre, RPU o tarifa).` }));
      return;
    }
  }
  const porTarifa = ordenadorProyectos($('selectOrdenProyectos')?.value);
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
$('inputBuscarProyecto').addEventListener('input', renderListaProyectos);
$('selectOrdenProyectos').addEventListener('change', renderListaProyectos);

function mostrarPantallaProyectos(clienteId) {
  clienteActual = obtenerCliente(clienteId);
  if (!clienteActual) { mostrarPantallaClientes(); return; }
  proyectoActual = null; ultimoResultado = null; ultimoLeido = null; ultimoInputJSON = null;
  ocultarAvisoCambiosSinCalcular();
  ocultarAvisoTextosRestauradosTarifa();
  archivosReciboAcumulados = []; // empieza limpio -- no arrastrar fotos de otro cliente/proyecto
  if ($('inputBuscarProyecto')) $('inputBuscarProyecto').value = ''; // no arrastrar busqueda de otro cliente
  $('pantallaClientes').hidden = true;
  $('pantallaEnvios').hidden = true;
  $('pantallaDashboard').hidden = true;
  $('pantallaDefinitivasPorTarifa').hidden = true;
  $('pantallaCotizadorMachote').hidden = true;
  $('pantallaProyectos').hidden = false;
  $('pantallaCliente').hidden = true;
  $('clienteNombreBarraProyectos').value = clienteActual.nombre;
  $('clienteTipoBarraProyectos').textContent = etiquetaTipo(clienteActual.tipo);
  $('clienteTipoBarraProyectos').className = `chip-tipo ${claseTipo(clienteActual.tipo)}`;
  fijarTitulo(clienteActual.nombre);
  $('estadoReciboNuevoProyecto').textContent = '';
  $('selectTarifaNuevoProyecto').value = '';
  $('listaMuestrasNuevoProyecto').innerHTML = '';
  $('estadoNuevoProyectoDesdeDefinitiva').className = 'nota';
  revisarDuplicadoCliente();
  renderListaProyectos();
  $('btnNuevoDesdeFormatoFijo').hidden = !hayFormatoFijo();
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
  if (!nombre) { alert('Escribe primero un nombre para esta estudio.'); return; }
  if (revisarDuplicadoProyecto(nombre, null) && !confirm(`"${clienteActual.nombre}" ya tiene otra estudio llamada "${nombre}" -- ¿crear otra con el mismo nombre de todos modos?`)) return;
  const proyecto = crearProyecto(clienteActual, { nombre });
  $('inputNombreNuevoProyecto').value = '';
  abrirProyecto(clienteActual.id, proyecto.id);
});

// "Nuevo desde mi formato fijo" -- mismo patron que "+ Cotización en blanco" de
// arriba (pide nombre primero, crea el proyecto vacío), pero además aplica de
// inmediato el formato fijo guardado (mismo motor de aplicarMachoteAProyecto, ver
// formatoFijo.js) -- los campos propios del servicio (RPU, dirección, consumo,
// paneles, imágenes, importes) arrancan vacíos porque crearProyecto() nunca los toca,
// exactamente lo que pide el punto 2 del encargo ("Inicia vacíos los campos propios
// del servicio anterior").
$('btnNuevoDesdeFormatoFijo').addEventListener('click', () => {
  const nombre = $('inputNombreNuevoProyecto').value.trim();
  if (!nombre) { alert('Escribe primero un nombre para esta cotización.'); return; }
  if (revisarDuplicadoProyecto(nombre, null) && !confirm(`"${clienteActual.nombre}" ya tiene otra cotización llamada "${nombre}" -- ¿crear otra con el mismo nombre de todos modos?`)) return;
  const proyecto = crearProyecto(clienteActual, { nombre });
  try {
    aplicarFormatoFijoAProyecto(proyecto);
    guardarProyecto(clienteActual, proyecto);
  } catch (err) {
    alert('No se pudo aplicar el formato fijo: ' + err.message);
  }
  $('inputNombreNuevoProyecto').value = '';
  abrirProyecto(clienteActual.id, proyecto.id);
});

// Lista, de CUALQUIER cliente, TODAS las cotizaciones ✅ definitivas con esta tarifa
// para poder elegir una como ejemplo al dar de alta un estudio nuevo -- pedido
// explicito del usuario, 2026-11-11: "ponle un botón para que elija la tarifa y el
// análisis definitivo que hayamos puesto ahí en esa tarifa como ejemplo"; corregido
// 2026-11-12 porque "no deja seleccionar muestra cuando selecciono la tarifa" -- antes
// un solo boton escogia SOLO (en silencio) la mejor de todas, sin dejar ver ni elegir
// si habia mas de una muestra para la misma tarifa. Las marcadas
// `propositoDefinitiva: 'muestra'` (pensadas justo para esto) van primero; el resto
// (entregas reales de otros clientes) despues, por si no hay ninguna muestra todavia.
function candidatosDefinitivaPorTarifa(tarifa) {
  const todas = [];
  for (const c of listarClientes()) {
    for (const p of (c.proyectos || [])) {
      if (!p.definitiva || !p.formulario || p.formulario.tarifa !== tarifa) continue;
      todas.push({ cliente: c, proyecto: p });
    }
  }
  return todas.sort((a, b) => {
    const aMuestra = a.proyecto.propositoDefinitiva === 'muestra' ? 1 : 0;
    const bMuestra = b.proyecto.propositoDefinitiva === 'muestra' ? 1 : 0;
    if (aMuestra !== bMuestra) return bMuestra - aMuestra;
    return (b.proyecto.actualizadoEn || '').localeCompare(a.proyecto.actualizadoEn || '');
  });
}

function renderListaMuestrasNuevoProyecto() {
  const cont = $('listaMuestrasNuevoProyecto');
  const estadoEl = $('estadoNuevoProyectoDesdeDefinitiva');
  const tarifa = $('selectTarifaNuevoProyecto').value;
  cont.innerHTML = '';
  if (!tarifa) return;
  const candidatos = candidatosDefinitivaPorTarifa(tarifa);
  if (!candidatos.length) {
    estadoEl.className = 'nota aviso';
    estadoEl.textContent = `Todavía no hay ninguna estudio ✅ definitiva con tarifa ${tarifa} guardada en ningún cliente -- usa "+ Estudio en blanco" y captura los datos a mano, o marca una estudio como "Definitiva para MUESTRA" primero para poder reusarla después.`;
    return;
  }
  estadoEl.className = 'nota';
  estadoEl.textContent = 'Da clic en la que quieras usar como ejemplo:';
  for (const { cliente, proyecto } of candidatos) {
    const div = document.createElement('div');
    div.className = 'tarjeta-cliente';
    div.style.cursor = 'pointer';
    div.innerHTML = `<strong>${escapeHtml(proyecto.nombre)}</strong> ` +
      (proyecto.propositoDefinitiva === 'muestra' ? '<span class="chip-definitiva">📋 muestra</span>' : '<span class="chip-definitiva">👤 entrega de cliente</span>') +
      `<div class="nota">Cliente: ${escapeHtml(cliente.nombre)} · ${new Date(proyecto.actualizadoEn).toLocaleDateString('es-MX')}</div>`;
    div.addEventListener('click', () => {
      const nombre = $('inputNombreNuevoProyecto').value.trim();
      if (!nombre) { alert('Escribe primero un nombre para esta estudio (arriba).'); return; }
      if (revisarDuplicadoProyecto(nombre, null) && !confirm(`"${clienteActual.nombre}" ya tiene otra estudio llamada "${nombre}" -- ¿crear otra con el mismo nombre de todos modos?`)) return;
      const nuevo = crearProyectoDesdeOrigen(clienteActual, { cliente, proyecto }, { nombre });
      $('inputNombreNuevoProyecto').value = '';
      abrirProyecto(clienteActual.id, nuevo.id);
    });
    cont.append(div);
  }
}
$('selectTarifaNuevoProyecto').addEventListener('change', renderListaMuestrasNuevoProyecto);

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
      textContent: 'No hay ninguna otra estudio guardada que coincida con este filtro (prueba quitar "solo definitivas" o cambiar la tarifa).',
    }));
    return;
  }

  const tarjetaMachote = ({ cliente, proyecto }) => {
    const div = document.createElement('div');
    div.className = 'tarjeta-cliente';
    div.style.cursor = 'pointer';
    div.innerHTML = `<strong>${escapeHtml(proyecto.nombre)}</strong> ${proyecto.definitiva ? `<span class="chip-definitiva">✅ Definitiva${proyecto.bloqueada ? ' 🔒' : ''}${proyecto.propositoDefinitiva === 'muestra' ? ' 📋 muestra' : ''}</span>` : ''}` +
      `<div class="nota">Cliente: ${escapeHtml(cliente.nombre)} · Tarifa: ${escapeHtml(proyecto.formulario.tarifa)} · ` +
      `${new Date(proyecto.actualizadoEn).toLocaleDateString('es-MX')}</div>`;
    div.addEventListener('click', () => {
      if (!confirm(`¿Aplicar "${proyecto.nombre}" (${cliente.nombre}) como machote sobre esta estudio? Se reemplazan los pasos y TODOS los textos/apagados editados (se quedan igual que en el machote, salvo los que traigan pegado un número/monto del cálculo del cliente anterior) -- tarifa, cargos, identidad y consumo de ESTE cliente NO se tocan, se quedan tal cual ya los tengas capturados.`)) return;
      // Pedido explicito del usuario, 2026-11-12: "revisa por que no jala la direccion
      // actual, se queda con la del machote" -- aplicarMachoteAProyecto() ya NO toca
      // proyecto.formulario (ver clientes.js), pero este handler seguia llamando
      // aplicarFormulario(proyectoActual.formulario) despues -- si el titular/domicilio
      // ya escritos en pantalla todavia no se habian guardado en memoria (no se habia
      // dado "Calcular" todavia), esto los pisaba de vuelta con el ultimo formulario
      // GUARDADO (vacio en un proyecto nuevo, o el de antes de escribir) -- se veian
      // "regresar" al estado viejo aunque el machote mismo nunca los tocara. Ya no hace
      // falta volver a aplicar el formulario: como el machote no lo modifica, lo que
      // esta en pantalla ahora mismo sigue siendo exactamente lo correcto.
      aplicarMachoteAProyecto(proyectoActual, { cliente, proyecto });
      // Pedido explicito del usuario, 2026-11-18: "Ajustar precios de materiales" /
      // "Comparar escenarios" / "Financiamiento" no deben volver a aparecer para esta
      // estudio una vez que se le aplicó un machote -- ver esMachoteActual() arriba.
      proyectoActual.panelesOcultosPorMachote = true;
      guardarProyecto(clienteActual, proyectoActual);
      ultimoResultado = null; ultimoLeido = null; ultimoInputJSON = null;
      $('contenedorSecciones').innerHTML = '';
      $('tabEditorPrecios').hidden = true;
      $('tabFinanciamiento').hidden = true;
      $('tabComparacion').hidden = true;
      $('estadoCalculo').className = 'nota aviso';
      $('estadoCalculo').textContent = 'Machote aplicado -- pulsa "Calcular" para ver la estudio con los textos del machote y los datos de este cliente.';
      $('tabPdf').hidden = true;
      renderAvisoPlantillaOrigen();
      renderListaMachotes();
      $('tabCaptura').scrollIntoView({ behavior: 'smooth' });
    });
    return div;
  };

  // Pedido explicito del usuario, 2026-11-12: "las cotizaciones guardadas como
  // muestra guardalas de acuerdo a su tarifa y deja elegir una para machote" -- cuando
  // no hay un filtro de tarifa especifico elegido (select en "Todas las tarifas"),
  // se agrupan con su propio encabezado por tarifa (orden alfabetico) en vez de una
  // sola lista plana ordenada solo por fecha; dentro de cada tarifa, las 📋 muestra
  // van primero (son el machote pensado para esto), despues el resto, ambas por
  // fecha mas reciente. Si ya hay un filtro de tarifa elegido no tiene sentido
  // agrupar (todas las tarjetas comparten la misma tarifa), se deja la lista plana.
  const tarifaFiltro = $('filtroTarifaMachote').value;
  if (tarifaFiltro) {
    for (const fila of candidatos) cont.append(tarjetaMachote(fila));
    return;
  }
  const porTarifa = new Map();
  for (const fila of candidatos) {
    const t = fila.proyecto.formulario.tarifa || 'Sin tarifa';
    if (!porTarifa.has(t)) porTarifa.set(t, []);
    porTarifa.get(t).push(fila);
  }
  for (const tarifa of [...porTarifa.keys()].sort()) {
    const filas = porTarifa.get(tarifa).sort((a, b) => {
      const aMuestra = a.proyecto.propositoDefinitiva === 'muestra' ? 1 : 0;
      const bMuestra = b.proyecto.propositoDefinitiva === 'muestra' ? 1 : 0;
      if (aMuestra !== bMuestra) return bMuestra - aMuestra;
      return (b.proyecto.actualizadoEn || '').localeCompare(a.proyecto.actualizadoEn || '');
    });
    const h4 = document.createElement('h4');
    h4.textContent = `Tarifa ${tarifa}`;
    cont.append(h4);
    for (const fila of filas) cont.append(tarjetaMachote(fila));
  }
}

// =====================================================================
// Pantalla: Cotizador por machote (un botón por tarifa) -- pedido explicito del
// usuario, 2026-11-14: un modulo con pantalla propia donde CADA estudio nuevo arranca
// EXCLUSIVAMENTE de un machote ya verificado para su tarifa (nunca "en blanco" desde
// aqui -- esa opcion sigue viviendo en "Cotizaciones de este cliente", sin tocarse).
// Reusa 100% el motor/editor/guardado/exportadores de siempre: crear el estudio es
// crearProyecto()+aplicarMachoteAProyecto() (igual que "Partir de la definitiva de
// muestra" de toda la vida) y despues abrirProyecto() entra a la MISMA pantalla de
// captura/secciones/PDF/Excel que cualquier otra cotizacion -- no existe una segunda
// implementacion de nada de eso.
//
// "Machote verificado" de una tarifa = proyecto definitiva + bloqueada (congelada,
// clientes.js) + propositoDefinitiva:'muestra' + su tarifaMachote (o formulario.tarifa
// si nunca se fijo explicito) coincide. Verificar = clonarProyectoCongelado() sobre
// una cotizacion ya trabajada -- el clon queda CONGELADO desde ese instante, asi que
// seguir editando el proyecto de origen nunca altera la version ya verificada (para
// actualizarla hay que volver a verificar a proposito, lo que crea una version NUEVA).
function machotesVerificadosDeTarifa(tarifa) {
  return todosLosMachotesVerificados().filter((f) => f.tarifa === tarifa);
}

// Pedido explicito del usuario, 2026-11-14 (refuerzo "Cotizador por machote"): "permite
// usar cualquier machote como referencia de presentacion para un estudio de cualquier
// tarifa" -- un machote SOLO aporta estructura/orden/textos/apagados (ver
// CAMPOS_EDITORIAL_MACHOTE en clientes.js, aplicarMachoteAProyecto NUNCA toca tarifa/
// cargos/escalones del estudio nuevo), asi que no hay ninguna razon tecnica para
// restringir su uso a estudios de SU MISMA tarifa. Devuelve TODOS los machotes
// verificados de cualquier tarifa, cada uno con su propia `tarifa` adjunta (para poder
// mostrarla como referencia al elegir uno de otra tarifa).
function todosLosMachotesVerificados() {
  const filas = [];
  for (const c of listarClientes()) {
    for (const p of (c.proyectos || [])) {
      const t = p.tarifaMachote || p.formulario?.tarifa;
      if (!t) continue;
      if (!(p.propositoDefinitiva === 'muestra' && p.bloqueada)) continue;
      filas.push({ cliente: c, proyecto: p, tarifa: t });
    }
  }
  return filas.sort((a, b) => {
    const aPred = a.proyecto.machotePredeterminadoTarifa ? 1 : 0;
    const bPred = b.proyecto.machotePredeterminadoTarifa ? 1 : 0;
    if (aPred !== bPred) return bPred - aPred;
    return (b.proyecto.actualizadoEn || '').localeCompare(a.proyecto.actualizadoEn || '');
  });
}

// Mini-formulario inline de "elige un cliente registrado o crea uno nuevo" -- mismo
// patron ya probado en tarjetaEnvio() (bandeja de envios), reconstruido aqui porque esa
// version esta atada a los ids fijos de esa pantalla. Se usa UNA vez por panel (al
// elegir una tarifa), no hace falta exponerlo mas alla de este archivo.
function crearSelectorClienteMachote() {
  const selectCliente = document.createElement('select');
  const grupos = clientesAgrupadosPorTipo();
  const hayClientesRegistrados = grupos.some(g => g.clientes.length);
  if (hayClientesRegistrados) {
    const optVacio = document.createElement('option');
    optVacio.value = ''; optVacio.textContent = '-- Elige un cliente registrado --';
    optVacio.disabled = true; optVacio.selected = true;
    selectCliente.append(optVacio);
  }
  for (const { tipo, clientes: lista } of grupos) {
    if (!lista.length) continue;
    const og = document.createElement('optgroup');
    og.label = etiquetaTipo(tipo);
    for (const c of lista) {
      const opt = document.createElement('option');
      opt.value = c.id; opt.textContent = c.nombre;
      og.append(opt);
    }
    selectCliente.append(og);
  }
  const optNuevo = document.createElement('option');
  optNuevo.value = '__nuevo__'; optNuevo.textContent = '+ Crear cliente nuevo';
  selectCliente.append(optNuevo);
  if (!hayClientesRegistrados) selectCliente.value = '__nuevo__';

  const filaNuevo = document.createElement('div');
  filaNuevo.className = 'fila fila-nuevo-cliente-envio';
  filaNuevo.innerHTML = `<label>Nombre del cliente nuevo<input type="text" class="input-nombre-nuevo" /></label>
    <label>Tipo<input type="text" class="select-tipo-nuevo" list="listaTiposCliente" placeholder="Gobierno, Particular, u otro..."></label>`;
  filaNuevo.hidden = selectCliente.value !== '__nuevo__';
  selectCliente.addEventListener('change', () => { filaNuevo.hidden = selectCliente.value !== '__nuevo__'; });
  return { selectCliente, filaNuevo };
}
function resolverClienteDeSelectorMachote(selectCliente, filaNuevo) {
  if (!selectCliente.value) { alert('Elige un cliente registrado, o "+ Crear cliente nuevo".'); return null; }
  if (selectCliente.value === '__nuevo__') {
    const nombre = filaNuevo.querySelector('.input-nombre-nuevo').value.trim();
    if (!nombre) { alert('Escribe el nombre del cliente nuevo.'); return null; }
    const tipo = filaNuevo.querySelector('.select-tipo-nuevo').value;
    return crearCliente({ nombre, tipo });
  }
  return obtenerCliente(selectCliente.value);
}

let tarifaMachoteSeleccionada = null;

function renderBotonesTarifaMachote() {
  const cont = $('botonesTarifaMachote');
  cont.innerHTML = '';
  const hayAlgunMachote = todosLosMachotesVerificados().length > 0;
  for (const tarifa of ORDEN_TARIFAS) {
    const verificados = machotesVerificadosDeTarifa(tarifa);
    const habilitado = verificados.length > 0;
    const predeterminado = verificados.find(f => f.proyecto.machotePredeterminadoTarifa) || verificados[0];
    const div = document.createElement('div');
    div.className = 'tarjeta-cliente';
    div.style.cursor = 'pointer';
    let estado;
    if (habilitado) {
      estado = `<div class="nota ok">✅ Machote propio: ${escapeHtml(predeterminado.proyecto.nombre)}${verificados.length > 1 ? ` (+${verificados.length - 1} más disponibles)` : ''}</div>`;
    } else if (hayAlgunMachote) {
      // Pedido explicito del usuario, 2026-11-14: "permite usar cualquier machote como
      // referencia de presentacion para un estudio de cualquier tarifa" -- no hace
      // falta tener UN machote propio de esta tarifa para poder crear un estudio aqui,
      // cualquier machote verificado de otra tarifa sirve de referencia editorial (ver
      // renderPanelCrearDesdeMachote).
      estado = '<div class="nota">🔁 Sin machote propio todavía -- puedes usar uno de otra tarifa como referencia</div>';
    } else {
      estado = '<div class="nota aviso">⚠️ Todavía no hay ningún machote verificado</div>';
    }
    div.innerHTML = `<strong>${tarifa}</strong> <span class="nota">${ETIQUETAS_TARIFA[tarifa] || ''}</span>` + estado;
    div.addEventListener('click', () => seleccionarTarifaMachote(tarifa));
    cont.append(div);
  }
}

function seleccionarTarifaMachote(tarifa) {
  tarifaMachoteSeleccionada = tarifa;
  if (todosLosMachotesVerificados().length) renderPanelCrearDesdeMachote(tarifa);
  else renderPanelVerificarMachote(tarifa);
}

// Panel para crear un estudio nuevo de `tarifa` -- pedido explicito del usuario,
// 2026-11-14: "permite usar cualquier machote como referencia de presentacion para un
// estudio de cualquier tarifa que el cotizador tenga implementada". Ya NO exige que
// `tarifa` tenga su PROPIO machote verificado -- aplicarMachoteAProyecto() (clientes.js)
// solo copia campos EDITORIALES (textos/orden/apagados/secciones personalizadas, ver
// CAMPOS_EDITORIAL_MACHOTE) y nunca toca tarifa/cargos/escalones, asi que un machote de
// OTRA tarifa sirve igual de bien como punto de partida de presentacion -- el calculo
// real de este estudio sigue saliendo 100% del recibo/RPU que se capture aqui, nunca
// del machote. Los propios de esta tarifa se listan primero (y predeterminado ⭐ sigue
// preseleccionado entre esos); los de otras tarifas se listan despues, marcados con de
// qué tarifa vienen, para que quede claro que son solo referencia de presentacion.
function renderPanelCrearDesdeMachote(tarifa) {
  const panel = $('panelTarifaMachoteSeleccionada');
  panel.innerHTML = '';
  const propios = machotesVerificadosDeTarifa(tarifa);
  const otros = todosLosMachotesVerificados().filter((f) => f.tarifa !== tarifa);
  const verificados = [...propios, ...otros];
  panel.append(Object.assign(document.createElement('h3'), { textContent: `Tarifa ${tarifa} — ${ETIQUETAS_TARIFA[tarifa] || ''}` }));
  panel.append(Object.assign(document.createElement('p'), {
    className: 'nota',
    textContent: 'Elige qué machote usar como referencia de presentación (el predeterminado ⭐ de esta tarifa, si ' +
      'existe, ya viene marcado). El estudio nuevo arranca con su estructura/textos/visibilidad -- el RPU, el ' +
      'recibo, el consumo, la demanda, la verificación en sitio, el sembrado y los resultados siempre arrancan ' +
      `vacíos y se calculan aparte, SIEMPRE con la tarifa ${tarifa} real de este servicio (nunca con la del machote ` +
      'elegido, aunque sea de otra tarifa).',
  }));
  if (!propios.length && otros.length) {
    panel.append(Object.assign(document.createElement('p'), {
      className: 'nota aviso',
      textContent: `Todavía no tienes un machote propio verificado de ${tarifa} -- cualquiera de los de abajo (de ` +
        'otra tarifa) sirve igual como referencia de presentación mientras tanto.',
    }));
  }

  const lista = document.createElement('div');
  lista.className = 'lista-clientes';
  let seleccionado = propios.find(f => f.proyecto.machotePredeterminadoTarifa) || verificados[0];
  const radios = [];
  for (const fila of verificados) {
    const { cliente, proyecto } = fila;
    const esPropio = fila.tarifa === tarifa;
    const div = document.createElement('div');
    div.className = 'tarjeta-cliente';
    const label = document.createElement('label');
    label.style.cursor = 'pointer';
    label.style.display = 'block';
    const radio = document.createElement('input');
    radio.type = 'radio'; radio.name = 'machoteElegido';
    radio.checked = fila === seleccionado;
    radio.addEventListener('change', () => { seleccionado = fila; });
    radios.push(radio);
    label.append(radio, document.createTextNode(' '));
    const strong = document.createElement('strong'); strong.textContent = proyecto.nombre;
    label.append(strong);
    if (!esPropio) label.innerHTML += ` <span class="chip-tarifa-proyecto">🔁 machote de ${fila.tarifa}</span>`;
    if (esPropio && proyecto.machotePredeterminadoTarifa) label.innerHTML += ' <span class="chip-definitiva">⭐ predeterminado</span>';
    const nota = document.createElement('div');
    nota.className = 'nota';
    nota.textContent = `Cliente: ${cliente.nombre} · verificado ${new Date(proyecto.entregadaEn || proyecto.actualizadoEn).toLocaleDateString('es-MX')}`;
    label.append(nota);
    div.append(label);

    const acciones = document.createElement('div');
    acciones.className = 'acciones';
    const btnVer = document.createElement('button');
    btnVer.className = 'btn-link'; btnVer.textContent = '👁 Ver qué incluye';
    btnVer.addEventListener('click', () => alert(textoVistaPrevia(proyecto)));
    acciones.append(btnVer);
    if (esPropio && !proyecto.machotePredeterminadoTarifa) {
      const btnPred = document.createElement('button');
      btnPred.className = 'btn-secundario'; btnPred.textContent = '⭐ Hacer predeterminado';
      btnPred.addEventListener('click', () => {
        marcarMachotePredeterminado(cliente.id, proyecto.id);
        renderBotonesTarifaMachote();
        renderPanelCrearDesdeMachote(tarifa);
      });
      acciones.append(btnPred);
    }
    div.append(acciones);
    lista.append(div);
  }
  panel.append(lista);

  if (!propios.length) {
    const btnVerificarPropio = document.createElement('button');
    btnVerificarPropio.className = 'btn-link';
    btnVerificarPropio.textContent = `O verifica una cotización ya trabajada con la tarifa ${tarifa} como su propio machote`;
    btnVerificarPropio.addEventListener('click', () => renderPanelVerificarMachote(tarifa));
    panel.append(btnVerificarPropio);
  }

  // Pedido explicito del usuario, 2026-11-17 (dos vueltas): al escribir el nombre de la
  // cotizacion nueva, previsualizar si ya existe un estudio (en CUALQUIER cliente, no
  // solo el que se vaya a elegir abajo) con ese nombre -- si se elige uno de la lista,
  // el campo "Cliente" se autocompleta solo con el que ya tiene guardado (no hace falta
  // buscarlo a mano) y el MISMO boton de abajo, en vez de crear un proyecto nuevo, le
  // aplica el machote elegido a ESE estudio ya existente (mismo patron de aplicar
  // machote que "Guardar cotización", ver el aviso/confirm de renderListaMachotes mas
  // arriba). Si no hay coincidencia, el flujo de siempre sigue igual: nombre nuevo +
  // cliente a elegir/crear.
  panel.append(Object.assign(document.createElement('h4'), { textContent: 'Crear estudio nuevo con el machote elegido' }));
  panel.append(Object.assign(document.createElement('p'), {
    className: 'nota',
    textContent: 'Escribe el nombre de la cotización -- si ya existe un estudio editable con ese nombre, aparece ' +
      'abajo para que lo elijas (el cliente se autocompleta solo y el machote se le aplica a ESE estudio, sin ' +
      'duplicarlo). Si no aparece ninguno, se crea una cotización nueva con el nombre que escribas.',
  }));

  const filaNombre = document.createElement('label');
  filaNombre.textContent = 'Nombre de esta cotización nueva (o de una ya existente)';
  const inputNombre = document.createElement('input');
  inputNombre.type = 'text';
  inputNombre.placeholder = `Ej. Nombre del servicio — ${tarifa}`;
  filaNombre.append(document.createElement('br'), inputNombre);
  panel.append(filaNombre);

  const listaCoincidencias = document.createElement('div');
  listaCoincidencias.className = 'lista-clientes';
  panel.append(listaCoincidencias);

  const avisoExistente = document.createElement('p');
  avisoExistente.className = 'nota ok';
  avisoExistente.hidden = true;
  panel.append(avisoExistente);

  const { selectCliente, filaNuevo } = crearSelectorClienteMachote();
  const filaCliente = document.createElement('label');
  filaCliente.textContent = 'Cliente';
  filaCliente.append(document.createElement('br'), selectCliente);
  panel.append(filaCliente, filaNuevo);

  // Cuando se elige una coincidencia de la lista, aqui queda el {cliente, proyecto}
  // real -- el boton de abajo aplica el machote a ESE proyecto en vez de crear uno
  // nuevo. Se limpia en cuanto el nombre escrito ya no coincide con lo elegido (se
  // asume que el usuario cambio de opinion y quiere un estudio nuevo de nuevo).
  let existenteElegido = null;
  const limpiarExistenteElegido = () => {
    existenteElegido = null;
    avisoExistente.hidden = true;
    filaCliente.hidden = false;
    filaNuevo.hidden = selectCliente.value !== '__nuevo__';
  };

  const renderCoincidencias = () => {
    const texto = normalizarBusqueda(inputNombre.value);
    listaCoincidencias.innerHTML = '';
    if (existenteElegido && normalizarBusqueda(existenteElegido.proyecto.nombre) !== texto) limpiarExistenteElegido();
    if (!texto || existenteElegido) return;
    const resultados = [];
    for (const c of listarClientes()) {
      for (const p of (c.proyectos || [])) {
        if (p.bloqueada) continue; // congelada (definitiva/machote verificado) -- no se le puede aplicar un machote encima
        const campos = [p.nombre, c.nombre, p.formulario?.noServicio].filter(Boolean).map(normalizarBusqueda);
        if (campos.some((v) => v.includes(texto))) resultados.push({ cliente: c, proyecto: p });
      }
    }
    if (!resultados.length) return;
    resultados.sort((a, b) => (b.proyecto.actualizadoEn || '').localeCompare(a.proyecto.actualizadoEn || ''));
    listaCoincidencias.append(Object.assign(document.createElement('p'), {
      className: 'nota',
      textContent: '¿Es alguno de estos estudios ya iniciados? Elígelo para aplicarle el machote ahí mismo, sin crear uno nuevo:',
    }));
    for (const { cliente, proyecto } of resultados.slice(0, 8)) {
      const div = document.createElement('div');
      div.className = 'tarjeta-cliente';
      div.style.cursor = 'pointer';
      div.innerHTML = `<strong>${escapeHtml(proyecto.nombre)}</strong>` +
        `<div class="nota">Cliente: ${escapeHtml(cliente.nombre)} · ${proyecto.formulario?.tarifa ? `Tarifa ${escapeHtml(proyecto.formulario.tarifa)}` : 'sin calcular todavía'}` +
        `${proyecto.formulario?.noServicio ? ` · No. servicio: ${escapeHtml(proyecto.formulario.noServicio)}` : ''}</div>`;
      div.addEventListener('click', () => {
        existenteElegido = { cliente, proyecto };
        inputNombre.value = proyecto.nombre;
        listaCoincidencias.innerHTML = '';
        avisoExistente.hidden = false;
        avisoExistente.textContent = `✅ "${proyecto.nombre}" ya existe (cliente: ${cliente.nombre}) -- el machote se le va a aplicar a ESE estudio en vez de crear uno nuevo.`;
        filaCliente.hidden = true; // ya no hace falta elegirlo, se usa el real del estudio encontrado
        filaNuevo.hidden = true;
      });
      listaCoincidencias.append(div);
    }
  };
  inputNombre.addEventListener('input', renderCoincidencias);

  const btnCrear = document.createElement('button');
  btnCrear.className = 'btn-primario';
  btnCrear.textContent = '🧭 Crear estudio nuevo con este machote';
  btnCrear.addEventListener('click', () => {
    if (!seleccionado) { alert('Elige un machote verificado de la lista.'); return; }
    if (existenteElegido) {
      const { cliente, proyecto } = existenteElegido;
      if (!confirm(`¿Aplicar "${seleccionado.proyecto.nombre}" como machote sobre "${proyecto.nombre}" (${cliente.nombre})? ` +
        'Se reemplazan los pasos y TODOS los textos/apagados editados de ese estudio (se quedan igual que en el ' +
        'machote, salvo los que traigan pegado un número/monto del cálculo del cliente anterior) -- tarifa, cargos, ' +
        'identidad y consumo de ESE proyecto NO se tocan, se quedan tal cual ya los tenga capturados.')) return;
      aplicarMachoteAProyecto(proyecto, { cliente: seleccionado.cliente, proyecto: seleccionado.proyecto });
      proyecto.machoteOrigenId = seleccionado.proyecto.id;
      proyecto.machoteOrigenTarifa = tarifa;
      guardarProyecto(cliente, proyecto);
      abrirProyecto(cliente.id, proyecto.id);
      return;
    }
    const nombre = inputNombre.value.trim();
    if (!nombre) { alert('Escribe primero el nombre de esta cotización.'); return; }
    const cliente = resolverClienteDeSelectorMachote(selectCliente, filaNuevo);
    if (!cliente) return;
    const nuevo = crearProyecto(cliente, { nombre });
    aplicarMachoteAProyecto(nuevo, { cliente: seleccionado.cliente, proyecto: seleccionado.proyecto });
    // Se guarda aparte de plantillaOrigen (que ya puso aplicarMachoteAProyecto) para
    // poder detectar mas adelante (calcularYRenderizar) si la tarifa que de verdad
    // trae el recibo de este servicio coincide con la tarifa del machote elegido aqui.
    nuevo.machoteOrigenId = seleccionado.proyecto.id;
    nuevo.machoteOrigenTarifa = tarifa;
    guardarProyecto(cliente, nuevo);
    abrirProyecto(cliente.id, nuevo.id);
  });
  panel.append(btnCrear);
}

// Panel cuando la tarifa AUN NO tiene ningun machote verificado: elegir una cotizacion
// ya trabajada con esa tarifa para verificarla, o (si GDMTO ya tiene uno verificado)
// preparar un borrador copiando su estructura para adaptarlo a esta tarifa primero.
function renderPanelVerificarMachote(tarifa) {
  const panel = $('panelTarifaMachoteSeleccionada');
  panel.innerHTML = '';
  panel.append(Object.assign(document.createElement('h3'), { textContent: `Tarifa ${tarifa} — ⚠️ Machote pendiente de verificar` }));
  panel.append(Object.assign(document.createElement('p'), {
    className: 'nota aviso',
    textContent: 'Todavía no hay ningún machote VERIFICADO para esta tarifa -- el botón de arriba se habilita en ' +
      'cuanto verifiques uno. Elige abajo una cotización ya trabajada con esta tarifa y verifícala, o (si existe) ' +
      'prepara primero un borrador copiando el machote de GDMTO ya verificado para adaptarlo a esta tarifa.',
  }));

  if (tarifa !== 'GDMTO') {
    const gdmto = machotesVerificadosDeTarifa('GDMTO');
    const gdmtoPred = gdmto.find(f => f.proyecto.machotePredeterminadoTarifa) || gdmto[0];
    if (gdmtoPred) {
      const div = document.createElement('div');
      div.className = 'tarjeta-cliente';
      div.innerHTML = `<strong>📑 Crear un borrador para ${tarifa} desde el machote GDMTO verificado</strong>` +
        `<div class="nota">Copia los textos/estructura/visibilidad de "${escapeHtml(gdmtoPred.proyecto.nombre)}" en un ` +
        'proyecto nuevo (sin calcular todavía) para que ahí adaptes tablas, cargos, períodos y conclusiones a esta ' +
        'tarifa -- pruébalo con un recibo real representativo de esta tarifa antes de verificarlo.</div>';
      const btnBorrador = document.createElement('button');
      btnBorrador.className = 'btn-secundario';
      btnBorrador.textContent = '📑 Crear borrador y abrirlo';
      btnBorrador.addEventListener('click', () => {
        const { cliente, proyecto } = crearBorradorMachote(tarifa, { cliente: gdmtoPred.cliente, proyecto: gdmtoPred.proyecto });
        abrirProyecto(cliente.id, proyecto.id);
      });
      div.append(btnBorrador);
      panel.append(div);
    }
  }

  panel.append(Object.assign(document.createElement('h4'), { textContent: 'Verificar una cotización ya trabajada con esta tarifa' }));
  const candidatos = proyectosParaVerificarMachote(tarifa);
  if (!candidatos.length) {
    panel.append(Object.assign(document.createElement('p'), {
      className: 'nota',
      textContent: `No hay ninguna cotización (ni borrador) con tarifa ${tarifa} todavía -- créala o calcúlala primero ` +
        '(desde "Cotizaciones de este cliente"), o usa el borrador de arriba si ya existe.',
    }));
    return;
  }
  const lista = document.createElement('div');
  lista.className = 'lista-clientes';
  for (const { cliente, proyecto } of candidatos) {
    const div = document.createElement('div');
    div.className = 'tarjeta-cliente';
    div.innerHTML = `<strong>${escapeHtml(proyecto.nombre)}</strong>` +
      (proyecto.definitiva ? ` <span class="chip-definitiva">${proyecto.propositoDefinitiva === 'muestra' ? '📋 muestra' : '✅ definitiva'}${proyecto.bloqueada ? ' 🔒' : ''}</span>` : '') +
      `<div class="nota">Cliente: ${escapeHtml(cliente.nombre)} · ${proyecto.formulario?.tarifa ? 'calculada' : 'sin calcular todavía'} · ${new Date(proyecto.actualizadoEn).toLocaleDateString('es-MX')}</div>`;
    const btnVerificar = document.createElement('button');
    btnVerificar.className = 'btn-primario';
    btnVerificar.textContent = `✅ Verificar como machote de ${tarifa}`;
    btnVerificar.addEventListener('click', () => {
      const preview = textoVistaPrevia(proyecto);
      if (!confirm(`${preview}\n\n¿Verificar "${proyecto.nombre}" (${cliente.nombre}) como machote de la tarifa ${tarifa}? ` +
        'Queda CONGELADA (como una definitiva de muestra) desde este momento -- seguir editando el proyecto de origen ' +
        'después de esto nunca altera esta versión ya verificada; para actualizarla hay que volver a verificarla a propósito.')) return;
      const clon = clonarProyectoCongelado(cliente, proyecto, 'muestra', tarifa);
      if (machotesVerificadosDeTarifa(tarifa).length === 1) marcarMachotePredeterminado(cliente.id, clon.id);
      renderBotonesTarifaMachote();
      seleccionarTarifaMachote(tarifa);
    });
    div.append(btnVerificar);
    lista.append(div);
  }
  panel.append(lista);
}

function mostrarPantallaCotizadorMachote() {
  $('pantallaClientes').hidden = true;
  $('pantallaEnvios').hidden = true;
  $('pantallaDashboard').hidden = true;
  $('pantallaDefinitivasPorTarifa').hidden = true;
  $('pantallaProyectos').hidden = true;
  $('pantallaCliente').hidden = true;
  $('pantallaCotizadorMachote').hidden = false;
  tarifaMachoteSeleccionada = null;
  $('estadoReciboCotizadorMachote').textContent = '';
  $('archivoReciboCotizadorMachote').value = '';
  $('panelTarifaMachoteSeleccionada').innerHTML = '';
  renderBotonesTarifaMachote();
  fijarTitulo('Cotizador por machote');
}
$('btnAbrirCotizadorMachote').addEventListener('click', mostrarPantallaCotizadorMachote);
$('btnVolverClientesDesdeCotizadorMachote').addEventListener('click', mostrarPantallaClientes);

// Deteccion de tarifa ANTES de crear nada -- pedido explicito del usuario: "permite
// elegir la tarifa o detectarla al cargar el recibo CFE... si el recibo indica una
// tarifa distinta de la seleccionada, muestra la diferencia". Solo lee el recibo
// (mismo leerReciboMultiple que usa el resto de la app) para enterarse de su tarifa --
// no crea ningun proyecto todavia, eso sigue pasando solo al dar clic en "Crear
// estudio nuevo con este machote" (arriba), que es cuando SI hace falta un cliente.
$('archivoReciboCotizadorMachote').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  const estadoEl = $('estadoReciboCotizadorMachote');
  estadoEl.className = 'nota';
  estadoEl.textContent = 'Leyendo el recibo para detectar su tarifa (puede tardar hasta 1 minuto si usa OCR)...';
  try {
    const campos = await leerReciboMultiple(files);
    if (!campos.tarifa || !TARIFAS_SOPORTADAS.has(campos.tarifa)) {
      estadoEl.className = 'nota aviso';
      estadoEl.textContent = 'No se pudo detectar una tarifa soportada en este recibo -- elige el botón de la tarifa correcta manualmente.';
      return;
    }
    if (tarifaMachoteSeleccionada && tarifaMachoteSeleccionada !== campos.tarifa) {
      estadoEl.className = 'nota aviso';
      estadoEl.textContent = `⚠️ Este recibo es de tarifa ${campos.tarifa}, distinta de la que tenías elegida ` +
        `(${tarifaMachoteSeleccionada}) -- se cambió la selección a ${campos.tarifa}.`;
    } else {
      estadoEl.className = 'nota ok';
      estadoEl.textContent = `Tarifa detectada: ${campos.tarifa}.`;
    }
    seleccionarTarifaMachote(campos.tarifa);
  } catch (err) {
    estadoEl.className = 'nota aviso';
    estadoEl.textContent = 'No se pudo leer el recibo: ' + err.message;
    console.error(err);
  }
});

// "Mi formato predeterminado (fijo)" -- ver formatoFijo.js. Muestra de dónde y cuándo
// se fijó, y cambia el texto del botón entre "Fijar" (primera vez) y "Actualizar"
// (ya hay uno guardado) -- misma acción, mismo botón, solo cambia la etiqueta.
function renderEstadoFormatoFijo() {
  const formato = leerFormatoFijo();
  const estadoEl = $('estadoFormatoFijo');
  const btn = $('btnFijarFormatoFijo');
  if (!formato) {
    estadoEl.textContent = 'Todavía no has fijado ningún formato predeterminado.';
    btn.textContent = '📌 Fijar ESTA cotización como mi formato predeterminado';
  } else {
    estadoEl.textContent = `Formato fijado desde "${formato.origenProyectoNombre}" (${formato.origenClienteNombre}) el ` +
      `${new Date(formato.fechaFijado).toLocaleDateString('es-MX')}.`;
    btn.textContent = '🔄 Actualizar mi formato predeterminado con ESTA cotización';
  }
}

$('btnFijarFormatoFijo').addEventListener('click', () => {
  if (!clienteActual || !proyectoActual) return;
  const preview = textoVistaPrevia(proyectoActual);
  if (!confirm(`${preview}\n\n¿Fijar/actualizar tu formato predeterminado con esta cotización? Reemplaza por completo lo que hubiera guardado antes.`)) return;
  fijarFormatoDesde(clienteActual, proyectoActual);
  renderEstadoFormatoFijo();
  alert('Formato predeterminado guardado. Ya puedes usar "🧩 Nuevo desde mi formato fijo" al crear una cotización para cualquier cliente.');
});

function renderAvisoPlantillaOrigen() {
  const o = proyectoActual.plantillaOrigen;
  const avisoEl = $('avisoPlantillaOrigen');
  if (!o || proyectoActual.plantillaVerificada) { avisoEl.hidden = true; return; }
  avisoEl.hidden = false;
  $('txtPlantillaOrigen').textContent = `${o.clienteNombre} — ${o.proyectoNombre}${o.tarifa ? ' (' + o.tarifa + ')' : ''}`;
  // Desde 2026-11-12, aplicarMachoteAProyecto() ya filtra estos textos al elegir el
  // machote (ver clientes.js) -- esta caja normalmente solo aparece si el usuario
  // edito a mano un parrafo DESPUES y le pego un numero el mismo. Pedido explicito del
  // usuario: el texto y el boton de abajo (btnMarcarPlantillaVerificada) hablaban de
  // "verificar contra el recibo real", pero estos numeros (paneles sugeridos, ahorro,
  // etc.) NUNCA vienen impresos en ningun recibo de CFE -- son resultado del CALCULO Y
  // ANALISIS del SFV para este inmueble, no un dato que se pueda cotejar contra el
  // recibo. Se explica asi, y se da un boton para restaurarlos de un clic al texto
  // generico (que ya muestra los numeros recalculados de este servicio) en vez de solo
  // "marcar como revisado" sin corregir nada.
  // Refuerzo 2026-11-13 (prompt de machotes): proyectoActual.textosRevisionMachote ya
  // viene poblado desde aplicarMachoteAProyecto() (clientes.js) con TODO lo detectado
  // al aplicar el machote (identidad ya auto-corregida, cifras sin convertir a token, y
  // conclusiones comparativas) -- antes esta caja solo corria detectarTextosConNumeros
  // Sospechosos() sobre el estado actual, que nunca encontraba nada relacionado al
  // machote porque esos textos ya se habian descartado en silencio antes de llegar
  // aqui. Se combina con la deteccion en vivo (edicion posterior de ESTE cliente que
  // pego un numero sin querer) para no perder esa red de seguridad.
  const pendientes = (proyectoActual.textosRevisionMachote || []).filter((h) => !h.resuelto);
  const autoCorregidos = (proyectoActual.textosRevisionMachote || []).filter((h) => h.resuelto);
  // Candado de tarifa cruzada (Parte A.1/D del encargo 2026-11-19, "Cotización 40"
  // COBAEB Plantel 26/PDBT): aplicarMachoteAProyecto() (clientes.js) solo filtra
  // identidad/cifras/conclusiones al copiar textosEditados del machote -- nunca
  // detectó que un párrafo mencionara la doctrina o el nombre de OTRA tarifa. Se
  // revisa aquí, contra la tarifa/clasificación REAL de este servicio (ultimoResultado,
  // ya calculado con el recibo de este cliente, nunca con el del machote), para
  // ofrecer la misma corrección de un clic que ya existe para los otros 2 casos.
  const tarifaCruzada = ultimoResultado ? detectarTextosTarifaCruzada(ultimoResultado, proyectoActual.textosEditados) : [];
  const sospechosos = [...detectarTextosConNumerosSospechosos(proyectoActual.textosEditados), ...tarifaCruzada]
    .filter((s) => !pendientes.some((h) => h.id === s.id)) // evitar duplicar el mismo id
    .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i); // ni duplicar entre si mismos (cifra + tarifa cruzada en el mismo id)
  const cajaEl = $('listaTextosSospechososMachote');
  cajaEl.innerHTML = '';
  if (pendientes.length || autoCorregidos.length || sospechosos.length) {
    cajaEl.hidden = false;
    if (pendientes.length || sospechosos.length) {
      cajaEl.append(Object.assign(document.createElement('p'), {
        className: 'nota aviso',
        textContent: '⚠️ Estos textos se conservaron tal como estaban en el machote, pero NO se pudieron verificar contra ' +
          'el cálculo de este servicio -- revísalos antes de entregar el estudio, o restáuralos para que muestren el ' +
          'texto genérico (ya recalculado):',
      }));
      const ul = document.createElement('ul');
      for (const s of [...pendientes, ...sospechosos]) {
        const li = document.createElement('li');
        const code = document.createElement('code'); code.textContent = s.id;
        li.append(code, document.createTextNode(`: "${s.texto}"`));
        if (s.detalle) { const small = document.createElement('div'); small.className = 'nota'; small.textContent = s.detalle; li.append(small); }
        ul.append(li);
      }
      cajaEl.append(ul);
      const btnRestaurar = document.createElement('button');
      btnRestaurar.className = 'btn-secundario';
      btnRestaurar.textContent = '🔄 Restaurar estos textos al cálculo de este inmueble';
      btnRestaurar.addEventListener('click', () => {
        for (const s of [...pendientes, ...sospechosos]) delete proyectoActual.textosEditados[s.id];
        proyectoActual.textosRevisionMachote = (proyectoActual.textosRevisionMachote || []).filter((h) => h.resuelto);
        guardarProyecto(clienteActual, proyectoActual);
        if (ultimoResultado) { ultimoResultado.textosEditados = proyectoActual.textosEditados; renderSecciones(ultimoResultado); }
        renderAvisoPlantillaOrigen();
      });
      cajaEl.append(btnRestaurar);
    }
    if (autoCorregidos.length) {
      const p = document.createElement('p');
      p.className = 'nota';
      p.textContent = `ℹ️ ${autoCorregidos.length} texto(s) mencionaban el inmueble anterior -- se usó el texto genérico (con los datos de este servicio) en su lugar automáticamente: ${autoCorregidos.map((h) => h.id).join(', ')}.`;
      cajaEl.append(p);
    }
  } else {
    cajaEl.hidden = true;
  }
}
$('btnMarcarPlantillaVerificada').addEventListener('click', () => {
  proyectoActual.plantillaVerificada = true;
  guardarProyecto(clienteActual, proyectoActual);
  renderAvisoPlantillaOrigen();
});

// Aviso de tarifa distinta -- pedido explicito del usuario (refuerzo "Cotizador por
// machote", 2026-11-14): "si el usuario cambia de tarifa despues de iniciar la
// cotizacion, vuelve a filtrar los machotes y solicita uno verificado para la nueva
// tarifa". `machoteOrigenTarifa` se fija una sola vez, al crear el estudio desde el
// modulo por machote (ver renderPanelCrearDesdeMachote) -- si el recibo real que se
// termina capturando aqui resulta de OTRA tarifa, se avisa y se ofrece reaplicar con
// un machote verificado de la tarifa correcta, sin perder los datos del servicio ya
// capturados (aplicarMachoteAProyecto nunca toca proyecto.formulario). Lee siempre
// `proyectoActual.formulario.tarifa` ya GUARDADO (no leerFormulario() en vivo) para que
// tambien funcione al reabrir el proyecto, antes de tocar cualquier campo del DOM.
function renderAvisoMachoteTarifaDistinta() {
  const avisoEl = $('avisoMachoteTarifaDistinta');
  if (!avisoEl || !proyectoActual) return;
  const origenTarifa = proyectoActual.machoteOrigenTarifa;
  const tarifaActual = proyectoActual.formulario?.tarifa;
  if (!origenTarifa || !tarifaActual || origenTarifa === tarifaActual) { avisoEl.hidden = true; return; }
  avisoEl.hidden = false;
  avisoEl.innerHTML = '';
  avisoEl.append(Object.assign(document.createElement('p'), {
    className: 'nota aviso',
    textContent: `⚠️ Esta cotización se creó con un machote verificado de tarifa ${origenTarifa}, pero el recibo ` +
      `capturado aquí es de tarifa ${tarifaActual} -- los textos reutilizables pueden no aplicar bien a esta tarifa. ` +
      'Elige un machote verificado de la tarifa correcta:',
  }));
  const verificados = machotesVerificadosDeTarifa(tarifaActual);
  if (!verificados.length) {
    avisoEl.append(Object.assign(document.createElement('p'), {
      className: 'nota',
      textContent: `Todavía no hay ningún machote verificado para la tarifa ${tarifaActual} -- ve a "🧭 Cotizador por ` +
        'machote" para verificar o preparar uno antes de seguir.',
    }));
    return;
  }
  for (const { cliente, proyecto } of verificados) {
    const btn = document.createElement('button');
    btn.className = 'btn-secundario';
    btn.textContent = `🔁 Aplicar "${proyecto.nombre}" (machote ${tarifaActual}${proyecto.machotePredeterminadoTarifa ? ', predeterminado' : ''})`;
    btn.addEventListener('click', () => {
      if (!confirm(`¿Aplicar "${proyecto.nombre}" (${cliente.nombre}) como machote de esta cotización? Se reemplazan ` +
        'los textos/apagados editados por los de este machote (salvo los que traigan un número del cálculo anterior, ' +
        'que se conservan marcados para revisión) -- tarifa, cargos, identidad y consumo de ESTE servicio NO se tocan.')) return;
      aplicarMachoteAProyecto(proyectoActual, { cliente, proyecto });
      proyectoActual.machoteOrigenId = proyecto.id;
      proyectoActual.machoteOrigenTarifa = tarifaActual;
      guardarProyecto(clienteActual, proyectoActual);
      $('contenedorSecciones').innerHTML = '';
      $('tabPdf').hidden = true;
      $('estadoCalculo').className = 'nota aviso';
      $('estadoCalculo').textContent = 'Machote aplicado -- pulsa "Calcular" para ver la cotización con los textos de este machote.';
      renderAvisoPlantillaOrigen();
      renderAvisoMachoteTarifaDistinta();
      renderListaMachotes();
    });
    avisoEl.append(btn);
  }
}

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

// Subir un recibo aquí (antes de abrir ninguna estudio) crea una estudio nueva
// con los datos ya detectados -- pedido explícito del usuario. Si en cambio se sube un
// recibo DENTRO de una estudio ya abierta (sección 1 más abajo), eso actualiza esa
// MISMA estudio -- no crea una nueva cada vez que se corrige un dato.
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
// Llena el selector de "con qué cliente registrado guardar esta estudio" --
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
  // Refuerzo 2026-11-13 (prompt de exportación PDF/Excel): "abre otro estudio durante
  // la generación" -- bug real encontrado leyendo el código: prepararDocumentosAdjuntos
  // ParaPdf() es async (descarga imagenes remotas) y generarPdfCompletaDesdeVista() lee
  // el DOM YA RENDERIZADO en vivo (#contenedorSecciones) -- si el usuario abria otro
  // proyecto MIENTRAS esa descarga seguia en curso, el PDF/Excel que terminaba de
  // generarse podia mezclar los datos financieros del estudio ORIGINAL (capturados en
  // `ultimoResultado` al iniciar) con el texto/tablas del estudio NUEVO ya renderizado
  // en pantalla para ese momento -- una combinacion invalida, nunca igual a ninguno de
  // los dos estudios reales. Se bloquea cambiar de estudio mientras haya una
  // exportacion en curso, en vez de arriesgar esa mezcla.
  if (exportandoDocumento) { alert('Espera a que termine la descarga en curso antes de abrir otro estudio.'); return; }
  clienteActual = obtenerCliente(clienteId);
  proyectoActual = clienteActual ? obtenerProyecto(clienteActual, proyectoId) : null;
  if (!clienteActual || !proyectoActual) { mostrarPantallaProyectos(clienteId); return; }
  // Pasos de entrega: proyectos guardados antes de que esto existiera se migran solos
  // aqui (ver asegurarPasos en clientes.js) -- nunca pierden lo que ya tuvieran apagado.
  asegurarPasos(proyectoActual);
  renderSelectorPasos();
  // "El RPU manda" (encargo 2026-11-20): proyectos guardados antes de que existiera el
  // sello de identidad del recibo se migran solos aqui tambien -- ver asegurarReciboSello.
  asegurarReciboSello(proyectoActual);
  // Si esta cotizacion ya tenia un link de vista previa compartida activo de una
  // sesion anterior, mostrar la caja con el link de nuevo (en vez de empezar oculta
  // como si nunca se hubiera compartido).
  if (proyectoActual.compartirToken) mostrarCajaLinkCompartido(proyectoActual.compartirToken);
  else { $('cajaLinkCompartido').hidden = true; $('btnDejarDeCompartir').hidden = true; }
  renderListaMachotes();
  renderEstadoFormatoFijo();
  $('pantallaClientes').hidden = true;
  $('pantallaEnvios').hidden = true;
  $('pantallaDashboard').hidden = true;
  $('pantallaDefinitivasPorTarifa').hidden = true;
  $('pantallaCotizadorMachote').hidden = true;
  $('pantallaProyectos').hidden = true;
  $('pantallaCliente').hidden = false;
  $('clienteNombreBarra').value = clienteActual.nombre;
  $('clienteTipoBarra').textContent = etiquetaTipo(clienteActual.tipo);
  fijarTitulo(`${proyectoActual.nombre} — ${clienteActual.nombre}`);
  $('clienteTipoBarra').className = `chip-tipo ${claseTipo(clienteActual.tipo)}`;
  sincronizarInputsNombreProyecto();
  renderAvisoPlantillaOrigen();
  renderAvisoMachoteTarifaDistinta();
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
  ocultarAvisoTextosRestauradosTarifa();
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
  renderGestorSeccionesPersonalizadas();
  renderFotosInmueble();
  renderIndice(null);
  renderComparacion();
  aplicarVisibilidadPanelesMachote();
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
}
$('aplicaIsr').addEventListener('change', () => { $('tasaIsr').disabled = !$('aplicaIsr').checked; });
// Escala de costos: se deriva sola de la tarifa (ya no se pide a mano) -- gran demanda
// (GDMTO/GDMTH/GDBT) = comercial, pequeña demanda/domestica (PDBT/01/DAC) = residencial.
$('tarifa').addEventListener('change', () => {
  $('escalaCostos').value = escalaCostosParaTarifa($('tarifa').value);
  // Si hay una plantilla guardada para esta tarifa, ofrecerla (pero no aplicarla automáticamente,
  // porque el usuario podría haber editado este proyecto a mano y querría conservar sus cambios).
  // Ver candidatosMachote() más abajo para cómo se muestra en la UI.
  renderListaMachotes();
});

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
    nombreVerificacion: $('inmNombreVerificacion').value.trim() || null,
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
  $('inmNombreVerificacion').value = inm?.nombreVerificacion || '';
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
  // Pedido explicito del usuario, 2026-11-18: poder releer un recibo YA subido sin
  // tener que volver a subirlo -- util cada vez que se corrige algo en el lector
  // (recibo.js) y ya hay estudios guardadas con el archivo adjunto pero con campos que
  // el lector viejo nunca detecto (ej. titular/domicilio/historial de un formato de
  // recibo que antes no se reconocia).
  if (archivos.length) {
    const filaBtn = document.createElement('div');
    filaBtn.className = 'fila-archivo-recibo';
    const btnRescan = document.createElement('button');
    btnRescan.type = 'button';
    btnRescan.id = 'btnReescanearRecibo';
    btnRescan.className = 'btn-link';
    btnRescan.textContent = '🔄 Volver a leer este recibo';
    btnRescan.title = 'Vuelve a extraer los datos del recibo con el lector actual, usando el/los archivo(s) ' +
      'ya subido(s) -- sin tener que volver a subirlos. Útil si se corrigió algo en el lector después de que ' +
      'este recibo ya se había subido.';
    btnRescan.addEventListener('click', reescanearArchivosRecibo);
    filaBtn.append(btnRescan);
    cont.append(filaBtn);
  }
}

async function reescanearArchivosRecibo() {
  const archivos = (proyectoActual && proyectoActual.archivosRecibo) || [];
  if (!archivos.length) return;
  const estadoEl = $('estadoRecibo');
  $('avisoReconciliacion').hidden = true;
  estadoEl.className = 'nota';
  estadoEl.textContent = (archivos.length > 1
    ? `Releyendo los ${archivos.length} archivos ya subidos`
    : 'Releyendo el archivo ya subido') + ' (puede tardar hasta 1 minuto si usa OCR)...';
  const btn = $('btnReescanearRecibo');
  if (btn) btn.disabled = true;
  try {
    const files = [];
    for (const a of archivos) {
      const resp = await fetch(a.url);
      if (!resp.ok) throw new Error(`No se pudo descargar "${a.nombre}" para releerlo (${resp.status}).`);
      const blob = await resp.blob();
      files.push(new File([blob], a.nombre, { type: blob.type || a.tipo || '' }));
    }
    const campos = await leerReciboMultiple(files);
    ultimoLeido = campos;
    if (llenarFormularioDesdeRecibo(campos)) {
      mostrarEstadoLecturaRecibo(campos);
      intentarAutoCalcular(campos);
    } else {
      estadoEl.className = 'nota';
      estadoEl.textContent = 'No se aplicó esta relectura -- el estudio se quedó exactamente como estaba.';
    }
  } catch (err) {
    estadoEl.className = 'nota';
    estadoEl.textContent = 'Error al releer el recibo: ' + err.message;
    console.error(err);
  } finally {
    const btnDeNuevo = $('btnReescanearRecibo');
    if (btnDeNuevo) btnDeNuevo.disabled = false;
  }
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
      : '⚠ No se pudo subir el archivo del recibo (revisa tu conexión a internet) -- no quedó adjuntado a esta estudio, intenta subirlo de nuevo.';
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
      : 'No se pudo subir el archivo de verificación (revisa tu conexión a internet) -- no quedó adjuntado a esta estudio, intenta subirlo de nuevo.');
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

// ---------------- Migracion unica (en segundo plano): fotos ya guardadas localmente ----------------
// Las estudios que ya tenian fotoSembrado/fotosInmueble guardados ANTES del 2026-11-17
// (como data URL completo) son justo las que estaban llenando la cuota de localStorage
// -- "No se pudo guardar... Borra fotos/archivos viejos" (ver avisoErrorGuardado,
// alGuardar en clientes.js). En vez de pedirle al usuario que las borre a mano, esto
// las sube a Supabase Storage (mismo bucket que ya usan archivosRecibo/
// archivosVerificacion/fotoSembrado nuevo) y reemplaza el dataUrl guardado por la
// referencia {url,...} -- la foto se conserva, solo deja de pesar en el navegador.
// Se corre una vez al arrancar la app (ver arrancar() al final del archivo),
// silenciosa, en segundo plano: si algo falla (sin internet, proyecto bloqueado/
// `bloqueada`, que nunca se puede modificar) simplemente se queda para el proximo
// intento -- nunca bloquea ni retrasa el arranque normal de la app.
async function migrarFotosLocalesANube() {
  let migradas = 0, fallidas = 0;
  for (const cliente of listarClientes()) {
    for (const proyecto of (cliente.proyectos || [])) {
      let cambio = false;
      if (proyecto.fotoSembrado && proyecto.fotoSembrado.dataUrl && !proyecto.fotoSembrado.url) {
        try {
          const blob = await (await fetch(proyecto.fotoSembrado.dataUrl)).blob();
          const subido = await supabaseSubirArchivo('sembrado', new File([blob], 'sembrado.jpg', { type: 'image/jpeg' }));
          proyecto.fotoSembrado = { ...subido, ancho: proyecto.fotoSembrado.ancho, alto: proyecto.fotoSembrado.alto };
          cambio = true; migradas++;
        } catch (err) {
          fallidas++;
          console.error(`No se pudo migrar la foto del sembrado de "${proyecto.nombre}" (${cliente.nombre}) a la nube:`, err);
        }
      }
      if (proyecto.fotosInmueble && proyecto.fotosInmueble.some((f) => f.dataUrl && !f.url)) {
        const nuevas = [];
        for (const foto of proyecto.fotosInmueble) {
          if (!foto.dataUrl || foto.url) { nuevas.push(foto); continue; }
          try {
            const blob = await (await fetch(foto.dataUrl)).blob();
            const subido = await supabaseSubirArchivo('fotos-inmueble', new File([blob], 'foto-inmueble.jpg', { type: 'image/jpeg' }));
            nuevas.push({ ...subido, ancho: foto.ancho, alto: foto.alto, etiqueta: foto.etiqueta || '' });
            cambio = true; migradas++;
          } catch (err) {
            fallidas++;
            nuevas.push(foto);
            console.error(`No se pudo migrar una foto del inmueble de "${proyecto.nombre}" (${cliente.nombre}) a la nube:`, err);
          }
        }
        proyecto.fotosInmueble = nuevas;
      }
      if (cambio) guardarProyecto(cliente, proyecto);
    }
  }
  if (migradas) console.log(`Migradas ${migradas} foto(s) de sembrado/inmueble a Supabase Storage -- liberan espacio en el navegador.`);
  if (fallidas) console.warn(`${fallidas} foto(s) no se pudieron migrar a la nube todavía (revisa tu conexión) -- se reintentará la próxima vez que abras la app.`);
}

// ---------------- Foto del sembrado de paneles (se agrega a la seccion 6 y al PDF) ----------------
// Se guarda como {nombre,tipo,url,ruta,ancho,alto} -- NO como data URL completo --
// desde el 2026-11-17: guardar la imagen entera dentro del proyecto llenaba la cuota de
// localStorage (ver "No se pudo guardar" en clientes.js/guardarTodos) con solo unas
// cuantas estudios con sembrado + fotos del inmueble. Ahora se sube al mismo bucket de
// Supabase Storage que ya usan archivosRecibo/archivosVerificacion (ver supabase.js) y
// solo se guarda la referencia -- ancho/alto se conservan porque el PDF (propuesta.js)
// los necesita para dibujar la imagen sin deformarla, sin tener que volver a descargarla
// solo para medirla.
function mostrarPreviaSembrado(foto) {
  // foto.dataUrl como respaldo: estudios guardados ANTES del 2026-11-17 (ver comentario
  // de arriba) todavia tienen la imagen completa ahi, nunca se subieron a Storage, y no
  // hay por que forzar una re-subida solo para poder seguir viendolas.
  $('imgPreviaSembrado').src = foto ? (foto.url || foto.dataUrl) : '';
  $('previsualizacionSembrado').hidden = !foto;
}

$('archivoSembrado').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $('archivoSembrado').disabled = true;
  try {
    const foto = await archivoAImagenComprimida(file);
    const blob = await (await fetch(foto.dataUrl)).blob();
    const subido = await supabaseSubirArchivo('sembrado', new File([blob], 'sembrado.jpg', { type: 'image/jpeg' }));
    const fotoFinal = { ...subido, ancho: foto.ancho, alto: foto.alto };
    const anterior = proyectoActual.fotoSembrado;
    proyectoActual.fotoSembrado = fotoFinal;
    proyectoActual.sembradoFuente = 'manual';
    guardarProyecto(clienteActual, proyectoActual);
    mostrarPreviaSembrado(fotoFinal);
    if (ultimoResultado) { ultimoResultado.fotoSembrado = fotoFinal; renderSecciones(ultimoResultado); }
    if (anterior && anterior.ruta) { try { await supabaseEliminarArchivo(anterior.ruta); } catch (err) { console.error(err); } }
  } catch (err) {
    alert('No se pudo procesar/subir la imagen (revisa tu conexión a internet): ' + err.message);
    console.error(err);
  } finally {
    $('archivoSembrado').disabled = false;
    e.target.value = '';
  }
});

$('btnQuitarSembrado').addEventListener('click', async () => {
  const anterior = proyectoActual.fotoSembrado;
  proyectoActual.fotoSembrado = null;
  guardarProyecto(clienteActual, proyectoActual);
  mostrarPreviaSembrado(null);
  if (ultimoResultado) { ultimoResultado.fotoSembrado = null; renderSecciones(ultimoResultado); }
  if (anterior && anterior.ruta) { try { await supabaseEliminarArchivo(anterior.ruta); } catch (err) { console.error(err); } }
});

// ---------------- Fotos de condiciones GENERALES del inmueble (seccion 5 del formulario,
// se ven en la seccion 6 de la cotizacion/PDF) ----------------
// Distinto de fotoSembrado (que es SOLO la distribucion de paneles sobre el techo):
// aqui se guardan VARIAS fotos (sombras, cubierta, tablero, etc.), cada una con una
// etiqueta corta opcional. Se guardan como {nombre,tipo,url,ruta,ancho,alto,etiqueta} --
// subidas a Supabase Storage, mismo motivo y mismo patron que fotoSembrado (ver ese
// comentario mas arriba, 2026-11-17) -- antes de esto, 6 fotos comprimidas por estudio
// seguian siendo suficiente para llenar la cuota de localStorage entre varios clientes.
// Tope de 6 fotos por proyecto, pedido explicito del usuario (hueco declarado desde
// 2026-10-29, "no hay captura de fotografias en esta version").
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
    img.src = foto.url || foto.dataUrl; // respaldo para fotos guardadas antes del 2026-11-17
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
  const fotos = proyectoActual.fotosInmueble || [];
  const foto = fotos[indice];
  proyectoActual.fotosInmueble = fotos.filter((_, i) => i !== indice);
  guardarProyecto(clienteActual, proyectoActual);
  renderFotosInmueble();
  if (ultimoResultado) { ultimoResultado.fotosInmueble = proyectoActual.fotosInmueble; renderSecciones(ultimoResultado); }
  if (foto && foto.ruta) { try { await supabaseEliminarArchivo(foto.ruta); } catch (err) { console.error(err); } }
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
    alert(`Solo se agregaron ${porProcesar.length} foto(s) -- el máximo son ${MAX_FOTOS_INMUEBLE} por estudio.`);
  }
  $('archivoFotoInmueble').disabled = true;
  let fallas = 0;
  try {
    for (const file of porProcesar) {
      try {
        const foto = await archivoAImagenComprimida(file, { maxAncho: 900, calidad: 0.6 });
        const blob = await (await fetch(foto.dataUrl)).blob();
        const subido = await supabaseSubirArchivo('fotos-inmueble', new File([blob], 'foto-inmueble.jpg', { type: 'image/jpeg' }));
        actuales.push({ ...subido, ancho: foto.ancho, alto: foto.alto, etiqueta: '' });
      } catch (err) {
        fallas++;
        console.error('No se pudo procesar/subir una foto del inmueble:', err);
      }
    }
    proyectoActual.fotosInmueble = actuales;
    guardarProyecto(clienteActual, proyectoActual);
    renderFotosInmueble();
    if (ultimoResultado) { ultimoResultado.fotosInmueble = proyectoActual.fotosInmueble; renderSecciones(ultimoResultado); }
    if (fallas) alert(`No se pudo subir ${fallas} foto(s) del inmueble -- revisa tu conexión a internet e intenta de nuevo.`);
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
// analizador-fv-cfe, que reciben cualquier imagen + su escala, sin depender de Maps API).
$('btnAbrirMaps').addEventListener('click', () => {
  const direccion = $('autoDireccionMaps').value.trim();
  if (!direccion) { alert('Escribe o confirma la dirección a buscar.'); return; }
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`, '_blank');
});

$('btnSembrarAuto').addEventListener('click', () => {
  const est = proyectoActual && proyectoActual.sembradorAuto;
  if (!est || !est.imagenDataUrl) return;
  if (!ultimoResultado || !ultimoResultado.n) {
    alert('Calcula primero la estudio (botón "Calcular") para saber cuántos paneles sembrar.');
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

$('btnGuardarSembradoAuto').addEventListener('click', async () => {
  const paneles = editorSembrador.obtener();
  if (!paneles.length) { alert('Todavía no hay paneles sembrados -- usa "③ Sembrar paneles" primero.'); return; }
  const btn = $('btnGuardarSembradoAuto');
  btn.disabled = true;
  try {
    const foto = hornearImagenSembrado($('imgSembradorAuto'), paneles);
    const blob = await (await fetch(foto.dataUrl)).blob();
    const subido = await supabaseSubirArchivo('sembrado', new File([blob], 'sembrado.jpg', { type: 'image/jpeg' }));
    const fotoFinal = { ...subido, ancho: foto.ancho, alto: foto.alto };
    const anterior = proyectoActual.fotoSembrado;
    proyectoActual.fotoSembrado = fotoFinal;
    proyectoActual.sembradoFuente = 'auto';
    guardarProyecto(clienteActual, proyectoActual);
    mostrarPreviaSembrado(fotoFinal);
    if (ultimoResultado) { ultimoResultado.fotoSembrado = fotoFinal; renderSecciones(ultimoResultado); }
    if (anterior && anterior.ruta) { try { await supabaseEliminarArchivo(anterior.ruta); } catch (err) { console.error(err); } }
    alert('Guardado -- esta imagen es ahora la activa en la sección 6 y el PDF.');
  } catch (err) {
    alert('No se pudo subir la imagen del sembrado (revisa tu conexión a internet): ' + err.message);
    console.error(err);
  } finally {
    btn.disabled = false;
  }
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
  d_periodoDias: 'Días del período', d_periodoKwh: 'kWh del período', d_dap: 'DAP del período',
};
// Bug real encontrado en auditoria 2026-11-18: para una tarifa DOMESTICA (01/DAC),
// CAMPO_A_INPUT mapeaba periodo_dias/periodo_kwh/dap a 'periodoDias'/'periodoKwh'/'dap'
// -- los inputs de la seccion NO domestica, que para una tarifa domestica estan
// OCULTOS (#bloqueNoDomestica.hidden). Si el recibo domestico no traia alguno de esos
// 3 datos, se marcaba en naranja un campo que el usuario nunca ve, y
// faltantesVisiblesParaCalcular() (que solo cuenta elementos con offsetParent !== null,
// es decir VISIBLES) nunca lo contaba como pendiente -- el calculo NUNCA se bloqueaba
// para estos 3 datos en una tarifa domestica, aunque no se hubieran detectado, y el
// valor viejo que quedara en el input domestico real (d_periodoDias/d_periodoKwh/d_dap)
// se usaba sin ningun aviso. Esta funcion redirige al input domestico real segun la
// tarifa ACTUAL en pantalla -- se usa en vez de CAMPO_A_INPUT[campo] en todos los
// lugares que deciden que input marcar/revisar para estos 3 campos.
function inputIdPara(campo) {
  if (esDomestica($('tarifa').value)) {
    if (campo === 'periodo_dias') return 'd_periodoDias';
    if (campo === 'periodo_kwh') return 'd_periodoKwh';
    if (campo === 'dap') return 'd_dap';
  }
  return CAMPO_A_INPUT[campo];
}

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
    const inputId = inputIdPara(campo);
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
      const inputId = inputIdPara(campo);
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
//
// SOLO para titular/domicilio (texto de identidad) -- bug real encontrado 2026-11-18:
// para los campos NUMERICOS que alimentan el calculo (periodoKwh, periodoDias, dap,
// cargos...) este mismo atajo dejaba pasar basura sin ningun aviso. Secuencia real:
// un estudio anterior (sin guardar) deja un numero cualquiera en el input compartido
// de "kWh del periodo"; se crea un cliente/estudio NUEVO y se sube un recibo cuyo
// kWh del periodo NO se pudo leer solo (campo_no_encontrado real); el input YA tenia
// ese numero de otro lado (no vacio) -- bastaba un clic/Tab para que este listener lo
// diera por "revisado", sin que Isaac hubiera escrito nada, y el calculo siguio
// adelante con un numero que no tenia nada que ver con ESTE recibo (caso real:
// "kWh del periodo" quedo en 999.98 mientras el historial del mismo recibo, si leido
// correctamente, promediaba 11,400 kWh/mes -- ahorro anual calculado 5x la inversion,
// imposible). Para estos campos ahora hace falta el evento 'input' de arriba (escribir
// algo de verdad) para confirmarlos -- un clic/Tab solo over ya no basta.
const CAMPOS_CONFIRMABLES_CON_SOLO_FOCO = new Set(['titular', 'domicilio']);
$('tabCaptura').addEventListener('focusin', (e) => {
  if (e.target.classList && e.target.classList.contains('campo-no-detectado') && e.target.value
      && CAMPOS_CONFIRMABLES_CON_SOLO_FOCO.has(e.target.id)) {
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
  const faltantes = campos.campos_no_encontrados.filter(k => inputIdPara(k));
  estadoEl.className = campos.uso_ocr ? 'nota' : 'nota ok';
  estadoEl.textContent = (campos.uso_ocr
    ? 'Se usó OCR (el PDF no traía texto aprovechable, o era una foto/escaneo). Revisa con más cuidado los datos.'
    : 'Se leyó el texto del recibo directamente.')
    + (faltantes.length ? ` No se encontraron solos (quedaron marcados en naranja abajo): ${faltantes.map(k => ETIQUETA_CAMPO[inputIdPara(k)] || k).join(', ')}.` : '');
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
    // "El RPU manda": si el usuario cancela el conflicto de servicio (ver
    // llenarFormularioDesdeRecibo), el estudio debe quedar exactamente como estaba --
    // ni un campo, ni un archivo (punto 3.b del encargo). Sin este candado, los 3
    // pasos de abajo seguian corriendo de todos modos (el archivo se subia y quedaba
    // adjunto aunque el usuario hubiera elegido "no tocar nada").
    if (llenarFormularioDesdeRecibo(campos)) {
      mostrarEstadoLecturaRecibo(campos);
      intentarAutoCalcular(campos);
      agregarArchivosReciboAProyecto(nuevos);
    } else {
      estadoEl.className = 'nota';
      estadoEl.textContent = 'No se aplicó este recibo -- el estudio se quedó exactamente como estaba.';
    }
  } catch (err) {
    estadoEl.className = 'nota';
    estadoEl.textContent = 'Error al leer el recibo: ' + err.message;
    console.error(err);
  } finally {
    $('archivoRecibo').disabled = false;
  }
});

// "El RPU manda" (encargo 2026-11-20, ver js/identidadRecibo.js): los datos de un
// recibo (titular, domicilio, tarifa, no. de servicio, cargos, periodo, dap,
// historial, archivo adjunto) viajan como UN SOLO conjunto sellado con el RPU de ese
// recibo -- nunca se mezcla "solo el consumo" o "solo los cargos" de un servicio
// distinto al del estudio. Unico punto de entrada para aplicar un recibo a un
// proyecto YA abierto (el boton de subir foto, "Volver a leer este recibo", y el caso
// camposIniciales de un proyecto recien creado -- este ultimo nunca tiene RPU previo,
// asi que cae solo al caso 1, sin preguntar nada). Se omite por completo en una
// cotizacion bloqueada (mismo criterio que sanearTextosTarifaCruzada en
// calcularYRenderizar): no tiene sentido alterar en memoria un documento que se dejo
// congelado a proposito. Regresa false cuando el usuario CANCELA el conflicto de RPU
// (el llamador debe entonces saltarse mostrarEstadoLecturaRecibo/intentarAutoCalcular/
// agregarArchivosReciboAProyecto -- sin este valor de regreso, esos 3 pasos seguian
// corriendo de todos modos y el archivo quedaba adjunto aunque el usuario hubiera
// elegido "no tocar nada", contradiciendo el punto 3.b del encargo).
function llenarFormularioDesdeRecibo(c) {
  if (proyectoActual && !proyectoActual.bloqueada) {
    const rpuActual = $('noServicio').value;
    const rpuNuevo = c.no_servicio;
    if (rpuDifiere(rpuActual, rpuNuevo)) {
      const cambiar = confirm(
        `Este recibo es del servicio ${rpuNuevo} y este estudio es del servicio ${rpuActual}.\n` +
        `El RPU manda: no se mezclan datos de dos servicios.\n\n` +
        `Aceptar = cambiar este estudio al servicio ${rpuNuevo} (reemplaza TODO: cargos, periodo, historial, ` +
        `titular, domicilio y los archivos de recibo ya adjuntos del servicio anterior).\n` +
        `Cancelar = no tocar nada -- el estudio se queda exactamente como está.`
      );
      if (!cambiar) return false; // caso 3.b del encargo: cancelar, nada se mezcla
      // caso 3.a: reemplazo atomico -- limpia primero TODO lo que pertenecia al RPU
      // anterior (incluye titular/domicilio, para que si el recibo nuevo no detecta
      // alguno no se quede con el del servicio anterior) antes de aplicar el conjunto
      // nuevo encima.
      aplicarFormularioRecibo(null);
      $('titular').value = '';
      $('domicilio').value = '';
      proyectoActual.archivosRecibo = null;
      proyectoActual.datosCapturadosConfirmados = null;
      renderArchivosRecibo();
    }
  }
  if (c.titular) $('titular').value = c.titular;
  if (c.domicilio) $('domicilio').value = c.domicilio;
  if (c.no_servicio) $('noServicio').value = c.no_servicio;
  llenarFormularioDesdeReciboCampos(c);
  if (proyectoActual && !proyectoActual.bloqueada) {
    proyectoActual.reciboSello = construirSelloDesdeCampos(c);
    guardarProyecto(clienteActual, proyectoActual);
  }
  return true;
}

// ---------------- Calcular ----------------
// Extraido a funcion compartida (2026-11-18) para que el boton "Calcular" Y el cambio
// manual de tarifa (mas abajo, $('tarifa').addEventListener('change', ...)) usen
// EXACTAMENTE la misma logica de bloqueo/traduccion de errores -- antes solo el boton
// la tenia, y cambiar la tarifa a mano no recalculaba nada hasta volver a pulsar
// "Calcular" (pedido explicito del usuario: "la tarifa del recibo manda en los
// cálculos... si el usuario cambia la tarifa manualmente, el programa debe RECALCULAR
// TODO automáticamente"). `prefijoAviso`, si se da, se antepone a cualquier mensaje
// (listo o con error) -- usado para avisar que la tarifa elegida ya no es la del
// recibo leido, sin duplicar ese aviso en dos lugares distintos.
function ejecutarCalculo({ prefijoAviso = '', desplazar = true } = {}) {
  const faltan = faltantesVisiblesParaCalcular();
  if (faltan.length) {
    $('estadoCalculo').className = 'nota aviso';
    $('estadoCalculo').textContent = prefijoAviso + 'Faltan datos para calcular (marcados en naranja arriba): ' +
      faltan.map(f => f.label).join(', ') + '. Complétalos antes de calcular -- si se calcula con un dato ' +
      'que falta, el resultado sale mal.';
    if (desplazar) {
      const primero = document.getElementById(faltan[0].id);
      if (primero) primero.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return false;
  }
  try {
    calcularYRenderizar();
    $('estadoCalculo').className = prefijoAviso ? 'nota aviso' : 'nota ok';
    $('estadoCalculo').textContent = prefijoAviso + 'Calculado. Desplázate hacia abajo para ver las secciones, o usa el índice.';
    if (desplazar) $('contenedorSecciones').scrollIntoView({ behavior: 'smooth' });
    return true;
  } catch (e) {
    $('estadoCalculo').className = 'nota aviso';
    // Bug real: motor.js truena con el nombre de la VARIABLE interna ("periodoKwh debe
    // ser > 0"), no con la etiqueta que el usuario ve en el formulario -- pasaba sobre
    // todo capturando 100% a mano (sin subir recibo), donde faltantesVisiblesParaCalcular()
    // de arriba no detecta nada porque esa funcion solo mira los campos marcados en
    // naranja por el OCR, nunca si un campo quedo vacio a mano. El mensaje crudo no decia
    // cual campo del formulario corregir ni lo desplazaba a la vista, a diferencia del
    // camino de "faltan datos" de arriba. Se traduce con el mismo mapa ETIQUETA_CAMPO ya
    // usado para esos avisos, y se reusa el mismo desplazamiento a la vista.
    const faltante = !(e instanceof ErrorDeClasificacion) && e.message.match(/^(\w+) debe ser/);
    const campoId = faltante && ETIQUETA_CAMPO[faltante[1]] ? faltante[1] : null;
    $('estadoCalculo').textContent = prefijoAviso + (campoId
      ? `Falta un dato para calcular: "${ETIQUETA_CAMPO[campoId]}" debe ser mayor que 0. Complétalo antes de calcular.`
      : (e instanceof ErrorDeClasificacion ? 'No se puede calcular con estos datos: ' : 'Error al calcular: ') + e.message);
    if (desplazar) {
      const campoEl = campoId && document.getElementById(campoId);
      if (campoEl) campoEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    console.error(e);
    return false;
  }
}
$('btnCalcular').addEventListener('click', () => ejecutarCalculo());

// Cambiar la tarifa A MANO (clic real, e.isTrusted -- no un dispatchEvent programatico
// de aplicar un recibo/abrir un proyecto, que ya dispara su propio recalculo en el
// momento correcto con todos los campos ya llenos) recalcula TODO automaticamente con
// la estructura de costos de la nueva tarifa, y avisa si esa tarifa ya no es la que
// trajo el ultimo recibo leido para este estudio -- pedido explicito del usuario,
// 2026-11-18. Si el estudio todavia no existe (pantalla de creacion) no hay nada que
// recalcular.
$('tarifa').addEventListener('change', (e) => {
  if (!e.isTrusted || !proyectoActual) return;
  const nueva = $('tarifa').value;
  const difiere = ultimoLeido && ultimoLeido.tarifa && ultimoLeido.tarifa !== nueva;
  const prefijoAviso = difiere
    ? `⚠️ Elegiste la tarifa ${nueva}, distinta de la detectada en el último recibo leído (${ultimoLeido.tarifa}). `
    : '';
  ejecutarCalculo({ prefijoAviso, desplazar: false });
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
  // Ancla "Estudio del..." a la fecha real de creación/entrega/última actualización de
  // esta estudio -- ver fechaBaseVigenciaDeProyecto() en util.js, nunca a "hoy" directo
  // (new Date() sigue siendo el respaldo final dentro de resultado.js si no hay ninguna
  // fecha capturada). El documento es un ANÁLISIS, no un presupuesto -- no lleva
  // vigencia (pedido explícito del usuario, 2026-11-20).
  const fechaBaseVigencia = proyectoActual ? fechaBaseVigenciaDeProyecto(proyectoActual) : undefined;
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
      aplicaIsr, tasaIsrPct, historialManual, fechaBaseVigencia };
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
      aplicaIsr, tasaIsrPct, historialManual, fechaBaseVigencia };
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
$('btnCerrarAvisoTextosRestauradosTarifa').addEventListener('click', ocultarAvisoTextosRestauradosTarifa);

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
  // Saneamiento automatico de texto con doctrina de otra tarifa (Parte 1 del encargo
  // 2026-11-20, "Autocorrección de textos con doctrina de otra tarifa" -- caso real:
  // COBAEP Plantel 26, PDBT 217991104461, con 2 textos heredados de un machote de
  // GDMTO que seguian bloqueando la exportacion). El candado de exportacion
  // (confirmarSinTextoTarifaCruzadaAntesDeExportar, mas abajo) YA detectaba esto bien,
  // pero obligaba a restaurar texto por texto a mano -- esto corre justo aqui, en
  // CUANTO se (re)calcula con la tarifa real de este recibo (r.tarifa/r.meta ya
  // listos), que es el mismo momento en que abrirProyecto() recalcula solo al reabrir
  // -- asi cubre tambien la ruta de descarga por enlace profundo del visor del lote 40
  // (manejarDescargaPorEnlaceProfundo llama abrirProyecto antes de exportar). Se omite
  // en una cotizacion bloqueada (definitiva/machote congelado): guardarProyecto() de
  // por si rechaza escribir ahi, y no tiene sentido alterar en memoria el texto de un
  // documento que se dejo congelado a proposito -- el candado de exportacion se queda
  // como unica salida para ese caso (desbloquear primero). NUNCA reescribe un texto a
  // mano -- solo QUITA la entrada de textosEditados para que vuelva al generico
  // correcto de esta tarifa (eso es lo que detectarTextosTarifaCruzada ya sabe armar).
  if (!proyectoActual.bloqueada) {
    // Parte 2 del encargo "Arreglar la conclusión vieja y los textos guardados"
    // (2026-11-20): extiende el saneamiento de arriba con la doctrina desactualizada
    // (lista de "qué baja" de la §4, aclaración PDBT de la §3 -- ver
    // sanearTextosDoctrinaDesactualizada en tarifaDoctrina.js) -- mismo aviso no
    // bloqueante, mismo registro de auditoria (textosRestauradosTarifa), un solo
    // guardado. El candado de exportacion (confirmarSinTextoTarifaCruzadaAntesDeExportar,
    // mas abajo) sigue usando SOLO detectarTextosTarifaCruzada, sin cambios -- este es
    // saneamiento previo, no otro candado.
    const saneo1 = sanearTextosTarifaCruzada(r, proyectoActual.textosEditados || {});
    const saneo2 = sanearTextosDoctrinaDesactualizada(r, saneo1.textosEditados);
    const restaurados = [...saneo1.restaurados, ...saneo2.restaurados];
    if (restaurados.length) {
      proyectoActual.textosEditados = saneo2.textosEditados;
      proyectoActual.textosRestauradosTarifa = [
        ...(proyectoActual.textosRestauradosTarifa || []),
        ...restaurados.map((x) => ({ id: x.id, fecha: new Date().toISOString() })),
      ];
      guardarProyecto(clienteActual, proyectoActual);
      mostrarAvisoTextosRestauradosTarifa(restaurados);
    }
  }
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
  // Pedido explicito del usuario, 2026-11-14 (auditoria metodologica): "paneles y
  // potencia deben coincidir en resumen, tablas, texto Y SEMBRADO" -- antes nada
  // comparaba r.n (calculado por consumo, puede cambiar si se recalcula con otro
  // historial/cobertura) contra sembradorAuto.paneles.length (snapshot congelado de
  // la ULTIMA vez que se sembraron paneles, ver btnSembrarAuto). Si se recalcula
  // despues de haber sembrado, el sembrado puede quedar desactualizado en silencio --
  // se expone aqui para que secciones.js pueda avisarlo (ver s06).
  r.sembradorAuto = proyectoActual.sembradorAuto || null;
  r.archivosRecibo = proyectoActual.archivosRecibo || null;
  r.archivosVerificacion = proyectoActual.archivosVerificacion || null;
  r.seccionesPersonalizadas = proyectoActual.seccionesPersonalizadas || [];
  // Nota cliente-facing (no solo interna) cuando todavia no hay verificacion en sitio
  // adjunta -- pedido explicito del usuario: decirle al cliente que esta propuesta se
  // calculo SOLO con su recibo, y que falta la visita/verificacion en sitio como
  // siguiente paso (de ahi sale, si se captura, el escenario y comparativo de las
  // secciones 24/25 -- se le avisa que esa comparacion todavia no existe para este caso).
  if (!r.archivosVerificacion || !r.archivosVerificacion.length) {
    r.notas = [
      ...(r.notas || []),
      'Esta estudio se calculó únicamente con base en su consumo real de CFE (su recibo). Pendiente, como ' +
      'siguiente paso: agendar la verificación en sitio (visita técnica) para confirmar el espacio disponible, la ' +
      'instalación eléctrica y las condiciones del inmueble antes de contratar -- hasta que esa visita se realice ' +
      'y se capture aquí, no existe todavía una sección de comparación contra una propuesta basada en la visita.',
    ];
  }
  ultimoResultado = r;

  // Si el proyecto todavia tiene su nombre generico de creacion ("Estudio N"), se
  // renombra solo al titular detectado -- asi la lista de cotizaciones del cliente se
  // identifica sin tener que abrir cada una.
  if (/^Estudio \d+$/.test(proyectoActual.nombre) && titular && titular !== 'Cliente') {
    proyectoActual.nombre = titular;
    sincronizarInputsNombreProyecto();
  }

  proyectoActual.formulario = leerFormulario();
  renderAvisoMachoteTarifaDistinta();
  // Refresca el panel de "plantilla sin verificar" con la tarifa/clasificación REAL
  // que acaba de calcularse -- antes solo se renderizaba al abrir el proyecto, así que
  // el candado de tarifa cruzada (ver renderAvisoPlantillaOrigen) no se evaluaba sino
  // hasta volver a entrar al proyecto. Ahora se evalúa cada vez que se (re)calcula, que
  // es justo el momento en que "se cargó un recibo" (Parte A.1 del encargo 2026-11-19).
  renderAvisoPlantillaOrigen();
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
  aplicarVisibilidadPanelesMachote();
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
// Pedido explicito del usuario, 2026-11-17: "Ajustar precios de materiales"/
// "Comparar escenarios de este cliente"/"Financiamiento (opcional)" no aplican a un
// MACHOTE -- es una plantilla de estructura/estilo (ver MACHOTE_ENTRE_TARIFAS.md),
// nunca una cotizacion real con numeros de inversion/financiamiento propios de un
// cliente. Se ocultan por completo (el panel entero, no solo su contenido) mientras la
// estudio abierta este marcada como machote (`propositoDefinitiva === 'muestra'`).
// Bug real reportado por el usuario, 2026-11-18: estos paneles SI se ocultaban para un
// machote ya VERIFICADO/congelado (propositoDefinitiva === 'muestra'), pero no mientras
// se estaba armando el BORRADOR de un machote nuevo (crearBorradorMachote, js/clientes.js)
// -- ese borrador nace con propositoDefinitiva sin fijar (solo tarifaMachote), asi que
// durante toda la fase de armado los 3 paneles seguian visibles. Se detecta tambien por
// `tarifaMachote` -- pero OJO: clonarProyectoCongelado() tambien fija tarifaMachote como
// efecto secundario en una definitiva NORMAL "para el cliente" (propositoDefinitiva ===
// 'cliente', una entrega real, no un machote) -- se excluye ese caso explicitamente para
// no ocultar estas herramientas en una entrega real.
// `panelesOcultosPorMachote`: pedido explicito del usuario, 2026-11-18 -- al "jalar"
// (aplicar) un machote YA VERIFICADO sobre una estudio real de un cliente (ver
// tarjetaMachote mas abajo), ese cliente/estudio destino NUNCA se vuelve el un machote
// en si (sigue siendo la entrega real de ESE cliente, con su propia tarifa/cargos) --
// asi que esMachoteActual() seguia dando false ahi, y estos 3 paneles volvian a
// aparecer en cuanto se volvia a pulsar "Calcular" (aplicarVisibilidadPanelesMachote ya
// los habia ocultado al momento de aplicar el machote, pero renderEditorPrecios/
// renderFinanciamiento los desocultaban de nuevo sin condicion en cada calculo
// siguiente). Esta bandera, fijada una sola vez justo al aplicar el machote, hace que
// se queden ocultos de forma permanente para esa estudio -- igual de persistente que
// para un machote real, sin necesitar que el proyecto ademas se comporte como uno.
function esMachoteActual() {
  if (!proyectoActual) return false;
  if (proyectoActual.propositoDefinitiva === 'muestra') return true;
  if (proyectoActual.panelesOcultosPorMachote) return true;
  return !!proyectoActual.tarifaMachote && proyectoActual.propositoDefinitiva !== 'cliente';
}
function aplicarVisibilidadPanelesMachote() {
  const ocultar = esMachoteActual();
  $('tabComparacion').hidden = ocultar;
  if (ocultar) { $('tabEditorPrecios').hidden = true; $('tabFinanciamiento').hidden = true; }
}

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
  let valorFinal = valor;
  // Campos dinamicos (pedido explicito del usuario, 2026-11-12: "conserva la frase...
  // y rellena ambos campos con los resultados del nuevo RPU"): si lo que se acaba de
  // escribir/pegar trae pegado el VALOR YA CALCULADO de este proyecto tal cual (ej.
  // "$341,829.54", el monto real de r.investment), se ofrece convertirlo al token
  // {{inversion}} -- asi, si este parrafo se vuelve a usar como machote para OTRO
  // servicio despues, el numero se recalcula solo en vez de quedarse pegado el de este
  // cliente. Solo se ofrece (nunca se reemplaza sin confirmar), y solo si hay una
  // coincidencia EXACTA de texto -- ver detectarCamposDinamicosConvertibles (secciones.js).
  if (valor && valor.trim() && ultimoResultado) {
    const hallazgos = detectarCamposDinamicosConvertibles(valor, ultimoResultado);
    if (hallazgos.length) {
      const lista = hallazgos.map((h) => `"${h.valorFormateado}" → {{${h.campo}}}`).join('\n');
      if (confirm(`Este texto trae pegado un valor que ya calculó esta cotización:\n\n${lista}\n\n¿Convertirlo a campo dinámico? Así, si vuelves a usar este párrafo como machote para otro servicio, el número se actualiza solo en vez de quedarse pegado el de este cliente.`)) {
        let reemplazado = valor;
        for (const h of hallazgos) reemplazado = reemplazado.split(h.valorFormateado).join(`{{${h.campo}}}`);
        valorFinal = reemplazado;
      }
    }
  }
  if (valorFinal == null || !valorFinal.trim() || valorFinal.trim() === textoDefecto.trim()) {
    delete proyectoActual.textosEditados[id];
  } else {
    proyectoActual.textosEditados[id] = valorFinal;
  }
  // Marca el hecho real "esto se editó a mano, justo ahora" -- a diferencia de
  // textosEditados mismo, que un proyecto nuevo puede heredar completo de un machote
  // sin que el usuario haya tocado nada aquí (ver nota de ultimaEdicionManualEn en
  // clientes.js). Pedido explicito del usuario, 2026-11-23: mostrar fecha/hora real,
  // no solo si/no, en el visor del lote de 40.
  proyectoActual.ultimaEdicionManualEn = new Date().toISOString();
  guardarProyecto(clienteActual, proyectoActual);
  if (ultimoResultado) {
    ultimoResultado.textosEditados = proyectoActual.textosEditados;
    renderSecciones(ultimoResultado);
  }
}

// El predeterminado GLOBAL (antes onGuardarTextoGlobal/onQuitarTextoGlobal, "🌐 Usar este
// texto en todas las cotizaciones nuevas") se quito a peticion explicita del usuario,
// 2026-11-13: "ya no usamos lo de guardar predeterminado global... cuando elijamos un
// machote ahi va a traer los datos que requerimos y la cotizacion original ya tiene sus
// datos predeterminados". La reutilizacion de redaccion entre cotizaciones ahora pasa
// por el machote (aplicarMachoteAProyecto, clientes.js) o por la plantilla por tarifa
// (onGuardarPlantillaTarifa, mas abajo) -- ambos mas especificos que un unico default
// ciego para TODAS las tarifas, que ademas fue la causa de un bug real encontrado el
// mismo dia (una direccion de un inmueble se colo como predeterminado global y aparecia
// en cotizaciones de otros inmuebles). El guardado por parrafo sigue igual que siempre,
// automatico al perder el foco (onEditarTexto, arriba).

// Apagar/prender UN parrafo suelto sin borrar su texto -- mismo patron que
// onToggleCalculo pero a nivel de parrafo (pedido explicito del usuario, 2026-11-02).
// Override de ESTE proyecto/cliente nada mas (no hay version global de esto, a
// diferencia del texto -- apagar un parrafo es una decision por cotizacion, no algo
// que tenga sentido heredar a clientes futuros).
function onOcultarTexto(id, oculto) {
  proyectoActual.textosOcultos = proyectoActual.textosOcultos || {};
  if (oculto) proyectoActual.textosOcultos[id] = true; else delete proyectoActual.textosOcultos[id];
  proyectoActual.ultimaEdicionManualEn = new Date().toISOString();
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
  // Solo se construyen/aparecen las secciones ACTIVAS -- pedido explicito del usuario,
  // 2026-11-14 (refuerzo "Cotizador por machote"): una apagada (individual, por bloque,
  // heredada de un machote, o sin datos todavia) ya no debe verse "difuminada, colapsada
  // ni como un hueco" en el editor -- debe estar de verdad ausente. renderSeccion() ya
  // regresa null para cualquier numero inactivo (ver secciones.js); aqui simplemente se
  // itera solo sobre las activas en vez de sobre todas y filtrar despues, para no
  // construir ni navegar hacia una que nunca va a existir en el DOM. El indice de
  // secciones (renderIndice, mas abajo) sigue listando las 25 siempre, activas o no --
  // ahi es donde se reactiva una apagada, independientemente de este contenedor.
  const activos = seccionesActivasEnOrden(r);
  activos.forEach((n, i) => {
    const art = renderSeccion(n, r, ultimoLeido, onToggleSeccion, onEditarTexto, onToggleCalculo, onOcultarTexto, onToggleGrafico, onToggleColumna, onToggleFila);
    if (!art) return; // no deberia pasar (activos ya viene filtrado), pero por seguridad
    agregarNavegacionSeccion(art, activos[i - 1] ?? null, activos[i + 1] ?? null);
    cont.append(art);
  });
  renderSeccionesPersonalizadasEnContenido(r);
  renderGestorSeccionesPersonalizadas();
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
      ? `${nodos.length} elementos editables, cada uno con su propia etiqueta fija (ej. "S4.2") -- esa etiqueta nunca cambia para ese párrafo, pase lo que pase en el resto de la estudio.`
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
  nota.textContent = 'Una estudio nueva de una tarifa con plantilla guardada arranca con esos textos/tablas en vez de los de fábrica -- editar algo en un proyecto específico siempre gana sobre la plantilla.';
  cont.append(nota);
}

function onGuardarPlantillaTarifa(tarifa) {
  // Bug real encontrado en vivo, 2026-11-13 (mismo dia que se quito el predeterminado
  // global por el mismo motivo): esto guardaba TODO proyectoActual.textosEditados tal
  // cual, sin filtrar -- un parrafo con el titular/domicilio/No. de servicio de ESTE
  // proyecto quedaba guardado como punto de partida para CUALQUIER cotizacion nueva de
  // esa tarifa, de cualquier otro inmueble.
  const origen = proyectoActual.textosEditados || {};
  const filtrado = {};
  let omitidos = 0;
  for (const [id, texto] of Object.entries(origen)) {
    if (typeof texto === 'string' && textoContieneIdentidadDe(texto, proyectoActual)) { omitidos++; continue; }
    filtrado[id] = texto;
  }
  // Guardar TODO el proyecto como plantilla para esta tarifa: textos editados, apagados,
  // orden de secciones, pasos, todo (2026-11-12) -- pero con los textos ya filtrados de
  // identidad (fix de arriba), nunca el textosEditados original sin filtrar.
  guardarPlantillaTarifa(tarifa, { ...proyectoActual, textosEditados: filtrado });
  if (omitidos > 0) {
    alert(`Se guardó la plantilla de ${tarifa}, pero se omitieron ${omitidos} texto(s) que mencionaban el titular/domicilio/número de servicio de esta cotización -- no tiene sentido que otra cotización de la misma tarifa arranque con los datos de este inmueble.`);
  }
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
    check.title = bloque === 'resumen' ? 'Siempre incluida' : `Incluir en la estudio final (pantalla y PDF) — bloque: ${bloqueEtiqueta}`;
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

// ---------------- "Agregar sección o texto" (secciones personalizadas) -- pedido
// explicito del usuario, 2026-11-14 (refuerzo "Cotizador por machote"): ver el
// comentario de seccionesPersonalizadas en clientes.js para el porque de ser un
// arreglo aparte de las 25 secciones fijas. Edicion de titulo/texto SOLO vive aqui
// (este panel, siempre visible) -- lo que se agrega mas abajo, dentro de
// #contenedorSecciones, es de solo lectura (el mismo texto ya guardado), para no
// duplicar un segundo lugar de edicion del mismo contenido. ----------------
function renderGestorSeccionesPersonalizadas() {
  const cont = $('listaSeccionesPersonalizadas');
  if (!cont || !proyectoActual) return;
  cont.innerHTML = '';
  const lista = proyectoActual.seccionesPersonalizadas || [];
  if (!lista.length) {
    cont.append(Object.assign(document.createElement('p'), {
      className: 'nota',
      textContent: 'Todavía no has agregado ninguna sección o texto libre a este estudio.',
    }));
    return;
  }
  const refrescar = () => {
    guardarProyecto(clienteActual, proyectoActual);
    if (ultimoResultado) { ultimoResultado.seccionesPersonalizadas = proyectoActual.seccionesPersonalizadas; renderSecciones(ultimoResultado); }
    else renderGestorSeccionesPersonalizadas();
  };
  for (const sp of lista) {
    const div = document.createElement('div');
    div.className = 'tarjeta-cliente';

    const filaTitulo = document.createElement('label');
    filaTitulo.textContent = 'Título de esta sección';
    const inputTitulo = document.createElement('input');
    inputTitulo.type = 'text';
    inputTitulo.value = sp.titulo;
    inputTitulo.addEventListener('change', () => { actualizarSeccionPersonalizada(proyectoActual, sp.id, { titulo: inputTitulo.value }); refrescar(); });
    filaTitulo.append(document.createElement('br'), inputTitulo);
    div.append(filaTitulo);

    const filaTexto = document.createElement('label');
    filaTexto.textContent = 'Texto (un párrafo por renglón)';
    const textarea = document.createElement('textarea');
    textarea.rows = 4;
    textarea.value = sp.texto;
    textarea.addEventListener('change', () => { actualizarSeccionPersonalizada(proyectoActual, sp.id, { texto: textarea.value }); refrescar(); });
    filaTexto.append(document.createElement('br'), textarea);
    div.append(filaTexto);

    const acciones = document.createElement('div');
    acciones.className = 'acciones';
    const chkActiva = document.createElement('label');
    chkActiva.className = 'toggle-seccion';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = sp.activa;
    check.addEventListener('change', () => { actualizarSeccionPersonalizada(proyectoActual, sp.id, { activa: check.checked }); refrescar(); });
    chkActiva.append(check, document.createTextNode(' Incluir en el editor, el PDF y el Excel'));
    acciones.append(chkActiva);

    const btnEliminar = document.createElement('button');
    btnEliminar.type = 'button';
    btnEliminar.className = 'btn-link';
    btnEliminar.textContent = '🗑 Eliminar';
    btnEliminar.addEventListener('click', () => {
      if (!confirm(`¿Eliminar la sección "${sp.titulo}"? No se puede deshacer.`)) return;
      eliminarSeccionPersonalizada(proyectoActual, sp.id);
      refrescar();
    });
    acciones.append(btnEliminar);
    div.append(acciones);
    cont.append(div);
  }
}

$('btnAgregarSeccionPersonalizada').addEventListener('click', () => {
  if (!proyectoActual) return;
  agregarSeccionPersonalizada(proyectoActual, { titulo: 'Sección nueva', texto: '' });
  guardarProyecto(clienteActual, proyectoActual);
  if (ultimoResultado) { ultimoResultado.seccionesPersonalizadas = proyectoActual.seccionesPersonalizadas; renderSecciones(ultimoResultado); }
  else renderGestorSeccionesPersonalizadas();
});

// Agrega las secciones personalizadas ACTIVAS al final de #contenedorSecciones, con la
// MISMA clase .seccion que las 25 fijas -- por construccion, generarPdfCompletaDesdeVista
// (propuesta.js) y el extractor de Excel (excel.js) ya recorren ese contenedor
// genericamente; esto basta para que aparezcan en PDF y en pantalla sin tocar ninguno de
// los dos (Excel no tiene tablas que extraer de texto libre, asi que no agrega nada ahi,
// correcto). id no numerico (seccion-custom-<id>) para no colisionar nunca con 1..25 ni
// con los casos especiales 17/18 de propuesta.js.
function renderSeccionesPersonalizadasEnContenido(r) {
  const cont = $('contenedorSecciones');
  if (!cont) return;
  const lista = (r.seccionesPersonalizadas || []).filter((sp) => sp.activa);
  for (const sp of lista) {
    const art = document.createElement('article');
    art.className = 'seccion';
    art.id = `seccion-custom-${sp.id}`;
    const header = document.createElement('div');
    header.className = 'seccion-header';
    const h2 = document.createElement('h2');
    h2.textContent = sp.titulo || 'Sección nueva';
    header.append(h2);
    art.append(header);
    const parrafos = (sp.texto || '').split(/\n+/).map((t) => t.trim()).filter(Boolean);
    if (parrafos.length) {
      parrafos.forEach((texto) => { const p = document.createElement('p'); p.textContent = texto; art.append(p); });
    } else {
      const p = document.createElement('p');
      p.className = 'nota';
      p.textContent = 'Sección sin texto todavía -- agrégalo arriba, en "➕ Secciones y textos agregados".';
      art.append(p);
    }
    cont.append(art);
  }
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

// prefijoArchivoDescarga: puesto por el enlace profundo &prefijoArchivo=<no. de servicio>
// (ver arrancar() más abajo) -- pedido explicito del usuario, 2026-11-23, para que
// "Descargar todos los PDF/Excel" de una tarifa completa (lote40Vista.js) pueda dejar
// el número de servicio al INICIO del nombre de cada archivo, sin depender de que
// proyecto.nombre ya lo traiga (la mayoría del lote sí sigue la convención "<rpu>
// <inmueble>", pero no es garantizado para cualquier cotización). null en el uso
// normal (botón manual dentro de esta misma pantalla) -- el nombre no cambia en nada.
let prefijoArchivoDescarga = null;

function nombreArchivoProyecto(prefijo, extension = 'pdf') {
  const base = `${clienteActual.nombre}_${proyectoActual.nombre}`.replace(/[^a-z0-9]+/gi, '_');
  const prefijoServicio = prefijoArchivoDescarga ? `${prefijoArchivoDescarga.replace(/[^a-z0-9]+/gi, '_')}_` : '';
  return `${prefijoServicio}${prefijo}_${base}.${extension}`;
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
    avisos.push(`• Editaste ${nEditados} párrafo(s)/aviso(s)/celda(s) en pantalla para esta estudio -- este ` +
      'documento NO incluye esas ediciones (sigue usando el texto original de la app).');
  }
  // Hallazgo 10, auditoria 2026-11-06: la reconciliacion aritmetica del recibo
  // (campos.reconciliacion_advertencia, ver recibo.js) solo se mostraba como aviso
  // dismissible -- se podia generar un documento con un recibo mal leido (caso real:
  // $128,429 de diferencia en el fixture secfinanzas) sin ningun freno.
  const adv = ultimoLeido && ultimoLeido.reconciliacion_advertencia;
  if (adv) avisos.push('• El recibo leído tiene una advertencia de reconciliación sin resolver:\n  ' + adv);
  if (proyectoActual.plantillaOrigen && !proyectoActual.plantillaVerificada) {
    avisos.push('• Esta estudio se creó desde otra ya guardada y todavía no marcaste que verificaste los ' +
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
// en sitio") nunca tuvieron página propia en "Estudio completa" (hueco documentado
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
  // fotoSembrado/fotosInmueble viven en Supabase Storage desde el 2026-11-17 (ver
  // imagenes.js) -- aqui se resuelven a dataUrl SOLO para este `r` transitorio (nunca
  // se toca proyectoActual.fotoSembrado, que es la misma referencia que usa
  // guardarProyecto) para que pagina06b/06c (propuesta.js, el generador viejo que
  // todavia usa "Enviar por WhatsApp") sigan funcionando igual que antes.
  try { r.fotoSembrado = await conDataUrlResuelto(r.fotoSembrado); }
  catch (err) { console.error('No se pudo preparar la foto del sembrado para el PDF:', err); r.fotoSembrado = null; }
  if (r.fotosInmueble && r.fotosInmueble.length) {
    const out = [];
    for (const foto of r.fotosInmueble) {
      try { const f = await conDataUrlResuelto(foto); if (f) out.push(f); }
      catch (err) { console.error('No se pudo preparar una foto del inmueble para el PDF:', err); }
    }
    r.fotosInmueble = out;
  }
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
  if (!confirm('¿Dejar de compartir esta estudio? El link dejará de funcionar para quien lo tenga.')) return;
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
  const texto = encodeURIComponent(`Te comparto la vista previa en vivo de esta estudio -- se va actualizando sola:\n${url}`);
  window.open(`https://wa.me/?text=${texto}`, '_blank');
});

// Refuerzo 2026-11-13 (prompt de exportación PDF/Excel): "al pulsar Descargar,
// incorpora el último cambio del editor, incluso si el cursor sigue dentro del campo".
// Un parrafo/celda editable solo guarda su cambio (onEditarTexto, via el evento
// 'blur') cuando pierde el foco -- en el caso normal, dar clic en un boton de
// descargar YA dispara ese blur antes de que corra el handler del clic (el navegador
// mueve el foco en el mousedown, antes del evento click). Pero mientras un campo esta
// enfocado, su texto en pantalla es el CRUDO sin resolver (con los {{tokens}} tal
// cual, ver campoEditableConId en secciones.js) -- si por cualquier motivo el foco no
// se soltara antes de leer el DOM (atajo de teclado, dispositivo tactil, doble clic
// rapido), el PDF/Excel (que leen el DOM ya renderizado, no el texto guardado)
// capturarian ese texto crudo en vez del numero resuelto. Se fuerza el blur
// explicito, de forma defensiva, antes de cualquier exportacion -- no depende del
// orden exacto de eventos del navegador.
// Ver comentario en abrirProyecto() -- bandera unica para bloquear cambiar de estudio
// mientras una descarga (PDF/Excel/WhatsApp) sigue en curso.
let exportandoDocumento = false;

function confirmarEdicionEnCursoAntesDeExportar() {
  const activo = document.activeElement;
  const cont = document.getElementById('contenedorSecciones');
  if (activo && activo !== document.body && cont && cont.contains(activo) && typeof activo.blur === 'function') {
    activo.blur();
  }
}

// "El RPU manda" (encargo 2026-11-20): proyectos guardados ANTES de que existiera el
// sello de identidad del recibo se migran solos aqui -- reconstruido desde
// proyecto.campos (la ULTIMA lectura de recibo que si se guardo con el proyecto),
// NUNCA desde proyecto.formulario (que pudo haberse editado/mezclado a mano -- es
// justo el dato que este encargo corrige, no la fuente de verdad del recibo). Si el
// proyecto nunca tuvo un recibo leido (proyecto.campos tambien ausente, captura 100%
// manual), no hay nada que sellar -- el candado de identidad simplemente no aplica
// para ese caso (punto 4 del encargo). Idempotente: no hace nada si ya hay sello, y
// nunca borra ni reescribe ningun otro dato del proyecto (punto 3 del encargo).
function asegurarReciboSello(proyecto) {
  if (!proyecto || proyecto.reciboSello || !proyecto.campos) return;
  const sello = construirSelloDesdeCampos(proyecto.campos, proyecto.creadoEn || new Date().toISOString());
  if (!sello || !sello.noServicio) return; // el recibo guardado ni siquiera traia no. de servicio
  proyecto.reciboSello = sello;
  if (!proyecto.bloqueada) guardarProyecto(clienteActual, proyecto);
}

// Candado de identidad al exportar (Parte 2 del encargo "El RPU manda", 2026-11-20 --
// misma familia que confirmarSinTextoTarifaCruzadaAntesDeExportar, justo abajo): un
// estudio debe ser de UN SOLO numero de servicio. Bloquea la exportacion -- por TODAS
// las rutas, ver sus 3 call sites (PDF, Excel, WhatsApp) -- si el no. de servicio
// capturado ya no coincide con el del recibo sellado de este proyecto, o si
// titular/domicilio/consumo/dias capturados difieren de ese mismo recibo. Un estudio
// normal de un solo RPU (sin sello, o con el formulario igual al sello) exporta sin
// que este candado aparezca -- punto 4 del encargo.
function confirmarIdentidadRpuAntesDeExportar(r) {
  if (!proyectoActual) return true;
  asegurarReciboSello(proyectoActual);
  const sello = proyectoActual.reciboSello;
  if (!sello) return true; // nunca se leyo un recibo para este estudio -- nada que verificar
  let rActual = r;

  if (normalizarRpu(rActual.noServicio) !== normalizarRpu(sello.noServicio)) {
    if (proyectoActual.bloqueada) {
      alert(
        `⛔ Exportación bloqueada: el número de servicio de este estudio (${rActual.noServicio || '(vacío)'}) no ` +
        `coincide con el del recibo aplicado a este estudio (${sello.noServicio}). El RPU manda -- este estudio ` +
        `está bloqueado (congelado): desbloquéalo primero para corregirlo.`
      );
      return false;
    }
    const corregir = confirm(
      `⛔ Exportación bloqueada: el número de servicio de este estudio (${rActual.noServicio || '(vacío)'}) no ` +
      `coincide con el del recibo aplicado a este estudio (${sello.noServicio}). El RPU manda: no se mezclan ` +
      `datos de dos servicios.\n\nAceptar = corregir el no. de servicio al del recibo aplicado (${sello.noServicio}) ` +
      `y continuar.\nCancelar = no exportar.`
    );
    if (!corregir) return false;
    $('noServicio').value = sello.noServicio;
    try { calcularYRenderizar(); } catch (e) { console.error('No se pudo recalcular tras corregir el no. de servicio:', e); return false; }
    rActual = ultimoResultado;
  }

  const diffsTodo = diferenciasIdentidadRecibo(sello, rActual);
  const diffs = diferenciasSinConfirmar(diffsTodo, proyectoActual.datosCapturadosConfirmados);
  if (!diffs.length) return true;

  const detalle = diffs.map((d) => `• ${d.etiqueta}: dice "${d.capturado}" -- el recibo de este RPU dice "${d.recibo}"`).join('\n');
  if (proyectoActual.bloqueada) {
    alert(
      `⛔ Exportación bloqueada: ${diffs.length} dato(s) capturado(s) no coinciden con el recibo del RPU ` +
      `${sello.noServicio}:\n\n${detalle}\n\nEste estudio está bloqueado (congelado): desbloquéalo primero para ` +
      `corregirlo.`
    );
    return false;
  }
  const usarRecibo = confirm(
    `⛔ Exportación bloqueada: ${diffs.length} dato(s) capturado(s) no coinciden con el recibo del RPU ` +
    `${sello.noServicio}:\n\n${detalle}\n\nAceptar = usar los datos del recibo (se corrige el formulario y la ` +
    `exportación continúa).\nCancelar = mantener mis datos capturados (para correcciones legítimas, ej. un ` +
    `domicilio truncado en el recibo -- no se volverá a preguntar mientras no cambien).`
  );
  if (usarRecibo) {
    if (sello.titular != null) $('titular').value = sello.titular;
    if (sello.domicilio != null) $('domicilio').value = sello.domicilio;
    const dom = esDomestica($('tarifa').value);
    if (sello.periodoDias != null) $(dom ? 'd_periodoDias' : 'periodoDias').value = sello.periodoDias;
    if (sello.periodoKwh != null) $(dom ? 'd_periodoKwh' : 'periodoKwh').value = sello.periodoKwh;
    try { calcularYRenderizar(); } catch (e) { console.error('No se pudo recalcular tras corregir los datos del recibo:', e); return false; }
    return true;
  }
  proyectoActual.datosCapturadosConfirmados = { ...(proyectoActual.datosCapturadosConfirmados || {}) };
  for (const d of diffs) proyectoActual.datosCapturadosConfirmados[d.campo] = d.capturado;
  guardarProyecto(clienteActual, proyectoActual);
  return true;
}

// Candado de consistencia antes de exportar (Parte A.4 del encargo 2026-11-19,
// "Cotización 40" COBAEB Plantel 26/PDBT): bloquea la exportación -- SIN excepciones
// silenciosas, sin importar si el estudio nació de un machote, se marcó verificado, o
// es un estudio viejo creado antes de este fix -- si algún texto editado a mano
// menciona el nombre de otra tarifa o la doctrina de demanda contratada que no le
// corresponde a la tarifa/clasificación real de este recibo. Se revisa aquí (no solo
// en el panel "plantilla sin verificar", que se oculta en cuanto se marca verificado)
// para que NINGÚN camino de exportación pueda saltárselo.
function confirmarSinTextoTarifaCruzadaAntesDeExportar(r) {
  const conflictos = detectarTextosTarifaCruzada(r, proyectoActual?.textosEditados);
  if (!conflictos.length) return true;
  const detalle = conflictos.map((c) => `• ${c.id}: "${c.texto}" (${c.motivo})`).join('\n');
  alert(
    `⛔ Exportación bloqueada: este estudio es de tarifa ${r.tarifa}, pero ${conflictos.length} texto(s) editado(s) ` +
    `a mano traen la doctrina o el nombre de otra tarifa -- revísalos o restáuralos (panel "Plantilla aplicada desde ` +
    `un machote", si viene de ahí, o editando el párrafo directo) antes de entregar este documento:\n\n${detalle}`
  );
  return false;
}

// fechaActualizacionEstudio -- pedido explicito del usuario, 2026-11-20 ("La fecha del
// estudio se actualiza al Guardar y al generar PDF/Excel"): se pone con la fecha de
// HOY justo antes de construir cualquier documento del cliente (PDF o Excel), por
// CUALQUIER ruta -- el boton manual, el enlace profundo del visor del lote de 40
// inmuebles (que llama estas mismas funciones generarPdfCotizacion/
// generarExcelCotizacion, ver manejarDescargaPorEnlaceProfundo), o el boton de
// WhatsApp. EXCEPCION explicita: un estudio ya ENTREGADO (bloqueada, con entregadaEn)
// nunca cambia su fecha al volver a generar su documento -- esa fecha identifica la
// entrega real al cliente, se queda intocable.
//
// Re-renderiza las secciones (renderSecciones, la misma funcion que ya usa cualquier
// otro toggle/edicion) porque generarPdfCompletaDesdeVista()/descargarExcelCotizacion()
// NO leen r.fechaEstudio directo para el cuerpo del documento -- leen el DOM YA
// RENDERIZADO de #contenedorSecciones (la portada de la seccion 1 imprime "Servicio
// CFE... Estudio del {r.fechaEstudio}." como texto fijo desde el ultimo renderSecciones()
// real, normalmente el de la ultima vez que se pulso "Calcular"). Sin este re-render,
// el ENCABEZADO del PDF (que si lee `r` directo, ver propuesta.js) habria mostrado la
// fecha nueva pero la PORTADA se habria quedado con la vieja -- justo la inconsistencia
// que el encargo pide evitar explicitamente ("no deben quedar una fecha en el
// encabezado desincronizada de la portada").
function refrescarFechaEstudioAntesDeGenerar() {
  if (!proyectoActual || !ultimoResultado || proyectoActual.bloqueada) return;
  proyectoActual.fechaActualizacionEstudio = new Date().toISOString();
  guardarProyecto(clienteActual, proyectoActual);
  const fechaBase = new Date(proyectoActual.fechaActualizacionEstudio);
  ultimoResultado.fechaEstudio = fechaEstudioEs(fechaBase);
  renderSecciones(ultimoResultado);
}

// Genera "Cotización completa" -- extraída a función aparte, 2026-11-20 (pedido:
// botones "PDF"/"Excel" directo en el visor "Estado del lote de 40 inmuebles",
// lote40.html/lote40Vista.js), para que el botón manual y el enlace profundo
// ?descargar=pdf (ver manejarDescargaPorEnlaceProfundo() y arrancar() más abajo) usen
// EXACTAMENTE el mismo camino -- nunca dos generadores/plantillas distintos.
// avisarSiNoHayResultado=false cuando se dispara sola (enlace profundo): si el estudio
// nunca se calculó, no hace nada, en vez de interrumpir con un alert() que en ese
// momento nadie está mirando (el visor ya filtra para no ofrecer el botón en ese caso,
// pero esta función no depende de esa confianza).
async function generarPdfCotizacion({ avisarSiNoHayResultado = true } = {}) {
  if (!ultimoResultado) { if (avisarSiNoHayResultado) alert('Calcula primero.'); return null; }
  if (!confirmarIdentidadRpuAntesDeExportar(ultimoResultado)) return null;
  if (!confirmarSinTextoTarifaCruzadaAntesDeExportar(ultimoResultado)) return null;
  confirmarEdicionEnCursoAntesDeExportar();
  if (!confirmarAntesDeGenerarDocumento(true)) return null;
  refrescarFechaEstudioAntesDeGenerar();
  const boton = $('btnGenerarPdf');
  boton.disabled = true;
  exportandoDocumento = true;
  const textoOriginal = boton.textContent;
  boton.textContent = 'Generando…';
  // `r` capturado UNA vez: prepararDocumentosAdjuntosParaPdf() es async (descarga
  // imagenes remotas) -- si se leyera `ultimoResultado` otra vez despues del await, y
  // ese await tardara lo suficiente para que algo mas reasignara la variable, las dos
  // llamadas podrian terminar operando sobre estudios distintos (ver nota en
  // abrirProyecto(), ahora bloqueado mientras exportandoDocumento es true, pero esta
  // captura es la misma salvaguarda a nivel de datos, no solo de UI).
  const r = ultimoResultado;
  try {
    await prepararDocumentosAdjuntosParaPdf(r);
    // generarPdfCompletaDesdeVista (no generarPdf) -- lee el contenido YA renderizado
    // en #contenedorSecciones, con las ediciones de texto/tablas aplicadas. Pedido
    // explicito del usuario, 2026-11-07. generarPdf() (el generador de texto fijo de
    // siempre) se deja sin usar pero intacta en propuesta.js, por si hace falta volver.
    // resolverImagenesRemotasEnDom() 2026-11-17: sin esto, cualquier <img> cuyo src ya
    // sea una URL de Supabase Storage (fotoSembrado/fotosInmueble/archivosRecibo/
    // archivosVerificacion) se perdia en silencio de este PDF -- ver imagenes.js.
    await resolverImagenesRemotasEnDom();
    const doc = generarPdfCompletaDesdeVista(r);
    const nombreArchivo = nombreArchivoProyecto('Cotizacion');
    mostrarPdfEnVisor(doc, nombreArchivo);
    return { doc, nombreArchivo };
  } finally {
    boton.disabled = false;
    exportandoDocumento = false;
    boton.textContent = textoOriginal;
  }
}
$('btnGenerarPdf').addEventListener('click', () => { generarPdfCotizacion(); });

// Pedido explicito del usuario, 2026-11-11: "un boton para descargar la cotizacion no
// solo en pdf tambien en excel". Lee las TABLAS ya visibles en pantalla (una hoja por
// tabla, mismo respeto a secciones/graficos/columnas/filas apagadas que el PDF) -- ver
// js/excel.js. Extraída a función aparte, 2026-11-20, mismo motivo que
// generarPdfCotizacion() arriba.
async function generarExcelCotizacion({ avisarSiNoHayResultado = true } = {}) {
  if (!ultimoResultado) { if (avisarSiNoHayResultado) alert('Calcula primero.'); return false; }
  if (!confirmarIdentidadRpuAntesDeExportar(ultimoResultado)) return false;
  if (!confirmarSinTextoTarifaCruzadaAntesDeExportar(ultimoResultado)) return false;
  confirmarEdicionEnCursoAntesDeExportar();
  refrescarFechaEstudioAntesDeGenerar();
  const boton = $('btnGenerarExcel');
  boton.disabled = true;
  exportandoDocumento = true;
  const textoOriginal = boton.textContent;
  boton.textContent = 'Generando…';
  try {
    // prepararDocumentosAdjuntosParaPdf() (2026-11-19, encargo "Excel clon del PDF"):
    // antes el Excel nunca preparaba r._archivosReciboImgs/_archivosVerificacionImgs
    // (eso solo corria en la ruta de PDF) -- sin esto, el anexo de documentos del
    // Excel nunca tendria la imagen real para incrustar, aunque el proyecto SI tenga
    // el archivo adjunto.
    await prepararDocumentosAdjuntosParaPdf(ultimoResultado);
    await descargarExcelCotizacion(ultimoResultado, nombreArchivoProyecto('Estudio', 'xlsx'));
    return true;
  } catch (err) {
    alert('No se pudo generar el Excel: ' + err.message);
    console.error(err);
    return false;
  } finally {
    boton.disabled = false;
    exportandoDocumento = false;
    boton.textContent = textoOriginal;
  }
}
$('btnGenerarExcel').addEventListener('click', () => { generarExcelCotizacion(); });

// Enlace profundo ?descargar=pdf|excel (ver arrancar() más abajo) -- pedido explicito
// del usuario, 2026-11-20: botones "⬇ PDF"/"⬇ Excel" en el visor "Estado del lote de 40
// inmuebles" (lote40.html/lote40Vista.js, OTRA página/contexto de JS, no puede llamar
// generarPdfCotizacion()/generarExcelCotizacion() de aquí directamente) -- el botón
// abre este mismo index.html con ?cliente=&proyecto=&descargar=pdf|excel, y en cuanto
// abrirProyecto() ya recalculó y renderizó ese estudio (ver arrancar()), se dispara la
// MISMA función que usa el botón manual, una sola vez. Para PDF, además de mostrarlo en
// el visor (igual que el botón manual) se llama doc.save() de una vez -- el punto de
// este enlace es no necesitar un clic extra después de llegar aquí. Para Excel no hace
// falta nada extra: descargarExcelCotizacion() ya dispara la descarga real por sí sola.
// &descargar=zip -- pedido explicito del usuario, 2026-11-24: "descarga todos los pdf
// y excel en carpetas en un archivo aparte de los 40". A diferencia de &descargar=
// pdf|excel (que SIEMPRE descargan el archivo real de una vez), este modo NUNCA
// descarga nada aquí -- genera el PDF y el Excel de este estudio y regresa sus Blobs
// por postMessage, para que quien abrió esta ventana (lote40Vista.js) los vaya
// metiendo a un único ZIP (con carpetas por tarifa) y descargue ESE un solo archivo
// al final, en vez de 80 archivos sueltos. Hace la preparación de documentos
// adjuntos/imágenes UNA sola vez para los dos documentos (a diferencia de llamar
// generarPdfCotizacion()+generarExcelCotizacion() por separado, que la harían dos
// veces cada una).
async function generarDocumentosParaZip() {
  if (!ultimoResultado) return null;
  if (!confirmarIdentidadRpuAntesDeExportar(ultimoResultado)) return null;
  if (!confirmarSinTextoTarifaCruzadaAntesDeExportar(ultimoResultado)) return null;
  confirmarEdicionEnCursoAntesDeExportar();
  if (!confirmarAntesDeGenerarDocumento(true)) return null;
  refrescarFechaEstudioAntesDeGenerar();
  const r = ultimoResultado;
  try {
    await prepararDocumentosAdjuntosParaPdf(r);
    await resolverImagenesRemotasEnDom();
    const doc = generarPdfCompletaDesdeVista(r);
    const pdfBlob = doc.output('blob');
    const excelBlob = await excelCotizacionComoBlob(r);
    return { pdfBlob, excelBlob };
  } catch (err) {
    console.error('No se pudieron generar los documentos para el ZIP:', err);
    return null;
  }
}

// Devuelve ok=true/false y, si esta pestaña fue ABIERTA por otra (ver "Descargar
// todos los PDF/Excel"/"Descargar TODO en un ZIP" en lote40Vista.js -- una ventana
// reusada, navegada vía window.open/location.href, NUNCA un <iframe>: este sitio
// exige login con HTTP Basic Auth, y Chrome por seguridad nunca manda las
// credenciales ya guardadas a un <iframe> -- la pestaña se queda pegada en blanco
// para siempre, confirmado en vivo antes de este fix), le avisa a quien la abrió por
// postMessage en cuanto termina -- en una pestaña normal (clic manual en el visor,
// sin padre ni opener) esto no hace nada, igual que siempre.
async function manejarDescargaPorEnlaceProfundo(tipo) {
  let ok = false;
  let archivos = null;
  try {
    if (tipo === 'pdf') {
      const resultado = await generarPdfCotizacion({ avisarSiNoHayResultado: false });
      if (resultado) { resultado.doc.save(resultado.nombreArchivo); ok = true; }
    } else if (tipo === 'excel') {
      ok = await generarExcelCotizacion({ avisarSiNoHayResultado: false });
    } else if (tipo === 'zip') {
      archivos = await generarDocumentosParaZip();
      ok = !!archivos;
    }
  } catch (err) {
    console.error('Descarga por enlace profundo falló:', err);
  }
  const destino = window.parent !== window ? window.parent : window.opener;
  if (destino) {
    try { destino.postMessage({ cfeLote40Descarga: true, ok, archivos }, location.origin); } catch (e) { /* ignorar */ }
  }
}

// (el boton "Cotizacion editada" / window.print() se quito 2026-11-07, pedido
// explicito del usuario: "los botones que no sirvan o esten redudantes quitalos" --
// quedo redundante en cuanto "Cotizacion completa" empezo a leer la pantalla real
// con sus ediciones de verdad, confirmado con la auditoria automatizada de cobertura
// de texto. El bloque CSS "body.modo-impresion" que usaba tambien se quito de
// styles.css.)

// Guardar SIEMPRE sobrescribe el mismo proyecto (mismo id), pase lo que pase con el
// nombre y los datos -- pedido explicito del usuario, 2026-11-20 ("Guardar simple y
// predecible"): antes esta misma ruta (guardarProyectoRespetandoRenombre, ver git
// history si hace falta el detalle) detectaba un renombre + datos distintos a los
// que tenia la cotizacion al abrirla y lo trataba como un "Guardar como" escondido
// (restauraba el registro original y creaba uno nuevo aparte) -- el usuario no podia
// saber de antemano cual de los 2 comportamientos iba a pasar con un mismo clic en
// "Guardar". Ahora Guardar hace una sola cosa, siempre: sobrescribe este registro tal
// cual se ve en pantalla (nombre y datos). Si de verdad se quiere conservar la
// version anterior aparte, "Guardar como copia" (boton propio, ver
// crearCopiaEditableDesdeActual) lo hace de forma explicita, nunca como efecto
// secundario de renombrar.

// Renombrar la cotizacion -- pedido explicito del usuario, 2026-11-05: poder
// "ponerle nombre con su proyecto y su cliente" antes de guardarla como definitiva.
// Se guarda en blur (igual que los campos editables de texto), no en cada tecla.
// Pedido explicito del usuario, 2026-11-11 ("no veo donde se puede editar... la
// estudio"): antes SOLO se podia renombrar desde este input, escondido dentro de la
// pestaña "Guardar estudio" -- la barra de arriba (visible SIEMPRE) solo mostraba el
// nombre como texto fijo. Ahora esa misma barra tambien es editable (mismo patron que
// el nombre del cliente), sincronizada con este input via sincronizarInputsNombreProyecto().
function sincronizarInputsNombreProyecto() {
  if (!proyectoActual) return;
  $('inputNombreProyecto').value = proyectoActual.nombre || '';
  $('proyectoNombreBarraInput').value = proyectoActual.nombre || '';
  fijarTitulo(`${proyectoActual.nombre} — ${clienteActual ? clienteActual.nombre : ''}`);
}
function renombrarProyectoActual(nuevoNombreCrudo) {
  if (!proyectoActual) return;
  const nuevo = nuevoNombreCrudo.trim();
  if (!nuevo || nuevo === proyectoActual.nombre) { sincronizarInputsNombreProyecto(); return; }
  proyectoActual.nombre = nuevo;
  sincronizarInputsNombreProyecto();
  revisarDuplicadoProyecto(nuevo, proyectoActual.id);
  guardarProyecto(clienteActual, proyectoActual);
}
$('inputNombreProyecto').addEventListener('blur', () => renombrarProyectoActual($('inputNombreProyecto').value));
$('proyectoNombreBarraInput').addEventListener('blur', () => renombrarProyectoActual($('proyectoNombreBarraInput').value));

// Logica compartida de "Guardar estudio" y "Marcar como definitiva" -- ambos
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
// direccion. "Guardar estudio" (borrador, no definitiva) se queda solo local, igual
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
  // la estudio no cambia, solo con qué cliente va a estar guardada". Una definitiva
  // congelada se queda protegida contra EDITAR su contenido o volver a congelarse, pero
  // mover A QUÉ CLIENTE pertenece no cambia ni el nombre ni el contenido -- es solo
  // organizativo, asi que esto SÍ se permite incluso bloqueada.
  if (proyectoActual.bloqueada) {
    const estaMoviendoDeCliente = clienteDestinoId && clienteDestinoId !== clienteActual.id;
    if (definitiva || !estaMoviendoDeCliente) {
      // Aviso visible y accionable, nunca silencioso -- pedido explicito del usuario,
      // 2026-11-20: antes de este cambio, un intento de guardado sobre una definitiva
      // bloqueada caia en el candado interno de guardarProyecto() (clientes.js), que
      // solo deja un console.warn -- el usuario creia que habia guardado y el cambio
      // se perdia sin que nada en pantalla lo dijera. Aqui, en la ruta explicita del
      // boton "Guardar", se intercepta ANTES de intentar guardar nada y se ofrece la
      // salida real: crear una copia editable con los datos de ahorita.
      if (confirm(`"${proyectoActual.nombre}" ya se marcó como definitiva y quedó congelada (es la versión que se le entregó al cliente) -- no se puede volver a guardar ni modificar su contenido.\n\n¿Crear una copia editable con los datos de ahorita? El original se queda intacto.\n\n(Cancelar no hace nada -- puedes elegir un cliente distinto arriba para solo moverla, o desbloquearla desde el aviso de arriba si de verdad necesitas editar ESTE registro.)`)) {
        crearCopiaEditableDesdeActual();
      }
      return false;
    }
  }
  proyectoActual.cotizacionGuardadaEn = new Date().toISOString();
  // fechaActualizacionEstudio -- pedido explicito del usuario, 2026-11-20 ("La fecha
  // del estudio se actualiza al Guardar y al generar PDF/Excel"): se pone con la fecha
  // de HOY en este guardado manual (nunca en el autoguardado de Calcular, que no pasa
  // por aqui) para que "Estudio del..."/"válida hasta..." (ver fechaBaseVigenciaDeProyecto
  // en util.js) reflejen la version mas reciente. Si llegamos aqui con bloqueada=true
  // es solo el caso de "mover de cliente sin tocar contenido" (permitido mas arriba) --
  // la fecha de una entregada nunca se toca, se queda su propio entregadaEn.
  if (!proyectoActual.bloqueada) proyectoActual.fechaActualizacionEstudio = new Date().toISOString();
  let seMovioDeCliente = false;
  if (clienteDestinoId && clienteDestinoId !== clienteActual.id) {
    seMovioDeCliente = true;
    const destino = moverProyecto(clienteActual.id, clienteDestinoId, proyectoActual);
    if (!destino) { alert('No se pudo mover la estudio a ese cliente.'); return false; }
    clienteActual = destino;
    $('clienteNombreBarra').value = clienteActual.nombre;
    $('clienteTipoBarra').textContent = etiquetaTipo(clienteActual.tipo);
    $('clienteTipoBarra').className = `chip-tipo ${claseTipo(clienteActual.tipo)}`;
    poblarSelectClienteGuardar();
  }
  if (!seMovioDeCliente) guardarProyecto(clienteActual, proyectoActual);
  // Clona el estado de ahorita en un registro aparte y congelado (ver
  // clonarProyectoCongelado en clientes.js) -- ESE clon es "lo que se le entrega al
  // cliente" y nunca se vuelve a tocar. proyectoActual (lo que se sigue viendo en
  // pantalla) se queda igual, sin badge de definitiva, listo para seguir editandose.
  let avisoDefinitiva = '';
  if (definitiva) {
    guardarProyecto(clienteActual, proyectoActual); // asegura que el clon parta del estado mas reciente
    const clon = clonarProyectoCongelado(clienteActual, proyectoActual, proposito);
    const etiquetaProposito = clon.propositoDefinitiva === 'muestra' ? 'MUESTRA (ejemplo reusable por tarifa)' : 'ENTREGA del cliente';
    avisoDefinitiva = ` Se creó "${clon.nombre}" como versión DEFINITIVA para ${etiquetaProposito} y quedó congelada (ya no se puede modificar) -- disponible en el historial de este cliente${clon.propositoDefinitiva === 'muestra' ? ' y para usarse como ejemplo al dar de alta un cliente nuevo' : ''}. Esta estudio que ves ahora sigue editable con normalidad.`;
  }
  const etiqueta = definitiva ? 'Versión definitiva creada' : 'Guardada';
  $('estadoGuardadoCotizacion').className = 'nota ok';
  $('estadoGuardadoCotizacion').textContent =
    `✓ ${etiqueta} con "${clienteActual.nombre}", estudio "${proyectoActual.nombre}". Subiendo respaldo a la nube...` + avisoDefinitiva;
  mostrarAvisoGuardadoOk();
  // Pedido explicito del usuario, 2026-11-08 ("tambien se tiene que guardar en la
  // nube"): antes SOLO "Marcar como definitiva" subia a la nube automaticamente --
  // "Guardar estudio" (borrador) se quedaba solo local a proposito, para no subir
  // cada cambio chico mientras se sigue editando. Eso generaba confusion (¿cual guarda
  // en la nube y cual no?) -- ahora los dos suben, simplificando el flujo a "Guarda
  // (local + nube) -> Genera el PDF".
  try {
    await subirANube();
    $('estadoGuardadoCotizacion').textContent =
      `✓ ${etiqueta} con "${clienteActual.nombre}", estudio "${proyectoActual.nombre}". ` +
      'Respaldo en la nube actualizado.' + avisoDefinitiva;
  } catch (err) {
    $('estadoGuardadoCotizacion').className = 'nota aviso';
    $('estadoGuardadoCotizacion').textContent =
      `✓ ${etiqueta} en este dispositivo, pero NO se pudo subir el respaldo a la nube ` +
      `(${err.message}). Usa "Respaldar todo en la nube" más tarde para intentarlo de nuevo.` + avisoDefinitiva;
    console.error(err);
  }
  return true;
}

$('btnGuardarCotizacion').addEventListener('click', () => guardarCotizacionConCliente({ definitiva: false }));
$('btnMarcarDefinitivaMuestra').addEventListener('click', () => guardarCotizacionConCliente({ definitiva: true, proposito: 'muestra' }));
$('btnMarcarDefinitivaCliente').addEventListener('click', () => guardarCotizacionConCliente({ definitiva: true, proposito: 'cliente' }));
// "Guardar como copia" -- pedido explicito del usuario, 2026-11-12, reforzado
// 2026-11-20 ("Guardar simple y predecible"): a diferencia de "Guardar" (SIEMPRE
// sobrescribe ESTE registro) y "Definitiva..." (congela un clon aparte), esto crea un
// estudio nuevo e INDEPENDIENTE y EDITABLE con el estado actual, y te deja viendo la
// copia nueva (el original se queda intacto, abierto donde estaba). Factorizada aparte
// (no solo el handler del boton) porque tambien la usa el aviso de "estudio bloqueada"
// (ver guardarCotizacionConCliente/renderAvisoBloqueo mas arriba) como la salida real
// cuando no se puede guardar porque ya esta congelada.
function crearCopiaEditableDesdeActual() {
  if (!clienteActual || !proyectoActual) return null;
  const nombreSugerido = `${proyectoActual.nombre} — copia`;
  const nombre = prompt('Nombre para la copia nueva:', nombreSugerido);
  if (nombre == null) return null; // cancelado
  guardarProyecto(clienteActual, proyectoActual); // el original se guarda tal como esta antes de clonarlo (no-op si ya esta bloqueada)
  const clon = clonarProyectoEditable(clienteActual, proyectoActual, nombre.trim() || nombreSugerido);
  $('estadoGuardadoCotizacion').className = 'nota ok';
  $('estadoGuardadoCotizacion').textContent = `✓ Se creó "${clon.nombre}" como copia independiente -- edítala aparte sin afectar "${proyectoActual.nombre}".`;
  mostrarAvisoGuardadoOk();
  abrirProyecto(clienteActual.id, clon.id);
  return clon;
}
$('btnGuardarComoCopia').addEventListener('click', () => crearCopiaEditableDesdeActual());
$('btnCrearCopiaEditableDesdeBloqueo').addEventListener('click', () => crearCopiaEditableDesdeActual());

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
    `✓ Cliente "${nuevo.nombre}" creado -- ahora dale clic a "Guardar estudio" o "Marcar como definitiva" para pasarle esta estudio.`;
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
  if (!confirmarIdentidadRpuAntesDeExportar(ultimoResultado)) return;
  if (!confirmarSinTextoTarifaCruzadaAntesDeExportar(ultimoResultado)) return;
  confirmarEdicionEnCursoAntesDeExportar();
  if (!confirmarSiHayCambiosSinCalcular()) return;
  refrescarFechaEstudioAntesDeGenerar();
  const r = ultimoResultado;
  const mensaje = `Estudio ${r.titular}\n` +
    `Sistema: ${r.n} paneles (${r.kwp.toFixed(2)} kWp)\n` +
    `Inversión: ${M(r.investment)}\n` +
    `Ahorro año 1: ${M(r.ahorroAnual)} (${PCT(r.pctAhorro)})\n` +
    `Recuperación: ${r.payback ? r.payback.toFixed(1) + ' años' : 'N/D'}\n` +
    `VAN 25 años: ${M(r.van)}\n\n` +
    'Adjunto el PDF del estudio.';
  exportandoDocumento = true;
  try {
    // generarPdfCompletaDesdeVista (no generarPdf) -- bug real reportado por el
    // usuario, 2026-11-12: "el S20.6 no se apaga, esta apagado y se imprime en el pdf
    // generado". Causa: este boton seguia usando generarPdf(), el generador de texto
    // FIJO de siempre (nunca lee textosOcultos/textosEditados de ningun parrafo, de
    // ninguna seccion) -- a diferencia de "Cotizacion completa"/"Descargar PDF", que ya
    // se cambiaron a generarPdfCompletaDesdeVista() desde el 2026-11-07 precisamente
    // por este mismo problema. Mismo fix aplicado aqui: lee el DOM ya renderizado
    // (con ediciones/apagados aplicados) en vez de reconstruir el texto desde cero.
    // `r` (capturado arriba, no `ultimoResultado` otra vez) en las dos llamadas -- misma
    // salvaguarda contra el estudio cambiando a medio vuelo que en btnGenerarPdf.
    await prepararDocumentosAdjuntosParaPdf(r);
    await resolverImagenesRemotasEnDom();
    const doc = generarPdfCompletaDesdeVista(r);
    const blob = doc.output('blob');
    const archivo = new File([blob], nombreArchivoProyecto('Cotizacion'), { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      await navigator.share({ files: [archivo], text: mensaje, title: `Estudio ${r.titular}` });
      return; // el PDF ya salio adjunto -- no abrir ademas el link de solo texto
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return; // el usuario cancelo el menu de compartir a proposito
    console.error('No se pudo compartir el PDF directo, cae al link de WhatsApp con solo texto:', err);
  } finally {
    exportandoDocumento = false;
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
// HTML), perdiendo en qué cliente/estudio se estaba trabajando. Se guarda un
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
// Botones flotantes: subir al inicio / bajar al final de la página --
// pedido explicito del usuario, 2026-11-12.
// =====================================================================
(function initBotonesScroll() {
  const cont = $('botonesScroll');
  const btnSubir = $('btnSubirInicio');
  const btnBajar = $('btnBajarFinal');
  function actualizarBotonesScroll() {
    const alMargen = 24;
    const sePuedeScrollear = document.documentElement.scrollHeight - window.innerHeight > alMargen * 2;
    cont.hidden = !sePuedeScrollear;
    if (!sePuedeScrollear) return;
    btnSubir.disabled = window.scrollY <= alMargen;
    const cercaDelFinal = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - alMargen;
    btnBajar.disabled = cercaDelFinal;
  }
  let pendienteRaf = false;
  function actualizarBotonesScrollDiferido() {
    if (pendienteRaf) return;
    pendienteRaf = true;
    requestAnimationFrame(() => { pendienteRaf = false; actualizarBotonesScroll(); });
  }
  btnSubir.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  btnBajar.addEventListener('click', () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }));
  window.addEventListener('scroll', actualizarBotonesScrollDiferido, { passive: true });
  window.addEventListener('resize', actualizarBotonesScrollDiferido);
  new MutationObserver(actualizarBotonesScrollDiferido).observe(document.body, { childList: true, subtree: true });
  actualizarBotonesScroll();
})();

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
  confirmarEdicionEnCursoAntesDeExportar();
  const problemas = [];
  const ok = [];

  // 1) Generar el PDF real (mismo camino que el boton "Cotizacion completa") y leer
  // su texto completo con pdf.js.
  await prepararDocumentosAdjuntosParaPdf(ultimoResultado);
  await resolverImagenesRemotasEnDom();
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
  // deberia aparecer en el PDF. Extracto de 120 caracteres, no 60 -- bug real
  // encontrado verificando el reporte "S20.6 no se apaga" (2026-11-12): la seccion 1
  // (texto "s1-verif-aviso") y la seccion 20 (texto "s20-t5") comparten casi la misma
  // redaccion sobre el escenario verificado ("Ambos escenarios se calcularon con el
  // mismo motor (mismo recibo, misma tarifa, mismos costos...") -- los primeros 60
  // caracteres son IDENTICOS entre ambas, asi que ocultar solo la de la seccion 20
  // reportaba un falso "SI aparece" porque la de la seccion 1 (nunca oculta) seguia
  // trayendo ese mismo inicio. Confirmado con el texto COMPLETO de cada una que el PDF
  // real (generarPdfCompletaDesdeVista) si excluye correctamente la oculta -- el bug
  // era de esta funcion de verificacion, no del PDF. 120 caracteres ya cubre donde
  // ambos parrafos empiezan a divergir ("de materiales... solo cambia" vs ") -- no
  // implica"); no es una garantia absoluta para cualquier texto futuro, pero reduce
  // mucho el riesgo de este mismo falso positivo.
  Object.keys(proyectoActual.textosOcultos || {}).forEach((id) => {
    const nodo = document.querySelector(`[data-texto-id="${id}"]`);
    if (!nodo) return;
    const extracto = nodo.textContent.trim().slice(0, 120);
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
  // Migracion en segundo plano (no se espera, nunca retrasa el arranque) -- ver
  // migrarFotosLocalesANube() arriba.
  migrarFotosLocalesANube().catch((err) => console.error('Migración de fotos a la nube falló:', err));
  // Link directo "?cliente=ID&proyecto=ID" -- pedido explicito del usuario,
  // 2026-11-14: el visor "Estado del lote de 40 inmuebles" ahora vive en su propia
  // ventana (lote40.html) y su botón "Abrir" necesita poder entrar DIRECTO a una
  // cotización ya existente desde ahí, en una pestaña nueva de esta misma app (no
  // puede llamar a abrirProyecto() de aquí porque es otra página/contexto de JS).
  // Se limpia la URL después de abrir para que un refresh normal use el mecanismo de
  // "reanudar" de siempre, no se quede pegado reabriendo siempre lo mismo.
  const parametros = new URLSearchParams(location.search);
  const clienteParam = parametros.get('cliente');
  const proyectoParam = parametros.get('proyecto');
  // &descargar=pdf|excel|zip (pedido explicito del usuario, 2026-11-20/24): se lee
  // ANTES del replaceState de abajo (que limpia toda la query string, incluido este
  // parametro) -- asi el valor sigue disponible en esta variable aunque la URL ya
  // haya quedado limpia, y un refresh normal de la pagina nunca vuelve a disparar la
  // descarga sola (ver manejarDescargaPorEnlaceProfundo()). "zip" (2026-11-24) no
  // descarga nada aqui -- regresa los Blobs del PDF/Excel por postMessage para que
  // lote40Vista.js los meta a un ZIP con carpetas (ver generarDocumentosParaZip()).
  // &prefijoArchivo=<no. de servicio> y &automatizado=1 -- pedido explicito del
  // usuario, 2026-11-23: "Descargar todos los PDF/Excel" de una tarifa completa (o
  // "Descargar TODO en un ZIP" de los 40, 2026-11-24) abre esta misma pagina, UNA VEZ
  // por cada proyecto, en una ventana real reusada (lote40Vista.js -- nunca un
  // <iframe>, ver nota de manejarDescargaPorEnlaceProfundo mas abajo). prefijoArchivo
  // deja el no. de servicio al INICIO del nombre del archivo (ver
  // nombreArchivoProyecto() arriba) -- solo aplica a pdf/excel, el modo zip ignora
  // este parametro porque lote40Vista.js nombra cada archivo DENTRO del zip el mismo.
  // automatizado=1 evita que un confirm()/alert() (ej. "¿generar de todos modos?",
  // candado de identidad de RPU) deje esa ventana COLGADA PARA SIEMPRE -- nadie puede
  // hacer clic en un dialogo de una ventana que nadie esta viendo. En automatizado=1,
  // cualquier aviso que normalmente pediria confirmar se trata como "no, cancelar"
  // (mas seguro omitir ESE estudio puntual -- se reporta como "no descargado" en el
  // visor -- que exportar algo sin que nadie vea el aviso real), y cualquier alert()
  // informativo solo se registra en consola.
  const prefijoArchivoParam = parametros.get('prefijoArchivo');
  const automatizadoParam = parametros.get('automatizado') === '1';
  // &editar=1 (mismo patron, mismo motivo que &descargar -- pedido explicito del
  // usuario, 2026-11-20): botón "✏️ Editar" del visor del lote de 40
  // (lote40Vista.js), para reabrir un estudio directo en el formulario de captura
  // ("Datos y recibo") en vez del resumen -- no existe un modo de edición separado en
  // esta app (es una sola pantalla continua), así que esto solo desplaza el scroll y
  // enfoca el primer campo real del formulario (ver el final de este IIFE).
  const editarParam = parametros.get('editar');
  if (clienteParam && proyectoParam) {
    const cliente = obtenerCliente(clienteParam);
    const proyecto = cliente ? obtenerProyecto(cliente, proyectoParam) : null;
    if (cliente && proyecto) {
      history.replaceState(null, '', location.pathname);
      abrirProyecto(clienteParam, proyectoParam);
      if (descargarParam === 'pdf' || descargarParam === 'excel' || descargarParam === 'zip') {
        if (prefijoArchivoParam) prefijoArchivoDescarga = prefijoArchivoParam;
        if (automatizadoParam) {
          window.confirm = () => false;
          window.alert = (msg) => console.warn('[descarga automatizada] aviso suprimido:', msg);
        }
        manejarDescargaPorEnlaceProfundo(descargarParam);
      } else if (editarParam === '1') {
        const tab = $('tabCaptura');
        if (tab) {
          tab.scrollIntoView({ behavior: 'smooth', block: 'start' });
          $('titular')?.focus();
        }
      }
      return;
    }
  }
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
  fijarTitulo('Clientes');
})();
