// Pagina publica donde un cliente carga sus propios datos de recibo CFE (sin pasar por
// la app interna de Isaac). Lo primero que elige es su tarifa (pedido explicito del
// usuario); el resto del formulario reusa EXACTAMENTE la misma logica/ids que la app
// principal (formularioRecibo.js) para no duplicar nada. Al enviar, el envio se guarda
// en Supabase (tabla envios_cliente) para que aparezca en la bandeja de entrada del
// panel interno -- esta pagina NUNCA toca el localStorage del cliente ni necesita que
// tenga nada instalado.
import { leerReciboMultiple } from './leerRecibo.js';
import {
  esDomestica, conectarEventosFormularioRecibo, leerFormularioRecibo, llenarFormularioDesdeReciboCampos,
} from './formularioRecibo.js';
import { supabaseInsertar } from './supabase.js';

window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

const $ = (id) => document.getElementById(id);

// Mismo mapeo que usa la app interna para resaltar en naranja los campos que el
// lector de recibo no pudo detectar solo.
const CAMPO_A_INPUT = {
  tarifa: 'tarifa', periodo_dias: 'periodoDias', periodo_kwh: 'periodoKwh', dap: 'dap',
  suministro: 'c_suministro', distribucion: 'c_distribucion', transmision: 'c_transmision',
  cenace: 'c_cenace', energia: 'c_energia', capacidad: 'c_capacidad', scnmem: 'c_scnmem',
  energia_base: 'c_energia_base', energia_intermedia: 'c_energia_intermedia', energia_punta: 'c_energia_punta',
};
const ETIQUETA_CAMPO = {
  tarifa: 'Tarifa', periodoDias: 'Días del período', periodoKwh: 'kWh del período', dap: 'DAP',
  c_suministro: 'Suministro', c_distribucion: 'Distribución', c_transmision: 'Transmisión',
  c_cenace: 'CENACE', c_energia: 'Energía', c_capacidad: 'Capacidad', c_scnmem: 'SCnMEM',
  c_energia_base: 'Energía Base', c_energia_intermedia: 'Energía Intermedia', c_energia_punta: 'Energía Punta',
};
function marcarCamposNoDetectados(campos) {
  document.querySelectorAll('.campo-no-detectado').forEach(el => el.classList.remove('campo-no-detectado'));
  for (const campo of campos.campos_no_encontrados || []) {
    const inputId = CAMPO_A_INPUT[campo];
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

$('tarifa').addEventListener('change', () => {
  $('restoFormularioCliente').hidden = !$('tarifa').value;
});
conectarEventosFormularioRecibo();

$('archivoRecibo').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
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
    llenarFormularioDesdeReciboCampos(campos);
    // Solo contar como "faltante" lo que de verdad tiene una casilla que marcar --
    // campos_no_encontrados tambien trae cosas internas sin input propio (multiplicador,
    // demanda_contratada_kw, historial_anual_kwh/meses_cubiertos) que antes se colaban
    // en este mensaje diciendo "quedaron marcados en naranja" sin que nada se marcara
    // de verdad. Bug real encontrado por el usuario probando un recibo real.
    const faltantes = (campos.campos_no_encontrados || []).filter(k => CAMPO_A_INPUT[k]);
    estadoEl.className = campos.uso_ocr ? 'nota' : 'nota ok';
    estadoEl.textContent = (campos.uso_ocr
      ? 'Leímos tu recibo (tuvimos que usar reconocimiento de imagen, revisa los datos con cuidado).'
      : 'Leímos tu recibo directamente.')
      + (faltantes.length
          ? ` Hay datos que no detectamos solos, quedaron marcados en naranja abajo: ${faltantes.map(k => ETIQUETA_CAMPO[CAMPO_A_INPUT[k]] || k).join(', ')}.`
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
});

$('btnEnviar').addEventListener('click', async () => {
  const estadoEl = $('estadoEnvio');
  const tarifa = $('tarifa').value;
  if (!tarifa) { estadoEl.className = 'nota aviso'; estadoEl.textContent = 'Elige tu tarifa arriba antes de enviar.'; return; }
  const f = leerFormularioRecibo();
  const dom = esDomestica(tarifa);
  const periodoDias = Number(dom ? f.dPeriodoDias : f.periodoDias);
  const periodoKwh = Number(dom ? f.dPeriodoKwh : f.periodoKwh);
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
    const fila = {
      nombre_declarado: nombre,
      telefono_declarado: $('telefonoDeclarado').value.trim() || null,
      notas_cliente: $('notasCliente').value.trim() || null,
      tarifa,
      es_domestica: dom,
      periodo_dias: periodoDias,
      periodo_kwh: periodoKwh,
      dap: Number(dom ? f.dDap : f.dap) || 0,
      cargos: dom ? null : f.cargos,
      rate_kw: dom ? null : { distribucion: f.rkDist === 'demanda' ? 1 : 0, capacidad: f.rkCap === 'demanda' ? 1 : 0 },
      bt_monto: f.traeBt && !dom ? (Number(f.btMonto) || 0) : 0,
      bonus_monto: f.traeBonus && !dom ? (Number(f.bonusMonto) || 0) : 0,
      escalones: dom ? { basicoKwh: f.dBasicoKwh, basicoRate: f.dBasicoRate, interKwh: f.dInterKwh, interRate: f.dInterRate, excedRate: f.dExcedRate } : null,
      historial: (dom ? f.historialDom : f.historialNoDom).filter(v => v != null).map(Number),
      campos_leidos: ultimoLeido,
      uso_ocr: ultimoLeido ? !!ultimoLeido.uso_ocr : false,
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
