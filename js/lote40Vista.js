// Logica del visor "Estado del lote de 40 inmuebles" -- pedido explicito del usuario,
// 2026-11-14: un boton que muestre cuantas de las 40 cotizaciones ya se generaron y
// cuantas faltan, agrupadas por tarifa. Vive en su PROPIA pagina (lote40.html), no
// dentro de la SPA de index.html -- pedido explicito de seguimiento del usuario, mismo
// dia: "que me abra en una ventana independiente", para poder tener el analizador y
// este visor abiertos al mismo tiempo en pestañas/ventanas distintas sin que se pisen.
// Lee el MISMO localStorage (mismo origen que index.html) via clientes.js -- de
// solo lectura en casi todo, con UNA excepcion explicita: el boton "+ Crear" de un
// inmueble "— Sin crear" (ver tarjetaLote40/crearProyectoPendiente mas abajo,
// 2026-11-20) SI escribe un proyecto nuevo en blanco, pedido explicito del usuario.
import { listarClientes, crearCliente, crearProyecto } from './clientes.js';
import { LOTE_40_INMUEBLES, normalizarRpu } from './lote40.js';
import { ETIQUETAS_TARIFA, ORDEN_TARIFAS } from './tarifas.js';
import { M } from './util.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Cruza LOTE_40_INMUEBLES (lista fija, ver lote40.js) contra TODOS los clientes/
// proyectos reales guardados en este navegador, por RPU -- no depende de que esten
// bajo un cliente con un nombre en particular.
function datosLote40() {
  const todosProyectos = [];
  for (const c of listarClientes()) {
    for (const p of (c.proyectos || [])) todosProyectos.push({ cliente: c, proyecto: p });
  }
  return LOTE_40_INMUEBLES.map((def) => {
    const rpusDef = [def.rpu, def.rpuAlt].filter(Boolean).map(normalizarRpu);
    // Match principal por el RPU capturado en el formulario; si el proyecto nunca
    // llego a capturar RPU (ej. se creo pero no se le subio el recibo todavia), se
    // intenta tambien contra el nombre del proyecto -- la convencion de esta misma
    // app para este lote es nombrar cada cotizacion "<RPU> <institucion>".
    const match = todosProyectos.find(({ proyecto: p }) => {
      const rpuCapturado = normalizarRpu(p.formulario?.noServicio);
      if (rpuCapturado && rpusDef.includes(rpuCapturado)) return true;
      return rpusDef.some((r) => r && (p.nombre || '').replace(/\D+/g, '').includes(r));
    });
    return { def, cliente: match?.cliente || null, proyecto: match?.proyecto || null };
  });
}

// Tarifa EFECTIVA de un inmueble, para agrupar -- pedido explicito del usuario,
// 2026-11-14 ("si le puedes poner la tarifa ya que esta en su recibo"): prioriza la
// tarifa REAL capturada en una cotizacion ya existente de esta app
// (`proyecto.formulario.tarifa`, la que de verdad se usa para calcular), y solo si
// todavia no hay eso, cae a `def.tarifaDelRecibo` (leida directo del recibo real del
// inmueble -- ver lote40.js). Las dos fuentes casi siempre deberian coincidir; si
// algun dia no coinciden, gana la capturada en la cotizacion (mas reciente/verificada
// para ESE calculo en particular).
function tarifaEfectiva(f) {
  return f.proyecto?.formulario?.tarifa || f.def.tarifaDelRecibo || null;
}

function agruparLote40PorTarifa(filas) {
  const grupos = new Map();
  for (const f of filas) {
    const tarifa = tarifaEfectiva(f);
    if (!grupos.has(tarifa)) grupos.set(tarifa, []);
    grupos.get(tarifa).push(f);
  }
  const ordenTarifas = [...ORDEN_TARIFAS, ...[...grupos.keys()].filter((t) => t && !ORDEN_TARIFAS.includes(t))];
  const resultado = [];
  for (const tarifa of ordenTarifas) {
    if (grupos.has(tarifa)) resultado.push({ tarifa, etiqueta: ETIQUETAS_TARIFA[tarifa] || tarifa, filas: grupos.get(tarifa) });
  }
  if (grupos.has(null)) resultado.push({ tarifa: null, etiqueta: 'Sin tarifa capturada todavía (sin cotización, o cotización sin recibo leído)', filas: grupos.get(null) });
  return resultado;
}

function estadoCotizacionLote40(proyecto) {
  if (!proyecto) return { clave: 'sin-crear', etiqueta: '— Sin crear' };
  if (proyecto.definitiva) return { clave: 'definitiva', etiqueta: '✅ Definitiva' };
  if (proyecto.ultimaInversionTotal != null) return { clave: 'calculada', etiqueta: '🧮 Calculada' };
  if (proyecto.formulario) return { clave: 'sin-calcular', etiqueta: '⚠️ Sin calcular' };
  return { clave: 'sin-datos', etiqueta: '⚠️ Sin datos' };
}

// Pedido explicito del usuario, 2026-11-23, en 3 vueltas el mismo dia: (1) "ponles una
// palomita a los analisis que ya se hallan editado y guardado", (2) "ponle la palomita
// solo si SI fue editada y guardada" (una primera version revisaba si textosEditados/
// textosOcultos tenian contenido, pero eso da falso positivo en la mayoria del lote --
// un proyecto creado DESDE UN MACHOTE hereda ese texto completo sin que el usuario haya
// tocado nada en ESE proyecto en particular), y (3) "mejor para saber ponle... la ultima
// hora y el dia de edicion ultimo" -- en vez de solo si/no, mostrar la fecha/hora real
// para que el usuario pueda compararla contra lo que el recuerda haber editado.
// `proyecto.ultimaEdicionManualEn` (clientes.js) es un ISO timestamp que SOLO se pone
// dentro de onEditarTexto/onOcultarTexto (app.js) -- nunca al heredar un machote.
function fechaUltimaEdicionManual(proyecto) {
  return proyecto?.ultimaEdicionManualEn || null;
}

function renderTotales(filas) {
  const cont = document.getElementById('lote40Totales');
  cont.innerHTML = '';
  const conProyecto = filas.filter((f) => f.proyecto);
  const calculadas = filas.filter((f) => f.proyecto?.ultimaInversionTotal != null);
  const definitivas = filas.filter((f) => f.proyecto?.definitiva);
  const bloqueadas = filas.filter((f) => f.def.estadoDocs !== 'Recibo y verificación localizados');
  const metricas = [
    [`${conProyecto.length} de ${filas.length}`, 'Ya tienen cotización creada en esta app'],
    [String(filas.length - conProyecto.length), 'Sin ninguna cotización todavía'],
    [String(calculadas.length), 'Ya calculadas (con inversión/ahorro)'],
    [String(definitivas.length), '✅ Marcadas como definitivas'],
    [String(bloqueadas.length), '⚠️ Con pendiente de documentación/identidad conocido'],
  ];
  for (const [valor, etiqueta] of metricas) {
    const m = document.createElement('div');
    m.className = 'metrica';
    m.innerHTML = `<div class="valor">${valor}</div><div class="etiqueta">${etiqueta}</div>`;
    cont.append(m);
  }
}

// Tarjetas apiladas (mismo componente visual `tarjeta-cliente` que usa el resto de la
// app para listas de clientes/proyectos, que si es responsivo) en vez de una tabla
// ancha -- una tabla de 10 columnas apretaba tanto el texto largo ("pendiente
// conocido") que se partia letra por letra en una pantalla normal.
function tarjetaLote40(fila) {
  const { def, cliente, proyecto } = fila;
  const estado = estadoCotizacionLote40(proyecto);
  const fechaEdicion = fechaUltimaEdicionManual(proyecto);
  const docsOk = def.reciboLocalizado && def.verificacionLocalizada;
  // Este texto SOLO describe si el documento fue LOCALIZADO en el filesystem del
  // usuario durante la recopilacion (lote40.js, catalogado 2026-10-23) -- nunca fue
  // un link ni carga nada, por eso el usuario reporto "no carga el recibo ni la
  // verificacion" al intentar abrirlo desde aqui (texto plano, sin <a>). El archivo
  // real solo existe en Supabase Storage si YA se subio dentro de ESTA cotizacion
  // (proyecto.archivosRecibo/archivosVerificacion, mismos que muestra la seccion 2/18
  // del analizador) -- esta app web (sin backend de archivos propio) no tiene forma
  // de leer `C:\RECIBOS GOBIERNO PUEBLA SFV\...` directo, asi que si el proyecto no
  // tiene esos archivos subidos todavia, no hay nada que esta pantalla pueda abrir
  // aunque el documento SI exista en disco.
  const docsTexto = `${def.reciboLocalizado ? '📄 recibo localizado' : '❌ sin recibo'} · ${def.verificacionLocalizada ? '🔍 verificación localizada' : '❌ sin verificación'}`;
  const div = document.createElement('div');
  div.className = 'tarjeta-cliente';
  if (!proyecto) div.classList.add('fila-pendiente-lote40'); // atenuado SIN tachado -- "no existe todavia", no "se excluyo a proposito"
  const chipClase = estado.clave === 'sin-crear' || estado.clave === 'sin-datos' || estado.clave === 'sin-calcular' ? 'chip-etapa-negociando' : 'chip-etapa-ganado';
  const cifras = proyecto?.ultimaInversionTotal != null
    ? `Inversión ${M(proyecto.ultimaInversionTotal)}${proyecto.ultimoAhorroAnual != null ? ' · Ahorro anual ' + M(proyecto.ultimoAhorroAnual) : ''} · `
    : '';
  // Si la tarifa del grupo vino del recibo (lote40.js) y NO de una cotizacion real ya
  // capturada en esta app, se avisa -- es la mejor estimacion disponible, no un dato
  // verificado por esta app todavia (ver tarifaEfectiva()).
  const tarifaConfirmadaEnApp = !!proyecto?.formulario?.tarifa;
  const avisoTarifa = !tarifaConfirmadaEnApp && def.tarifaDelRecibo
    ? `<span class="nota">📄 Tarifa ${escapeHtml(def.tarifaDelRecibo)} según su recibo -- todavía sin cotización en esta app que la confirme.</span>`
    : '';
  const info = document.createElement('div');
  info.className = 'tarjeta-cliente-info';
  info.innerHTML = `<strong>${def.id}. ${escapeHtml(def.inmueble)}</strong>` +
    `<span class="chip-etapa ${chipClase}">${estado.etiqueta}</span>` +
    (fechaEdicion
      ? `<span class="chip-etapa chip-etapa-ganado" title="Última edición manual de texto en esta cotización, ya guardada">✓ Editado ${escapeHtml(new Date(fechaEdicion).toLocaleDateString('es-MX'))} ${escapeHtml(new Date(fechaEdicion).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }))}</span>`
      : '') +
    `<span class="nota">RPU ${escapeHtml(def.rpu)}${def.rpuAlt ? ` (alt. ${escapeHtml(def.rpuAlt)})` : ''}` +
    (proyecto ? ` · ${escapeHtml(cliente.nombre)} · ${escapeHtml(proyecto.nombre)}` : '') + `</span>` +
    (proyecto ? `<span class="nota">${cifras}actualizado ${new Date(proyecto.actualizadoEn).toLocaleDateString('es-MX')}</span>` : '') +
    avisoTarifa +
    `<span class="nota${docsOk ? '' : ' aviso'}">${docsTexto}</span>` +
    (def.pendientes ? `<span class="nota">⚠️ ${escapeHtml(def.pendientes)}</span>` : '');
  div.append(info);
  // Links reales para VER el recibo/verificacion ya subidos a esta cotizacion (si
  // los hay) -- a diferencia de docsTexto arriba (solo describe si el documento
  // fue localizado en disco), esto SI abre el archivo real (Supabase Storage,
  // mismo que usa la seccion 2/18 del analizador dentro de index.html). Un
  // proyecto puede tener el recibo subido y la verificacion no (o viceversa), asi
  // que se revisan por separado.
  const archivosRecibo = proyecto?.archivosRecibo || [];
  const archivosVerificacion = proyecto?.archivosVerificacion || [];
  archivosRecibo.forEach((a, i) => {
    const link = document.createElement('a');
    link.className = 'btn-link';
    link.textContent = archivosRecibo.length > 1 ? `📄 Ver recibo ${i + 1}` : '📄 Ver recibo';
    link.href = a.url;
    link.target = '_blank';
    link.rel = 'noopener';
    div.append(link);
  });
  archivosVerificacion.forEach((a, i) => {
    const link = document.createElement('a');
    link.className = 'btn-link';
    link.textContent = archivosVerificacion.length > 1 ? `🔍 Ver verificación ${i + 1}` : '🔍 Ver verificación';
    link.href = a.url;
    link.target = '_blank';
    link.rel = 'noopener';
    div.append(link);
  });
  if (proyecto) {
    // Abre index.html en OTRA pestaña nueva, directo en esa cotización (ver el
    // bloque "?cliente=&proyecto=" en el arranque de app.js) -- no se puede llamar
    // abrirProyecto() de alla desde aqui, son paginas/contextos de JS distintos.
    const a = document.createElement('a');
    a.className = 'btn-link';
    a.textContent = 'Abrir';
    a.target = '_blank';
    a.rel = 'noopener';
    const base = `index.html?cliente=${encodeURIComponent(cliente.id)}&proyecto=${encodeURIComponent(proyecto.id)}`;
    a.href = base;
    div.append(a);
    // Botón "Editar" -- pedido explicito del usuario, 2026-11-20: varios estudios del
    // lote se generaron antes de correcciones recientes (líneas BT/FP de la sección 3,
    // franjas GDMTH, sección 9, aclaración PDBT) y el dueño los va a reabrir uno por
    // uno para recalcular/regenerar con el código vigente -- este es el atajo directo
    // a esa pasada. A diferencia de "PDF"/"Excel", aparece para CUALQUIER servicio con
    // proyecto (calculado o no, a propósito -- también hay estudios sin calcular que
    // necesitan completarse). Mismo mecanismo de enlace profundo (&editar=1, consumido
    // una sola vez en el arranque de app.js), que dentro de index.html deja el
    // formulario "Datos y recibo" visible/enfocado en vez de aterrizar solo en el
    // resumen -- no es un modo de edición nuevo, es la misma pantalla de siempre,
    // scrolleada a la sección donde se capturan/cambian los datos.
    const aEditar = document.createElement('a');
    aEditar.className = 'btn-link';
    aEditar.textContent = '✏️ Editar';
    aEditar.target = '_blank';
    aEditar.rel = 'noopener';
    aEditar.href = `${base}&editar=1`;
    div.append(aEditar);
    // Botones "PDF"/"Excel" directo desde el visor -- pedido explicito del usuario,
    // 2026-11-20: "sin tener que abrir cada proyecto". Mismo mecanismo de enlace
    // profundo que "Abrir" (&descargar=pdf|excel, consumido una sola vez en el
    // arranque de app.js) -- nunca otro generador/plantilla, es EL MISMO documento que
    // el botón manual produce dentro del proyecto. Solo se ofrecen si el estudio ya
    // tiene cifras calculadas; si no, no aparecen (nada que descargar todavía). El
    // visor sigue siendo de solo lectura: estos enlaces nunca escriben nada aquí, solo
    // abren index.html en otra pestaña.
    if (proyecto.ultimaInversionTotal != null) {
      const aPdf = document.createElement('a');
      aPdf.className = 'btn-link';
      aPdf.textContent = '⬇ PDF';
      aPdf.target = '_blank';
      aPdf.rel = 'noopener';
      aPdf.href = `${base}&descargar=pdf`;
      div.append(aPdf);

      const aExcel = document.createElement('a');
      aExcel.className = 'btn-link';
      aExcel.textContent = '⬇ Excel';
      aExcel.target = '_blank';
      aExcel.rel = 'noopener';
      aExcel.href = `${base}&descargar=excel`;
      div.append(aExcel);
    }
  } else {
    // Botón "+ Crear" -- pedido explicito del usuario, 2026-11-20: "a los que aparecen
    // sin crear ponles un boton de crear". Única escritura real de este visor (ver
    // nota del import arriba) -- crea un proyecto en blanco bajo el cliente "40
    // inmuebles" (mismo cliente que ya usan 18 de los 23 reales del lote, convención
    // dominante -- no se inventó una ni se adivinó por inmueble) con el nombre
    // "<RPU> <inmueble>" (mismo patrón "<rpu> <nombre>" que datosLote40() ya reconoce
    // por dígitos del RPU, así que el cruce de la próxima vez que se abra/recargue el
    // visor encuentra este proyecto solo, sin tocar nada más). Después de crear, abre
    // el proyecto nuevo en otra pestaña directo en el formulario (mismo &editar=1 que
    // "✏️ Editar") para subir el recibo de una vez, y refresca esta tarjeta en el
    // visor sin recargar la página completa.
    const aCrear = document.createElement('a');
    aCrear.className = 'btn-link';
    aCrear.textContent = '+ Crear';
    aCrear.href = '#';
    aCrear.addEventListener('click', (ev) => {
      ev.preventDefault();
      crearProyectoPendiente(def);
    });
    div.append(aCrear);
  }
  return div;
}

const NOMBRE_CLIENTE_LOTE_40 = '40 inmuebles';

function crearProyectoPendiente(def) {
  // Revisa de nuevo con datos frescos (no los de cuando se renderizó esta tarjeta) por
  // si otra pestaña ya creó este mismo proyecto mientras tanto -- evita un duplicado.
  const yaExiste = datosLote40().find((f) => f.def.id === def.id)?.proyecto;
  if (yaExiste) { render(); return; }
  let cliente = listarClientes().find((c) => c.nombre === NOMBRE_CLIENTE_LOTE_40);
  if (!cliente) cliente = crearCliente({ nombre: NOMBRE_CLIENTE_LOTE_40, tipo: 'Gobierno' });
  const proyecto = crearProyecto(cliente, { nombre: `${def.rpu} ${def.inmueble}` });
  window.open(`index.html?cliente=${encodeURIComponent(cliente.id)}&proyecto=${encodeURIComponent(proyecto.id)}&editar=1`, '_blank', 'noopener');
  render();
}

// Pedido explicito del usuario, 2026-11-14 (seguimiento): "permite agruparlos por
// tarifa... para que pueda ver los de una tarifa en especifico y luego cambie a la
// otra" -- el agrupado por tarifa ya existia (todas las tarifas a la vez, una debajo
// de otra), pero el usuario queria poder ELEGIR una sola tarifa a la vez y cambiar
// entre ellas. Primer intento con un <select> no funciono para el usuario ("no lo
// hace") -- pidio en su lugar "un boton donde seleccione que grupo de tarifas quiero
// solo ver", mismo patron de un boton por tarifa ya usado en "Cotizador por machote".
// `filtroTarifaActual` (modulo, no en el DOM) guarda la seleccion; los botones se
// regeneran cada vez que hay datos nuevos (recuentos por tarifa pueden cambiar si se
// crea una cotizacion), conservando la seleccion actual si la tarifa sigue existiendo.
let filtroTarifaActual = null;

function poblarBotonesTarifa(grupos) {
  const cont = document.getElementById('botonesTarifaLote40');
  cont.innerHTML = '';
  const tarifasDisponibles = grupos.filter((g) => g.tarifa !== null).map((g) => g.tarifa);
  if (filtroTarifaActual && !tarifasDisponibles.includes(filtroTarifaActual)) filtroTarifaActual = null;

  const total = grupos.reduce((s, g) => s + g.filas.length, 0);
  const btnTodas = document.createElement('button');
  btnTodas.className = `btn-secundario btn-filtro-tarifa${filtroTarifaActual === null ? ' activo' : ''}`;
  btnTodas.textContent = `Todas (${total})`;
  btnTodas.addEventListener('click', () => { filtroTarifaActual = null; renderTabla(datosLote40()); });
  cont.append(btnTodas);

  for (const { tarifa, etiqueta, filas } of grupos) {
    if (tarifa === null) continue; // "Sin tarifa capturada" no es un filtro elegible -- ya no deberia aparecer nunca (tarifaDelRecibo cubre los 40), pero por si acaso
    const btn = document.createElement('button');
    btn.className = `btn-secundario btn-filtro-tarifa${filtroTarifaActual === tarifa ? ' activo' : ''}`;
    btn.textContent = `${tarifa} (${filas.length})`;
    btn.title = etiqueta;
    btn.addEventListener('click', () => { filtroTarifaActual = tarifa; renderTabla(datosLote40()); });
    cont.append(btn);
  }
}

// Pedido explicito del usuario, 2026-11-23: "ponle la opcion descargar todos los pdf
// de gdmto y todos los excel y asi pdbt y gdmth igual directo a descargas sin abrilo
// con el numero de servicio al inicio de cada nombre" -- un boton por grupo de
// tarifa (GDMTO/PDBT/GDMTH/cualquier otra, todas igual, no hardcodeado por tarifa)
// que descarga TODOS los PDF o TODOS los Excel ya calculados de ese grupo, uno por
// uno, sin que el usuario tenga que dar clic "⬇ PDF"/"⬇ Excel" inmueble por inmueble.
//
// Como "Cotización completa"/"Excel" solo saben generarse leyendo el DOM YA
// RENDERIZADO de index.html (ver nota de generarPdfCotizacion en app.js), no hay
// forma de generarlos desde esta pagina sin abrir index.html de verdad.
//
// INTENTO ORIGINAL DESCARTADO, dejado documentado para no repetir el error: la
// primera version de esto abria index.html dentro de un <iframe> OCULTO -- se probo
// en vivo contra la produccion real y la pestaña se quedaba pegada en "about:blank"
// para siempre. Causa real: este sitio exige login con HTTP Basic Auth (header
// `WWW-Authenticate: Basic`, confirmado con curl), y Chrome por diseño de seguridad
// NUNCA reenvia credenciales de Basic Auth ya guardadas a un <iframe> (para que una
// pagina no pueda robar una sesion ajena embebiendola oculta) -- la navegacion del
// iframe simplemente nunca arranca, sin ningun error visible. Un <a target="_blank">
// o un window.open() normal (ventana de primer nivel) SI reusa las credenciales
// guardadas sin pedirlas de nuevo -- por eso los botones individuales "⬇ PDF"/
// "⬇ Excel" de cada tarjeta siempre funcionaron bien.
//
// Por eso esto reusa UNA SOLA ventana real (window.open, igual que "📋 Abrir"/
// "✏️ Editar" ya hacen) en vez de un iframe -- se abre una vez al empezar el grupo y
// se navega otra vez por cada proyecto (misma ventana, nunca una nueva por archivo),
// cerrandose sola al terminar todo el grupo. Mismo enlace profundo &descargar=pdf|excel
// que ya usan los botones individuales, con dos parametros nuevos: &prefijoArchivo=<RPU>
// (deja el no. de servicio al INICIO del nombre del archivo, el pedido explicito de
// esta vez) y &automatizado=1 (evita que un confirm()/alert() -- ej. "¿generar de
// todos modos?", candado de identidad de RPU -- deje esa ventana colgada para
// siempre: nadie puede hacer clic en el dialogo de una ventana que nadie esta
// viendo, asi que en automatizado=1 cualquier aviso se trata como cancelar, ver
// arrancar()/manejarDescargaPorEnlaceProfundo en app.js). doc.save()/la descarga del
// Excel van directo al navegador -- nunca se abre ningun visor dentro de esa ventana.
const NOMBRE_VENTANA_DESCARGA_MASIVA = 'cfeDescargaMasivaLote40';

function descargarUnoViaVentana(ventana, cliente, proyecto, rpu, tipo) {
  return new Promise((resolve) => {
    let terminado = false;
    let timer = null;
    const onMessage = (ev) => {
      if (ev.source !== ventana || !ev.data || !ev.data.cfeLote40Descarga) return;
      finalizar(!!ev.data.ok);
    };
    function finalizar(ok) {
      if (terminado) return;
      terminado = true;
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve(ok);
    }
    window.addEventListener('message', onMessage);
    // 35s de margen -- un estudio con recibo/verificación/fotos adjuntas descarga
    // imágenes remotas antes de armar el PDF, puede tardar más que uno sin archivos.
    timer = setTimeout(() => finalizar(false), 35000);
    ventana.location.href = `index.html?cliente=${encodeURIComponent(cliente.id)}&proyecto=${encodeURIComponent(proyecto.id)}` +
      `&descargar=${tipo}&prefijoArchivo=${encodeURIComponent(rpu)}&automatizado=1`;
  });
}

function elementoEstadoDescargaMasiva() {
  return document.getElementById('lote40DescargaMasivaEstado');
}

async function descargarTodosDeGrupo(filasGrupo, tipo, tituloGrupo) {
  const pendientes = filasGrupo.filter((f) => f.proyecto?.ultimaInversionTotal != null);
  const etiquetaTipo = tipo === 'pdf' ? 'PDF' : 'Excel';
  if (!pendientes.length) {
    alert(`${tituloGrupo}: ningún inmueble de este grupo tiene todavía una cotización calculada -- nada que descargar.`);
    return;
  }
  if (!confirm(`¿Descargar ${pendientes.length} ${etiquetaTipo} de "${tituloGrupo}" directo a tu carpeta de Descargas?\n\n` +
    'Se abre una ventana auxiliar que navega sola por cada cotización y se cierra al terminar -- no la cierres a mano ' +
    'mientras tanto, y puede tardar varios segundos por cada archivo.')) return;
  // Se abre AQUI, sincrono dentro del propio clic -- un window.open() disparado despues
  // de un await (ej. dentro del for de abajo) pierde el "gesto del usuario" y la mayoria
  // de navegadores lo bloquea como pop-up no solicitado.
  const ventana = window.open('about:blank', NOMBRE_VENTANA_DESCARGA_MASIVA, 'width=480,height=420');
  if (!ventana) {
    alert('El navegador bloqueó la ventana auxiliar de descarga -- permite ventanas emergentes para este sitio e inténtalo de nuevo.');
    return;
  }
  const estado = elementoEstadoDescargaMasiva();
  let ok = 0;
  const fallidos = [];
  for (let i = 0; i < pendientes.length; i++) {
    const f = pendientes[i];
    if (estado) {
      estado.hidden = false;
      estado.textContent = `⬇ Descargando ${etiquetaTipo} ${i + 1} de ${pendientes.length} (${f.def.inmueble})…`;
    }
    const exito = await descargarUnoViaVentana(ventana, f.cliente, f.proyecto, f.def.rpu, tipo);
    if (exito) ok++; else fallidos.push(f.def.inmueble);
  }
  ventana.close();
  if (estado) estado.hidden = true;
  let msg = `Listo: ${ok} de ${pendientes.length} ${etiquetaTipo} de "${tituloGrupo}" descargados a tu carpeta de Descargas.`;
  if (fallidos.length) {
    msg += `\n\nNo se pudieron descargar automáticamente (requieren revisión manual -- ábrelos uno por uno desde su ` +
      `tarjeta, probablemente hay un aviso pendiente que confirmar):\n${fallidos.map((n) => '• ' + n).join('\n')}`;
  }
  alert(msg);
}

function botonesDescargaMasivaGrupo(filasGrupo, tituloGrupo) {
  const cont = document.createElement('div');
  cont.className = 'acciones botones-descarga-masiva-lote40';
  const btnPdf = document.createElement('button');
  btnPdf.className = 'btn-secundario';
  btnPdf.textContent = '⬇ Descargar todos los PDF';
  btnPdf.addEventListener('click', () => descargarTodosDeGrupo(filasGrupo, 'pdf', tituloGrupo));
  const btnExcel = document.createElement('button');
  btnExcel.className = 'btn-secundario';
  btnExcel.textContent = '⬇ Descargar todos los Excel';
  btnExcel.addEventListener('click', () => descargarTodosDeGrupo(filasGrupo, 'excel', tituloGrupo));
  cont.append(btnPdf, btnExcel);
  return cont;
}

function renderTabla(filas) {
  const cont = document.getElementById('lote40Tabla');
  cont.innerHTML = '';
  const grupos = agruparLote40PorTarifa(filas);
  poblarBotonesTarifa(grupos);
  const gruposAMostrar = filtroTarifaActual ? grupos.filter((g) => g.tarifa === filtroTarifaActual) : grupos;

  for (const { tarifa, etiqueta, filas: filasGrupo } of gruposAMostrar) {
    const titulo = `${tarifa ? `Tarifa ${tarifa} — ${etiqueta}` : etiqueta} (${filasGrupo.length})`;
    const lista = document.createElement('div');
    lista.className = 'lista-clientes';
    for (const f of filasGrupo) lista.append(tarjetaLote40(f));

    // El grupo catch-all "Sin tarifa capturada todavia" se queda colapsado por
    // defecto (ver entrada anterior, 2026-11-14) -- pedido explicito del usuario
    // ("en el visor... esta todo en uno") porque, cuando aparece, suele ser el mas
    // grande por mucho y tapaba visualmente los grupos de tarifa real.
    if (tarifa === null) {
      const details = document.createElement('details');
      details.className = 'grupo-proyectos grupo-lote40-sin-tarifa';
      const summary = document.createElement('summary');
      summary.textContent = titulo;
      details.append(summary, lista);
      cont.append(details);
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'grupo-proyectos';
      const h4 = document.createElement('h4');
      h4.textContent = titulo;
      wrap.append(h4, botonesDescargaMasivaGrupo(filasGrupo, titulo), lista);
      cont.append(wrap);
    }
  }
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportarCsv() {
  const grupos = agruparLote40PorTarifa(datosLote40());
  const lineas = [['#', 'Inmueble', 'Tarifa', 'RPU', 'RPU alterno', 'Recibo localizado', 'Verificación localizada', 'Pendiente de documentación',
    'Cliente en esta app', 'Cotización en esta app', 'Estado de la cotización', 'Inversión', 'Ahorro anual', 'Actualizado', 'Última edición manual', 'Definitiva'].join(',')];
  for (const { tarifa, filas } of grupos) {
    for (const { def, cliente, proyecto } of filas) {
      const estado = estadoCotizacionLote40(proyecto);
      const fechaEdicion = fechaUltimaEdicionManual(proyecto);
      lineas.push([
        def.id, csvEscape(def.inmueble), csvEscape(tarifa || ''), def.rpu, csvEscape(def.rpuAlt || ''),
        def.reciboLocalizado ? 'Sí' : 'No', def.verificacionLocalizada ? 'Sí' : 'No', csvEscape(def.pendientes || ''),
        csvEscape(cliente?.nombre || ''), csvEscape(proyecto?.nombre || ''), csvEscape(estado.etiqueta),
        proyecto?.ultimaInversionTotal ?? '', proyecto?.ultimoAhorroAnual ?? '',
        proyecto ? csvEscape(new Date(proyecto.actualizadoEn).toLocaleDateString('es-MX')) : '',
        fechaEdicion ? csvEscape(new Date(fechaEdicion).toLocaleString('es-MX')) : '',
        proyecto?.definitiva ? 'Sí' : 'No',
      ].join(','));
    }
  }
  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `estado_lote_40_inmuebles_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function render() {
  const filas = datosLote40();
  renderTotales(filas);
  renderTabla(filas);
}

document.getElementById('btnRefrescarLote40').addEventListener('click', render);
document.getElementById('btnExportarLote40Csv').addEventListener('click', exportarCsv);
render();
