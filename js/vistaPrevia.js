// Vista previa en ventana/pestaña aparte, EN ESTE MISMO DISPOSITIVO -- pedido
// explicito del usuario, 2026-11-09: "yo uso dos pantallas, en una pongo el editor...
// y en la otra que se abra y se vea la pagina de previsualizacion". Se abre desde un
// boton del editor (ver app.js, "🖥️ Abrir vista previa en otra ventana"), pasando
// cliente/proyecto por la URL. La logica de renderizado real vive en
// vistaPreviaComun.js, compartida con vista-previa-compartida.html (el link para un
// colaborador en OTRO dispositivo) -- aqui solo queda de DONDE sale el dato
// (localStorage) y COMO se entera de que cambio (evento 'storage').
//
// NO es el PDF real -- el usuario acepto explicitamente que no sea pixel-perfecto a
// la paginacion real. Lo que SI tiene que ser fiel es el PDF mismo (el boton
// "📄 Generar PDF" de esta pagina llama a generarPdfCompletaDesdeVista, nunca una copia).
//
// Se actualiza SOLA cuando el editor (en la otra ventana) guarda algo -- el evento
// nativo 'storage' del navegador avisa a CUALQUIER OTRA pestaña/ventana del MISMO
// origen cuando cambia una llave de localStorage (nunca a la pestaña que hizo el
// cambio) -- exactamente el caso de "2 ventanas, edito en una, veo en la otra". No
// hace falta ningun servidor ni polling.
import { obtenerCliente, obtenerProyecto } from './clientes.js';
import { construirRDesdeProyecto, renderEnContenedor, generarYMostrarPdf } from './vistaPreviaComun.js';

// Bug real reportado por el usuario, 2026-11-09: "cuando le di generar pdf no se ven
// la foto del recibo y de la verificacion en sitio" -- causa: el recibo casi siempre
// se sube como PDF (no foto), y leerlo requiere window.pdfjsLib (ver
// convertirArchivosParaPdf en vistaPreviaComun.js). `lib/pdf.min.js` se agrego en
// vista-previa.html; aqui se configura el worker, mismo patron que app.js/clienteForm.js.
if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

const params = new URLSearchParams(location.search);
const clienteId = params.get('cliente');
const proyectoId = params.get('proyecto');

const $ = (id) => document.getElementById(id);

function render() {
  const estado = $('estadoVistaPrevia');
  const cliente = clienteId ? obtenerCliente(clienteId) : null;
  const proyecto = cliente && proyectoId ? obtenerProyecto(cliente, proyectoId) : null;
  const r = proyecto ? construirRDesdeProyecto(proyecto) : null;
  if (!cliente || !proyecto || !r) {
    $('contenedorSecciones').innerHTML = '';
    estado.textContent = 'No se encontró esta estudio, o todavía no se ha calculado -- ábrela en el editor y pulsa "Calcular" primero.';
    document.title = 'Vista previa -- sin datos';
    window._vistaPreviaActual = null;
    return;
  }
  document.title = `Vista previa -- ${proyecto.nombre || 'Estudio'}`;
  $('tituloVistaPrevia').textContent = `${cliente.nombre} -- ${proyecto.nombre}`;
  $('subtituloVistaPrevia').textContent = `${r.tarifa} · servicio ${r.noServicio || 'por confirmar'} · ${r.n} paneles de ${r.moduloWp} W`;
  estado.textContent = `Última actualización: ${new Date().toLocaleTimeString('es-MX')}`;
  renderEnContenedor(r);
  window._vistaPreviaActual = { cliente, proyecto, r };
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
  if (!datos) { alert('No hay una estudio calculada que generar.'); return; }
  const boton = $('btnGenerarPdfVistaPrevia');
  boton.disabled = true;
  const textoOriginal = boton.textContent;
  boton.textContent = 'Generando…';
  try {
    const nombreBase = `${datos.cliente.nombre}_${datos.proyecto.nombre}`.replace(/[^a-z0-9]+/gi, '_');
    await generarYMostrarPdf(datos.r, nombreBase);
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
});

render();
