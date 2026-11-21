// Utilidades compartidas por secciones.js, propuesta.js y app.js: formato de dinero,
// porcentajes, fecha en espanol, y agrupacion del presupuesto en categorias legibles
// (port 1:1 de _agrupar_presupuesto en app/propuesta.py).

// Redondea `x` a `decimales` lugares (mismo algoritmo "redondeo lejos de cero + colchon
// de punto flotante" que R() en motor.js, generalizado a cualquier cantidad de
// decimales) y normaliza -0 a 0 -- Parte 4 del encargo "Arreglar la conclusión vieja y
// los textos guardados" (2026-11-20): un numero MUY cercano a cero pero negativo
// (ej. -0.001) redondea a "-0.00"/"-0.0%" en JS de forma nativa (el signo se conserva
// aunque el valor mostrado sea literalmente cero) -- real en este proyecto: la
// diferencia de recuperación del comparativo calculado-vs-verificación salía
// "-0.0 años" en vez de "0.0 años" cuando ambos escenarios redondeaban al mismo valor.
export function redondear(x, decimales) {
  const factor = 10 ** decimales;
  const n = Number(x);
  let r = (Math.sign(n) * Math.round(Math.abs(n) * factor + 1e-9)) / factor;
  if (r === 0) r = 0; // -0 === 0 es true en JS -- esta asignacion es la que de verdad quita el signo
  return r;
}

// Diferencia entre dos numeros, calculada DESPUES de redondear cada uno por separado a
// `decimales` -- usar siempre que el resultado se vaya a imprimir junto a dos celdas
// que YA muestran `a` y `b` redondeados a esa misma precisión (Parte 4 del mismo
// encargo: "la diferencia impresa debe ser la resta de los dos números impresos", no
// de los valores crudos sin redondear -- si no, dos celdas que se VEN iguales en
// pantalla podían mostrar una diferencia distinta de cero).
export function diferenciaRedondeada(a, b, decimales) {
  return redondear(redondear(a, decimales) - redondear(b, decimales), decimales);
}

export const M = (x) => `$${redondear(Number(x), 2).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const PCT = (x) => `${redondear(100 * Number(x), 1).toFixed(1)}%`;

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

// Fecha base de "Estudio del..."/"válida hasta..." -- pedido explicito del usuario,
// 2026-11-20 ("La fecha del estudio se actualiza al Guardar y al generar PDF/Excel"):
// antes se anclaba SIEMPRE a creadoEn/entregadaEn (ver resultado.js), asi que un
// estudio vuelto a guardar o a generar semanas despues seguia imprimiendo su fecha de
// creacion original, sin forma de saber de un vistazo cual version es la mas
// reciente. Prioridad, en este orden: `entregadaEn` si el proyecto esta
// entregado/bloqueada (esa fecha es la de la entrega real, intocable); si no,
// `fechaActualizacionEstudio` (se pone al Guardar y al generar PDF/Excel, ver
// app.js); si no existe todavia (proyectos de antes de este cambio), `creadoEn` como
// hasta hoy. Compartida entre app.js (editor) y vistaPreviaComun.js (las 2 paginas de
// vista previa en vivo) para que nunca se desincronicen.
export function fechaBaseVigenciaDeProyecto(proyecto) {
  if (!proyecto) return undefined;
  return proyecto.bloqueada
    ? (proyecto.entregadaEn || proyecto.creadoEn)
    : (proyecto.fechaActualizacionEstudio || proyecto.creadoEn);
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
