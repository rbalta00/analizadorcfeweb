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

// ---------------------------------------------------------------------------
// Plantilla final revisada POR TARIFA -- pedido explicito del usuario, 2026-11-05:
// "en sí que todo texto [y] tabla se pueda editar y al final poder guardar como
// formato final revisado para ya así hacer todas las cotizaciones, aunque puede
// variar por tarifa se va a ir guardando y corrigiendo y eliminando por tarifa".
// Capa ADICIONAL a la global de arriba, no la reemplaza -- la global sigue
// aplicando a cualquier tarifa si no hay plantilla especifica para la tarifa de
// este proyecto. Prioridad completa (ver _resolverBase en secciones.js):
// override de proyecto > plantilla de ESTA tarifa > global para todas las tarifas
// > texto fijo en el codigo.
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

// Aplica la plantilla por tarifa COMPLETA a un proyecto:
// - textosEditados, textosOcultos
// - seccionesExcluidas, graficosExcluidos, calculosActivos
// - tablaColumnasOcultas, tablaFilasOcultas
// - pasos y pasoActivo
//
// Se llama después de aplicar un nuevo recibo/tarifa (cuando cambia el tarifa),
// para restaurar la configuración que el usuario trabajó anteriormente para esa tarifa.
// NO toca proyecto.formulario ni los datos del recibo -- solo la configuración editorial.
export function aplicarPlantillaTarifa(proyecto, tarifa) {
  const plantilla = leerPlantillaTarifa(tarifa);
  if (!plantilla || !Object.keys(plantilla).length) return; // sin plantilla, no hace nada

  if (plantilla.textosEditados) proyecto.textosEditados = { ...plantilla.textosEditados };
  if (plantilla.textosOcultos) proyecto.textosOcultos = { ...plantilla.textosOcultos };
  if (plantilla.seccionesExcluidas) proyecto.seccionesExcluidas = [...plantilla.seccionesExcluidas];
  if (plantilla.graficosExcluidos) proyecto.graficosExcluidos = [...plantilla.graficosExcluidos];
  if (plantilla.calculosActivos) proyecto.calculosActivos = [...plantilla.calculosActivos];
  if (plantilla.tablaColumnasOcultas) proyecto.tablaColumnasOcultas = JSON.parse(JSON.stringify(plantilla.tablaColumnasOcultas));
  if (plantilla.tablaFilasOcultas) proyecto.tablaFilasOcultas = JSON.parse(JSON.stringify(plantilla.tablaFilasOcultas));
  if (plantilla.pasos) {
    proyecto.pasos = JSON.parse(JSON.stringify(plantilla.pasos));
    proyecto.pasoActivo = plantilla.pasoActivo || 'completo';
  }
}

// Reemplaza COMPLETO el snapshot de esta tarifa con todos los campos necesarios
// para reproducir fielmente su configuración (textos, apagados, pasos, etc.).
// `proyectoSnapshot` es el proyecto actual -- se copia COMPLETO para que la
// plantilla capture exactamente cómo está quedando el usuario (2026-11-12).
export function guardarPlantillaTarifa(tarifa, proyectoSnapshot) {
  const todas = leerTodasLasPlantillas();
  todas[tarifa] = {
    textosEditados: { ...(proyectoSnapshot.textosEditados || {}) },
    textosOcultos: { ...(proyectoSnapshot.textosOcultos || {}) },
    seccionesExcluidas: [...(proyectoSnapshot.seccionesExcluidas || [])],
    graficosExcluidos: [...(proyectoSnapshot.graficosExcluidos || [])],
    calculosActivos: [...(proyectoSnapshot.calculosActivos || [])],
    tablaColumnasOcultas: JSON.parse(JSON.stringify(proyectoSnapshot.tablaColumnasOcultas || {})),
    tablaFilasOcultas: JSON.parse(JSON.stringify(proyectoSnapshot.tablaFilasOcultas || {})),
    pasos: JSON.parse(JSON.stringify(proyectoSnapshot.pasos || {})),
    pasoActivo: proyectoSnapshot.pasoActivo || 'completo',
  };
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
