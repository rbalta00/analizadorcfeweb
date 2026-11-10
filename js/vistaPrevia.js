// Vista previa en ventana/pestaña aparte -- pedido explicito del usuario, 2026-11-09:
// "yo uso dos pantallas, en una pongo el editor... y en la otra que se abra y se vea
// la pagina de previsualizacion". Se abre desde un boton del editor (ver app.js,
// "🖥️ Abrir vista previa en otra ventana"), pasando cliente/proyecto por la URL.
//
// NO es el PDF real -- es la MISMA informacion ya calculada y editada, dibujada con
// el mismo motor de secciones (secciones.js, sin reinventar nada), con un estilo que
// imita hojas A4 y los colores del PDF real (pdfComponents.js) para parecerse lo mas
// posible. El usuario acepto explicitamente que no sea pixel-perfecto a la paginacion
// real -- lo que SI tiene que ser fiel al pie de la letra es el PDF mismo (el boton
// "📄 Generar PDF" de esta pagina llama exactamente a la misma funcion real,
// generarPdfCompletaDesdeVista, no una copia).
//
// Se actualiza SOLA cuando el editor (en la otra ventana) guarda algo -- el evento
// nativo 'storage' del navegador avisa a CUALQUIER OTRA pestaña/ventana del MISMO
// origen cuando cambia una llave de localStorage (nunca a la pestaña que hizo el
// cambio) -- exactamente el caso de "2 ventanas, edito en una, veo en la otra". No
// hace falta ningun servidor ni polling.
import { obtenerCliente, obtenerProyecto } from './clientes.js';
import { construirResultado } from './resultado.js';
import { renderSeccion, ordenSeccionesEfectivo, seccionTieneDatos } from './secciones.js';
import { archivoAImagenComprimida } from './imagenes.js';
import { COSTOS_RESIDENCIAL, COSTOS_COMERCIAL } from './motor.js';

// construirResultado() NO acepta proyecto.formulario tal cual -- espera el objeto
// "input" ya derivado que leerInputCalculo() (app.js) arma leyendo el formulario EN
// VIVO (rateKw/btPct/fpBonusPct calculados, costos resuelto a un objeto, etc.), no el
// snapshot crudo que guarda leerFormulario()/leerFormularioRecibo(). Esta pagina no
// tiene ningun formulario -- se reconstruye el mismo "input" a partir del snapshot
// YA GUARDADO, replicando exactamente la misma derivacion que leerInputCalculo(),
// sin tocar el DOM. Bug real encontrado probando esta misma pagina: sin esto,
// construirResultado() tronaba (ErrorDeClasificacion: "rate_kw es obligatorio").
function construirInputDesdeFormulario(f, proyecto) {
  const tarifa = f.tarifa || 'GDMTO';
  const esDom = tarifa === '01' || tarifa === 'DAC';
  const costos = f.escalaCostos === 'residencial' ? COSTOS_RESIDENCIAL : COSTOS_COMERCIAL;
  const moduloWp = Number(f.moduloWp ?? 605);
  const cobertura = Number(f.cobertura ?? 1.0);
  const horasUtiles = Number(f.horasUtiles ?? 4.5);
  const escalamientoPct = Number(f.escalamiento ?? 4.0);
  const titular = f.titular || 'Cliente';
  const domicilio = f.domicilio || '';
  const noServicio = f.noServicio || '';
  const aplicaIsr = !!f.aplicaIsr;
  const tasaIsrPct = Number(f.tasaIsr ?? 30);
  const vigenciaDias = Number(f.vigenciaDias) || 15;
  const inmueble = proyecto.inmueble || null;
  const leido = proyecto.campos || null;
  const historialCrudo = esDom ? (f.historialDom || []) : (f.historialNoDom || []);
  const historialManual = historialCrudo.filter((v) => v != null).map(Number);

  if (!esDom) {
    const periodoDias = Number(f.periodoDias);
    const periodoKwh = Number(f.periodoKwh);
    const dap = Number(f.dap);
    const cr = f.cargos || {};
    const cargos = {
      suministro: Number(cr.suministro), distribucion: Number(cr.distribucion),
      transmision: Number(cr.transmision), cenace: Number(cr.cenace),
      capacidad: Number(cr.capacidad), scnmem: Number(cr.scnmem),
    };
    if (tarifa === 'GDMTH') {
      cargos.energia_base = Number(cr.energiaBase);
      cargos.energia_intermedia = Number(cr.energiaIntermedia);
      cargos.energia_punta = Number(cr.energiaPunta);
    } else {
      cargos.energia = Number(cr.energia);
    }
    const rateKw = {
      distribucion: f.rkDist === 'demanda' ? 1.0 : 0.0,
      capacidad: f.rkCap === 'demanda' ? 1.0 : 0.0,
    };
    const baseAprox = Object.values(cargos).reduce((a, b) => a + b, 0) || 1.0;
    const traeBt = !!f.traeBt, traeBonus = !!f.traeBonus, traeRecargoFp = !!f.traeRecargoFp;
    const btMonto = Number(f.btMonto), bonusMonto = Number(f.bonusMonto), recargoFpMonto = Number(f.recargoFpMonto);
    const btPct = traeBt ? btMonto / baseAprox : 0.0;
    const fpBonusPct = traeBonus ? bonusMonto / (baseAprox + btMonto) : 0.0;
    const recargoFpPct = traeRecargoFp ? recargoFpMonto / (baseAprox + btMonto) : 0.0;
    return { titular, domicilio, noServicio, tarifa, esDomestica: false, periodoDias, periodoKwh, dap, cargos,
      rateKw, btPct, fpBonusPct, recargoFpPct, moduloWp, cobertura, horasUtiles, costos, escalamientoPct, leido, inmueble,
      aplicaIsr, tasaIsrPct, historialManual, vigenciaDias };
  }
  const periodoDias = Number(f.dPeriodoDias);
  const periodoKwh = Number(f.dPeriodoKwh);
  const escalones = [
    [Number(f.dBasicoKwh), Number(f.dBasicoRate)],
    [Number(f.dInterKwh), Number(f.dInterRate)],
    [null, Number(f.dExcedRate)],
  ];
  return { titular, domicilio, noServicio, tarifa, esDomestica: true, periodoDias, periodoKwh, escalones,
    dapDomestica: Number(f.dDap), cargoFijoDomestica: Number(f.dCargoFijo),
    moduloWp, cobertura, horasUtiles, costos, escalamientoPct, leido, inmueble,
    aplicaIsr, tasaIsrPct, historialManual, vigenciaDias };
}

const params = new URLSearchParams(location.search);
const clienteId = params.get('cliente');
const proyectoId = params.get('proyecto');

const $ = (id) => document.getElementById(id);

function cargarDatos() {
  const cliente = clienteId ? obtenerCliente(clienteId) : null;
  const proyecto = cliente && proyectoId ? obtenerProyecto(cliente, proyectoId) : null;
  if (!cliente || !proyecto || !proyecto.formulario) return null;
  const input = construirInputDesdeFormulario(proyecto.formulario, proyecto);
  const r = construirResultado(input);
  // Mismos campos que calcularYRenderizar() copia en app.js -- la vista previa lee
  // exactamente el mismo estado de edicion/apagado que ya esta guardado, nunca
  // recalcula nada por su cuenta.
  r.seccionesActivas = proyecto.seccionesActivas;
  r.seccionesExcluidas = proyecto.seccionesExcluidas || [];
  r.graficosExcluidos = proyecto.graficosExcluidos || [];
  r.tablaColumnasOcultas = proyecto.tablaColumnasOcultas || {};
  r.tablaFilasOcultas = proyecto.tablaFilasOcultas || {};
  r.calculosActivos = proyecto.calculosActivos || [];
  r.ordenSecciones = proyecto.ordenSecciones || null;
  r.textosEditados = proyecto.textosEditados || {};
  r.textosOcultos = proyecto.textosOcultos || {};
  r.fotoSembrado = proyecto.fotoSembrado || null;
  r.fotosInmueble = proyecto.fotosInmueble || [];
  r.archivosRecibo = proyecto.archivosRecibo || null;
  r.archivosVerificacion = proyecto.archivosVerificacion || null;
  return { cliente, proyecto, r };
}

const noop = () => {};

function render() {
  const datos = cargarDatos();
  const cont = $('contenedorSecciones');
  const estado = $('estadoVistaPrevia');
  if (!datos) {
    cont.innerHTML = '';
    estado.textContent = 'No se encontró esta cotización, o todavía no se ha calculado -- ábrela en el editor y pulsa "Calcular" primero.';
    document.title = 'Vista previa -- sin datos';
    return null;
  }
  const { cliente, proyecto, r } = datos;
  document.title = `Vista previa -- ${proyecto.nombre || 'Cotización'}`;
  $('tituloVistaPrevia').textContent = `${cliente.nombre} -- ${proyecto.nombre}`;
  $('subtituloVistaPrevia').textContent = `${r.tarifa} · servicio ${r.noServicio || 'por confirmar'} · ${r.n} paneles de ${r.moduloWp} W`;
  estado.textContent = `Última actualización: ${new Date().toLocaleTimeString('es-MX')}`;
  cont.innerHTML = '';
  const numeros = ordenSeccionesEfectivo(r).filter((n) => seccionTieneDatos(n, r));
  numeros.forEach((n) => {
    const art = renderSeccion(n, r, null, noop, noop, noop, noop, noop, noop, noop, noop, noop);
    cont.append(art);
  });
  // Las secciones apagadas (bloque completo o individuales) se quedan en el DOM
  // dimmed en el editor a proposito (ver VISION_Y_REQUISITOS.md, seccion 5) -- pero
  // esta vista previa representa "como queda la cotizacion", no el editor, asi que
  // aqui SI se ocultan por completo (mismo filtro de clase que ya usa
  // generarPdfCompletaDesdeVista para decidir que entra al PDF real).
  cont.querySelectorAll(':scope > .seccion.seccion-apagada').forEach((el) => el.remove());
  // Apagar la edicion de verdad (no solo visualmente) -- un clic accidental aqui no
  // debe parecer que "guarda" nada, porque los callbacks de arriba son no-ops.
  cont.querySelectorAll('[contenteditable="true"]').forEach((el) => { el.contentEditable = 'false'; });
  window._vistaPreviaActual = { cliente, proyecto, r };
  return { cliente, proyecto, r };
}

// Se dispara en ESTA pestaña cuando OTRA pestaña/ventana del mismo origen cambia
// localStorage -- exactamente el caso de "edito en el editor, veo aqui". No se
// dispara en la pestaña que hizo el cambio (limitacion nativa del evento 'storage',
// por eso el editor nunca necesita saber que esta vista existe).
window.addEventListener('storage', (ev) => {
  if (!ev.key || ev.key === 'cfe_clientes_v1') render();
});

$('btnRefrescarVistaPrevia').addEventListener('click', () => render());

$('btnGenerarPdfVistaPrevia').addEventListener('click', async () => {
  const datos = window._vistaPreviaActual;
  if (!datos) { alert('No hay una cotización calculada que generar.'); return; }
  const boton = $('btnGenerarPdfVistaPrevia');
  boton.disabled = true;
  const textoOriginal = boton.textContent;
  boton.textContent = 'Generando…';
  try {
    const { proyecto, r } = datos;
    // Mismo paso previo que btnGenerarPdf en app.js (prepararDocumentosAdjuntosParaPdf):
    // baja y comprime las imagenes de recibo/verificacion ANTES de generar, para que
    // las paginas 17/18 (documento adjunto) salgan completas. Duplicado aqui (en vez
    // de importado de app.js) a proposito -- app.js tiene codigo de arranque que
    // asume los elementos del editor completo, importarlo aqui tronaria.
    async function convertirTodos(archivos) {
      const out = [];
      for (const a of archivos || []) {
        try { out.push(await archivoAImagenComprimida(a.url ? await (async () => {
          const resp = await fetch(a.url);
          if (!resp.ok) throw new Error(`No se pudo descargar "${a.nombre}" (HTTP ${resp.status}).`);
          const blob = await resp.blob();
          return new File([blob], a.nombre || 'documento', { type: a.tipo || blob.type });
        })() : null, { maxAncho: 1800, calidad: 0.8 })); }
        catch (err) { console.error('No se pudo preparar un documento adjunto para el PDF:', err); }
      }
      return out;
    }
    r._archivosReciboImgs = await convertirTodos(proyecto.archivosRecibo);
    r._archivosVerificacionImgs = await convertirTodos(proyecto.archivosVerificacion);
    const { generarPdfCompletaDesdeVista } = await import('./propuesta.js');
    const doc = generarPdfCompletaDesdeVista(r);
    const nombreBase = `${datos.cliente.nombre}_${proyecto.nombre}`.replace(/[^a-z0-9]+/gi, '_');
    const blobUrl = doc.output('bloburl');
    const visor = $('visorVistaPrevia');
    visor.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.src = blobUrl;
    iframe.className = 'iframe-pdf';
    const btnDescargar = document.createElement('button');
    btnDescargar.className = 'btn-primario';
    btnDescargar.textContent = 'Descargar PDF';
    btnDescargar.addEventListener('click', () => doc.save(`Cotizacion_${nombreBase}.pdf`));
    const acciones = document.createElement('div');
    acciones.className = 'acciones';
    acciones.append(btnDescargar);
    visor.append(acciones, iframe);
    visor.scrollIntoView({ behavior: 'smooth' });
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
});

render();
