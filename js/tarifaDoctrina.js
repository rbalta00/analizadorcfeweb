// Fuente unica de la doctrina de clasificacion por tarifa -- Parte C del encargo
// 2026-11-19 ("Cotizacion 40", COBAEB Plantel 26 San Salvador Chachapa, PDBT, servicio
// 217991104461): el documento entregado decia "Tarifa GDMTO: Gran Demanda de Media
// tension Ordinaria..." y aplicaba la doctrina de demanda de GDMTO (Distribucion y
// Capacidad nunca bajan porque se facturan por kW) sobre un recibo PDBT real, donde
// esos mismos conceptos SI bajan (se facturan por kWh, no por demanda contratada).
//
// Causa raiz confirmada leyendo el codigo: secciones.js/propuesta.js/resumen.js ya
// calculaban el texto de clasificacion de forma dinamica a partir de r.tarifa/
// r.meta.tieneDemandaContratada (nunca de un valor fijo) -- pero 3 huecos reales
// hacian que la doctrina de GDMTO/demanda se filtrara IGUAL en un documento PDBT:
//   1. razonSiReducible() (secciones.js) explicaba por que Distribucion/Capacidad SI
//      bajan en una tarifa sin demanda citando LITERALMENTE "GDMTO/GDMTH" como
//      ejemplo de lo contrario -- el nombre de otra tarifa aparecia dentro del propio
//      documento PDBT.
//   2. El parrafo "Tarifa X. <razon>" de la seccion/pagina "Que cargos pueden
//      disminuir" (secciones.js s04, propuesta.js pagina04, resumen.js) escribia "No
//      tiene demanda contratada: ..." en el caso SIN demanda -- la frase prohibida
//      aparecia hasta en la oracion que la estaba NEGANDO.
//   3. Varias etiquetas/notas fijas (mapa de que dato alimenta que calculo, tabla de
//      trazabilidad del recibo, checklist de pendientes) mencionaban "demanda
//      contratada" como boilerplate para CUALQUIER tarifa, sin condicionar a si esta
//      tarifa en particular la tiene.
// Ademas, el mecanismo de "machotes" (clientes.js: aplicarMachoteAProyecto) copia
// `textosEditados` del machote origen a la estudio nueva filtrando solo cifras/
// identidad/conclusiones comparativas -- nunca detecto que un parrafo editado a mano
// mencionara la tarifa/doctrina de OTRA tarifa, asi que un machote verificado de
// GDMTO aplicado (a falta de uno propio de PDBT, ver MACHOTE_ENTRE_TARIFAS.md) podia
// dejar ese texto contaminado sin ningun aviso. detectarTextosTarifaCruzada() de aqui
// cierra ese hueco -- se usa tanto para avisar en el panel de "plantilla sin
// verificar" (app.js) como para BLOQUEAR la exportacion de PDF/Excel si algo asi
// sigue sin resolverse.

import { listaConceptos, NOMBRES_CONCEPTO } from './util.js';

// Parrafo "Tarifa X. <razon>" de la seccion/pagina "Que cargos pueden disminuir" --
// UNA sola fuente para secciones.js (s04), propuesta.js (pagina04) y resumen.js
// (resumen ejecutivo), para que nunca puedan decir cosas distintas sobre la misma
// tarifa (Parte C.1 del encargo). A proposito, la rama SIN demanda contratada nunca
// debe mencionar "demanda contratada" (ni negandola) ni el nombre de una tarifa CON
// demanda (GDMTO/GDMTH/GDBT) -- ese fue exactamente el defecto real.
export function razonCargosPuedenDisminuir(r) {
  if (r.tarifa === 'GDMTH') {
    return 'Tiene demanda contratada: Distribución y Capacidad se facturan por kW y no bajan aunque la energía ' +
      'neta llegue a cero. Además, la Energía Punta tampoco baja (motivo distinto: es horario, no demanda -- ver ' +
      'la sección "Cómo se forma lo que paga a CFE").';
  }
  if (r.meta.tieneDemandaContratada) {
    return 'Tiene demanda contratada: Distribución y Capacidad se facturan por kW, no por kWh, y no bajan aunque ' +
      'la energía neta llegue a cero.';
  }
  return 'No tiene cargo fijo por potencia contratada: prácticamente toda la factura se factura por kWh ' +
    'consumido, por lo que casi todo baja con la energía solar.';
}

// Texto corto (sin "Tarifa X." al frente) para resumen.js, que ya trae su propio
// encabezado "Clasificación {tarifa}: ...". Misma doctrina que razonCargosPuedenDisminuir,
// solo con la redaccion recortada para caber en una linea del resumen de 1 pagina.
export function razonCargosPuedenDisminuirCorta(r) {
  if (r.meta.tieneDemandaContratada) {
    return `tiene demanda contratada, así que ${listaConceptos(r.meta.noReducibles || [])} se mantienen aunque se cubra el 100% del consumo con paneles`;
  }
  return 'no tiene cargo fijo por potencia contratada, así que casi todo el recibo es reducible con paneles';
}

// Corrección 6 (encargo 2026-11-19, "7 correcciones de salida"): el párrafo "En
// palabras simples" de la sección "Cómo se forma lo que paga a CFE" (secciones.js s03,
// propuesta.js pagina03) explica Suministro/Distribución/Transmisión/CENACE/Energía/
// Capacidad/SCnMEM con el mismo texto para CUALQUIER tarifa -- correcto para GDMTO/
// GDMTH/GDBT (ahí Distribución y Capacidad SÍ se facturan por demanda contratada), pero
// incompleto para PDBT: en esa tarifa esos 2 conceptos NO tienen cargo de demanda,
// se facturan por kWh igual que Energía, y por eso SÍ bajan con los paneles (ya
// calculado así, correctamente, por el motor -- ver r.meta.reducibles). Sin esta
// aclaración, un lector de PDBT podía confundirse con el texto genérico, que suena a
// que Distribución/Capacidad son "cargos aparte" sin aclarar si bajan o no. UNA sola
// fuente para ambos generadores (secciones.js/propuesta.js), mismo criterio que
// razonCargosPuedenDisminuir() arriba -- regresa cadena vacía para cualquier tarifa
// que no sea PDBT, para no tener que acordarse de excluirla en cada llamador.
export function aclaracionPalabrasSimplesPdbt(r) {
  if (r.tarifa !== 'PDBT') return '';
  return ' En esta tarifa, Distribución y Capacidad NO son cargos por demanda: son componentes del precio de cada ' +
    'kWh consumido, por eso sí disminuyen con los paneles. El único cargo que no baja es Suministro.';
}

// Tarifas CON demanda contratada conocidas por este motor (ver motor.js
// TARIFAS_CON_DEMANDA) -- usadas solo para detectar que un documento mencione el
// NOMBRE de una de ellas cuando la tarifa real del estudio es otra. Se excluye '01'
// a proposito: es un codigo demasiado generico (coincide con cualquier numeracion,
// "Paso 01", "01 de 25", etc.) para buscarlo como token sin producir falsos positivos.
const TARIFAS_CONOCIDAS_PARA_CANDADO = ['GDMTO', 'GDMTH', 'GDBT', 'PDBT', 'DAC'];

// Frases que solo tienen sentido en una tarifa CON demanda contratada -- si aparecen
// en el texto de un estudio SIN demanda contratada, es casi seguro que vienen de un
// texto editado a mano o heredado de un machote de otra tarifa, nunca del texto
// generico de hoy (que ya evita estas frases para tarifas sin demanda).
const FRASES_DOCTRINA_DEMANDA = ['demanda contratada', 'por kw, no por kwh', 'por kw y no por kwh', 'se factura por kw'];

// Simetrico al de arriba: frases que solo tienen sentido en una tarifa SIN demanda
// contratada (PDBT, 01, DAC) -- si aparecen en un estudio que SI tiene demanda
// contratada (GDMTO/GDMTH/GDBT), es el mismo defecto al reves (ej. un machote de PDBT
// aplicado sobre un estudio GDMTH). Encargo 2026-11-19 (GDMTH, caso Antiguo Edificio de
// la Secretaria de Finanzas), Parte B.3: "un estudio GDMTH no puede ... contener
// doctrina de otra tarifa (<<no tiene cargos por demanda>>, textos de GDMTO/PDBT)".
const FRASES_DOCTRINA_SIN_DEMANDA = [
  'no tiene cargo fijo por potencia contratada', 'no tiene cargos por demanda',
  'sin cargo fijo por potencia', 'no tiene demanda contratada',
];

export function mencionaOtraTarifa(texto, tarifaActual) {
  const up = texto.toUpperCase();
  return TARIFAS_CONOCIDAS_PARA_CANDADO.some((t) => {
    if (t === tarifaActual) return false;
    // Limite de palabra manual (sin \b, que en JS no distingue bien algunos casos con
    // numeros pegados) -- el caracter antes/despues del match, si existe, no debe ser
    // otra letra/digito, para no confundir "GDBT" dentro de otra palabra mas larga.
    const re = new RegExp(`(^|[^A-Z0-9])${t}([^A-Z0-9]|$)`);
    return re.test(up);
  });
}

function contieneAlguna(texto, frases) {
  const bajo = texto.toLowerCase();
  return frases.some((f) => bajo.includes(f));
}

// Evaluador puro (Parte 1/2 del encargo 2026-11-20, "Autocorrección de textos con
// doctrina de otra tarifa"): compara UN texto contra la tarifa/clasificacion DESTINO,
// sin necesitar el resultado completo `r` -- asi lo puede reusar tanto
// detectarTextosTarifaCruzada() (abajo, con r.tarifa/r.meta ya calculados) como
// aplicarMachoteAProyecto() (clientes.js, que solo conoce proyecto.formulario.tarifa
// del estudio nuevo, antes de que exista ningun `r`). Regresa null si el texto no
// tiene ningun conflicto, o {motivo} si si.
export function evaluarTextoTarifaCruzada(texto, tarifaDestino, tieneDemandaDestino) {
  if (typeof texto !== 'string' || !texto.trim() || !tarifaDestino) return null;
  const otraTarifa = mencionaOtraTarifa(texto, tarifaDestino);
  // Solo es un conflicto real si la doctrina NO corresponde a la clasificacion REAL
  // de la tarifa destino -- en GDMTO/GDMTH/GDBT la doctrina de demanda es correcta (no
  // se marca), y en PDBT/01/DAC la doctrina de "sin demanda" es correcta (no se marca).
  const doctrinaDemandaIndebida = !tieneDemandaDestino && contieneAlguna(texto, FRASES_DOCTRINA_DEMANDA);
  const doctrinaSinDemandaIndebida = tieneDemandaDestino && contieneAlguna(texto, FRASES_DOCTRINA_SIN_DEMANDA);
  if (!otraTarifa && !doctrinaDemandaIndebida && !doctrinaSinDemandaIndebida) return null;
  const motivos = [];
  if (otraTarifa) motivos.push(`menciona el nombre de otra tarifa distinta a ${tarifaDestino}`);
  if (doctrinaDemandaIndebida) motivos.push('describe "demanda contratada" / facturación por kW, pero este recibo no tiene demanda contratada');
  if (doctrinaSinDemandaIndebida) motivos.push('describe una tarifa sin cargo fijo por potencia, pero este recibo SÍ tiene demanda contratada');
  return { motivo: motivos.join(' y ') };
}

// Candado de consistencia (Parte A.4/B del encargo 2026-11-19): revisa el texto
// EDITADO a mano de un estudio (textosEditados -- parrafos, titulos, celdas de tabla)
// contra la tarifa Y la clasificacion real de ESTE estudio (r.tarifa /
// r.meta.tieneDemandaContratada), en AMBAS direcciones (doctrina de demanda en un
// estudio sin demanda, o doctrina de "sin demanda" en un estudio con demanda -- ej.
// machote de PDBT aplicado sobre GDMTH). Regresa la lista de conflictos encontrados,
// vacia si no hay ninguno. NO revisa el texto generico/por-defecto (ese ya se corrigio
// en el propio codigo, Parte A/C de este mismo archivo) -- solo lo que alguien
// escribio a mano o llego copiado de un machote de otra tarifa, que es exactamente
// donde puede quedar un texto cruzado sin que el codigo lo regenere solo.
export function detectarTextosTarifaCruzada(r, textosEditados) {
  const conflictos = [];
  if (!r || !r.tarifa || !r.meta) return conflictos;
  const tieneDemanda = !!r.meta.tieneDemandaContratada;
  for (const [id, texto] of Object.entries(textosEditados || {})) {
    if (typeof texto !== 'string' || !texto.trim()) continue;
    const resultado = evaluarTextoTarifaCruzada(texto, r.tarifa, tieneDemanda);
    if (!resultado) continue;
    conflictos.push({ id, texto, motivo: resultado.motivo });
  }
  return conflictos;
}

// Parte 1 del encargo 2026-11-20 ("Autocorrección de textos con doctrina de otra
// tarifa"): saneamiento automatico, puro (sin tocar localStorage/DOM) para que app.js
// lo pueda llamar en el camino normal de abrir/calcular un proyecto y decidir solo, sin
// duplicar aqui la logica de donde guardar. Caso real que motivo esto (COBAEP Plantel
// 26, PDBT 217991104461): el candado ya DETECTABA el texto cruzado (candado de
// exportacion, confirmarSinTextoTarifaCruzadaAntesDeExportar en app.js) pero obligaba a
// restaurar texto por texto a mano -- esto cura el proyecto solo, en cuanto se calcula
// con la tarifa real del recibo. NUNCA reescribe el texto (eso seguiria contando como
// "editado" para el candado) -- solo QUITA la entrada de textosEditados, para que el
// parrafo vuelva a mostrar el texto generico correcto de esta tarifa (ya construido por
// las funciones de arriba de este mismo archivo). Regresa el objeto de textos YA
// saneado (nueva referencia, nunca muta el que se le paso) + la lista de lo que se quitó,
// para que el llamador decida si guardar/avisar (vacia si no habia nada que sanear).
export function sanearTextosTarifaCruzada(r, textosEditados) {
  const conflictos = detectarTextosTarifaCruzada(r, textosEditados);
  if (!conflictos.length) return { textosEditados: textosEditados || {}, restaurados: [] };
  const saneado = { ...(textosEditados || {}) };
  for (const c of conflictos) delete saneado[c.id];
  return { textosEditados: saneado, restaurados: conflictos.map((c) => ({ id: c.id, motivo: c.motivo })) };
}

// Parte 2 del encargo "Arreglar la conclusión vieja y los textos guardados"
// (2026-11-20): dos parrafos de DOCTRINA -- la lista de "qué baja / qué no baja" de la
// §4 (secciones.js s04) y la aclaración PDBT del "En palabras simples" de la §3
// (secciones.js s03) -- tienen como fuente única este archivo. Si un texto editado
// guardado para ESOS párrafos (identificados por su forma fija, nunca por id, para que
// esto funcione sin importar en qué id secuencial hayan quedado guardados) CONTRADICE
// la clasificación vigente para la tarifa/recibo de este estudio, se restaura.
// Deliberadamente SEPARADO de evaluarTextoTarifaCruzada()/detectarTextosTarifaCruzada()
// de arriba (el candado de exportación y aplicarMachoteAProyecto siguen usando SOLO
// esas, sin cambios -- "el candado... queda como está, esto es saneamiento previo, no
// otro candado"); app.js corre AMBOS saneamientos en la misma pasada, con el mismo
// aviso y el mismo registro de auditoría.

// §4: "Lo que SÍ baja: <lista>. Lo que NO baja: <lista>." (ver secciones.js s04) --
// forma FIJA, por eso se puede verificar sin interpretar prosa libre: si algún
// concepto que SÍ baja en este recibo (r.meta.reducibles) no aparece mencionado en la
// parte "SÍ baja" del texto guardado, o si algún concepto que NO baja (r.meta.noReducibles)
// sí aparece ahí, hay contradicción.
function evaluarTextoListaReducibles(texto, r) {
  const m = /^Lo que SÍ baja:\s*([^.]*)\./i.exec(texto.trim());
  if (!m) return null; // no es este parrafo -- no se interpreta nada mas
  const siBaja = m[1].toLowerCase();
  const faltantes = (r.meta.reducibles || []).filter((k) => !siBaja.includes((NOMBRES_CONCEPTO[k] || k).toLowerCase()));
  const indebidos = (r.meta.noReducibles || []).filter((k) => siBaja.includes((NOMBRES_CONCEPTO[k] || k).toLowerCase()));
  if (!faltantes.length && !indebidos.length) return null;
  const detalles = [];
  if (faltantes.length) detalles.push(`omite ${listaConceptos(faltantes)}, que sí baja en este recibo`);
  if (indebidos.length) detalles.push(`incluye ${listaConceptos(indebidos)}, que en este recibo NO baja`);
  return { motivo: `la lista de "qué baja" ${detalles.join(' y ')}` };
}

// §3, solo PDBT: "En palabras simples: ..." (ver secciones.js s03) -- si el texto
// guardado explica Capacidad/Distribución como cargo por demanda/potencia contratada
// (doctrina de GDMTO/GDMTH/GDBT) y no trae la aclaración vigente de
// aclaracionPalabrasSimplesPdbt() (que esos 2 conceptos son componentes por kWh en
// PDBT), hay contradicción.
function evaluarTextoPalabrasSimplesPdbt(texto, r) {
  if (r.tarifa !== 'PDBT') return null;
  if (!/^En palabras simples:/i.test(texto.trim())) return null; // no es este parrafo
  const explicaComoDemanda = /(capacidad|distribuci[oó]n)[^.]{0,120}(demanda|potencia contratada)/i.test(texto) ||
    /(demanda|potencia contratada)[^.]{0,120}(capacidad|distribuci[oó]n)/i.test(texto);
  if (!explicaComoDemanda) return null;
  const aclaracion = aclaracionPalabrasSimplesPdbt(r).trim();
  if (aclaracion && texto.includes(aclaracion)) return null; // ya trae la aclaración vigente
  return { motivo: 'explica Capacidad/Distribución como cargo por demanda sin la aclaración vigente de que en PDBT son componentes por kWh' };
}

export function evaluarTextoDoctrinaDesactualizada(texto, r) {
  if (typeof texto !== 'string' || !texto.trim() || !r || !r.tarifa || !r.meta) return null;
  return evaluarTextoListaReducibles(texto, r) || evaluarTextoPalabrasSimplesPdbt(texto, r);
}

export function detectarTextosDoctrinaDesactualizada(r, textosEditados) {
  const conflictos = [];
  if (!r || !r.tarifa || !r.meta) return conflictos;
  for (const [id, texto] of Object.entries(textosEditados || {})) {
    if (typeof texto !== 'string' || !texto.trim()) continue;
    const resultado = evaluarTextoDoctrinaDesactualizada(texto, r);
    if (!resultado) continue;
    conflictos.push({ id, texto, motivo: resultado.motivo });
  }
  return conflictos;
}

export function sanearTextosDoctrinaDesactualizada(r, textosEditados) {
  const conflictos = detectarTextosDoctrinaDesactualizada(r, textosEditados);
  if (!conflictos.length) return { textosEditados: textosEditados || {}, restaurados: [] };
  const saneado = { ...(textosEditados || {}) };
  for (const c of conflictos) delete saneado[c.id];
  return { textosEditados: saneado, restaurados: conflictos.map((c) => ({ id: c.id, motivo: c.motivo })) };
}
