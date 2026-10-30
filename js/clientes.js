// Clientes del cotizador, guardados en localStorage del navegador (ver ESTADO.md: la
// decision de usar Supabase para compartir entre dispositivos sigue pendiente -- esto
// es el minimo viable para poder agrupar por cliente mientras tanto). Cada cliente
// puede ser 'gobierno' o 'particular' -- no todos los servicios son del lote de
// gobierno de Puebla.
import { todosLosBloques } from './bloques.js';

const CLAVE_STORAGE = 'cfe_clientes_v1';

function leerTodos() {
  try {
    const crudo = localStorage.getItem(CLAVE_STORAGE);
    return crudo ? JSON.parse(crudo) : [];
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

function uuid() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function crearCliente({ nombre, tipo }) {
  const ahora = new Date().toISOString();
  const cliente = {
    id: uuid(),
    nombre: nombre || 'Cliente sin nombre',
    tipo: tipo === 'gobierno' ? 'gobierno' : 'particular',
    creadoEn: ahora,
    actualizadoEn: ahora,
    formulario: null, // snapshot de los campos capturados (ver app.js: leerFormulario/aplicarFormulario)
    campos: null, // ultimo recibo leido (extraerCampos())
    inmueble: null, // condiciones del inmueble (ver app.js: leerInmueble/aplicarInmueble)
    seccionesActivas: todosLosBloques(), // bloques de BLOQUES_COTIZACION activos para este cliente
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

export function clientesAgrupadosPorTipo() {
  const todos = listarClientes();
  return {
    gobierno: todos.filter(c => c.tipo === 'gobierno'),
    particular: todos.filter(c => c.tipo === 'particular'),
  };
}
