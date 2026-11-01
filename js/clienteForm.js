// Pagina publica donde un cliente carga sus propios datos de recibo CFE (sin pasar por
// la app interna de Isaac). Lo primero que elige es su tarifa (pedido explicito del
// usuario); a partir de eso aparece el formulario PROPIO de esa tarifa (tambien pedido
// explicito -- "cada tarifa tenga su propio formulario para que no te confundas"), ver
// formulariosPorTarifa.js. Al enviar, el envio se guarda en Supabase (tabla
// envios_cliente) para que aparezca en la bandeja de entrada del panel interno -- esta
// pagina NUNCA toca el localStorage del cliente ni necesita que tenga nada instalado.
import { leerReciboMultiple } from './leerRecibo.js';
import {
  esDomestica, inicializarFormulariosPorTarifa, mostrarFormularioTarifa, leerFormularioTarifa,
  llenarFormularioTarifaDesdeRecibo, idDeCampo, TARIFAS_SOPORTADAS,
} from './formulariosPorTarifa.js';
import { supabaseInsertar, supabaseSubirArchivo } from './supabase.js';
import { prepararArchivosParaSubir } from './archivosAPdf.js';

window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

const $ = (id) => document.getElementById(id);

const ETIQUETA_CAMPO = {
  periodo_dias: 'Días del período', periodo_kwh: 'kWh del período', dap: 'DAP',
  suministro: 'Suministro', distribucion: 'Distribución', transmision: 'Transmisión',
  cenace: 'CENACE', energia: 'Energía', capacidad: 'Capacidad', scnmem: 'SCnMEM',
  energia_base: 'Energía Base', energia_intermedia: 'Energía Intermedia', energia_punta: 'Energía Punta',
};
function marcarCamposNoDetectados(campos) {
  document.querySelectorAll('.campo-no-detectado').forEach(el => el.classList.remove('campo-no-detectado'));
  const tarifa = $('tarifa').value;
  for (const campo of campos.campos_no_encontrados || []) {
    if (campo === 'tarifa') continue;
    const inputId = idDeCampo(tarifa, campo);
    const el = inputId && $(inputId);
    if (el) el.classList.add('campo-no-detectado');
  }
}
document.addEventListener('input', (e) => {
  if (e.target.classList && e.target.classList.contains('campo-no-detectado')) {
    e.target.classList.remove('campo-no-detectado');
  }
});

let ultimoLeido = null; // ultimo extraerCampos() -- se manda junto al envio para que el panel vea el detalle
// Acumulador de archivos seleccionados -- un <input type=file> no se puede "editar"
// (su FileList es de solo lectura), asi que se mantiene esta copia propia para poder
// quitar uno solo si el cliente se equivoco de foto, sin perder los demas ya
// seleccionados. Mismo patron que archivosReciboAcumulados en la app interna (app.js).
let archivosAcumulados = [];

function renderListaArchivosCliente() {
  const cont = $('listaArchivosCliente');
  cont.innerHTML = '';
  cont.hidden = !archivosAcumulados.length;
  archivosAcumulados.forEach((f, i) => {
    const fila = document.createElement('div');
    fila.className = 'fila-archivo-recibo';
    const nombre = document.createElement('span');
    nombre.textContent = '📎 ' + f.name;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn-link'; btn.textContent = '🗑 Quitar';
    btn.title = 'Quitar este archivo para volver a adjuntar el correcto';
    btn.addEventListener('click', () => quitarArchivoCliente(i));
    fila.append(nombre, btn);
    cont.append(fila);
  });
}

// Quita un archivo de la lista y vuelve a leer los que queden (si no queda ninguno,
// solo limpia el estado -- no se borra lo que el cliente ya escribio a mano).
async function quitarArchivoCliente(indice) {
  archivosAcumulados = archivosAcumulados.filter((_, i) => i !== indice);
  renderListaArchivosCliente();
  if (archivosAcumulados.length) {
    await procesarArchivosCliente(archivosAcumulados);
  } else {
    $('estadoRecibo').textContent = 'Quitaste todas las fotos/archivos. Puedes adjuntar de nuevo o llenar los datos a mano.';
    $('estadoRecibo').className = 'nota';
    $('avisoReconciliacion').hidden = true;
  }
}

inicializarFormulariosPorTarifa('contenedorFormulariosTarifa');
$('tarifa').addEventListener('change', () => {
  const tarifa = $('tarifa').value;
  $('restoFormularioCliente').hidden = !tarifa;
  if (tarifa) mostrarFormularioTarifa(tarifa);
});

async function procesarArchivosCliente(files) {
  const estadoEl = $('estadoRecibo');
  $('avisoReconciliacion').hidden = true;
  estadoEl.className = 'nota';
  estadoEl.textContent = files.length > 1
    ? `Leyendo ${files.length} archivos de tu recibo (puede tardar hasta 1 minuto por foto)...`
    : 'Leyendo tu recibo (puede tardar hasta 1 minuto)...';
  $('archivoRecibo').disabled = true;
  try {
    const campos = await leerReciboMultiple(files);
    ultimoLeido = campos;
    // Si el recibo trae la tarifa impresa y detectable, elegimos esa tarifa por el
    // cliente y mostramos SU formulario antes de llenarlo -- sin esto, llenar campos
    // de una tarifa que todavia no es la seleccionada no tendria efecto (esos inputs
    // ni siquiera existen en el DOM hasta que mostrarFormularioTarifa los revela).
    if (campos.tarifa && TARIFAS_SOPORTADAS.includes(campos.tarifa)) {
      $('tarifa').value = campos.tarifa;
      $('tarifa').dispatchEvent(new Event('change'));
    }
    const tarifaActual = $('tarifa').value;
    if (tarifaActual) llenarFormularioTarifaDesdeRecibo(tarifaActual, campos);
    // Solo contar como "faltante" lo que de verdad tiene una casilla que marcar en la
    // tarifa actual -- campos_no_encontrados tambien trae cosas internas sin input
    // propio (multiplicador, demanda_contratada_kw, historial_anual_kwh/meses_cubiertos)
    // que antes se colaban en este mensaje diciendo "quedaron marcados en naranja" sin
    // que nada se marcara de verdad. Bug real encontrado por el usuario probando un
    // recibo real -- el filtro se mantiene, ahora via idDeCampo().
    const faltantes = (campos.campos_no_encontrados || [])
      .filter(k => k !== 'tarifa' && tarifaActual && idDeCampo(tarifaActual, k));
    estadoEl.className = campos.uso_ocr ? 'nota' : 'nota ok';
    estadoEl.textContent = (campos.uso_ocr
      ? 'Leímos tu recibo (tuvimos que usar reconocimiento de imagen, revisa los datos con cuidado).'
      : 'Leímos tu recibo directamente.')
      + (faltantes.length
          ? ` Hay datos que no detectamos solos, quedaron marcados en naranja abajo: ${faltantes.map(k => ETIQUETA_CAMPO[k] || k).join(', ')}.`
          : ' ¡Todo se detectó!');
    if (campos.reconciliacion_advertencia) {
      $('avisoReconciliacion').hidden = false;
      $('avisoReconciliacion').textContent = '🛑 Algo no cuadra en lo que leímos de tu recibo -- revisa los datos abajo con cuidado antes de enviar.';
    }
    marcarCamposNoDetectados(campos);
  } catch (err) {
    estadoEl.className = 'nota';
    estadoEl.textContent = 'No pudimos leer tu recibo automáticamente: ' + err.message + ' Llena los datos a mano abajo.';
    console.error(err);
  } finally {
    $('archivoRecibo').disabled = false;
  }
}

$('archivoRecibo').addEventListener('change', async (e) => {
  const nuevos = Array.from(e.target.files || []);
  if (!nuevos.length) return;
  e.target.value = ''; // permite volver a usar el mismo input para agregar otra foto despues
  archivosAcumulados = archivosAcumulados.concat(nuevos);
  renderListaArchivosCliente();
  await procesarArchivosCliente(archivosAcumulados);
});

$('btnEnviar').addEventListener('click', async () => {
  const estadoEl = $('estadoEnvio');
  const tarifa = $('tarifa').value;
  if (!tarifa) { estadoEl.className = 'nota aviso'; estadoEl.textContent = 'Elige tu tarifa arriba antes de enviar.'; return; }
  const f = leerFormularioTarifa(tarifa);
  const dom = esDomestica(tarifa);
  const periodoDias = Number(f.periodoDias);
  const periodoKwh = Number(f.periodoKwh);
  if (!periodoDias || !periodoKwh) {
    estadoEl.className = 'nota aviso';
    estadoEl.textContent = 'Faltan los días y/o los kWh del período -- revisa la sección 3 antes de enviar.';
    return;
  }
  const nombre = $('nombreDeclarado').value.trim();
  if (!nombre) { estadoEl.className = 'nota aviso'; estadoEl.textContent = 'Escribe tu nombre antes de enviar.'; return; }

  $('btnEnviar').disabled = true;
  estadoEl.className = 'nota';
  estadoEl.textContent = 'Enviando...';
  try {
    // Sube el/los archivo(s) originales del recibo (no solo los datos ya leidos) para
    // que Isaac pueda verlos/descargarlos despues desde el panel -- si la subida falla
    // (ej. sin internet un momento), no se bloquea el envio de los datos ya extraidos.
    // Las fotos (no los PDF que ya eran PDF) se combinan primero en un solo PDF --
    // pedido explicito del usuario, "para trabajar mejor" -- antes de subir a Supabase
    // Storage (decision del usuario: Supabase alcanza, no hace falta Cloudinary).
    let archivosSubidos = [];
    if (archivosAcumulados.length) {
      estadoEl.textContent = 'Preparando tu(s) archivo(s)...';
      const paraSubir = await prepararArchivosParaSubir(archivosAcumulados, nombre.replace(/[^\w\- ]+/g, '').trim() || 'recibo');
      estadoEl.textContent = 'Subiendo tu recibo...';
      const resultados = await Promise.allSettled(paraSubir.map(f => supabaseSubirArchivo('envios', f)));
      archivosSubidos = resultados.filter(r => r.status === 'fulfilled').map(r => r.value);
    }
    estadoEl.textContent = 'Enviando...';
    const fila = {
      nombre_declarado: nombre,
      telefono_declarado: $('telefonoDeclarado').value.trim() || null,
      notas_cliente: $('notasCliente').value.trim() || null,
      tarifa,
      es_domestica: dom,
      periodo_dias: periodoDias,
      periodo_kwh: periodoKwh,
      dap: Number(f.dap) || 0,
      cargos: dom ? null : f.cargos,
      rate_kw: dom ? null : f.rateKw,
      bt_monto: f.traeBt && !dom ? (Number(f.btMonto) || 0) : 0,
      bonus_monto: f.traeBonus && !dom ? (Number(f.bonusMonto) || 0) : 0,
      escalones: dom ? f.escalones : null,
      historial: (f.historial || []).filter(v => v != null).map(Number),
      campos_leidos: ultimoLeido,
      uso_ocr: ultimoLeido ? !!ultimoLeido.uso_ocr : false,
      archivos: archivosSubidos.length ? archivosSubidos : null,
    };
    await supabaseInsertar('envios_cliente', fila);
    $('restoFormularioCliente').hidden = true;
    $('tarjetaIntro').hidden = true;
    $('tarjetaConfirmacion').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    estadoEl.className = 'nota aviso';
    estadoEl.textContent = 'No se pudo enviar: ' + err.message + ' Intenta de nuevo en un momento.';
    console.error(err);
  } finally {
    $('btnEnviar').disabled = false;
  }
});

$('linkOtroEnvio').addEventListener('click', (e) => {
  e.preventDefault();
  location.reload();
});
