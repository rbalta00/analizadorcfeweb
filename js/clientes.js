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

// Crea un proyecto nuevo CLONANDO los datos de tarifa/cargos de un proyecto YA
// GUARDADO (de este cliente o de cualquier otro) -- pedido explicito del usuario,
// 2026-11-06: "cuando haga un proyecto o cotizacion nueva... usar la tarifa ya
// validada o la cotizacion ya validada". Copia TODO el formulario (tarifa, cargos,
// escalones domesticos, clasificacion $/kW, BT/factor de potencia, modulo/cobertura/
// horas-sol/costos/ISR) como punto de partida -- pero limpia los campos que son
// especificos de CADA cliente real (identidad + consumo del periodo + historial), que
// SIEMPRE tienen que venir del recibo real de este cliente nuevo, nunca clonarse.
// `plantillaOrigen` se guarda para poder avisar en la UI que estos datos vienen de
// otra cotizacion y no se han verificado todavia contra el recibo real de ESTE
// cliente -- mismo criterio de transparencia que el resto del proyecto (reconciliacion,
// avisos de OCR, etc.): nunca dejar que un dato sin verificar se vea identico a uno ya
// confirmado.
export function crearProyectoDesdeOrigen(cliente, origen, { nombre } = {}) {
  const f = origen.proyecto.formulario ? JSON.parse(JSON.stringify(origen.proyecto.formulario)) : null;
  if (f) {
    f.titular = ''; f.domicilio = ''; f.noServicio = '';
    f.periodoDias = ''; f.periodoKwh = '';
    f.dPeriodoDias = ''; f.dPeriodoKwh = '';
    f.historialNoDom = Array(12).fill(null);
    f.historialDom = Array(6).fill(null);
  }
  const proyecto = crearProyecto(cliente, { nombre });
  proyecto.formulario = f;
  // Los pasos de entrega (que secciones se muestran en cada paso) SI se clonan del
  // origen -- a diferencia de textosEditados/textosOcultos (redaccion especifica de
  // ESE cliente, nunca se clona), que secciones conviene mostrar en un "Analisis
  // preliminar" vs una "Propuesta completa" es una decision de formato que si tiene
  // sentido reusar como parte del machote. Pedido explicito del usuario, 2026-11-09:
  // "la cotizacion que ya decidimos que esta bien se pueda utilizar como machote".
  if (origen.proyecto.pasos) {
    proyecto.pasos = JSON.parse(JSON.stringify(origen.proyecto.pasos));
    proyecto.pasoActivo = origen.proyecto.pasoActivo || 'completo';
    aplicarPaso(proyecto, proyecto.pasoActivo);
  }
  proyecto.plantillaOrigen = {
    clienteNombre: origen.cliente.nombre,
    proyectoNombre: origen.proyecto.nombre,
    tarifa: origen.proyecto.formulario?.tarifa || null,
    fecha: new Date().toISOString(),
  };
  proyecto.plantillaVerificada = false;
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
