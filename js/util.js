// Utilidades compartidas por secciones.js, propuesta.js y app.js: formato de dinero,
// porcentajes, fecha en espanol, y agrupacion del presupuesto en categorias legibles
// (port 1:1 de _agrupar_presupuesto en app/propuesta.py).
export const M = (x) => `$${Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const PCT = (x) => `${(100 * Number(x)).toFixed(1)}%`;

const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
                   'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function fechaEstudioEs(d = new Date()) {
  return `${d.getDate()} de ${MESES_ES[d.getMonth()]} de ${d.getFullYear()}`;
}

// Fecha de vigencia de la cotizacion = hoy + diasVigencia -- los precios de materiales
// (dimensionamiento.py/motor.js COSTOS_RESIDENCIAL/COMERCIAL) son una provision, no una
// cotizacion de proveedor fija, asi que toda propuesta de ventas deberia traer una
// fecha limite explicita en vez de dar a entender que el precio es fijo para siempre.
export function fechaVigenciaEs(diasVigencia, base = new Date()) {
  const d = new Date(base.getTime() + diasVigencia * 86400000);
  return fechaEstudioEs(d);
}

// Texto de cadencia de facturación, derivado del período REAL de este recibo
// (periodoDias) -- nunca asumir "mensual" a fuerza. Hallazgo real, auditoria
// 2026-11-18: el texto de "cuánto se paga solo"/"promedio mensual" decía "cada
// mes"/"mensual" de forma fija para CUALQUIER tarifa, aunque un recibo PDBT (o
// 01/DAC) puede ser bimestral. Compartida entre secciones.js (pantalla) y
// propuesta.js (PDF viejo) para que nunca se desincronicen -- antes vivía
// duplicada/sin arreglar en cada archivo por separado.
export function cadenciaPeriodo(periodoDias) {
  const DIAS_MES_REF_LOCAL = 30.5;
  const periodosPorAnio = periodoDias > 0 ? Math.round(365 / periodoDias) : 12;
  if (periodosPorAnio >= 11) return { adjetivo: 'mensual', frase: 'cada mes', periodosPorAnio: 12 };
  if (periodosPorAnio >= 5 && periodosPorAnio <= 7) return { adjetivo: 'bimestral', frase: 'cada período (bimestral, cada 2 meses)', periodosPorAnio: 6 };
  const mesesAprox = Math.round(periodoDias / DIAS_MES_REF_LOCAL);
  return { adjetivo: 'del período', frase: `cada período (cada ${mesesAprox} meses aprox.)`, periodosPorAnio: periodosPorAnio || 12 };
}

export const NOMBRES_CONCEPTO = {
  energia: 'Energía', energia_base: 'Energía base', energia_intermedia: 'Energía intermedia',
  energia_punta: 'Energía punta', transmision: 'Transmisión', cenace: 'CENACE', scnmem: 'SCnMEM',
  suministro: 'Suministro', distribucion: 'Distribución', capacidad: 'Capacidad',
};

export function listaConceptos(keys) {
  return keys && keys.length ? keys.map(k => NOMBRES_CONCEPTO[k] || k).join(' + ') : '—';
}

const GRUPOS_PRESUPUESTO = {
  'Paneles': ['panel'],
  'Inversor': ['inversor'],
  'Estructura y anclaje': ['estructura'],
  'Cableado y conectores': ['cable', 'conector'],
  'Protecciones y tierra': ['proteccion', 'tierra', 'canalizacion'],
  'Ingeniería, trámites y monitoreo': ['ingenieria', 'tramite', 'gestion', 'monitoreo'],
  'Flete y mano de obra': ['flete', 'mano de obra', 'maniobra', 'puesta en marcha'],
};

export function agruparPresupuesto(materiales) {
  const totales = {};
  for (const g in GRUPOS_PRESUPUESTO) totales[g] = 0.0;
  let otros = 0.0;
  for (const m of materiales) {
    const texto = m.partida.toLowerCase();
    let encontrado = false;
    for (const [grupo, claves] of Object.entries(GRUPOS_PRESUPUESTO)) {
      if (claves.some(c => texto.includes(c))) { totales[grupo] += m.importeMxn; encontrado = true; break; }
    }
    if (!encontrado) otros += m.importeMxn;
  }
  if (otros) totales['Otros'] = otros;
  return Object.entries(totales).filter(([, v]) => v > 0);
}

// Kg de CO2 evitados por cada kWh generado con paneles en vez de la red electrica
// nacional (factor de referencia del Sistema Electrico Nacional, SEMARNAT/CFE), y kg
// de CO2 que absorbe un arbol urbano promedio en un ano -- mismas cifras de referencia
// que app/propuesta.py, no una certificacion de bono de carbono.
export const FACTOR_CO2_KG_KWH = 0.429;
export const CO2_KG_POR_ARBOL_ANIO = 21.0;

export const EXPLICACION_TARIFA = {
  GDMTO: 'tarifa de media tensión para negocios y gobierno, con un cargo fijo mensual por la potencia ' +
    'contratada (la "demanda"), sin importar el horario del día.',
  // Texto literal pedido por el dueño, encargo 2026-11-19 (machote GDMTH, caso Antiguo
  // Edificio de la Secretaría de Finanzas) -- antes decia "igual que GDMTO pero..."
  // (correcto pero mencionaba el nombre de otra tarifa; la verificacion de ese encargo
  // pide cero apariciones de "GDMTO" en textos de tarifa de un documento GDMTH).
  GDMTH: 'Gran Demanda en Media Tensión Horaria. Además del cargo por la demanda contratada, el costo de ' +
    'la energía depende del horario en que se consume: base, intermedia y punta, cada franja con su ' +
    'propio precio.',
  GDBT: 'tarifa de baja tensión para negocios y gobierno con consumo grande, con un cargo fijo mensual ' +
    'por la potencia contratada, igual que GDMTO pero sin necesitar media tensión.',
  PDBT: 'tarifa de baja tensión para negocios pequeños, sin cargo fijo por potencia: casi todo lo que ' +
    'se paga depende de cuánta energía (kWh) se consume.',
  '01': 'tarifa doméstica (de casa-habitación), con el precio por kWh más barato en los primeros kWh ' +
    'del período y más caro conforme se consume más, sin cargo fijo por potencia.',
  DAC: 'tarifa doméstica de alto consumo: un precio único por kWh, más caro que la tarifa doméstica ' +
    'normal, sin los escalones baratos iniciales.',
};
