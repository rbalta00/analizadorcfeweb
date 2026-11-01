// Textos predeterminados GLOBALES de la cotizacion -- pedido explicito del usuario:
// "editar titulos y textos de toda la cotizacion y guardarlo para las futuras
// cotizaciones... para que no tenga que estarte diciendo a ti por codigo". Distinto
// de `proyecto.textosEditados` (secciones.js/app.js), que es un override SOLO para
// ese cliente/cotizacion -- esto vive aparte, en todo el navegador, y aplica como
// nuevo texto por defecto a CUALQUIER cotizacion (la actual y las que se creen
// despues) que no tenga ya su propio override de proyecto para ese mismo parrafo.
// Capa de prioridad: override de proyecto > default global > texto en el codigo.
const CLAVE_STORAGE = 'cfe_textos_globales_v1';

export function leerTextosGlobales() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_STORAGE)) || {};
  } catch {
    return {};
  }
}

function guardarTodos(obj) {
  localStorage.setItem(CLAVE_STORAGE, JSON.stringify(obj));
}

export function guardarTextoGlobal(id, texto) {
  const todos = leerTextosGlobales();
  todos[id] = texto;
  guardarTodos(todos);
}

export function quitarTextoGlobal(id) {
  const todos = leerTextosGlobales();
  delete todos[id];
  guardarTodos(todos);
}
