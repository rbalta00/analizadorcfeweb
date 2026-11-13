// "Nuevo desde mi formato fijo" -- pedido explicito del usuario, 2026-11-13: un
// formato reutilizable PERSISTENTE (sobrevive cerrar/abrir el programa, independiente
// de que la cotizacion u otro machote de origen se borre o cambie despues), a
// diferencia del machote normal (aplicarMachoteAProyecto en clientes.js), que siempre
// lee en vivo OTRA cotizacion ya guardada -- si esa cotizacion se borra o se edita de
// nuevo, el machote de ahi en adelante lee la version nueva, no la que se uso la
// primera vez. El formato fijo es una COPIA PROFUNDA tomada en el momento de "Fijar"/
// "Actualizar", nunca una referencia viva.
//
// Diseño: en vez de reimplementar el filtro de identidad/cifras/conclusiones
// (PATRON_POSIBLE_NUMERO_CALCULADO/PATRON_CONCLUSION_COMPARATIVA/valoresIdentidadDe),
// este modulo arma un "origen" sintetico con la MISMA forma que espera
// aplicarMachoteAProyecto({cliente, proyecto}) y reusa esa funcion tal cual -- un solo
// lugar donde vive la logica de que se conserva, que se descarta y que se marca para
// revision, sin duplicarla.
import { CAMPOS_EDITORIAL_MACHOTE, aplicarMachoteAProyecto } from './clientes.js';
import { TITULOS_SECCIONES } from './secciones.js';

const CLAVE_FORMATO_FIJO = 'cfe_formato_fijo_v1';

export function leerFormatoFijo() {
  try {
    const crudo = localStorage.getItem(CLAVE_FORMATO_FIJO);
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    return null; // storage corrupto/inaccesible -- se trata como "no hay formato fijo", nunca truena la app
  }
}

export function hayFormatoFijo() {
  return !!leerFormatoFijo();
}

// Resumen para la vista previa ANTES de fijar/actualizar -- pedido explicito del
// usuario ("muestra una vista previa de los títulos, textos, tablas y secciones que se
// incluirán"). Se arma directo del proyecto abierto (no hace falta esperar a
// construirResultado) -- basta con lo que ya esta en CAMPOS_EDITORIAL_MACHOTE.
export function resumenParaFijar(proyecto) {
  const excluidas = new Set(proyecto.seccionesExcluidas || []);
  const titulosActivos = TITULOS_SECCIONES
    .map((t, i) => ({ numero: i + 1, titulo: t }))
    .filter((s) => !excluidas.has(s.numero));
  const nTextos = Object.keys(proyecto.textosEditados || {}).length;
  const nOcultos = Object.keys(proyecto.textosOcultos || {}).filter((k) => proyecto.textosOcultos[k]).length;
  const nGraficosApagados = (proyecto.graficosExcluidos || []).length;
  return {
    seccionesActivas: titulosActivos,
    seccionesApagadas: excluidas.size,
    textosEditados: nTextos,
    parrafosApagados: nOcultos,
    graficosTablasApagados: nGraficosApagados,
  };
}

// Construye el texto de la vista previa en una sola cadena, lista para mostrar en el
// confirm() de "Fijar como mi formato predeterminado" -- mismo patron que ya usa
// renderListaMachotes() en app.js para el confirm() de aplicar un machote normal.
export function textoVistaPrevia(proyecto) {
  const s = resumenParaFijar(proyecto);
  const listaSecciones = s.seccionesActivas.map((x) => `${x.numero}. ${x.titulo}`).join('\n');
  return `Se incluirán ${s.seccionesActivas.length} secciones activas:\n${listaSecciones}\n\n` +
    `${s.textosEditados} párrafo(s)/celda(s) con texto editado, ${s.parrafosApagados} apagado(s), ` +
    `${s.seccionesApagadas} sección(es) completa(s) apagada(s) y ${s.graficosTablasApagados} gráfico(s)/tabla(s) individuales apagados -- ` +
    'ninguno de estos se incluirá en los estudios que arranquen desde este formato.';
}

// Fijar/actualizar: SIEMPRE sobre-escribe por completo lo que hubiera guardado antes
// (pedido explicito del usuario en el prompt original de plantillas por tarifa, mismo
// criterio reaplicado aqui: "snapshot completo, no acumulativo", para que el formato
// fijo sea siempre fiel a la ultima revision, sin arrastrar ids huerfanos de una
// version anterior). `proyecto`/`cliente` son el ORIGEN que se esta fijando -- solo se
// guarda identidad (para el filtro de identidad de aplicarMachoteAProyecto) y tarifa
// (solo para mostrarla), NUNCA cargos/consumo/montos del origen.
export function fijarFormatoDesde(cliente, proyecto) {
  const snapshot = {};
  for (const campo of CAMPOS_EDITORIAL_MACHOTE) {
    if (proyecto[campo] !== undefined) snapshot[campo] = JSON.parse(JSON.stringify(proyecto[campo]));
  }
  if (proyecto.pasos) { snapshot.pasos = JSON.parse(JSON.stringify(proyecto.pasos)); snapshot.pasoActivo = proyecto.pasoActivo || 'completo'; }
  snapshot.formulario = {
    titular: proyecto.formulario?.titular || null,
    domicilio: proyecto.formulario?.domicilio || null,
    noServicio: proyecto.formulario?.noServicio || null,
    tarifa: proyecto.formulario?.tarifa || null,
  };
  const formato = {
    snapshot,
    origenClienteNombre: cliente.nombre,
    origenProyectoNombre: proyecto.nombre,
    fechaFijado: new Date().toISOString(),
  };
  localStorage.setItem(CLAVE_FORMATO_FIJO, JSON.stringify(formato));
  return formato;
}

// Aplica el formato fijo guardado sobre un proyecto (normalmente recien creado en
// blanco) -- reusa aplicarMachoteAProyecto tal cual, envolviendo el snapshot guardado
// en la misma forma {cliente, proyecto} que esa funcion ya espera de un machote
// normal. Esto es lo que garantiza, SIN codigo nuevo, que las mismas reglas de
// conservar/descartar/marcar-para-revision de un machote normal (identidad -> texto
// generico; cifra/conclusion sin token -> se conserva y se marca; {{token}} -> pasa
// limpio) apliquen IGUAL para el formato fijo.
export function aplicarFormatoFijoAProyecto(proyecto) {
  const formato = leerFormatoFijo();
  if (!formato) throw new Error('No hay ningún formato fijo guardado todavía.');
  const origenSintetico = {
    cliente: { nombre: formato.origenClienteNombre || 'Mi formato fijo' },
    proyecto: { ...formato.snapshot, nombre: formato.origenProyectoNombre || 'Mi formato fijo' },
  };
  aplicarMachoteAProyecto(proyecto, origenSintetico);
  // plantillaOrigen ya quedo escrito por aplicarMachoteAProyecto con el nombre/tarifa
  // del origen sintetico -- se sobreescribe la fecha con la del fijado (mas relevante
  // aqui que "ahorita", que es cuando se APLICO, no cuando se fijo el formato).
  proyecto.plantillaOrigen.fecha = formato.fechaFijado;
  proyecto.formatoFijoAplicado = true;
  return proyecto;
}
