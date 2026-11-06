// Clientes del cotizador, guardados en localStorage del navegador (ver ESTADO.md: la
// decision de usar Supabase para compartir entre dispositivos sigue pendiente -- esto
// es el minimo viable para poder agrupar por cliente mientras tanto). Cada cliente
// puede ser 'gobierno' o 'particular' -- no todos los servicios son del lote de
// gobierno de Puebla.
//
// Un cliente puede tener VARIOS proyectos/cotizaciones (pedido explicito del usuario:
// "agregar varios proyectos a un mismo cliente... proyectos o cotizaciones como le
// quieras llamar"). Cada proyecto es lo que antes vivia directo en el cliente: su
// propio formulario/recibo/condiciones del inmueble/bloques activos/textos editados.
// Subir un recibo nuevo crea un proyecto nuevo (ver app.js) en vez de sobreescribir el
// que ya estaba abierto.
import { todosLosBloques } from './bloques.js';

const CLAVE_STORAGE = 'cfe_clientes_v1';

function uuid() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Clientes guardados ANTES de que existieran "proyectos" (un cliente = una sola
// cotizacion, los campos vivian directo en el). Se migran la primera vez que se leen,
// envolviendo lo que ya tenian en un unico proyecto, para no perder nada guardado.
function migrarClienteSiHaceFalta(c) {
  if (c.proyectos) return c;
  const ahora = c.actualizadoEn || new Date().toISOString();
  const proyecto = {
    id: uuid(),
    nombre: (c.formulario && c.formulario.titular) || 'Cotización 1',
    creadoEn: c.creadoEn || ahora,
    actualizadoEn: ahora,
    formulario: c.formulario || null,
    campos: c.campos || null,
    inmueble: c.inmueble || null,
    seccionesActivas: c.seccionesActivas || todosLosBloques(),
    calculosActivos: c.calculosActivos || todosLosBloques(),
    textosEditados: c.textosEditados || {},
    textosOcultos: c.textosOcultos || {},
  };
  c.proyectos = c.formulario ? [proyecto] : [];
  delete c.formulario; delete c.campos; delete c.inmueble;
  delete c.seccionesActivas; delete c.textosEditados;
  return c;
}

function leerTodos() {
  try {
    const crudo = localStorage.getItem(CLAVE_STORAGE);
    if (!crudo) return [];
    const parsed = JSON.parse(crudo);
    let migro = false;
    const lista = parsed.map((c) => {
      if (c.proyectos) return c;
      migro = true;
      return migrarClienteSiHaceFalta(c);
    });
    if (migro) guardarTodos(lista);
    return lista;
  } catch {
    return [];
  }
}

function guardarTodos(lista) {
  try {
    localStorage.setItem(CLAVE_STORAGE, JSON.stringify(lista));
    return true;
  } catch (e) {
    console.error('No se pudo guardar en localStorage (¿cuota llena?):', e);
    return false;
  }
}

export function listarClientes() {
  return leerTodos().sort((a, b) => (b.actualizadoEn || '').localeCompare(a.actualizadoEn || ''));
}

export function obtenerCliente(id) {
  return leerTodos().find(c => c.id === id) || null;
}

export function crearCliente({ nombre, tipo }) {
  const ahora = new Date().toISOString();
  const cliente = {
    id: uuid(),
    nombre: nombre || 'Cliente sin nombre',
    tipo: tipo === 'gobierno' ? 'gobierno' : 'particular',
    creadoEn: ahora,
    actualizadoEn: ahora,
    proyectos: [], // ver crearProyecto() -- un cliente arranca sin cotizaciones
  };
  const lista = leerTodos();
  lista.push(cliente);
  guardarTodos(lista);
  return cliente;
}

export function guardarCliente(cliente) {
  cliente.actualizadoEn = new Date().toISOString();
  const lista = leerTodos();
  const i = lista.findIndex(c => c.id === cliente.id);
  if (i >= 0) lista[i] = cliente; else lista.push(cliente);
  return guardarTodos(lista);
}

export function eliminarCliente(id) {
  const lista = leerTodos().filter(c => c.id !== id);
  return guardarTodos(lista);
}

// Reemplaza TODOS los clientes de este navegador de una sola vez -- usado por
// "Traer de la nube" (js/nube.js). A diferencia de guardarCliente() (que actualiza
// uno), esto sobreescribe la lista completa, asi que quien lo llame debe confirmar
// con el usuario antes (ver nube.js) -- no hay deshacer.
export function reemplazarTodosLosClientes(lista) {
  return guardarTodos(Array.isArray(lista) ? lista : []);
}

export function clientesAgrupadosPorTipo() {
  const todos = listarClientes();
  return {
    gobierno: todos.filter(c => c.tipo === 'gobierno'),
    particular: todos.filter(c => c.tipo === 'particular'),
  };
}

// ---------------------------------------------------------------------------
// Proyectos / cotizaciones dentro de un cliente
// ---------------------------------------------------------------------------
export function listarProyectos(cliente) {
  return [...(cliente.proyectos || [])].sort((a, b) => (b.actualizadoEn || '').localeCompare(a.actualizadoEn || ''));
}

export function obtenerProyecto(cliente, proyectoId) {
  return (cliente.proyectos || []).find(p => p.id === proyectoId) || null;
}

export function crearProyecto(cliente, { nombre } = {}) {
  const ahora = new Date().toISOString();
  const proyecto = {
    id: uuid(),
    nombre: nombre || `Cotización ${(cliente.proyectos || []).length + 1}`,
    creadoEn: ahora,
    actualizadoEn: ahora,
    formulario: null,
    campos: null,
    inmueble: null,
    seccionesActivas: todosLosBloques(),
    // calculosActivos: igual que seccionesActivas pero para el bloque "Cómo se
    // calculó" de cada seccion (formulas/cargos/tarifa) -- independiente, pedido
    // explicito del usuario: debe poder apagarse aparte de la seccion misma al
    // generar la cotizacion para el cliente.
    calculosActivos: todosLosBloques(),
    textosEditados: {},
    // textosOcultos: id de parrafo -> true, mismo patron que textosEditados pero para
    // apagar un parrafo suelto sin borrar su texto (pedido explicito del usuario,
    // 2026-11-02) -- igual que seccionesActivas/calculosActivos, SIEMPRE se ve en
    // pantalla (atenuado) para que Isaac pueda reactivarlo, el estado es lo que decide
    // si queda incluido.
    textosOcultos: {},
    fotoSembrado: null, // data URL JPEG comprimido (ver imagenes.js) de la distribucion de paneles sobre el techo -- es
    // la UNICA imagen activa que se muestra en la seccion 6/PDF, venga de la foto manual o de "Guardar" del sembrador
    // automatico (ver abajo) -- siempre gana la ultima que se guarde, no hay bandera de cual fuente esta "prendida".
    sembradoFuente: 'manual', // 'manual' | 'auto' -- solo recuerda que pestaña dejar abierta al reabrir, cosmetico
    // sembradorAuto: estado editable del sembrador automatico (pedido explicito del usuario, 2026-11-02 -- "sembrador
    // de paneles", portado de js/sembrador.js a partir del repo cotizador-fv-cfe/sembrador_de_paneles). Independiente
    // de fotoSembrado para poder seguir ajustando el diseño sin perderlo aunque la foto manual sea la activa ahorita.
    sembradorAuto: null, // { imagenDataUrl, anchoImg, altoImg, cotaP1, cotaP2, cotaMetros, techoP1, techoP2, techoP3, angulo, paneles }
    // La captura se consigue abriendo Google Maps gratis (boton "Abrir en Google Maps") y subiendo una captura de
    // pantalla propia -- sin API de pago ni facturacion, decision explicita del usuario, 2026-11-02. El techo son 3
    // puntos (no 2): p1->p2 es un lado del techo tal como se ve en la foto (da el angulo real), p3 el lado opuesto
    // -- el sembrador se alinea solo al techo en vez de sembrar siempre sin rotar (ver panelesEnTecho en sembrador.js).
    archivosRecibo: null, // array de {nombre,tipo,url,ruta} -- archivos originales subidos a Supabase Storage (ver supabase.js)
    archivosVerificacion: null, // igual forma que archivosRecibo, para el documento de verificacion en sitio (evidencia adjunta, no se lee)
    // definitiva: marca manual (boton "Marcar como definitiva y guardar", app.js) para distinguir la version
    // final de una cotizacion de versiones de prueba/comparacion -- pedido explicito del usuario, 2026-11-05. Se
    // muestra como insignia "✅ Definitiva" en el historial de cotizaciones del cliente (tarjetaProyecto).
    definitiva: false,
    fotosInmueble: [], // array de {dataUrl, ancho, alto, etiqueta} -- fotos de condiciones GENERALES del inmueble
    // (sombras, estado de cubierta, tablero, etc., distinto de fotoSembrado que es solo la distribucion de
    // paneles). Mismo patron de compresion que fotoSembrado (ver imagenes.js), pero en arreglo porque aqui si
    // tiene sentido guardar varias -- pedido explicito del usuario, hueco declarado desde 2026-10-29 ("no se
    // capturan fotografias en esta version"). Tope de 6 fotos y compresion mas agresiva que fotoSembrado (ver
    // app.js) para no comerse la cuota de localStorage entre varias fotos + fotoSembrado del mismo proyecto.
  };
  cliente.proyectos = cliente.proyectos || [];
  cliente.proyectos.push(proyecto);
  guardarCliente(cliente);
  return proyecto;
}

// Marca el proyecto como actualizado y persiste TODO el cliente (los proyectos viven
// anidados dentro del cliente en storage, no por separado).
export function guardarProyecto(cliente, proyecto) {
  proyecto.actualizadoEn = new Date().toISOString();
  const i = (cliente.proyectos || []).findIndex(p => p.id === proyecto.id);
  if (i >= 0) cliente.proyectos[i] = proyecto; else (cliente.proyectos = cliente.proyectos || []).push(proyecto);
  return guardarCliente(cliente);
}

export function eliminarProyecto(cliente, proyectoId) {
  cliente.proyectos = (cliente.proyectos || []).filter(p => p.id !== proyectoId);
  return guardarCliente(cliente);
}

// Mueve una cotizacion de un cliente a otro (ej. se capturo bajo el cliente
// equivocado, o se decide que en realidad corresponde a otro ya registrado). `proyecto`
// se recibe completo (no se vuelve a leer de storage) para no perder cambios en
// memoria que todavia no se hubieran guardado.
export function moverProyecto(clienteOrigenId, clienteDestinoId, proyecto) {
  if (clienteOrigenId === clienteDestinoId) return obtenerCliente(clienteDestinoId);
  const origen = obtenerCliente(clienteOrigenId);
  const destino = obtenerCliente(clienteDestinoId);
  if (!origen || !destino) return null;
  origen.proyectos = (origen.proyectos || []).filter(p => p.id !== proyecto.id);
  guardarCliente(origen);
  destino.proyectos = destino.proyectos || [];
  destino.proyectos.push(proyecto);
  guardarCliente(destino);
  return destino;
}
