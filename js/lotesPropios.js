// "Mis lotes" -- pedido explicito del usuario, 2026-11-24: "y puedo crear mis propios
// lotes". El lote de 40 inmuebles (lote40.js/lote40Vista.js) es una lista FIJA,
// capturada en el codigo, de un solo contrato real de gobierno -- nunca se toca aqui.
// Este modulo es su equivalente GENERICO: el usuario puede crear tantos lotes como
// quiera, cada uno con su propia lista de inmuebles esperados (nombre + RPU), y la
// vista (mislotesVista.js) cruza esa lista contra sus clientes/proyectos reales por
// RPU, exactamente con el mismo criterio que datosLote40() -- pero sin tocar ese
// archivo ni esa pantalla.
//
// Guardado en localStorage, por navegador (mismo modelo que clientes.js) -- nunca se
// sincroniza a la nube junto con clientes/proyectos (no forma parte de cfe_respaldo).
const CLAVE = 'cfe_lotes_propios_v1';

function uuid() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function leerTodos() {
  try { return JSON.parse(localStorage.getItem(CLAVE)) || []; } catch { return []; }
}

function guardarTodos(lotes) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lotes));
    return true;
  } catch (e) {
    console.error('No se pudo guardar "mis lotes" -- revisa el espacio disponible en este navegador.', e);
    return false;
  }
}

export function listarLotesPropios() {
  return leerTodos().sort((a, b) => (b.actualizadoEn || '').localeCompare(a.actualizadoEn || ''));
}

export function obtenerLotePropio(id) {
  return leerTodos().find((l) => l.id === id) || null;
}

export function crearLotePropio({ nombre }) {
  const lotes = leerTodos();
  const ahora = new Date().toISOString();
  const nuevo = { id: uuid(), nombre, creadoEn: ahora, actualizadoEn: ahora, inmuebles: [] };
  lotes.push(nuevo);
  guardarTodos(lotes);
  return nuevo;
}

export function renombrarLotePropio(id, nombre) {
  const lotes = leerTodos();
  const lote = lotes.find((l) => l.id === id);
  if (!lote) return false;
  lote.nombre = nombre;
  lote.actualizadoEn = new Date().toISOString();
  return guardarTodos(lotes);
}

export function eliminarLotePropio(id) {
  // Solo quita el lote (y deja de rastrear sus inmuebles aqui) -- las cotizaciones
  // reales que ya existan bajo el cliente del mismo nombre NUNCA se tocan, igual que
  // "Quitar del tablero" en serviciosExtra.js.
  return guardarTodos(leerTodos().filter((l) => l.id !== id));
}

export function agregarInmuebleALote(loteId, { nombre, rpu, rpuAlt }) {
  const lotes = leerTodos();
  const lote = lotes.find((l) => l.id === loteId);
  if (!lote) return null;
  const inmueble = { id: uuid(), nombre, rpu: rpu || '', rpuAlt: rpuAlt || null };
  lote.inmuebles.push(inmueble);
  lote.actualizadoEn = new Date().toISOString();
  guardarTodos(lotes);
  return inmueble;
}

export function editarInmuebleDeLote(loteId, inmuebleId, cambios) {
  const lotes = leerTodos();
  const lote = lotes.find((l) => l.id === loteId);
  const inmueble = lote?.inmuebles.find((i) => i.id === inmuebleId);
  if (!inmueble) return false;
  Object.assign(inmueble, cambios);
  lote.actualizadoEn = new Date().toISOString();
  return guardarTodos(lotes);
}

export function eliminarInmuebleDeLote(loteId, inmuebleId) {
  const lotes = leerTodos();
  const lote = lotes.find((l) => l.id === loteId);
  if (!lote) return false;
  lote.inmuebles = lote.inmuebles.filter((i) => i.id !== inmuebleId);
  lote.actualizadoEn = new Date().toISOString();
  return guardarTodos(lotes);
}
