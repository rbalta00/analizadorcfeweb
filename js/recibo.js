// Lectura semi-automatica de un recibo CFE, portada 1:1 desde
// cfe-presupuestos/app/leer_recibo.py. Mismos patrones de regex, mismo orden de
// intentos, mismos nombres de campo (en camelCase) para poder auditar este archivo
// contra el original. Todo lo que regresa leerRecibo() es un borrador para revisar y
// corregir en la interfaz -- igual que en Python.

export function quitarAcentos(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function num(s) {
  return parseFloat(s.replace(/,/g, ''));
}

function M_(x) {
  // Igual que el f'${x:,.2f}' de Python: separador de miles con coma, 2 decimales.
  return `$${x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const TARIFAS_CONOCIDAS = ['GDMTH', 'GDMTO', 'GDBT', 'PDBT', 'DAC'];
const MESES = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12 };

const ANCLAS_TEXTO_VALIDO = ['SUMINISTRO', 'TARIFA', 'SERVICIO', 'CFE', 'ENERGIA', 'RECIBO'];

// Algunos PDF de CFE traen una fuente con tabla de codificacion rota: el texto se
// extrae pero no son las letras reales. Si no contiene ninguna palabra esperada de un
// recibo CFE, se trata como no legible (quien llama debe caer a OCR sobre la imagen).
export function textoPareceLegible(textoNormMayus) {
  return ANCLAS_TEXTO_VALIDO.some(a => textoNormMayus.includes(a));
}

const CONCEPTOS_TABLA = [
  ['suministro', 'Suministro'],
  ['distribucion', 'Distribuci[o0]n'],
  ['transmision', 'Transmisi[o0]n'],
  ['cenace', 'CENACE'],
  ['energia', 'Energ[i1i]a'],
  ['energia_base', 'Generaci[o0]n\\s*B\\b'],
  ['energia_intermedia', 'Generaci[o0]n\\s*I\\b'],
  ['energia_punta', 'Generaci[o0]n\\s*P\\b'],
  ['capacidad', 'Capacidad'],
  ['scnmem', 'SCnMEM'],
];
const PAT_FILA = '(\\(\\d\\))?\\s*([\\d,]+\\.\\d{2})\\s+([\\d,]+\\.\\d{2})\\s+([\\d,]+\\.\\d{2})\\s+([\\d,]+\\.\\d{2})';

function leerTablaDesglose(textoNorm) {
  const cargos = {}, columna = {};
  for (const [concepto, patronLabel] of CONCEPTOS_TABLA) {
    const re = new RegExp(patronLabel + '\\s*' + PAT_FILA, 'i');
    const m = textoNorm.match(re);
    if (!m) continue;
    const colFijo = num(m[2]), colDemanda = num(m[3]), colMercado = num(m[4]), total = num(m[5]);
    cargos[concepto] = total;
    if (colDemanda > 0.005) columna[concepto] = 'demanda';
    else if (colMercado > 0.005) columna[concepto] = 'mercado';
    else if (colFijo > 0.005) columna[concepto] = 'fijo';
  }
  return { cargos, columna };
}

function leerResumen(textoNorm) {
  const out = {};
  const patrones = {
    cargo_fijo: /Cargo Fijo\(*\d?\)*\s+([\d,]+\.\d{2})/i,
    bt: /2%\s*Baja Tensi[o0]n\(*\d?\)*\s+([\d,]+\.\d{2})/i,
    bonus: /Bonificaci[o0]n Factor de Potencia\(*\d?\)*\s+(-?[\d,]+\.\d{2})/i,
    // Hallazgo 6, auditoria 2026-11-06: antes solo se buscaba "Bonificacion Factor de
    // Potencia" -- si el recibo trae un RECARGO (FP < 90%, Acuerdo SHCP 2000) en vez de
    // una bonificacion (FP >= 90%), no habia ningun patron que lo reconociera. Campo
    // separado a proposito (no reusar "bonus" con signo invertido): un recibo nunca
    // trae los dos a la vez, pero mezclarlos en un solo campo obligaria a adivinar cual
    // de los dos es segun el signo que haya capturado el OCR.
    recargo_fp: /Recargo Factor de Potencia\(*\d?\)*\s+(-?[\d,]+\.\d{2})/i,
    subtotal: /(?<!\w)Subtotal\s+([\d,]+\.\d{2})/i,
    iva: /IVA\s*16%\s+([\d,]+\.\d{2})/i,
    facturacion_periodo: /Facturaci[o0]n del Periodo\s+([\d,]+\.\d{2})/i,
    dap: /(?:Derecho de Alumbrado P[u0]blico|(?<!\w)DAP)\s*\(*\d?\)*\s+([\d,]+\.\d{2})/i,
    adeudo_anterior: /Adeudo Anterior\s+([\d,]+\.\d{2})/i,
  };
  for (const [campo, pat] of Object.entries(patrones)) {
    const m = textoNorm.match(pat);
    if (m) out[campo] = num(m[1]);
  }
  if (out.dap === undefined) {
    const mDap = textoNorm.match(/Derecho de Alumbrado P[u0]blico/i);
    if (mDap) {
      const resto = textoNorm.slice(mDap.index + mDap[0].length, mDap.index + mDap[0].length + 400);
      const mFin = resto.match(/Adeudo Anterior|(?<!\w)Total\s/i);
      const tramo = mFin ? resto.slice(0, mFin.index) : resto.slice(0, 80);
      const cifras = [...tramo.matchAll(/([\d,]+\.\d{2})/g)];
      if (cifras.length) out.dap = num(cifras[cifras.length - 1][1]);
    }
  }
  const todos = [...textoNorm.matchAll(/(?<!\w)Total\s+([\d,]+\.\d{2})/gi)];
  if (todos.length) out.total = num(todos[todos.length - 1][1]);
  return out;
}

// La "Razon Social" del bloque fiscal del CFDI (impresa cerca del RFC, al pie del
// recibo) es un dato casi siempre legible incluso cuando el bloque de arriba
// ("Ciudad de Mexico...NO. DE SERVICIO", de donde se lee titular/domicilio) salio
// mal por OCR -- sirve como segunda fuente para detectar cuando el titular se leyo
// mal, sin tener que adivinar de una lista fija de nombres de dependencias.
function leerRazonSocial(textoNorm) {
  const m = textoNorm.match(/Raz[o0]n Social:?\s*([^\n]+?)\s*(?:R[e0]gimen Fiscal|Uso CFDI|$)/i);
  return m ? m[1].trim().replace(/\s{2,}/g, ' ') : null;
}

const PALABRAS_DIRECCION = /^(CALLE|AV\.?|AVENIDA|BLVD\.?|BOULEVARD|PRIV\.?|PRIVADA|CALZ\.?|CALZADA|ANDADOR|PROL\.?|PROLONGACI[O0]N|CARRETERA|KM\.?|CIRCUITO|RETORNO|CERRADA)\b/i;
const PATRON_DOMICILIO_TOKENS = /\b(C\.?P\.?\s*\d{3,5}|COL(ONIA)?\.?\b|SUR|NORTE|ORIENTE|PONIENTE|FRACC|BLVD|CALZ|AV\.?\b|NUM\.?\b|KM\.?\b)/i;

// Verificacion de "¿lo que se leyo como titular/domicilio tiene sentido?" -- pedido
// explicito del usuario (2026-11-05: "cuando capturas los datos revisa bien... las
// direcciones y lo que extraigas"), motivado por un caso real ya en los fixtures
// (secfinanzas): el bloque anclado en "Ciudad de Mexico...NO. DE SERVICIO" se
// desincronizo con el OCR y el titular termino siendo "CALLE 11 ORIENTE 2224" (la
// primera linea del domicilio), sin que nada lo marcara -- domicilio estaba excluido
// de campos_no_encontrados a proposito (para no repetir el mismo texto en 2 inputs)
// y un titular NO NULO pero incorrecto nunca pasaba por ningun chequeo de contenido.
function verificarTitularDomicilio(titular, domicilio, razonSocial) {
  const avisos = [];

  const titularPareceDireccion = titular && PALABRAS_DIRECCION.test(titular.trim());
  if (titularPareceDireccion) {
    let msg = `El "titular" detectado ("${titular}") empieza como una dirección, no como un nombre -- ` +
      'probablemente el lector tomó la línea equivocada del recibo (caso ya visto: confundir la primera línea del domicilio con el nombre).';
    if (razonSocial && quitarAcentos(razonSocial).toUpperCase() !== quitarAcentos(titular).toUpperCase()) {
      msg += ` El propio recibo trae impresa la Razón Social fiscal "${razonSocial}" en el bloque del CFDI -- ` +
        'probablemente ESE es el nombre correcto. Revisar y corregir el campo "Titular" a mano.';
    }
    avisos.push(msg);
  } else if (!titular && razonSocial) {
    avisos.push(`No se detectó el titular, pero el comprobante CFDI trae impresa la Razón Social "${razonSocial}" -- ` +
      'usar ese nombre si corresponde a este mismo inmueble, o corregir a mano si no.');
  }

  if (domicilio && !PATRON_DOMICILIO_TOKENS.test(domicilio)) {
    avisos.push(`El "domicilio" detectado ("${domicilio}") no trae ningún dato típico de una dirección ` +
      '(colonia, C.P., punto cardinal) -- revisar si se leyó completo contra el PDF/foto original.');
  } else if (!domicilio) {
    avisos.push('No se detectó el domicilio -- revisar a mano contra el recibo antes de continuar (hace falta para ubicar el inmueble).');
  }

  return avisos.length ? avisos.join(' ') : null;
}

function leerHistorialConsumo(textoNorm) {
  const filas = {}, orden = [];
  const re = /([A-Z]{3})\s*(\d{2})\s+(\d+)\s+([\d,]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/g;
  for (const m of textoNorm.matchAll(re)) {
    const mesTxt = m[1].toUpperCase(), anioTxt = m[2], kwhTxt = m[4];
    if (!(mesTxt in MESES)) continue;
    const clave = `${mesTxt}${anioTxt}`;
    if (!(clave in filas)) orden.push(clave);
    filas[clave] = { mes: mesTxt, anio: Number(anioTxt), kwh: num(kwhTxt) };
  }
  return orden.length ? orden.map(c => filas[c]) : null;
}

// Hallazgo 13, auditoria 2026-11-06: el historial se promediaba tal cual sin verificar
// que los periodos fueran consecutivos -- un hueco real (ej. el propio fixture
// secfinanzas, que salta de SEP25 a NOV25 sin OCT25) se contaba igual como "historial
// real de N periodos" sin ningun aviso. Esto NO bloquea el calculo (el promedio sigue
// siendo razonable), solo avisa para que se revise contra el recibo si el hueco
// importa (ej. un mes de consumo muy distinto a los demas).
function detectarHuecosHistorial(historial) {
  if (!historial || historial.length < 2) return null;
  const indice = (h) => h.anio * 12 + MESES[h.mes];
  const huecos = [];
  for (let i = 1; i < historial.length; i++) {
    const diff = indice(historial[i]) - indice(historial[i - 1]);
    if (diff > 1) {
      huecos.push(`entre ${historial[i - 1].mes}${String(historial[i - 1].anio).padStart(2, '0')} y ${historial[i].mes}${String(historial[i].anio).padStart(2, '0')}`);
    }
  }
  if (!huecos.length) return null;
  return `El historial impreso en el recibo tiene al menos un hueco (falta algún mes) ${huecos.join(', ')} -- ` +
    'el promedio usado para dimensionar puede no ser representativo si esos meses faltantes tuvieron un consumo muy distinto. Revisar contra el recibo real.';
}

export function extraerCampos(texto, usoOcr = false) {
  const norm = quitarAcentos(texto);

  // OJO: a proposito NO se inicializan aqui energia_base/energia_intermedia/energia_punta
  // (a diferencia de los demas campos) -- igual que en Python, esas 3 llaves solo
  // existen en el objeto si leerTablaDesglose() las encontro de verdad (GDMTH). Si se
  // inicializaran en null, apareceria una falsa alarma en campos_no_encontrados para
  // cualquier tarifa que no sea GDMTH (donde nunca deberian existir esas filas).
  const campos = {
    tarifa: null, no_servicio: null, no_medidor: null, multiplicador: null, titular: null, domicilio: null,
    demanda_contratada_kw: null, periodo_dias: null, periodo_kwh: null, periodo_label: null,
    suministro: null, distribucion: null, transmision: null, cenace: null, energia: null,
    capacidad: null, scnmem: null, dap: null, bt_monto: null, bonus_monto: null, recargo_fp_monto: null,
    rate_kw_detectado: null, historial: null, texto_crudo: texto,
  };

  // Titular + domicilio: entre "Ciudad de Mexico." y "NO. DE SERVICIO".
  const mTit = texto.match(/Ciudad de M[eé0]xico\.?[\s\S]*?\n([\s\S]*?)NO\.?\s*DE SERVICIO/i);
  if (mTit) {
    const lineas = mTit[1].split('\n').map(l => l.trim().replace(/\s{2,}/g, ' ')).filter(l => l);
    if (lineas.length) {
      const titular = lineas[0].replace(/\s*TOTAL A PAGAR:?.*$/i, '').trim();
      campos.titular = titular || null;
      campos.domicilio = lineas.length > 1 ? lineas.slice(1).join(', ') : null;
    }
  }

  for (const t of TARIFAS_CONOCIDAS) {
    if (new RegExp('TARIFA\\s*:?\\s*' + t, 'i').test(norm) || new RegExp('\\b' + t + '\\b', 'i').test(norm)) {
      campos.tarifa = t;
      break;
    }
  }
  if (campos.tarifa === null && /\bdomestic/i.test(norm)) campos.tarifa = '01';

  let m;
  if ((m = norm.match(/NO\.?\s*DE SERVICIO\s*:?\s*(\d{9,14})/i))) campos.no_servicio = m[1];
  if ((m = norm.match(/NO\.?\s*MEDIDOR\s*:\s*([A-Z0-9]+)/i))) campos.no_medidor = m[1];
  if ((m = norm.match(/MULTIPLICADOR\s*:?\s*(\d+)/i))) campos.multiplicador = Number(m[1]);
  if ((m = norm.match(/DEMANDA CONTRATADA kW\s*:?\s*(\d+)/i))) campos.demanda_contratada_kw = Number(m[1]);

  m = norm.match(/PERIODO FACTURADO\s*:?\s*(\d{1,2})\s*([A-Z]{3})\s*(\d{2})\s*-\s*(\d{1,2})\s*([A-Z]{3})\s*(\d{2})/i);
  if (m && m[2].toUpperCase() in MESES && m[5].toUpperCase() in MESES) {
    const mes1 = MESES[m[2].toUpperCase()], mes2 = MESES[m[5].toUpperCase()];
    const d1 = Date.UTC(2000 + Number(m[3]), mes1 - 1, Number(m[1]));
    const d2 = Date.UTC(2000 + Number(m[6]), mes2 - 1, Number(m[4]));
    const dias = Math.round((d2 - d1) / 86400000);
    // Blindaje contra OCR mal leido (recibos escaneados/foto, sin texto nativo): si el
    // regex hizo match pero con digitos equivocados (ej. año mal leido), la resta puede
    // dar un numero negativo o absurdo que antes se aceptaba tal cual y se usaba en el
    // calculo sin avisar -- caso real: "29 ENE 26-26 FEB 26" leido via OCR dio
    // periodo_dias=-337 en vez de 28, sin marcarse en naranja (2026-11-01). Cualquier
    // periodo facturado real de CFE cae entre 1 y 100 dias (mensual ~30, bimestral
    // domestico ~61); fuera de ese rango se trata como no detectado, para que quede
    // marcado y bloquee el calculo hasta que se corrija a mano.
    if (dias >= 1 && dias <= 100) {
      campos.periodo_dias = dias;
      campos.periodo_label = `${m[1]} ${m[2].toUpperCase()} ${m[3]} al ${m[4]} ${m[5].toUpperCase()} ${m[6]}`;
    }
  }

  const { cargos, columna } = leerTablaDesglose(norm);
  Object.assign(campos, cargos);
  if ('distribucion' in columna && 'capacidad' in columna) {
    const tieneDemanda = columna.distribucion === 'demanda' || columna.capacidad === 'demanda';
    campos.rate_kw_detectado = {
      distribucion: columna.distribucion === 'demanda' ? 1.0 : 0.0,
      capacidad: columna.capacidad === 'demanda' ? 1.0 : 0.0,
    };
    campos.rate_kw_via_ocr = usoOcr;
    void tieneDemanda;
  }

  const resumen = leerResumen(norm);
  if (campos.dap === null && 'dap' in resumen) campos.dap = resumen.dap;
  if (campos.suministro === null && 'cargo_fijo' in resumen) campos.suministro = resumen.cargo_fijo;
  campos.bt_monto = resumen.bt ?? null;
  campos.bonus_monto = resumen.bonus ?? null;
  campos.recargo_fp_monto = resumen.recargo_fp ?? null;
  campos.subtotal_resumen = resumen.subtotal ?? null;
  campos.iva_resumen = resumen.iva ?? null;
  campos.total_resumen = resumen.total ?? null;

  // Mismo criterio que el fix de periodo_dias (2026-11-01): un OCR mal leido en estos 3
  // metodos de respaldo puede inflar/reducir el consumo real sin ningun aviso. Se acota a un
  // rango plausible para cualquier recibo de este proyecto -- desde chico/domestico hasta el
  // inmueble de gobierno mas grande ya visto (~90 mil kWh/periodo), con margen amplio -- en
  // vez de aceptar cualquier numero. Fuera de rango se deja null a proposito, para que caiga
  // en campos_no_encontrados (se marca en naranja y bloquea el calculo) en lugar de corromper
  // el dimensionamiento en silencio.
  const kwhPlausible = (v) => Number.isFinite(v) && v > 0 && v <= 5000000;
  if (campos.periodo_kwh === null) {
    const partesKwh = [];
    for (const patron of [/kWh\s*base\s*([\d,]+)/i, /kWh\s*intermedia\s*([\d,]+)/i, /kWh\s*punta\s*([\d,]+)/i]) {
      const mm = norm.match(patron);
      if (mm) partesKwh.push(num(mm[1]));
    }
    if (partesKwh.length === 3) {
      const suma = partesKwh.reduce((a, b) => a + b, 0);
      if (kwhPlausible(suma)) campos.periodo_kwh = suma;
    }
  }
  if (campos.periodo_kwh === null && campos.multiplicador) {
    const mm = norm.match(/kWh\s+[A-Z0-9]+\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/i);
    if (mm) {
      const valor = num(mm[3]) * campos.multiplicador;
      if (kwhPlausible(valor)) campos.periodo_kwh = valor;
    }
  }
  if (campos.periodo_kwh === null) {
    const mm = norm.match(/Energ[i1i]a\s*\(kWh\)\s*([\d,]+)\s+([\d,]+)/i);
    if (mm) {
      const valor = Math.abs(num(mm[1]) - num(mm[2]));
      if (kwhPlausible(valor)) campos.periodo_kwh = valor;
    }
  }

  campos.historial = leerHistorialConsumo(norm);
  campos.historial_anual_kwh = null;
  campos.historial_meses_cubiertos = null;
  campos.historial_advertencia_huecos = null;
  if (campos.historial) {
    const ultimos = campos.historial.slice(-12);
    campos.historial_meses_cubiertos = ultimos.length;
    campos.historial_anual_kwh = ultimos.reduce((s, x) => s + x.kwh, 0) * (12 / ultimos.length);
    campos.historial_advertencia_huecos = detectarHuecosHistorial(campos.historial);
  }

  campos.rate_kw_advertencia = null;
  const rateKw = campos.rate_kw_detectado;
  if (rateKw !== null) {
    const tieneDemandaDetectada = rateKw.distribucion > 0 || rateKw.capacidad > 0;
    const demandaKw = campos.demanda_contratada_kw;
    if (demandaKw !== null) {
      if (demandaKw > 0 && !tieneDemandaDetectada) {
        campos.rate_kw_advertencia = `El recibo declara ${demandaKw.toFixed(0)} kW de demanda contratada, pero la columna "$/kW" ` +
          'leida dice que Distribucion/Capacidad no son por demanda. Verificar con cuidado.';
      } else if (demandaKw === 0 && tieneDemandaDetectada) {
        campos.rate_kw_advertencia = 'El recibo declara 0 kW de demanda contratada, pero la columna "$/kW" leida dice que ' +
          'Distribucion/Capacidad SI son por demanda. Verificar con cuidado.';
      }
    }
    const TARIFAS_SIN_DEMANDA = new Set(['PDBT']);
    const TARIFAS_CON_DEMANDA = new Set(['GDMTO', 'GDMTH', 'GDBT']);
    if (TARIFAS_SIN_DEMANDA.has(campos.tarifa) && tieneDemandaDetectada) {
      campos.rate_kw_advertencia = `Tarifa ${campos.tarifa} normalmente no tiene demanda contratada, pero se detecto columna ` +
        '"$/kW" > 0. Verificar con cuidado.';
    } else if (TARIFAS_CON_DEMANDA.has(campos.tarifa) && !tieneDemandaDetectada) {
      campos.rate_kw_advertencia = `Tarifa ${campos.tarifa} normalmente tiene demanda contratada, pero se detecto columna ` +
        '"$/kW" en $0.00. Verificar con cuidado.';
    }
  }

  // Reconciliacion aritmetica (ver app/leer_recibo.py para la razon completa): los
  // conceptos de la tabla + 2% BT - bonificacion FP + recargo FP deben sumar EXACTO el
  // Subtotal impreso. Detecta solo, sin revisar a mano, si algun concepto se leyo mal.
  // `recargo_fp_monto` agregado (hallazgo 6, auditoria 2026-11-06): antes la
  // reconciliacion no sabia de la existencia de un recargo por FP bajo, asi que un
  // recibo con recargo (en vez de bonificacion) siempre hubiera disparado una falsa
  // alarma de reconciliacion sin explicar la causa real.
  const cargosConceptos = ['suministro', 'distribucion', 'transmision', 'cenace', 'energia',
                            'energia_base', 'energia_intermedia', 'energia_punta', 'capacidad', 'scnmem'];
  const sumaCargos = cargosConceptos.reduce((s, k) => s + (campos[k] ?? 0), 0);
  const bt = campos.bt_monto ?? 0.0;
  const bonus = campos.bonus_monto ?? 0.0;
  const recargoFp = campos.recargo_fp_monto ?? 0.0;
  const reconciliado = sumaCargos + bt - Math.abs(bonus) + Math.abs(recargoFp);
  const subtotal = campos.subtotal_resumen;
  campos.reconciliacion_diff = null;
  campos.reconciliacion_advertencia = null;
  if (subtotal) {
    const diff = Math.round((reconciliado - subtotal) * 100) / 100;
    campos.reconciliacion_diff = diff;
    if (Math.abs(diff) >= 1.0) {
      campos.reconciliacion_advertencia =
        `Los cargos leidos del recibo (suministro+distribucion+...+SCnMEM, mas el 2% de baja ` +
        `tension, menos la bonificacion por factor de potencia, mas el recargo por factor de ` +
        `potencia si aplica) suman ${M_(reconciliado)}, pero el Subtotal impreso en el recibo es ` +
        `${M_(subtotal)} -- una diferencia de ${M_(diff)}. Esto normalmente significa que algun ` +
        'concepto no se leyo del recibo (o se leyo mal). NO continuar sin corregir los montos a ' +
        'mano contra el PDF/foto original.';
    }
  }
  const ivaResumen = campos.iva_resumen;
  if (subtotal && ivaResumen !== null && campos.reconciliacion_advertencia === null) {
    const diffIva = Math.round((ivaResumen - subtotal * 0.16) * 100) / 100;
    if (Math.abs(diffIva) >= 1.0) {
      campos.reconciliacion_advertencia =
        `El IVA impreso (${M_(ivaResumen)}) no es 16% del Subtotal impreso (${M_(subtotal)}, ` +
        `16% seria ${M_(subtotal * 0.16)}). Revisar si el Subtotal o el IVA se leyeron bien del recibo.`;
    }
  }
  const totalResumen = campos.total_resumen;
  const dapVal = campos.dap ?? 0.0;
  if (subtotal && ivaResumen !== null && totalResumen && campos.reconciliacion_advertencia === null) {
    const totalEsperado = subtotal + ivaResumen + dapVal;
    const diffTotal = Math.round((totalEsperado - totalResumen) * 100) / 100;
    if (Math.abs(diffTotal) >= 1.0) {
      campos.reconciliacion_advertencia =
        `Subtotal + IVA + DAP (${M_(totalEsperado)}) no coincide con el Total a pagar impreso ` +
        `(${M_(totalResumen)}), diferencia ${M_(diffTotal)}. Revisar el recibo a mano antes de ` +
        'continuar -- puede haber un adeudo anterior u otro cargo no detectado.';
    }
  }

  campos.razon_social_cfdi = leerRazonSocial(norm);
  campos.titular_domicilio_advertencia = verificarTitularDomicilio(campos.titular, campos.domicilio, campos.razon_social_cfdi);

  campos.uso_ocr = usoOcr;
  const ignorar = new Set(['texto_crudo', 'uso_ocr', 'rate_kw_detectado', 'rate_kw_advertencia', 'rate_kw_via_ocr',
    'bt_monto', 'bonus_monto', 'recargo_fp_monto', 'subtotal_resumen', 'iva_resumen', 'total_resumen', 'periodo_label',
    'historial', 'historial_advertencia_huecos', 'reconciliacion_diff', 'reconciliacion_advertencia',
    'razon_social_cfdi', 'titular_domicilio_advertencia']);
  if (campos.energia === null && ['energia_base', 'energia_intermedia', 'energia_punta'].some(k => k in campos)) {
    ignorar.add('energia');
  }
  campos.campos_no_encontrados = Object.keys(campos).filter(k => campos[k] === null && !ignorar.has(k));
  return campos;
}
