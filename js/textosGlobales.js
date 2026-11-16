import { textoTieneCifraOConclusionSinToken } from './clientes.js';

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

  // Bug real reportado por el usuario, 2026-11-16: un texto como "la verificación en
  // campo sugiere N paneles menos/más..." trae la diferencia ya calculada pegada como
  // numero crudo (no {{token}}) -- si quedo guardado en la plantilla de esta tarifa
  // (antes de este fix, guardarPlantillaTarifa() no filtraba nada), se aplicaba tal cual
  // a CUALQUIER estudio nuevo de esa tarifa, sin importar lo que SU PROPIA verificacion
  // en sitio sugiriera -- el texto parecia "no actualizarse" aunque se recalculara con
  // datos nuevos. Filtrado aqui tambien (no solo al guardar) para que plantillas YA
  // guardadas antes de este fix dejen de aplicar ese numero congelado sin que el usuario
  // tenga que volver a guardar la plantilla a mano.
  if (plantilla.textosEditados) {
    const limpios = {};
    for (const [id, texto] of Object.entries(plantilla.textosEditados)) {
      if (textoTieneCifraOConclusionSinToken(texto)) continue;
      limpios[id] = texto;
    }
    proyecto.textosEditados = limpios;
  }
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
  // Mismo filtro que aplicarPlantillaTarifa() -- no dejar que un numero/cifra/conclusion
  // del calculo de ESTE proyecto (ej. "sugiere 3 paneles menos") quede congelado en la
  // plantilla de la tarifa, donde se aplicaria igual a cualquier otro estudio futuro.
  const textosEditadosLimpios = {};
  for (const [id, texto] of Object.entries(proyectoSnapshot.textosEditados || {})) {
    if (textoTieneCifraOConclusionSinToken(texto)) continue;
    textosEditadosLimpios[id] = texto;
  }
  todas[tarifa] = {
    textosEditados: textosEditadosLimpios,
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
