// Orquestador equivalente a leer_recibo()/extraer_texto() en app/leer_recibo.py:
// intenta el texto nativo del PDF primero; si no es legible (o es una foto/imagen),
// cae a OCR con Tesseract.js sobre un render de cada pagina.
//
// Seleccion por puntaje entre varias reconstrucciones del mismo texto nativo (pedido
// explicito del usuario, 2026-11-20: el recibo real GDMTH del Antiguo Edificio de
// Finanzas, 220890101496, se lee perfecto con la reconstruccion de siempre
// (reconstruirLineas, "Candidato A" de pdftext.js) cuando pdf.js entrega los items en
// el orden "esperado", pero si el mismo PDF entrega el stream con las columnas en otro
// orden, ese mismo candidato pierde periodo_kwh/dap/bonus_monto/subtotal_resumen y
// mezcla el domicilio con la caja de "Total a pagar" -- antes de esto, leerRecibo()
// aceptaba el primer candidato "legible" tal cual, sin comparar contra nada, y el
// usuario terminaba capturando a mano lo que se perdio. La correccion vive ENTERAMENTE
// en esta seleccion -- nunca en las regex de recibo.js ni en el motor: se generan 3
// reconstrucciones candidatas de los MISMOS items de pdf.js (ver
// extraerTextosCandidatosDeDocumento en pdftext.js) y se corre extraerCampos() sobre
// cada una, quedandose con la que mejor reconcilia -- usando la misma senal que ya
// existia para avisar al usuario (reconciliacion_diff, campos_no_encontrados), nunca
// una señal nueva inventada para este caso puntual.
import { abrirPdf, extraerTextosCandidatosDeDocumento } from './pdftext.js';
import { ocrImagen, renderizarPaginaComoCanvas } from './ocr.js';
import { extraerCampos, textoPareceLegible, quitarAcentos } from './recibo.js';

// Campos "criticos" para considerar una lectura PERFECTA -- no hace falta revisar a
// mano ni probar otro candidato. Base siempre: tarifa, dias y kWh del periodo. Para
// tarifas no domesticas (las unicas que trae la tabla de CONCEPTOS_TABLA de recibo.js)
// se agregan ademas los propios cargos de esa tarifa -- GDMTH factura la Energia
// partida en 3 franjas (Base/Intermedia/Punta) en vez de un solo renglon, asi que ahi
// se piden las 3 franjas en vez de 'energia'. Si la tarifa trae demanda contratada
// (GDMTO/GDMTH/GDBT), tambien se exige haber detectado la columna "$/kW" -- es el dato
// mas importante para no mezclar la doctrina de una tarifa con otra (ver
// tarifaDoctrina.js).
const TARIFAS_DOMESTICAS = new Set(['01', 'DAC']);
const TARIFAS_CON_DEMANDA = new Set(['GDMTO', 'GDMTH', 'GDBT']);
const CARGOS_BASE_NO_DOMESTICA = ['suministro', 'distribucion', 'transmision', 'cenace', 'capacidad', 'scnmem'];

export function camposCriticosFaltantes(campos) {
  const faltan = [];
  for (const k of ['tarifa', 'periodo_dias', 'periodo_kwh']) {
    if (campos[k] === null || campos[k] === undefined) faltan.push(k);
  }
  if (campos.tarifa && !TARIFAS_DOMESTICAS.has(campos.tarifa)) {
    for (const k of CARGOS_BASE_NO_DOMESTICA) {
      if (campos[k] === null || campos[k] === undefined) faltan.push(k);
    }
    const camposEnergia = campos.tarifa === 'GDMTH'
      ? ['energia_base', 'energia_intermedia', 'energia_punta']
      : ['energia'];
    for (const k of camposEnergia) {
      if (campos[k] === null || campos[k] === undefined) faltan.push(k);
    }
    if (TARIFAS_CON_DEMANDA.has(campos.tarifa) && campos.rate_kw_detectado == null) {
      faltan.push('rate_kw_detectado');
    }
  }
  return faltan;
}

export function esLecturaPerfecta(campos) {
  return campos.reconciliacion_diff === 0 && camposCriticosFaltantes(campos).length === 0;
}

// Puntaje de un candidato: (a) que tan cerca reconcilia (null = peor que cualquier
// numero, aunque sea grande -- un candidato que ni siquiera encontro el Subtotal
// impreso para comparar es peor que uno que SI lo encontro, aunque no cuadre exacto);
// (b) cuantos campos criticos SI encontro; (c) cuantos campos en general le faltaron.
function puntaje(campos) {
  const diff = campos.reconciliacion_diff;
  return {
    diffAbs: (diff === null || diff === undefined) ? Infinity : Math.abs(diff),
    criticosFaltantes: camposCriticosFaltantes(campos).length,
    noEncontrados: (campos.campos_no_encontrados || []).length,
  };
}

// true si `a` es estrictamente mejor que `b` segun el orden de criterios del encargo:
// (a) menor |reconciliacion_diff| primero, (b) mas campos criticos encontrados, (c)
// menos campos_no_encontrados en general.
function esMejorQue(a, b) {
  const pa = puntaje(a), pb = puntaje(b);
  if (pa.diffAbs !== pb.diffAbs) return pa.diffAbs < pb.diffAbs;
  if (pa.criticosFaltantes !== pb.criticosFaltantes) return pa.criticosFaltantes < pb.criticosFaltantes;
  return pa.noEncontrados < pb.noEncontrados;
}

// Elige el mejor de una lista de resultados de extraerCampos() ya calculados -- el
// primero que sea una lectura perfecta gana de inmediato (no hace falta seguir
// comparando); si ninguno lo es, gana el de mejor puntaje. Exportada aparte (no solo
// usada internamente) para poder probar la logica de seleccion sin pasar por pdf.js/
// OCR -- ver test_recibo.mjs.
export function elegirMejorCandidato(listaCampos) {
  let mejor = listaCampos[0];
  for (const c of listaCampos.slice(1)) {
    if (esMejorQue(c, mejor)) mejor = c;
  }
  return mejor;
}

function esPdf(file) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

// Prepara UN archivo: si es PDF, abre el documento una sola vez (pdf.js "transfiere" el
// ArrayBuffer que recibe getDocument() -- no se puede volver a llamar con el mismo
// buffer, pero el documento YA ABIERTO se puede reusar las veces que haga falta, tanto
// para los 3 candidatos nativos como para el OCR si hiciera falta mas adelante) y
// extrae los 3 candidatos de texto nativo. Si ninguno de los 3 "parece legible" (fuente
// codificada, o es una foto/escaneo sin capa de texto), hace OCR de una vez, igual que
// antes -- ese disparador ("no parece legible") no cambia, solo deja de ser el UNICO
// camino hacia el OCR (ver construirLecturaDeArchivos).
async function prepararArchivo(file) {
  if (!esPdf(file)) {
    return { candidatosNativos: null, textoOcr: await ocrImagen(file), usoOcr: true, pdf: null };
  }
  const buf = await file.arrayBuffer();
  const pdf = await abrirPdf(buf);
  const candidatos = await extraerTextosCandidatosDeDocumento(pdf);
  const legible = candidatos.some(t => t.trim().length >= 80 && textoPareceLegible(quitarAcentos(t).toUpperCase()));
  if (legible) return { candidatosNativos: candidatos, textoOcr: null, usoOcr: false, pdf };
  const partes = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const canvas = await renderizarPaginaComoCanvas(page, 2.5);
    partes.push(await ocrImagen(canvas));
  }
  return { candidatosNativos: null, textoOcr: partes.join('\n'), usoOcr: true, pdf };
}

async function ocrDeArchivoYaAbierto(preparado) {
  if (preparado.textoOcr !== null) return preparado.textoOcr; // ya se hizo OCR al prepararlo (no era legible)
  if (!preparado.pdf) return ''; // no deberia pasar (archivos sin pdf siempre traen textoOcr ya resuelto)
  const partes = [];
  for (let i = 1; i <= preparado.pdf.numPages; i++) {
    const page = await preparado.pdf.getPage(i);
    const canvas = await renderizarPaginaComoCanvas(page, 2.5);
    partes.push(await ocrImagen(canvas));
  }
  return partes.join('\n');
}

// Orquesta la lectura de uno o varios archivos del MISMO recibo (ver leerReciboMultiple
// mas abajo -- leerRecibo(file) es solo el caso de un archivo):
// 1. Si TODOS los archivos se leyeron nativamente, arma los 3 textos "por tipo de
//    candidato" (A de todos los archivos concatenado, B de todos, C de todos) y corre
//    extraerCampos sobre A. Si A ya es una lectura perfecta, se devuelve tal cual --
//    el caso comun (la gran mayoria de los recibos) queda identico a como era antes,
//    sin ningun trabajo extra.
// 2. Si A no es perfecta, tambien se corre extraerCampos sobre B y C, y gana el de
//    mejor puntaje de los 3.
// 3. Si ese mejor candidato (100% nativo) TODAVIA no es una lectura perfecta -- o si
//    algun archivo no tuvo ningun candidato nativo legible --, tambien se hace OCR
//    (de los archivos que todavia no lo tuvieran) y se compara ese resultado contra lo
//    mejor que ya se tenia; gana el de mejor puntaje entre los dos. El disparador de
//    "intentar OCR" sigue siendo el mismo de siempre (texto no legible) MAS este caso
//    nuevo (texto legible pero que no reconcilia ni con el mejor de los 3 candidatos) --
//    pero el OCR ya no gana automaticamente solo por existir, tiene que ganar por
//    puntaje como cualquier otro candidato.
async function construirLecturaDeArchivos(preparados) {
  const todosNativos = preparados.every(p => p.candidatosNativos !== null);
  let mejorNativo = null;
  if (todosNativos) {
    const textoA = preparados.map(p => p.candidatosNativos[0]).join('\n');
    const campoA = extraerCampos(textoA, false);
    if (esLecturaPerfecta(campoA)) return campoA;
    const textoB = preparados.map(p => p.candidatosNativos[1]).join('\n');
    const textoC = preparados.map(p => p.candidatosNativos[2]).join('\n');
    mejorNativo = elegirMejorCandidato([campoA, extraerCampos(textoB, false), extraerCampos(textoC, false)]);
    if (esLecturaPerfecta(mejorNativo)) return mejorNativo;
  }
  // Hace falta OCR: o algun archivo nunca tuvo lectura nativa legible (mismo disparador
  // de siempre), o el mejor candidato 100% nativo sigue sin reconciliar/le faltan
  // campos criticos (disparador nuevo). Se usa el texto OCR que cada archivo YA tenga
  // (los que no fueron legibles lo calcularon al prepararse) y se completa el que falte.
  const textosOcr = [];
  for (const p of preparados) textosOcr.push(await ocrDeArchivoYaAbierto(p));
  const campoOcr = extraerCampos(textosOcr.join('\n'), true);
  if (!mejorNativo) return campoOcr; // ningun archivo tuvo candidato nativo legible -- igual que antes
  return elegirMejorCandidato([mejorNativo, campoOcr]);
}

export async function leerRecibo(file) {
  return leerReciboMultiple([file]);
}

// Lee VARIOS archivos de un mismo recibo (pedido explicito del usuario: a veces el
// recibo llega partido en 2 fotos, ej. anverso/reverso o mitad de arriba/abajo). Se
// extrae el texto de cada archivo por separado y se concatena ANTES de buscar los
// campos una sola vez -- asi un dato que solo aparece en la segunda foto (ej. la
// tabla de desglose) se detecta igual que si viniera en un solo documento. El orden
// de los archivos es el orden en que se seleccionaron/arrastraron.
export async function leerReciboMultiple(files) {
  const preparados = [];
  for (const file of files) preparados.push(await prepararArchivo(file));
  return construirLecturaDeArchivos(preparados);
}
