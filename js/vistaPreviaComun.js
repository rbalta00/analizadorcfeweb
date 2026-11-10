// Logica COMPARTIDA entre las 2 paginas de vista previa -- pedido explicito del
// usuario, 2026-11-09: primero "que se vea en otra ventana/pantalla" (vista-previa.html,
// localStorage + evento 'storage', mismo dispositivo), despues "que tambien vea el
// colaborador la vista previa en tiempo real" (vista-previa-compartida.html, Supabase +
// polling, cualquier dispositivo con el link). Las dos paginas renderizan EXACTAMENTE
// el mismo documento a partir de un `proyecto` ya guardado -- solo cambia DE DONDE sacan
// ese `proyecto` y COMO se enteran de que cambio. Esta pieza central vive aqui para que
// nunca se desincronicen.
import { construirResultado } from './resultado.js';
import { renderSeccion, ordenSeccionesEfectivo, seccionTieneDatos } from './secciones.js';
import { archivoAImagenComprimida } from './imagenes.js';
import { COSTOS_RESIDENCIAL, COSTOS_COMERCIAL } from './motor.js';

// construirResultado() NO acepta proyecto.formulario tal cual -- espera el objeto
// "input" ya derivado que leerInputCalculo() (app.js) arma leyendo el formulario EN
// VIVO (rateKw/btPct/fpBonusPct calculados, costos resuelto a un objeto, etc.), no el
// snapshot crudo que guarda leerFormulario()/leerFormularioRecibo(). Estas paginas no
// tienen ningun formulario -- se reconstruye el mismo "input" a partir del snapshot
// YA GUARDADO, replicando exactamente la misma derivacion que leerInputCalculo(), sin
// tocar el DOM. Bug real encontrado construyendo vista-previa.html: sin esto,
// construirResultado() tronaba (ErrorDeClasificacion: "rate_kw es obligatorio").
export function construirInputDesdeFormulario(f, proyecto) {
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

// A partir de un `proyecto` guardado (formulario + todo el estado de edicion/apagado),
// arma el mismo `r` que usan secciones.js/propuesta.js -- mismos campos que
// calcularYRenderizar() copia en app.js, para no desincronizarse nunca.
export function construirRDesdeProyecto(proyecto) {
  if (!proyecto || !proyecto.formulario) return null;
  const input = construirInputDesdeFormulario(proyecto.formulario, proyecto);
  const r = construirResultado(input);
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
  return r;
}

const noop = () => {};

// Renderiza `r` dentro de #contenedorSecciones (debe existir en el DOM de la pagina
// que llama esto). Las secciones apagadas se QUITAN del todo (a diferencia del editor,
// que las deja atenuadas a proposito para que Isaac las siga viendo -- ver
// VISION_Y_REQUISITOS.md seccion 5): esta vista representa "como queda la cotizacion"
// para alguien de AFUERA (Isaac en su otra pantalla, o un colaborador), no el panel de
// edicion. contentEditable se apaga de verdad (no solo visualmente) para que un clic
// accidental no parezca que "guarda" algo -- los callbacks que recibe renderSeccion()
// aqui son siempre no-ops.
export function renderEnContenedor(r, contenedorId = 'contenedorSecciones') {
  const cont = document.getElementById(contenedorId);
  cont.innerHTML = '';
  if (!r) return;
  const numeros = ordenSeccionesEfectivo(r).filter((n) => seccionTieneDatos(n, r));
  numeros.forEach((n) => {
    const art = renderSeccion(n, r, null, noop, noop, noop, noop, noop, noop, noop, noop, noop);
    cont.append(art);
  });
  cont.querySelectorAll(':scope > .seccion.seccion-apagada').forEach((el) => el.remove());
  cont.querySelectorAll('[contenteditable="true"]').forEach((el) => { el.contentEditable = 'false'; });
}

// Descarga y comprime los archivos adjuntos (recibo/verificacion) para embeberlos en
// el PDF -- mismo patron que prepararDocumentosAdjuntosParaPdf()/
// archivoAdjuntoAImagenPdf() en app.js (no se importa de ahi porque app.js arranca
// codigo que asume los elementos del editor completo, importarlo aqui tronaria).
// Requiere que la pagina que llama esto haya cargado lib/pdf.min.js Y configurado
// window.pdfjsLib.GlobalWorkerOptions.workerSrc -- bug real encontrado 2026-11-09:
// vista-previa.html solo cargaba jsPDF (para generar) pero no pdf.js (para LEER un
// adjunto que sea PDF, el caso mas comun), asi que la foto se omitia en silencio.
async function convertirArchivosParaPdf(archivos) {
  const out = [];
  for (const a of archivos || []) {
    if (!a.url) continue;
    try {
      const resp = await fetch(a.url);
      if (!resp.ok) throw new Error(`No se pudo descargar "${a.nombre}" (HTTP ${resp.status}).`);
      const blob = await resp.blob();
      const file = new File([blob], a.nombre || 'documento', { type: a.tipo || blob.type });
      out.push(await archivoAImagenComprimida(file, { maxAncho: 1800, calidad: 0.8 }));
    } catch (err) {
      console.error('No se pudo preparar un documento adjunto para el PDF:', err);
    }
  }
  return out;
}

// Genera el PDF real (generarPdfCompletaDesdeVista, la MISMA funcion que usa el
// editor, nunca una copia) y lo muestra en un iframe dentro de `visorId`, con boton de
// descarga. Requiere que `r` ya se haya renderizado en #contenedorSecciones (lee ese
// DOM directo, igual que el editor).
export async function generarYMostrarPdf(r, nombreArchivoBase, visorId = 'visorVistaPrevia') {
  r._archivosReciboImgs = await convertirArchivosParaPdf(r.archivosRecibo);
  r._archivosVerificacionImgs = await convertirArchivosParaPdf(r.archivosVerificacion);
  const { generarPdfCompletaDesdeVista } = await import('./propuesta.js');
  const doc = generarPdfCompletaDesdeVista(r);
  const blobUrl = doc.output('bloburl');
  const visor = document.getElementById(visorId);
  visor.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.src = blobUrl;
  iframe.className = 'iframe-pdf';
  const btnDescargar = document.createElement('button');
  btnDescargar.className = 'btn-primario';
  btnDescargar.textContent = 'Descargar PDF';
  btnDescargar.addEventListener('click', () => doc.save(`Cotizacion_${nombreArchivoBase}.pdf`));
  const acciones = document.createElement('div');
  acciones.className = 'acciones';
  acciones.append(btnDescargar);
  visor.append(acciones, iframe);
  visor.scrollIntoView({ behavior: 'smooth' });
  return doc;
}
