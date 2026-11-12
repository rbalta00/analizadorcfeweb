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

// Hook UNICO para que app.js se entere del resultado de CADA intento de guardado, sin
// importar por cual funcion de este archivo se llego ahi (guardarCliente/guardarProyecto,
// crearCliente, crearProyecto, eliminarCliente, eliminarProyecto -- TODAS pasan por
// guardarTodos() internamente, es el unico lugar real donde se escribe a localStorage).
// Arreglo de raiz pedido por el usuario, 2026-11-05: un guardado fallido (tipicamente
// cuota de localStorage llena) antes solo quedaba en consola, sin aviso visible.
// Se llama con `ok` en AMBOS casos (true o false), no solo en el fallo -- la primera
// version de este fix solo avisaba en el fallo y nunca quitaba el aviso cuando un
// guardado posterior SI tenia exito por un camino que no fuera guardarProyecto/
// guardarCliente (ej. crearProyecto llamado directo desde "+ Cotizacion en blanco"),
// dejando el aviso pegado en pantalla aunque el guardado ya funcionara bien de nuevo --
// bug real encontrado probando en navegador antes de dar el fix por terminado.
let _onResultadoGuardado = null;
export function alGuardar(cb) { _onResultadoGuardado = cb; }

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
    if (_onResultadoGuardado) _onResultadoGuardado(true);
    return true;
  } catch (e) {
    console.error('No se pudo guardar en localStorage (¿cuota llena?):', e);
    if (_onResultadoGuardado) _onResultadoGuardado(false, e);
    return false;
  }
}

export function listarClientes() {
  return leerTodos().sort((a, b) => (b.actualizadoEn || '').localeCompare(a.actualizadoEn || ''));
}

export function obtenerCliente(id) {
  return leerTodos().find(c => c.id === id) || null;
}

// `tipo` ya NO esta limitado a exactamente "gobierno"/"particular" -- pedido explicito
// del usuario, 2026-11-11: "no tengo que elegir entre particular y gobierno... puede
// ser gobierno u otro termino no predeterminado". Se guarda tal cual lo que escriba
// (recortado), con "Particular" como default solo si lo deja vacio -- la UI sigue
// sugiriendo "Gobierno"/"Particular" (ver datalist en index.html) pero no obliga a
// esos 2 valores.
export function crearCliente({ nombre, tipo }) {
  const ahora = new Date().toISOString();
  const cliente = {
    id: uuid(),
    nombre: nombre || 'Cliente sin nombre',
    tipo: (tipo || '').toString().trim() || 'Particular',
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

// Agrupa por el VALOR REAL de `tipo` (no solo gobierno/particular -- ver crearCliente).
// "gobierno"/"particular" (cualquier mayuscula/minuscula, por los clientes viejos
// creados antes de este cambio) siempre van primero en ese orden; cualquier otro valor
// que el usuario haya escrito se agrega despues, en orden alfabetico.
export function clientesAgrupadosPorTipo() {
  const todos = listarClientes();
  const grupos = new Map();
  for (const c of todos) {
    const clave = (c.tipo || 'Particular').toString();
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(c);
  }
  const prioridad = (clave) => {
    const t = clave.toLowerCase();
    if (t === 'gobierno') return 0;
    if (t === 'particular') return 1;
    return 2;
  };
  return [...grupos.entries()]
    .sort((a, b) => prioridad(a[0]) - prioridad(b[0]) || a[0].localeCompare(b[0]))
    .map(([tipo, clientes]) => ({ tipo, clientes }));
}

// Valores de `tipo` ya usados por algun cliente -- para sugerir en el datalist del
// formulario de cliente nuevo (ver index.html/app.js), sin limitar a esos valores.
export function tiposClienteUsados() {
  const vistos = new Set(['Gobierno', 'Particular']);
  for (const c of listarClientes()) if (c.tipo) vistos.add(c.tipo);
  return [...vistos];
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
    // tablaColumnasOcultas / tablaFilasOcultas: { [tablaId]: [indices...] } -- pedido
    // explicito del usuario, 2026-11-05: "permite eliminar columnas o renglones de las
    // tablas". MISMO patron reversible que graficosExcluidos (secciones.js/app.js): nunca
    // es un borrado real, solo se oculta -- la columna/fila sigue en pantalla atenuada
    // (clase 'col-oculta-tabla'/'fila-oculta-tabla', ver tabla() en secciones.js) con su
    // propio boton para reactivarla, y solo desaparece de verdad en el PDF (propuesta.js,
    // ver tablaF()). `tablaId` es el mismo id que ya identifica la tabla para el toggle de
    // apagado completo (graficoToggle) y para la edicion de celdas (celdaEditable) -- un
    // tercer uso del mismo id, no uno nuevo.
    tablaColumnasOcultas: {},
    tablaFilasOcultas: {},
    // pasos / pasoActivo: "pasos de entrega" -- pedido explicito del usuario,
    // 2026-11-09: poder entregar un analisis previo (menos secciones) sin perder ni
    // duplicar la cotizacion completa ya validada. Cada paso es solo una FOTO de que
    // secciones/graficas/tablas se muestran (los 4 campos de arriba) -- el contenido
    // real (textos, cifras calculadas) es siempre el mismo para todos los pasos de la
    // misma cotizacion, nunca se copia. "completo" se crea siempre como el primer paso
    // y nunca se borra -- es la version que representa el analisis integro; ver
    // asegurarPasos/aplicarPaso/crearPasoDesdeActual/eliminarPaso mas abajo.
    pasos: {
      completo: { nombre: 'Análisis completo', seccionesExcluidas: [], graficosExcluidos: [], tablaColumnasOcultas: {}, tablaFilasOcultas: {} },
    },
    pasoActivo: 'completo',
  };
  cliente.proyectos = cliente.proyectos || [];
  cliente.proyectos.push(proyecto);
  guardarCliente(cliente);
  return proyecto;
}

// ---------------- Pasos de entrega (analisis previo / propuesta completa / los que
// se necesiten) ----------------
// Proyectos guardados ANTES de que existiera esto no tienen `pasos` -- se migran la
// primera vez que se abren, envolviendo lo que ya tuvieran en los 4 campos sueltos
// (seccionesExcluidas/graficosExcluidos/tablaColumnasOcultas/tablaFilasOcultas) dentro
// de un paso "completo" nuevo, para no perder ningun apagado/edicion ya hecho.
export function asegurarPasos(proyecto) {
  if (proyecto.pasos && Object.keys(proyecto.pasos).length && proyecto.pasoActivo && proyecto.pasos[proyecto.pasoActivo]) return proyecto;
  proyecto.pasos = {
    completo: {
      nombre: 'Análisis completo',
      seccionesExcluidas: [...(proyecto.seccionesExcluidas || [])],
      graficosExcluidos: [...(proyecto.graficosExcluidos || [])],
      tablaColumnasOcultas: JSON.parse(JSON.stringify(proyecto.tablaColumnasOcultas || {})),
      tablaFilasOcultas: JSON.parse(JSON.stringify(proyecto.tablaFilasOcultas || {})),
    },
  };
  proyecto.pasoActivo = 'completo';
  return proyecto;
}

// Copia los 4 campos sueltos ACTUALES (lo que el usuario acaba de apagar/mostrar) hacia
// el paso activo -- se llama despues de CUALQUIER cambio en esos 4 campos (ver los 5
// handlers onToggle* en app.js), para que cambiar de paso y regresar no pierda nada.
export function sincronizarPasoActivoDesdeFlat(proyecto) {
  asegurarPasos(proyecto);
  const paso = proyecto.pasos[proyecto.pasoActivo];
  if (!paso) return;
  paso.seccionesExcluidas = [...(proyecto.seccionesExcluidas || [])];
  paso.graficosExcluidos = [...(proyecto.graficosExcluidos || [])];
  paso.tablaColumnasOcultas = JSON.parse(JSON.stringify(proyecto.tablaColumnasOcultas || {}));
  paso.tablaFilasOcultas = JSON.parse(JSON.stringify(proyecto.tablaFilasOcultas || {}));
}

// Cambia el paso activo: copia LO GUARDADO de ese paso hacia los 4 campos sueltos (los
// mismos que ya lee toda la app -- secciones.js/propuesta.js nunca se enteran de que
// existen "pasos", solo ven seccionesExcluidas/etc. de siempre).
export function aplicarPaso(proyecto, idPaso) {
  asegurarPasos(proyecto);
  const paso = proyecto.pasos[idPaso];
  if (!paso) return proyecto;
  proyecto.pasoActivo = idPaso;
  proyecto.seccionesExcluidas = [...(paso.seccionesExcluidas || [])];
  proyecto.graficosExcluidos = [...(paso.graficosExcluidos || [])];
  proyecto.tablaColumnasOcultas = JSON.parse(JSON.stringify(paso.tablaColumnasOcultas || {}));
  proyecto.tablaFilasOcultas = JSON.parse(JSON.stringify(paso.tablaFilasOcultas || {}));
  return proyecto;
}

// Crea un paso NUEVO, nombrado, como copia exacta de lo que se ve AHORA MISMO (sea cual
// sea el paso activo) y lo vuelve el activo -- asi se puede partir de "Análisis
// completo" y empezar a apagar secciones para armar "Análisis preliminar" sin tocar el
// paso de origen (son copias independientes desde este punto, no una referencia
// compartida). Devuelve el id nuevo.
export function crearPasoDesdeActual(proyecto, nombre) {
  asegurarPasos(proyecto);
  const id = uuid();
  proyecto.pasos[id] = {
    nombre: nombre || 'Paso sin nombre',
    seccionesExcluidas: [...(proyecto.seccionesExcluidas || [])],
    graficosExcluidos: [...(proyecto.graficosExcluidos || [])],
    tablaColumnasOcultas: JSON.parse(JSON.stringify(proyecto.tablaColumnasOcultas || {})),
    tablaFilasOcultas: JSON.parse(JSON.stringify(proyecto.tablaFilasOcultas || {})),
  };
  proyecto.pasoActivo = id;
  return id;
}

export function renombrarPaso(proyecto, idPaso, nuevoNombre) {
  if (proyecto.pasos && proyecto.pasos[idPaso] && nuevoNombre && nuevoNombre.trim()) {
    proyecto.pasos[idPaso].nombre = nuevoNombre.trim();
  }
}

// No se puede eliminar el ultimo paso que quede (siempre tiene que haber al menos uno
// activo) -- si se borra el paso activo, se cambia solo a "completo" si existe, o al
// primero que quede. Devuelve el id del paso que quedo activo.
export function eliminarPaso(proyecto, idPaso) {
  asegurarPasos(proyecto);
  const ids = Object.keys(proyecto.pasos);
  if (ids.length <= 1) return proyecto.pasoActivo;
  delete proyecto.pasos[idPaso];
  if (proyecto.pasoActivo === idPaso) {
    const siguiente = proyecto.pasos.completo ? 'completo' : Object.keys(proyecto.pasos)[0];
    aplicarPaso(proyecto, siguiente);
  }
  return proyecto.pasoActivo;
}

// Marca el proyecto como actualizado y persiste TODO el cliente (los proyectos viven
// anidados dentro del cliente en storage, no por separado).
//
// Guarda (bloqueada): una vez que un proyecto quedo CONGELADO (ver
// clonarProyectoCongelado() mas abajo), este NUNCA se vuelve a escribir -- sin
// importar que se le haya cambiado algo en memoria, ni desde donde se llame
// (autoguardado de Calcular, edicion de texto, mover de cliente, etc.). Pedido
// explicito del usuario, 2026-11-11: "que la que ya se guardo para entregar al
// cliente no se toque ya". Se compara contra lo que YA esta guardado (no contra el
// `proyecto` que llega, que podria venir ya con `bloqueada` puesto a proposito) --
// clonarProyectoCongelado() guarda su clon nuevo con guardarCliente() directo, sin
// pasar por aqui, asi que no hace falta ninguna excepcion para "la primera vez".
export function guardarProyecto(cliente, proyecto) {
  const existente = (cliente.proyectos || []).find(p => p.id === proyecto.id);
  if (existente && existente.bloqueada) {
    console.warn(`Cotización "${proyecto.nombre}" está bloqueada (ya se entregó como definitiva) -- se ignora este intento de modificarla.`);
    return cliente;
  }
  proyecto.actualizadoEn = new Date().toISOString();
  const i = (cliente.proyectos || []).findIndex(p => p.id === proyecto.id);
  if (i >= 0) cliente.proyectos[i] = proyecto; else (cliente.proyectos = cliente.proyectos || []).push(proyecto);
  return guardarCliente(cliente);
}

export function eliminarProyecto(cliente, proyectoId) {
  cliente.proyectos = (cliente.proyectos || []).filter(p => p.id !== proyectoId);
  return guardarCliente(cliente);
}

// Desbloquear/bloquear una definitiva -- pedido explicito del usuario, 2026-11-11:
// "realmente son etiquetas, si quiero que se puedan editar y volver a guardar los
// cambios... pero asi identifico cual es la buena y cual puedo usar como machote...
// basicamente la que quiero que no se pueda sobre escribir tan facil es la muestra o
// machote". El candado se queda por DEFAULT (protege de ediciones accidentales,
// sobre todo a las muestras, que otros clientes reusan como machote), pero ya no es
// definitivo -- estas 2 funciones tocan DIRECTO el campo `bloqueada` sin pasar por
// guardarProyecto() (que de por si rechaza cualquier escritura mientras
// existente.bloqueada sea true -- por diseño no puede usarse para quitar su propio
// candado). La etiqueta (definitiva/propositoDefinitiva) nunca se toca aqui -- sigue
// identificando cual es cual, solo cambia si esta protegida contra escritura o no.
export function desbloquearProyecto(cliente, proyectoId) {
  const p = (cliente.proyectos || []).find(x => x.id === proyectoId);
  if (!p) return cliente;
  p.bloqueada = false;
  return guardarCliente(cliente);
}
export function bloquearProyecto(cliente, proyectoId) {
  const p = (cliente.proyectos || []).find(x => x.id === proyectoId);
  if (!p) return cliente;
  p.bloqueada = true;
  return guardarCliente(cliente);
}

// Clona un proyecto COMPLETO (todo su estado real: formulario, textos
// editados/ocultos, secciones/graficos/tablas apagados, archivos adjuntos, orden de
// secciones, etc.) en un registro NUEVO e independiente del mismo cliente, marcado
// `definitiva`+`bloqueada` -- a diferencia de crearProyectoDesdeOrigen() (que solo
// copia tarifa/cargos como PUNTO DE PARTIDA para una cotizacion distinta, pensado para
// otro cliente), esto preserva todo tal cual para que el PDF que generaria el clon sea
// idéntico al original en este momento exacto.
//
// Pedido explicito del usuario, 2026-11-11: al dar clic en "Marcar como definitiva y
// guardar", la version que se entrega al cliente debe quedar en un registro aparte y
// CONGELADO (bloqueada, ver guardarProyecto() arriba), mientras la cotizacion que se
// sigue trabajando ("el proyecto que se esta haciendo") sigue intacta y editable bajo
// su propio id de siempre -- antes ambas cosas eran el MISMO registro, asi que seguir
// editando despues de marcar definitiva modificaba en silencio lo que ya se le habia
// entregado al cliente. El clon aparece en el historial de cotizaciones de este mismo
// cliente (✅ Definitiva + 🔒) y automaticamente queda disponible para reusar como
// "machote" (candidatosMachote() en app.js ya filtra por `proyecto.definitiva`).
//
// `proposito` ('muestra' | 'cliente') -- pedido explicito del usuario, 2026-11-11:
// "cuando se genere ya decido si este nuevo lo guardo como definitivo PARA MUESTRA o
// definitivo PARA EL CLIENTE". Ambos quedan igual de congelados (nunca se tocan), pero
// solo 'muestra' se ofrece como ejemplo generico reusable por tarifa (ver
// mejorDefinitivaPorTarifa() en app.js) -- 'cliente' es la entrega real de ESE cliente,
// no necesariamente un buen ejemplo generico para empezar la cotizacion de otro.
export function clonarProyectoCongelado(cliente, proyecto, proposito = 'cliente') {
  const ahora = new Date().toISOString();
  const clon = JSON.parse(JSON.stringify(proyecto));
  clon.id = uuid();
  clon.creadoEn = ahora;
  clon.actualizadoEn = ahora;
  clon.definitiva = true;
  clon.bloqueada = true;
  clon.entregadaEn = ahora;
  clon.propositoDefinitiva = proposito === 'muestra' ? 'muestra' : 'cliente';
  (cliente.proyectos = cliente.proyectos || []).push(clon);
  guardarCliente(cliente);
  return clon;
}

// Aplica un machote (otra cotizacion ya validada) SOBRE un proyecto que ya existe --
// pedido explicito del usuario, 2026-11-09: "ya hay un boton de nuevo cliente al final
// de la cotizacion donde se trabaja... permite elegir que cliente, el nombre de la
// cotizacion y que cotizacion final usar como machote" -- en vez de un flujo aparte
// ("Desde cotizacion ya validada", quitado de index.html por redundante), esto se usa
// desde el panel "Guardar cotizacion" de una cotizacion YA ABIERTA (tipicamente recien
// creada en blanco): nombre/cliente se deciden con los controles que ya existian ahi.
//
// CAMPOS_EDITORIAL_MACHOTE: bug real reportado por el usuario, 2026-11-12 -- "cuando
// usamos como machote... se cambiaron textos, solo modifica los calculos los textos
// dejalos igual que el machote". Antes esta funcion solo copiaba
// formulario/pasos -- textosEditados/textosOcultos/seccionesExcluidas/graficosExcluidos/
// calculosActivos/tablaColumnasOcultas/tablaFilasOcultas/ordenSecciones se quedaban en
// los DEFAULT de un proyecto recien creado (todo encendido, sin ninguna edicion), asi
// que cualquier texto personalizado o secccion/grafico/columna/fila apagada en el
// machote se perdia en silencio -- el nuevo proyecto mostraba el texto GENERICO de
// fabrica en vez del texto ya redactado del machote. Estos campos son id->valor
// (ids ESTRUCTURALES, estables para cualquier cotizacion con el mismo layout de
// secciones/tablas, nunca datos del cliente real) -- copiarlos tal cual es seguro.
// Riesgo aceptado explicitamente por el usuario: un texto editado a mano que mencione
// algo especifico del cliente ORIGEN (ej. su ubicacion) viajaria igual al nuevo -- "ya
// si sale algo mal yo lo modifico manual" (el aviso de "plantilla sin verificar" ya
// existente sigue recordando revisar antes de confiar en el resultado).
//
// IMPORTANTE, pedido explicito del usuario 2026-11-12 (version final, tras dos vueltas
// de ajuste en el mismo dia): "el machote solo sea que se jalen los textos editados
// manuales" + "revisa que se recalcule y se tome bien la informacion del nuevo
// recibo" -- el machote YA NO toca `proyecto.formulario` para NADA (ni identidad, ni
// consumo, ni cargos, ni tarifa, ni criterios como modulo/cobertura/clasificacion
// $/kW) -- intentos anteriores de "rellenar lo que faltara" seguian arriesgando que un
// dato del cliente ORIGEN se mezclara con el calculo del cliente nuevo. Ahora el
// machote aporta UNICAMENTE lo editorial (CAMPOS_EDITORIAL_MACHOTE) + la estructura de
// pasos -- toda la tarifa/cargos/periodo/kWh del calculo tiene que salir siempre de
// leer el recibo real de este cliente (antes o despues de elegir el machote, en
// cualquier orden), nunca del machote.
//
// "Y SOLO NECESITO LOS TEXTOS QUE SE EDITARON" + "esos numeros son del machote que se
// ocupo" (usuario, 2026-11-12): dentro de textosEditados, algunos "textos" en realidad
// son numeros del CALCULO del cliente origen pegados en una oracion (ej. "...pasar de
// pagar una facturacion anual de $80,645.36 a $49,245.65...", "...sugiere 21 paneles
// mas...") -- esos NUNCA deben copiarse al machote nuevo, porque el numero es del
// servicio/recibo ORIGEN, no del nuevo. Se filtran con la MISMA deteccion que ya existia
// como aviso (PATRON_POSIBLE_NUMERO_CALCULADO, ver detectarTextosConNumerosSospechosos
// mas abajo) -- un texto editado SIN ningun numero/%/kWh/años/paneles pegado (redaccion
// pura) si se copia tal cual; uno que si trae un numero de ese tipo se omite, para que
// el cliente nuevo muestre el texto GENERICO con el numero ya recalculado en su lugar.
const CAMPOS_EDITORIAL_MACHOTE = [
  'textosEditados', 'textosOcultos', 'seccionesExcluidas', 'graficosExcluidos',
  'calculosActivos', 'tablaColumnasOcultas', 'tablaFilasOcultas', 'ordenSecciones',
];
export function aplicarMachoteAProyecto(proyecto, origen) {
  const origenProyecto = origen.proyecto;
  for (const campo of CAMPOS_EDITORIAL_MACHOTE) {
    if (origenProyecto[campo] === undefined) continue;
    // Copiar textosEditados COMPLETO, sin filtrar números. La heurística
    // detectarTextosConNumerosSospechosos() es una ADVERTENCIA posterior, no un filtro.
    // El usuario escribió esos textos así -- conservarlos tal cual (2026-11-12).
    proyecto[campo] = JSON.parse(JSON.stringify(origenProyecto[campo]));
  }
  if (origenProyecto.pasos) {
    proyecto.pasos = JSON.parse(JSON.stringify(origenProyecto.pasos));
    proyecto.pasoActivo = origenProyecto.pasoActivo || 'completo';
    aplicarPaso(proyecto, proyecto.pasoActivo);
  }
  proyecto.plantillaOrigen = {
    clienteNombre: origen.cliente.nombre,
    proyectoNombre: origenProyecto.nombre,
    tarifa: origenProyecto.formulario?.tarifa || null,
    fecha: new Date().toISOString(),
  };
  proyecto.plantillaVerificada = false;
  return proyecto;
}

// Heurística de aviso, no un bloqueo: un texto editado a mano puede llevar pegado un
// número/monto/porcentaje. Desde 2026-11-12, aplicarMachoteAProyecto() YA filtra (con
// este mismo patrón) los textosEditados del machote que traigan un número así -- por
// eso, justo despues de aplicar un machote, esta funcion normalmente no encuentra nada.
// Sigue existiendo como red de seguridad para el caso que SI puede pasar despues: el
// usuario edita a mano un parrafo de ESTE cliente y pega sin querer un numero que ya no
// es el actual (ej. copio y pego de otro documento). Esto NO detecta todos los casos
// (es imposible saberlo con certeza desde el texto solo) -- es un recordatorio
// dirigido para revisar esos textos en particular en vez de los 25+ de la cotización.
const PATRON_POSIBLE_NUMERO_CALCULADO = /\$\s?[\d,]+(\.\d+)?|\d+(\.\d+)?\s?%|\d+(\.\d+)?\s?(kwh|kwp|kw)\b|\d+(\.\d+)?\s*años|\d+\s*paneles/i;
export function detectarTextosConNumerosSospechosos(textosEditados) {
  if (!textosEditados) return [];
  const hallazgos = [];
  for (const [id, texto] of Object.entries(textosEditados)) {
    if (typeof texto !== 'string') continue;
    if (PATRON_POSIBLE_NUMERO_CALCULADO.test(texto)) {
      hallazgos.push({ id, texto: texto.length > 90 ? texto.slice(0, 90) + '…' : texto });
    }
  }
  return hallazgos;
}

export function crearProyectoDesdeOrigen(cliente, origen, { nombre } = {}) {
  const proyecto = crearProyecto(cliente, { nombre });
  aplicarMachoteAProyecto(proyecto, origen);
  guardarProyecto(cliente, proyecto);
  return proyecto;
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

// Recupera texto editado que quedo HUERFANO por los fixes de id-fijo de 2026-11-11
// (commits 9ecd60a/6b712ab) -- esos commits corrigieron que varios parrafos
// condicionales (verificacion en sitio, historial, inmueble, ISR, reposicion de
// inversor) tuvieran un id SECUENCIAL que se corria segun los datos del cliente.
// Arreglar eso cambio el id de esos parrafos especificos -- cualquier edicion YA
// guardada bajo el id secuencial viejo dejo de aplicarse (reportado por el usuario:
// "esa es mi machote ya trabajado, recupera eso").
//
// El id VIEJO de cada uno se puede reconstruir EXACTO para un proyecto YA CALCULADO
// (sobre todo uno congelado/definitiva, cuyos datos nunca cambian): es una funcion
// pura de que tan abajo en la secuencia de esa seccion caia ese parrafo cuando las
// MISMAS condiciones de r (escenarioVerificado/historial/inmueble/aplicaIsr/
// reposicion) ya eran estas. No se BORRA el valor viejo (por si el calculo de alguna
// seccion de arriba llegara a diferir), solo se copia hacia el id nuevo si este
// todavia no tiene su propio valor.
export function recuperarTextosEditadosOrfanados(textosEditados, r) {
  if (!textosEditados) return textosEditados;
  const hayDatosInmueble = !!(r.inmueble && Object.values(r.inmueble).some((v) => v));
  const reposicionAnio = (r.flujo25Rows || []).find((x) => x.reposicionMxn)?.anio;
  const mapa = [
    ['s1-verif-texto', 's1-t2', !!r.escenarioVerificado],
    ['s1-verif-aviso', 's1-t3', !!r.escenarioVerificado],
    ['s2-aviso-nombre', 's2-t2', !!(r.tituloRecibo && r.titular && r.tituloRecibo.trim().toUpperCase() !== r.titular.trim().toUpperCase())],
    ['s5-historial-intro', 's5-t0', !!(r.historial && r.historial.length >= 3)],
    ['s6-inmueble-resumen', 's6-t1', hayDatosInmueble],
    ['s6-inmueble-implica', 's6-t2', hayDatosInmueble],
    ['s13-isr-aviso', 's13-t2', !!r.aplicaIsr],
    ['s14-nota-reposicion', 's14-t1', !!(r.flujo25Rows && r.flujo25Rows.length && reposicionAnio)],
  ];
  let resultado = textosEditados;
  let cambios = false;
  for (const [idNuevo, idViejo, condicion] of mapa) {
    if (!condicion) continue;
    if (Object.prototype.hasOwnProperty.call(resultado, idNuevo)) continue; // ya tiene su propio valor -- no pisar
    if (!Object.prototype.hasOwnProperty.call(resultado, idViejo)) continue; // no hay nada que recuperar
    if (!cambios) { resultado = { ...resultado }; cambios = true; }
    resultado[idNuevo] = resultado[idViejo];
  }
  return resultado;
}
