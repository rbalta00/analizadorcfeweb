// El predeterminado GLOBAL de texto (un solo default para CUALQUIER tarifa, aplicado a
// cotizaciones actuales y futuras) se quito a peticion explicita del usuario,
// 2026-11-13: "ya no usamos lo de guardar predeterminado global... cuando elijamos un
// machote ahi va a traer los datos que requerimos y la cotizacion original ya tiene sus
// datos predeterminados" -- el machote (aplicarMachoteAProyecto, clientes.js) y la
// plantilla por tarifa de aqui abajo cubren el mismo caso de uso de forma mas
// especifica. La clave vieja en localStorage ('cfe_textos_globales_v1') ya no se lee ni
// se escribe desde ningun lado de la app -- queda huerfana en el navegador de quien la
// haya usado, sin efecto.

// ---------------------------------------------------------------------------
// Plantilla final revisada POR TARIFA -- pedido explicito del usuario, 2026-11-05:
// "en sí que todo texto [y] tabla se pueda editar y al final poder guardar como
// formato final revisado para ya así hacer todas las cotizaciones, aunque puede
// variar por tarifa se va a ir guardando y corrigiendo y eliminando por tarifa".
// Prioridad (ver campoEditableConId/textoChico/celdaEditable en secciones.js):
// override de proyecto > plantilla de ESTA tarifa > texto fijo en el codigo.
// Guardado como SNAPSHOT completo por tarifa (no acumulativo campo a campo): el
// boton "Guardar/actualizar plantilla" en app.js manda TODO proyecto.textosEditados
// de la cotizacion que se esta revisando, reemplazando entero lo que hubiera antes
// para esa tarifa -- pedido explicito del usuario ("se va a ir guardando y
// corrigiendo"), para que la plantilla sea siempre un reflejo fiel del ultimo
// proyecto revisado, sin arrastrar ids viejos huerfanos de revisiones anteriores.
export const TARIFAS_PLANTILLA = ['GDMTO', 'GDMTH', 'GDBT', 'PDBT', '01', 'DAC'];
const CLAVE_STORAGE_TARIFA = 'cfe_plantillas_por_tarifa_v1';

function leerTodasLasPlantillas() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_STORAGE_TARIFA)) || {};
  } catch {
    return {};
  }
}

function guardarTodasLasPlantillas(obj) {
  localStorage.setItem(CLAVE_STORAGE_TARIFA, JSON.stringify(obj));
}

export function leerPlantillaTarifa(tarifa) {
  return leerTodasLasPlantillas()[tarifa] || {};
}

// Reemplaza COMPLETO el snapshot de esta tarifa con `mapaTextos` (normalmente
// proyecto.textosEditados tal cual, copiado) -- ver nota de diseño arriba.
export function guardarPlantillaTarifa(tarifa, mapaTextos) {
  const todas = leerTodasLasPlantillas();
  todas[tarifa] = { ...mapaTextos };
  guardarTodasLasPlantillas(todas);
}

export function eliminarPlantillaTarifa(tarifa) {
  const todas = leerTodasLasPlantillas();
  delete todas[tarifa];
  guardarTodasLasPlantillas(todas);
}

// Para la UI de gestion (app.js): cuantos textos/tablas tiene guardados cada
// tarifa, para mostrar la lista de las 6 con su estado (tiene plantilla o no).
export function resumenPlantillasPorTarifa() {
  const todas = leerTodasLasPlantillas();
  const resumen = {};
  for (const t of TARIFAS_PLANTILLA) resumen[t] = Object.keys(todas[t] || {}).length;
  return resumen;
}
