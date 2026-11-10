// Vista previa compartida por LINK -- pedido explicito del usuario, 2026-11-09:
// "puedes hacer un link para compartir y que tambien vea el colaborador la vista
// previa en tiempo real". A diferencia de vista-previa.html (mismo dispositivo,
// localStorage + evento 'storage'), esta pagina es PUBLICA (cualquiera con el link,
// en cualquier dispositivo) y lee de Supabase en vez de localStorage -- el editor
// (ver app.js, boton "🔗 Compartir vista previa en vivo") empuja el proyecto completo
// a la tabla `vista_compartida` cada vez que algo cambia; esta pagina hace POLLING de
// esa fila (no Supabase Realtime/websockets, para no sumar una dependencia nueva --
// consistente con el resto del proyecto, que ya usa fetch directo a PostgREST en vez
// del SDK supabase-js) y vuelve a renderizar cuando el timestamp `actualizado_en`
// cambia. La logica de renderizado real vive en vistaPreviaComun.js, compartida con
// vista-previa.html, para que las 2 nunca se desincronicen.
//
// Mismo modelo de seguridad que TODO el resto de este proyecto (envios_cliente,
// cliente.html, etc.): sin autenticacion, RLS abierta a la anon key -- cualquiera con
// el link ve los datos de esa cotizacion especifica. Decision consciente, ya aceptada
// por el usuario al pedir esta funcion.
import { supabaseListar } from './supabase.js';
import { construirRDesdeProyecto, renderEnContenedor, generarYMostrarPdf } from './vistaPreviaComun.js';

if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

const INTERVALO_POLLING_MS = 4000;
const params = new URLSearchParams(location.search);
const token = params.get('token');

const $ = (id) => document.getElementById(id);

let ultimoActualizadoEn = null;

async function cargarFila() {
  if (!token) return null;
  const filas = await supabaseListar('vista_compartida', `token=eq.${encodeURIComponent(token)}&select=*`);
  return filas && filas[0] ? filas[0] : null;
}

function render(fila) {
  const estado = $('estadoVistaPrevia');
  if (!fila) {
    $('contenedorSecciones').innerHTML = '';
    estado.textContent = 'Este link ya no está activo, o el vendedor todavía no ha compartido una cotización con él.';
    document.title = 'Vista previa compartida -- sin datos';
    window._vistaPreviaActual = null;
    return;
  }
  const proyecto = fila.proyecto;
  const r = construirRDesdeProyecto(proyecto);
  if (!r) {
    $('contenedorSecciones').innerHTML = '';
    estado.textContent = 'Esta cotización todavía no se ha calculado del lado del vendedor.';
    window._vistaPreviaActual = null;
    return;
  }
  document.title = `Vista previa -- ${fila.cliente_nombre || proyecto.nombre || 'Cotización'}`;
  $('tituloVistaPrevia').textContent = `${fila.cliente_nombre || ''} -- ${proyecto.nombre || ''}`;
  $('subtituloVistaPrevia').textContent = `${r.tarifa} · servicio ${r.noServicio || 'por confirmar'} · ${r.n} paneles de ${r.moduloWp} W`;
  estado.textContent = `Última actualización: ${new Date(fila.actualizado_en).toLocaleTimeString('es-MX')}`;
  renderEnContenedor(r);
  window._vistaPreviaActual = { cliente: { nombre: fila.cliente_nombre }, proyecto, r };
}

async function revisarYActualizar() {
  if (!token) {
    $('estadoVistaPrevia').textContent = 'Falta el token en el link (?token=...) -- pide al vendedor que te mande el link completo.';
    return;
  }
  try {
    const fila = await cargarFila();
    if (!fila) { render(null); ultimoActualizadoEn = null; return; }
    if (fila.actualizado_en === ultimoActualizadoEn) return; // nada nuevo, no re-renderizar de a gratis
    ultimoActualizadoEn = fila.actualizado_en;
    render(fila);
  } catch (err) {
    console.error('No se pudo consultar la vista compartida:', err);
    $('estadoVistaPrevia').textContent = 'No se pudo conectar para revisar actualizaciones -- revisa tu conexión. Reintentando solo...';
  }
}

$('btnRefrescarVistaPrevia').addEventListener('click', () => { ultimoActualizadoEn = null; revisarYActualizar(); });

$('btnGenerarPdfVistaPrevia').addEventListener('click', async () => {
  const datos = window._vistaPreviaActual;
  if (!datos) { alert('No hay una cotización calculada que generar.'); return; }
  const boton = $('btnGenerarPdfVistaPrevia');
  boton.disabled = true;
  const textoOriginal = boton.textContent;
  boton.textContent = 'Generando…';
  try {
    const nombreBase = `${datos.cliente.nombre || 'cliente'}_${datos.proyecto.nombre || 'cotizacion'}`.replace(/[^a-z0-9]+/gi, '_');
    await generarYMostrarPdf(datos.r, nombreBase);
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
});

revisarYActualizar();
setInterval(revisarYActualizar, INTERVALO_POLLING_MS);
