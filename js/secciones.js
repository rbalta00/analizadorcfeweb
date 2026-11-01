// Las 21 secciones interactivas de la cotizacion, mismo orden y mismo contenido real
// que las 21 paginas de app/propuesta.py (puerto fiel del texto/tablas, no generico) --
// aqui en HTML navegable en vez de PDF estatico. Cada seccion pertenece a un bloque de
// bloques.js (para el boton de apagado) y recibe el mismo objeto `r` que arma
// construirResultado() en app.js.
import { M, PCT, listaConceptos, agruparPresupuesto, FACTOR_CO2_KG_KWH, CO2_KG_POR_ARBOL_ANIO, EXPLICACION_TARIFA } from './util.js';
import { barraHorizontal, barraAgrupada, gauge, curvaFlujo } from './charts.js';
import { bloqueDeSeccion } from './bloques.js';
import { COMERCIAL } from './comercial.js';
import { REQUISITOS_PRESUPUESTO_REAL } from './notas.js';
import { leerTextosGlobales } from './textosGlobales.js';

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

// ---------------------------------------------------------------------------
// Texto editable: los parrafos (p) y avisos (avisoCream) de cada seccion se pueden
// editar directo en pantalla (clic, escribir, clic afuera para guardar). El id de
// cada parrafo se genera solo, por orden de aparicion dentro de la seccion
// (sNN-tK) -- no requiere tocar cada llamada en s01..s21. `renderSeccion()` fija el
// numero de seccion/los overrides/el callback de guardado antes de llamar a la
// funcion sNN correspondiente.
// OJO: esta edicion solo aplica a la vista en pantalla. El PDF (propuesta.js) arma
// los mismos parrafos con llamadas propias (bodyX/notice), en un orden que no
// siempre coincide 1:1 con el de aqui -- conectar el PDF es un paso aparte, no
// hecho todavia (ver ESTADO.md).
let _seccionActual = 0;
let _contadorTexto = 0;
let _overridesActuales = {};
let _onEditarTextoActual = () => {};
let _calculosActivosActual = [];
let _onToggleCalculoActual = () => {};
let _globalesActuales = {};
let _onGuardarGlobalActual = () => {};
let _onQuitarGlobalActual = () => {};

function siguienteTextoId() {
  return `s${_seccionActual}-t${_contadorTexto++}`;
}

// Prioridad: override de este proyecto/cliente > predeterminado global (guardado por
// Isaac para todas las cotizaciones) > texto fijo en el codigo. Pedido explicito del
// usuario: poder cambiar la redaccion de la app sin pedirmelo por codigo cada vez.
function textoEditable(tag, cls, textoDefecto) {
  const id = siguienteTextoId();
  const wrap = el('div', 'campo-editable');
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.classList.add('texto-editable');
  e.contentEditable = 'true';
  e.spellcheck = false;
  e.dataset.textoId = id;
  const tieneProyecto = Object.prototype.hasOwnProperty.call(_overridesActuales, id);
  const tieneGlobal = Object.prototype.hasOwnProperty.call(_globalesActuales, id);
  const base = tieneGlobal ? _globalesActuales[id] : textoDefecto;
  e.textContent = tieneProyecto ? _overridesActuales[id] : base;
  e.addEventListener('paste', (ev) => {
    ev.preventDefault();
    const texto = (ev.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, texto);
  });
  e.addEventListener('focusout', () => _onEditarTextoActual(id, e.textContent, base));
  wrap.append(e);
  if (tieneGlobal) {
    const nota = el('span', 'nota-texto-global', '🌐 Usa tu predeterminado global');
    wrap.append(nota);
  }
  if (tieneProyecto) {
    wrap.classList.add('campo-editado');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-restaurar-texto';
    btn.textContent = '↺ Restaurar a predeterminado';
    btn.addEventListener('click', () => _onEditarTextoActual(id, null, base));
    wrap.append(btn);
  }
  if (tieneProyecto || !tieneGlobal) {
    // Solo tiene sentido "guardar como predeterminado" si lo que se ve ahora mismo
    // es distinto del predeterminado global actual (o no hay uno todavia).
    const btnGlobal = document.createElement('button');
    btnGlobal.type = 'button';
    btnGlobal.className = 'btn-guardar-global';
    btnGlobal.textContent = '🌐 Usar este texto en todas las cotizaciones nuevas';
    btnGlobal.addEventListener('click', () => _onGuardarGlobalActual(id, e.textContent, textoDefecto));
    wrap.append(btnGlobal);
  }
  if (tieneGlobal) {
    const btnQuitar = document.createElement('button');
    btnQuitar.type = 'button';
    btnQuitar.className = 'btn-guardar-global';
    btnQuitar.textContent = '🌐✕ Quitar predeterminado global (usar el texto original de la app)';
    btnQuitar.addEventListener('click', () => _onQuitarGlobalActual(id, textoDefecto));
    wrap.append(btnQuitar);
  }
  return wrap;
}

function p(texto) { return textoEditable('p', null, texto); }

function tarjetas(items) {
  const cont = el('div', 'tarjetas-metricas');
  for (const [valor, etiqueta] of items) {
    const m = el('div', 'metrica');
    m.innerHTML = `<div class="valor">${valor}</div><div class="etiqueta">${etiqueta}</div>`;
    cont.append(m);
  }
  return cont;
}

function tabla(headers, filas, { small = false } = {}) {
  const wrap = el('div', 'tabla-wrap');
  const t = el('table', 'tabla-seccion' + (small ? ' tabla-chica' : ''));
  const thead = el('thead');
  const trh = el('tr');
  headers.forEach((h, i) => trh.append(el('th', i > 0 ? 'num' : null, h)));
  thead.append(trh);
  const tbody = el('tbody');
  for (const fila of filas) {
    const tr = el('tr');
    fila.forEach((c, i) => tr.append(el('td', i > 0 ? 'num' : null, String(c))));
    tbody.append(tr);
  }
  t.append(thead, tbody);
  wrap.append(t);
  return wrap;
}

function avisoCream(texto) { return textoEditable('div', 'aviso-cream', texto); }
function avisoRojo(texto) { return el('div', 'nota aviso', texto); }

function detalle(resumen, nodoOArray) {
  const d = el('details', 'detalle-calculo');
  const s = el('summary', null, 'Ver detalle del cálculo');
  void resumen;
  d.append(s);
  const cont = el('div', 'detalle-calculo-cuerpo');
  for (const n of Array.isArray(nodoOArray) ? nodoOArray : [nodoOArray]) cont.append(n);
  d.append(cont);
  return d;
}

const ESTADOS = {
  comprobado: ['Comprobado', 'Respaldado por una fuente identificada (el recibo, un cálculo verificado).'],
  declarado: ['Declarado', 'Proporcionado por una persona, pendiente de verificar.'],
  supuesto: ['Supuesto', 'Adoptado como criterio para poder calcular.'],
  pendiente: ['Pendiente', 'Información o validación todavía faltante.'],
};
function badgeEstado(tipo) {
  const [texto, titulo] = ESTADOS[tipo] || ESTADOS.supuesto;
  const b = el('span', `badge-estado badge-${tipo}`, texto);
  b.title = titulo;
  return b;
}

// Posicion de cada seccion ENTRE LAS ACTIVAS, sin huecos -- pedido explicito del
// usuario: "si solo deje 5, va del 1 al 5, no se brinca". El PDF (propuesta.js) ya
// renumeraba asi; esto hace que la vista en pantalla (numero en el header de cada
// seccion + el indice) haga exactamente lo mismo.
export function seccionesActivasEnOrden(r) {
  const activos = [];
  for (let n = 1; n <= 21; n++) {
    if (r.seccionesActivas.includes(bloqueDeSeccion(n))) activos.push(n);
  }
  return activos;
}

function toggleBloque(r, numero, onToggle) {
  const bloque = bloqueDeSeccion(numero);
  const activo = r.seccionesActivas.includes(bloque);
  const wrap = el('label', 'toggle-seccion');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = activo;
  input.disabled = bloque === 'resumen';
  input.addEventListener('change', () => onToggle(bloque, input.checked));
  wrap.append(input, document.createTextNode(
    bloque === 'resumen' ? ' Siempre incluida' : ' Incluir en la cotización final (pantalla y PDF)'));
  return wrap;
}

// "Cómo se calculó esta sección" -- bloque de formulas/cargos/tarifa reales (no
// generico), con su propio toggle INDEPENDIENTE del de la seccion (ver bloques.js /
// onToggleCalculo en app.js). Pedido explicito del usuario: debe mostrar de donde
// salen los numeros -- formula, cargos y tarifa reales del recibo que se esta
// cotizando -- y poder apagarse aparte al generar la cotizacion que se envia al
// cliente. Igual que con seccionesActivas, el bloque SIEMPRE se ve aqui en pantalla
// (para que Isaac lo revise); el estado del checkbox es lo que decide si entra o no
// a lo que se genera -- el PDF (propuesta.js) todavia no replica esta seccion, mismo
// alcance ya documentado para la edicion de texto (ver ESTADO.md).
function bloqueCalculo(numero, nodoOArray) {
  const bloque = bloqueDeSeccion(numero);
  const activo = _calculosActivosActual.includes(bloque);
  const cont = el('div', 'calculo-detalle' + (activo ? '' : ' calculo-detalle-apagado'));
  const header = el('div', 'calculo-detalle-header');
  header.append(el('h3', null, '📐 Cómo se calculó'));
  const wrap = el('label', 'toggle-seccion toggle-calculo');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = activo;
  input.addEventListener('change', () => _onToggleCalculoActual(bloque, input.checked));
  wrap.append(input, document.createTextNode(' Incluir este detalle en la cotización final (pantalla)'));
  header.append(wrap);
  cont.append(header);
  if (!activo) cont.append(el('p', 'nota', 'Apagado: no se incluirá al generar la cotización para este cliente.'));
  const cuerpo = el('div', 'calculo-detalle-cuerpo');
  for (const n of Array.isArray(nodoOArray) ? nodoOArray : [nodoOArray]) cuerpo.append(n);
  cont.append(cuerpo);
  return cont;
}

function crearSeccion(numero, titulo, pregunta, r, onToggle) {
  _seccionActual = numero;
  _contadorTexto = 0;
  const art = el('article', 'seccion');
  art.id = `seccion-${numero}`;
  const header = el('div', 'seccion-header');
  const activos = seccionesActivasEnOrden(r);
  const pos = activos.indexOf(numero) + 1;
  const etiquetaNumero = pos > 0 ? `${String(pos).padStart(2, '0')} de ${activos.length}` : 'Desactivada';
  header.append(el('div', 'seccion-numero' + (pos > 0 ? '' : ' seccion-numero-apagada'), etiquetaNumero));
  header.append(el('h2', null, titulo));
  if (pregunta) header.append(el('p', 'seccion-pregunta', pregunta));
  header.append(toggleBloque(r, numero, onToggle));
  art.append(header);
  return art;
}

// ---------- 01: resumen ----------
function s01(r, _leido, onToggle) {
  const art = crearSeccion(1, 'Su proyecto, explicado en una página', 'Resultado principal: ¿cuánto cuesta y en cuánto se paga solo?', r, onToggle);
  art.append(p(`${r.titular} · ${r.domicilio || 'domicilio por confirmar'}`));
  art.append(p(`Servicio CFE ${r.noServicio || 'por confirmar'} · Estudio del ${r.fechaEstudio}.`));
  art.append(avisoCream(`Esta cotización es válida hasta el ${r.fechaVigencia} (${r.vigenciaDias} días). Los ` +
    'precios de materiales son una provisión de mercado, no una cotización fija de proveedor -- después de esa ' +
    'fecha hay que revisarlos antes de confirmar.'));
  art.append(tarjetas([
    [M(r.investment), 'Lo que cuesta el sistema, IVA incluido'],
    [r.payback ? `${r.payback.toFixed(1)} años` : 'N/D', 'En cuánto tiempo se paga solo'],
    [M(r.ahorroAnual), 'Lo que ahorraría en el primer año'],
  ]));
  art.append(tarjetas([
    [`${r.n} paneles`, `${r.moduloWp} W por módulo / ${r.kwp.toFixed(2)} kWp`],
    [M(r.ahorroAnual - r.om1), 'Ahorro neto año 1, tras mantenimiento'],
    [PCT(r.pctAhorro), 'Porcentaje de la factura que ahorraría'],
  ]));
  art.append(el('h3', null, 'Qué se propone'));
  art.append(p(`Instalar un sistema conectado a red de ${r.n} paneles de ${r.moduloWp} W. Su producción regional ` +
    `de referencia es de ${r.gen.toLocaleString('en-US', { maximumFractionDigits: 0 })} kWh/año. Se plantea ` +
    'medición neta, sujeta a contratación y autorización.'));
  art.append(el('h3', null, 'Cuánto cuesta y en cuánto se paga solo'));
  const flujoTxt = r.recuperacionAcumulada
    ? ` (o ${r.recuperacionAcumulada.toFixed(1)} años si se cuenta el mantenimiento y el cambio de inversor)` : '';
  art.append(p(`El sistema completo cuesta ${M(r.investment)} (ya con IVA). Con el ahorro que generaría cada mes, ` +
    `esa inversión se recupera en aproximadamente ${r.payback ? r.payback.toFixed(1) + ' años' : 'un tiempo no calculable con el ahorro estimado actual'}${flujoTxt}. ` +
    'Después de ese tiempo, el ahorro mensual es ganancia, no recuperación de lo invertido.'));
  art.append(p(`En el año de referencia se estima pasar de pagar ${M(r.annualbefore)} a ${M(r.annualafter)} al año. ` +
    `El promedio mensual sería ${M(r.annualafter / 12)} en vez de ${M(r.annualbefore / 12)}. Son promedios de un ` +
    'modelo, no pagos mensuales fijos.'));
  art.append(avisoCream('El recibo permite comprobar el gasto actual; el ahorro futuro es una estimación ' +
    `condicionada. Se conserva el gasto observado de ${listaConceptos(r.meta.noReducibles)} sin anticipar ahorro ` +
    'adicional. Los precios deberán actualizarse antes de contratar.'));
  return art;
}

// ---------- 02: recibo ----------
function s02(r, leido, onToggle) {
  const art = crearSeccion(2, 'Su recibo: datos comprobados', '¿Qué dice el recibo real, tal como se leyó?', r, onToggle);
  art.append(badgeEstado(leido ? 'comprobado' : 'declarado'));
  art.append(p(`Titular: ${r.titular}. Domicilio: ${(r.domicilio || 'por confirmar').replace(/\.$/, '')}.`));
  art.append(p(`Tarifa ${r.tarifa}: ${EXPLICACION_TARIFA[r.tarifa] || 'tarifa de CFE; consultar al emisor el detalle de su clasificación.'}`));
  if (r.tituloRecibo && r.tituloRecibo.trim().toUpperCase() !== r.titular.trim().toUpperCase()) {
    art.append(avisoRojo(`El nombre impreso en el recibo de CFE es "${r.tituloRecibo}", distinto al nombre con el ` +
      `que se identifica este inmueble ("${r.titular}"). Verificar que ambos correspondan al mismo servicio antes de continuar.`));
  }
  const filasRecibo = [['Período', `${r.periodoDias || '?'} días`], ['Consumo del período', r.periodoKwh ? `${r.periodoKwh.toLocaleString('en-US', { maximumFractionDigits: 0 })} kWh` : 'por confirmar']];
  if (r.demandaContratadaKw) filasRecibo.push(['Demanda contratada', `${r.demandaContratadaKw.toFixed(0)} kW`]);
  art.append(tabla(['Dato verificado', 'Valor'], filasRecibo));
  art.append(tabla(['Total del recibo', 'Importe'], [
    ['Servicio con IVA', M(r.pagoRecurrentePeriodo - (r.dap || 0))],
    ['Alumbrado público (DAP)', M(r.dap || 0)],
    ['Pago recurrente del período', M(r.pagoRecurrentePeriodo)],
  ]));
  art.append(avisoCream('Los datos de este recibo se usan como base de cálculo del estudio completo; cualquier ' +
    'corrección debe confirmarse contra el documento original de CFE.'));
  art.append(bloqueDocumentosYVerificacion(r));
  return art;
}

function filaArchivo(a) {
  const esImagen = (a.tipo || '').startsWith('image/');
  const fila = el('div', 'documento-adjunto');
  if (esImagen) {
    const img = document.createElement('img');
    img.src = a.url; img.alt = a.nombre; img.className = 'documento-adjunto-img';
    fila.append(img);
  }
  const link = document.createElement('a');
  link.href = a.url; link.target = '_blank'; link.rel = 'noopener';
  link.textContent = (esImagen ? '🖼 ' : '📄 ') + a.nombre;
  fila.append(link);
  return fila;
}

// Documentos originales adjuntos (recibo + verificacion en sitio del gobierno/emisor,
// archivo "Verificaciones en Sitio") y, si Isaac capturo cuantos paneles sugiere esa
// verificacion de campo, una comparacion contra lo que calculo el sistema -- pedido
// explicito del usuario: "como queda el proyecto... y como seria con la propuesta de
// los paneles que verificaron en campo los del gobierno".
function bloqueDocumentosYVerificacion(r) {
  const cont = el('div', 'documentos-verificacion');
  const recibo = r.archivosRecibo || [];
  const verif = r.archivosVerificacion || [];
  if (recibo.length) {
    cont.append(el('h3', null, 'Recibo original adjunto'));
    const grid = el('div', 'documentos-grid');
    recibo.forEach(a => grid.append(filaArchivo(a)));
    cont.append(grid);
  }
  if (verif.length) {
    cont.append(el('h3', null, 'Verificación en sitio adjunta'));
    cont.append(p('Documento de verificación en campo (del gobierno u otro emisor), adjuntado tal cual -- no se ' +
      'extrajo ningún dato de él automáticamente.'));
    const grid = el('div', 'documentos-grid');
    verif.forEach(a => grid.append(filaArchivo(a)));
    cont.append(grid);
  }
  const panelesCampo = r.inmueble?.panelesVerificacion;
  if (panelesCampo) {
    cont.append(el('h3', null, 'Proyecto calculado vs. propuesta de la verificación en campo'));
    cont.append(tabla(['', 'Paneles', 'Potencia', 'Ahorro anual estimado'], [
      ['Calculado por este sistema (consumo real del recibo)', `${r.n}`, `${r.kwp.toFixed(2)} kWp`, M(r.ahorroAnual)],
      ['Sugerido en la verificación en campo', `${panelesCampo}`, panelesCampo && r.moduloWp ? `${(panelesCampo * r.moduloWp / 1000).toFixed(2)} kWp` : 'por confirmar', 'no calculado -- ver nota'],
    ]));
    const dif = panelesCampo - r.n;
    cont.append(p(dif === 0
      ? 'El número de paneles calculado por el consumo real coincide con lo que sugirió la verificación en campo.'
      : `La verificación en campo sugiere ${Math.abs(dif)} panel${Math.abs(dif) === 1 ? '' : 'es'} ${dif > 0 ? 'más' : 'menos'} que lo que calcula este sistema a partir del consumo real del recibo. La verificación en campo suele basarse en el espacio disponible observado en sitio, no necesariamente en el consumo exacto -- ambos criterios son válidos y conviene presentarle al cliente las dos referencias antes de decidir el tamaño final.`));
    cont.append(avisoCream('El ahorro anual de la columna "Sugerido en la verificación en campo" no se calculó -- ' +
      'requeriría correr el motor con ese número de paneles. Esta tabla es solo para comparar tamaños, no para ' +
      'prometer un ahorro distinto al presentado en el resto del estudio.'));
  }
  return cont;
}

// ---------- 03: como se forma el pago ----------
function s03(r, _leido, onToggle) {
  const art = crearSeccion(3, 'Cómo se forma lo que paga a CFE', '¿En qué conceptos se divide el recibo?', r, onToggle);
  const filas = [];
  for (const k of ['suministro', 'distribucion', 'transmision', 'cenace', 'energia', 'energia_base',
                    'energia_intermedia', 'energia_punta', 'capacidad', 'scnmem']) {
    if (k in r.cargos) filas.push([listaConceptos([k]), M(r.cargos[k])]);
  }
  const suma = Object.values(r.cargos).reduce((a, b) => a + b, 0);
  filas.push(['Suma de componentes', M(suma)]);
  art.append(tabla(['Componente del recibo', 'Importe'], filas));
  art.append(p('En palabras simples: "Suministro" es lo que cuesta que CFE le dé servicio, sin importar cuánto ' +
    'consuma. "Distribución" y "Transmisión" son el costo de llevar la electricidad desde la planta hasta su ' +
    'medidor. "CENACE" y "SCnMEM" son cargos que CFE traslada tal cual del operador del sistema eléctrico ' +
    'nacional — no los decide CFE libremente. "Energía" y "Capacidad" son lo que cuesta generar y tener ' +
    'disponible la electricidad que usa.'));
  art.append(p('Para valorar el ahorro no se multiplica toda la producción solar por el precio medio de la ' +
    'factura: cada uno de estos cargos tiene su propia regla, explicada en la sección siguiente.'));
  art.append(bloqueCalculo(3, r.esDomestica ? calculoReciboDomestico(r) : calculoReciboConDemanda(r)));
  return art;
}

// Tarifas con demanda contratada o PDBT (GDMTO/GDMTH/GDBT/PDBT): cargo fijo por día +
// tarifa por kWh, igual formula en motor.js/construirInvoice -- ver esa funcion para
// el porque exacto de cada paso.
function calculoReciboConDemanda(r) {
  return [
    p(`Fórmula de facturación de CFE para la tarifa ${r.tarifa} (Acuerdo de la Comisión Nacional de Energía ` +
      'para tarifas finales de suministro básico, apartados 3.1.2, 5.1, 5.2 y 5.5): el pago de un período se arma ' +
      'como "cargo fijo por los días del período" + "tarifa por kWh × energía neta consumida", más el 2% de baja ' +
      'tensión y la bonificación por factor de potencia cuando el recibo los trae, más IVA (16%) y el Derecho de ' +
      'Alumbrado Público (DAP).'),
    tabla(['Variable', 'Cómo se obtuvo', 'Valor en este recibo'], [
      ['Cargo fijo por día', `Suma de los conceptos que NO dependen del consumo (${listaConceptos(r.meta.noReducibles)}) ÷ días del período = ${M(r.meta.noReducible)} ÷ ${r.periodoDias} días`, `${M(r.meta.monthlyFixed)}/día`],
      ['Tarifa por kWh', `Suma de los conceptos que SÍ dependen del consumo (${listaConceptos(r.meta.reducibles)}) ÷ kWh del período = ${M(r.meta.reducible)} ÷ ${r.periodoKwh.toLocaleString('en-US')} kWh`, `${r.meta.energyRate.toFixed(4)} $/kWh`],
      ['2% de baja tensión', r.btPct ? `${PCT(r.btPct)} del cargo base del período, tal como lo trae impreso el recibo` : 'Este recibo no lo trae impreso este período', r.btPct ? PCT(r.btPct) : '—'],
      ['Bonificación factor de potencia', r.fpBonusPct ? `${PCT(r.fpBonusPct)} del (cargo base + 2% BT), tal como lo trae impreso el recibo` : 'Este recibo no la trae impresa este período', r.fpBonusPct ? PCT(r.fpBonusPct) : '—'],
      ['DAP', `Importe fijo que cobra el municipio, no CFE (p. ej. Ley de Ingresos del Municipio de Puebla 2026, arts. 60 y 92, que fija una cuota mensual con un estímulo contemplado)`, M(r.dap || 0) + '/período'],
    ], { small: true }),
    p(`Con estos 5 valores se reconstruye el total exacto de este recibo: ${M(r.meta.monthlyFixed)}/día × ${r.periodoDias} ` +
      `días + ${r.meta.energyRate.toFixed(4)} $/kWh × ${r.periodoKwh.toLocaleString('en-US')} kWh = ${M(r.meta.monthlyFixed * r.periodoDias + r.meta.energyRate * r.periodoKwh)} de cargo base, y de ahí se aplican BT/bonificación, IVA y DAP hasta llegar a ${M(r.pagoRecurrentePeriodo)}.`),
    avisoCream('Esta reconstrucción es aritmética pura sobre los importes ya impresos en el recibo del cliente -- ' +
      'no depende de ningún precio de lista ni de ningún supuesto del sistema fotovoltaico.'),
  ];
}

// Tarifas domesticas 01/DAC: volumetrica por escalones (01) o precio unico (DAC), SIN
// cargo de demanda -- ver construirInvoiceDomestica() en motor.js. 01 tiene 3 tramos
// (Basico/Intermedio/Excedente); DAC es un solo tramo con limite null (mismo motor,
// un solo renglon).
function calculoReciboDomestico(r) {
  const esc = r.escalones || [];
  const tieneTramos = esc.length > 1;
  const rateProm = r.periodoKwh ? r.cargos.energia / r.periodoKwh : 0;
  const filasEsc = esc.map(([limite, tarifa], i) => [
    tieneTramos ? (i === 0 ? 'Básico' : i === 1 ? 'Intermedio' : 'Excedente') : 'Precio único',
    limite == null ? 'Resto del consumo' : `Primeros ${limite} kWh de este tramo`,
    `${Number(tarifa).toFixed(4)} $/kWh`,
  ]);
  return [
    p(`Fórmula de facturación de CFE para la tarifa ${r.tarifa} (volumétrica por tramos, sin cargo de demanda): ` +
      (tieneTramos
        ? 'cada tramo de consumo (Básico, Intermedio, Excedente) tiene su propio precio por kWh, impresos en el ' +
          'propio recibo -- se cobra el consumo que cae en cada tramo al precio de ese tramo, no todo el consumo ' +
          'al precio del tramo más alto.'
        : 'un único precio por kWh para todo el consumo del período, sin tramos ni cargo fijo de demanda.') +
      ' Después se aplica IVA (16%) y el DAP del período.'),
    tabla(['Tramo', 'Alcance', 'Precio'], filasEsc, { small: true }),
    tabla(['Variable', 'Cómo se obtuvo', 'Valor en este recibo'], [
      ['Consumo del período', 'Impreso en el recibo', `${r.periodoKwh.toLocaleString('en-US')} kWh en ${r.periodoDias} días`],
      ['Cargo de energía', tieneTramos ? 'Suma de lo que corresponde a cada tramo' : `${r.periodoKwh.toLocaleString('en-US')} kWh × precio único`, M(r.cargos.energia)],
      ['Precio efectivo promedio', 'Cargo de energía ÷ kWh del período -- solo como referencia, no es el precio real de ningún tramo', `${rateProm.toFixed(4)} $/kWh`],
      ['DAP', 'Importe fijo del período', M(r.dap || 0)],
    ], { small: true }),
    avisoCream('A diferencia de GDMTO/GDMTH/GDBT, aquí NO hay cargo de demanda contratada: prácticamente todo el ' +
      'consumo que se cubra con energía solar se refleja en el ahorro -- ver sección 4.'),
  ];
}

// ---------- 04: que cargos pueden disminuir ----------
function s04(r, _leido, onToggle) {
  const art = crearSeccion(4, 'Qué cargos pueden disminuir', '¿Cuánto de la factura SÍ baja con paneles solares, y cuánto no?', r, onToggle);
  const razon = r.meta.tieneDemandaContratada
    ? 'Tiene demanda contratada: Distribución y Capacidad se facturan por kW, no por kWh, y no bajan aunque la energía neta llegue a cero.'
    : 'No tiene demanda contratada: casi toda la factura se factura por kWh, por lo que casi todo baja con la energía solar.';
  art.append(badgeEstado('comprobado'));
  art.append(p(`Tarifa ${r.tarifa}. ${razon}`));
  const montoReduc = r.meta.reducibles.reduce((s, k) => s + (r.cargos[k] || 0), 0);
  const montoNoReduc = r.meta.noReducibles.reduce((s, k) => s + (r.cargos[k] || 0), 0);
  art.append(barraHorizontal([
    ['Sí baja con los paneles', montoReduc, 'var(--cfe-teal,#21798b)'],
    ['No baja con los paneles', montoNoReduc, 'var(--cfe-navy,#163b4c)'],
  ]));
  art.append(p(`Lo que SÍ baja: ${listaConceptos(r.meta.reducibles)}. Lo que NO baja: ${listaConceptos(r.meta.noReducibles)}.`));
  art.append(p(`Por eso, aunque se instalaran más paneles de los que se necesitan, el pago de un período no ` +
    `bajaría de ${M(r.pisoPeriodo)} (ya con IVA y DAP) frente a los ${M(r.pagoRecurrentePeriodo)} actuales. El ` +
    `ahorro máximo posible en este recibo, sin importar cuántos paneles se instalen, es de ${M(r.ahorroMaxPeriodo)} ` +
    `por período — un ${PCT(r.pctMaxPeriodo)}.`));
  art.append(avisoCream('No se prometen ahorros de demanda sin conocer la energía importada y la demanda después ' +
    'de instalar. Conservar su importe en el presupuesto es un criterio prudente, no afirmar que esos cargos sean fijos.'));
  art.append(bloqueCalculo(4, r.esDomestica ? [
    p(`Esta tarifa (${r.tarifa}) es 100% volumétrica: no tiene cargo de demanda contratada ni ningún concepto ` +
      'que se facture por kW. Todo el cargo de energía se factura por kWh consumido (por tramos en la tarifa 01, ' +
      'a precio único en DAC), así que la energía solar sustituye kWh comprados a CFE prácticamente 1 a 1, sin el ' +
      'piso de cargos fijos de demanda que sí tienen GDMTO/GDMTH/GDBT.'),
    tabla(['Concepto', 'Clasificación', 'Por qué'], [
      ['Energía (todos los tramos)', 'Sí baja', 'Se factura por kWh -- la energía solar sustituye kWh comprados a CFE.'],
    ], { small: true }),
    avisoCream('El único piso que queda es el IVA y el DAP, que no dependen del consumo -- por eso el % máximo de ' +
      'ahorro de una tarifa doméstica suele ser más alto que el de una tarifa con demanda contratada.'),
  ] : [
    p('Criterio de clasificación usado (freno de clasificación del motor de cálculo): se revisa la columna ' +
      '"$/kW" del propio recibo para Distribución y Capacidad -- si trae un importe mayor a $0.00, esos dos ' +
      'conceptos se facturan por demanda contratada (kW), no por consumo (kWh), y se marcan como "no reducibles". ' +
      `En este recibo: ${r.meta.tieneDemandaContratada ? 'SÍ' : 'NO'} hay importe en esa columna, por eso ` +
      `${r.meta.tieneDemandaContratada ? 'Distribución y Capacidad quedan fuera del cálculo de ahorro' : 'prácticamente todo el recibo entra al cálculo de ahorro'}.`),
    p('Por qué no se acredita ahorro en los cargos de demanda aunque se instalen paneles: la medición neta ' +
      '(Metodología para la medición neta, Resolución RES/142/2017 de la CRE, Anexo I) compensa kWh de energía ' +
      'contra kWh consumidos, pero no modifica por sí sola el cargo por demanda contratada -- ese cargo depende ' +
      'de la potencia máxima que el inmueble le exige a la red, no de cuánta energía neta se le compra a CFE en ' +
      'el mes. Sin una medición de la demanda real después de instalar, no hay base para prometer que ese cargo baje.'),
    tabla(['Concepto', 'Clasificación', 'Por qué'], [
      ...r.meta.reducibles.map(k => [listaConceptos([k]), 'Sí baja', 'Se factura por $/kWh -- la energía solar sustituye kWh comprados a CFE 1 a 1.']),
      ...r.meta.noReducibles.map(k => [listaConceptos([k]), 'No baja', 'Se factura por $/kW de demanda o es un cargo fijo -- no depende de cuánta energía se compre ese mes.']),
    ], { small: true }),
    avisoCream('Esta clasificación es la misma para cualquier recibo con la misma tarifa y el mismo patrón en la ' +
      'columna "$/kW" -- no es un supuesto por tarifa, se lee directo del recibo de cada cliente.'),
  ]));
  return art;
}

// ---------- 05: consumo anual ----------
function s05(r, _leido, onToggle) {
  const art = crearSeccion(5, 'Consumo anual: base disponible', '¿Con qué consumo anual se dimensiona el sistema?', r, onToggle);
  const historial = r.historial;
  if (historial && historial.length >= 3) {
    art.append(badgeEstado('comprobado'));
    art.append(p(`El propio recibo trae impreso un historial de ${historial.length} períodos ya facturados — es ` +
      'la base más confiable para calcular el consumo anual, mejor que suponer que todos los meses son iguales al último período.'));
    const meses = historial.map(x => `${x.mes}${x.anio}`);
    const kwh = historial.map(x => x.kwh);
    const prom = kwh.reduce((a, b) => a + b, 0) / kwh.length;
    art.append(barraAgrupada(meses, 'Consumo real facturado', kwh, 'Promedio del historial', kwh.map(() => prom)));
    art.append(tabla(['Período', 'Consumo facturado'], historial.map(x => [`${x.mes} ${x.anio}`, `${x.kwh.toLocaleString('en-US', { maximumFractionDigits: 0 })} kWh`]), { small: true }));
  } else {
    art.append(badgeEstado('supuesto'));
  }
  art.append(tabla(['Base de trabajo', 'Resultado'], [
    ['Período observado', r.periodoKwh && r.periodoDias ? `${r.periodoKwh.toLocaleString('en-US', { maximumFractionDigits: 0 })} kWh en ${r.periodoDias} días` : 'por confirmar'],
    ['Base usada para el consumo anual', r.basisConsumo],
    ['Consumo anual de referencia', `${r.annualKwh.toLocaleString('en-US', { maximumFractionDigits: 0 })} kWh/año`],
    ['Gasto anual de referencia', M(r.annualbefore) + ' con IVA y 12 cuotas de DAP'],
  ]));
  if (historial && historial.length >= 6) {
    art.append(avisoCream(`Esta base usa el historial real de consumo del propio recibo (${historial.length} períodos), no una extrapolación de un solo mes.`));
  } else {
    art.append(avisoCream('La extrapolación de un solo período sirve para presupuestar. El historial de consumo ' +
      'de 12 meses, cuando esté disponible, debe usarse para confirmar esta base antes de comprometer una cifra de ahorro definitiva.'));
  }
  art.append(bloqueCalculo(5, [
    historial && historial.length >= 3
      ? p(`Fórmula: se promedian los ${historial.length} períodos del historial (${historial.map(x => `${x.mes} ${x.anio}: ${x.kwh.toLocaleString('en-US')} kWh`).join(', ')}) ` +
          `y ese promedio se normaliza a un mes de 30.5 días -- así un período corto o largo no distorsiona el promedio mensual.`)
      : p(`Fórmula: ${r.periodoKwh.toLocaleString('en-US')} kWh ÷ ${r.periodoDias} días × 30.5 días/mes = consumo mensual normalizado, extrapolado a 12 meses.`),
    tabla(['Variable', 'Valor'], [
      ['Consumo mensual normalizado', `${(r.annualKwh / 12).toLocaleString('en-US', { maximumFractionDigits: 0 })} kWh/mes`],
      ['Consumo anual de referencia', `${r.annualKwh.toLocaleString('en-US', { maximumFractionDigits: 0 })} kWh/año`],
      ['Base usada', r.basisConsumo],
    ], { small: true }),
  ]));
  return art;
}

// ---------- 06: sistema propuesto (+ condiciones del inmueble) ----------
function s06(r, _leido, onToggle) {
  const art = crearSeccion(6, `Sistema propuesto: ${r.n} paneles de ${r.moduloWp} W`, 'Paneles → inversor → inmueble ↔ red. ¿Qué se instalaría?', r, onToggle);
  const esquema = el('div', 'esquema-sistema');
  esquema.innerHTML = '<span>☀️ Paneles</span><span class="flecha">→</span><span>⚡ Inversor</span>' +
    '<span class="flecha">→</span><span>🏠 Inmueble</span><span class="flecha-doble">↔</span><span>🔌 Red CFE</span>';
  art.append(esquema);
  const acKw = r.kwp / 1.2;
  art.append(tabla(['Parte del sistema', 'Cantidad y función'], [
    ['Paneles', `${r.n} módulos de ${r.moduloWp} W: ${r.kwp.toFixed(2)} kWp de potencia nominal. Marca y modelo por confirmar.`],
    ['Inversor', `${acKw.toFixed(2)} kW AC como capacidad de cálculo económico; equipo comercial por seleccionar.`],
    ['Relación DC:AC', '1.2 — el inversor se dimensiona más chico que la suma de los paneles a propósito (práctica estándar de la industria, no un error de cálculo): los paneles casi nunca producen su potencia máxima al mismo tiempo.'],
    ['Estructura', 'Compatible con cubierta y panel. Anclajes, viento y cargas por calcular.'],
    ['Conexiones y protecciones', 'Cables DC/AC, conectores, canalización, protecciones y puesta a tierra previstos.'],
    ['Monitoreo', 'Consulta de producción, según solución y comunicaciones disponibles.'],
    ['Espacio preliminar', `${(r.n * 4).toLocaleString('en-US')} m² con pasillos, como provisión de 4 m² por módulo; sujeto a levantamiento.`],
    ['Baterías / respaldo', 'No incluidas. No hay respaldo durante apagones en esta propuesta.'],
  ]));
  art.append(avisoCream('Es una distribución conceptual, sin levantamiento validado: no es prueba de cabida, ' +
    'escala exacta ni seguridad estructural. La potencia y las cantidades presupuestadas no sustituyen el plano ' +
    'y los cálculos de ingeniería.'));

  if (r.fotoSembrado) {
    art.append(el('h3', null, 'Distribución de paneles sobre el techo/azotea (sembrado)'));
    const img = document.createElement('img');
    img.src = r.fotoSembrado.dataUrl;
    img.alt = 'Distribución de paneles sobre el techo/azotea';
    img.className = 'seccion-img-sembrado';
    art.append(img);
    art.append(badgeEstado('declarado'));
  }

  // --- Condiciones actuales del inmueble (dato nuevo que no tenia un lugar en las 21
  // paginas de Python; se integra aqui -- ver propuesta al usuario de no crear una
  // seccion 22 automatica, sino usar el espacio natural de "sistema propuesto"). ---
  const inm = r.inmueble || {};
  const hayDatos = Object.values(inm).some(v => v);
  art.append(el('h3', null, 'Condiciones actuales del inmueble'));
  if (!hayDatos) {
    art.append(badgeEstado('pendiente'));
    art.append(avisoCream('Sin datos capturados todavía del sitio. Completar en "Datos y recibo → Condiciones ' +
      'del inmueble" cuando se tenga la visita o la información del cliente.'));
  } else {
    art.append(p('Resumen de la situación actual, según lo capturado (ver estados: declarado = lo dijo el ' +
      'cliente; pendiente = falta confirmarlo).'));
    const filaCondicion = (etiqueta, valor) => [etiqueta, valor || '— pendiente —'];
    art.append(tabla(['Condición', 'Dato'], [
      filaCondicion('Actividad del inmueble', inm.actividad),
      filaCondicion('Horarios y días de operación', inm.horarios),
      filaCondicion('Equipos principales / cambios previstos', inm.equipos),
      filaCondicion('Tensión y fases', inm.tensionFases),
      filaCondicion('Tablero e interruptor principal', inm.tablero),
      filaCondicion('Transformador', inm.transformador),
      filaCondicion('Tierra física', inm.tierraFisica),
      filaCondicion('Punto de conexión posible', inm.puntoConexion),
      filaCondicion('Tipo y estado de cubierta', inm.cubierta),
      filaCondicion('Dimensiones / área disponible', inm.areaDisponible ? `${inm.areaDisponible} (${inm.areaFuente === 'medida' ? 'medida' : 'estimada'})` : null),
      filaCondicion('Sombras, obstáculos, accesos', inm.sombras),
      filaCondicion('Sistemas solares/baterías existentes', inm.sistemasExistentes),
      filaCondicion('Fecha de visita y notas', [inm.fechaVisita, inm.notas].filter(Boolean).join(' — ')),
    ], { small: true }));
    art.append(el('div', 'recuadro-implica',
      '<strong>Qué implica para la propuesta:</strong> estos datos son los que la persona declaró o se observaron ' +
      'en sitio; no reemplazan un levantamiento técnico. No se deduce tensión o fases solo por el número de hilos ' +
      'del recibo, y ninguna fotografía o inspección visual aquí descrita es un dictamen estructural.'));
  }
  return art;
}

// ---------- 07: produccion ----------
function s07(r, _leido, onToggle) {
  const art = crearSeccion(7, 'Cuánta electricidad podría producir', '¿Cuánta energía generarían los paneles al año?', r, onToggle);
  art.append(tarjetas([
    [`${r.gen.toLocaleString('en-US', { maximumFractionDigits: 0 })} kWh`, 'Producción anual regional estimada'],
    [(r.gen / r.kwp).toLocaleString('en-US', { maximumFractionDigits: 2 }), 'kWh por kWp al año de referencia'],
    [`${r.kwp.toFixed(2)} kWp`, 'Potencia nominal de cálculo'],
  ]));
  art.append(p('El segundo número (kWh por kWp al año) es un indicador de rendimiento. Con el criterio fijo de ' +
    'horas-sol que se explica abajo, ese número sale prácticamente igual sin importar el predio o el tamaño del ' +
    'sistema — no es un error de cálculo ni algo específico de este inmueble.'));
  const mesesAbrev = r.rows.map(x => x.mes.slice(0, 3));
  art.append(barraAgrupada(mesesAbrev, 'Generación estimada', r.rows.map(x => x.generacionKwh), 'Consumo extrapolado', r.rows.map(x => x.consumoExtrapoladoKwh)));
  art.append(detalle('Ver detalle', tabla(['Mes', 'Generación estimada', 'Consumo extrapolado'],
    r.rows.map(x => [x.mes, `${x.generacionKwh.toLocaleString('en-US', { maximumFractionDigits: 0 })} kWh`, `${x.consumoExtrapoladoKwh.toLocaleString('en-US', { maximumFractionDigits: 0 })} kWh`]), { small: true })));
  art.append(badgeEstado('supuesto'));
  art.append(avisoCream(r.metodoGeneracion || 'Criterio preliminar de horas-sol fijas (4.5 h/día, 30.5 días/mes), ' +
    'no una simulación con PVGIS ni datos de irradiancia reales del sitio. No hay simulación de sombras exactas ' +
    'del inmueble ni descuento de pérdidas de sistema. Generar el equivalente al 100% de los kWh consumidos no ' +
    'significa ahorrar el 100% de la factura ni disponer de respaldo durante apagones.'));
  return art;
}

// ---------- 08: impacto ambiental ----------
function s08(r, _leido, onToggle) {
  const art = crearSeccion(8, 'Impacto ambiental estimado', '¿Cuánto CO2 evitaría generar su propia electricidad?', r, onToggle);
  const co2Kg = r.gen * FACTOR_CO2_KG_KWH, co2Ton = co2Kg / 1000, arboles = co2Kg / CO2_KG_POR_ARBOL_ANIO;
  art.append(p('Generar su propia electricidad con el sol, en vez de tomarla de la red (que en México todavía se ' +
    'produce en buena parte quemando combustibles), evita que se emita cierta cantidad de CO2 cada año que el sistema esté funcionando.'));
  art.append(tarjetas([
    [`${co2Ton.toLocaleString('en-US', { maximumFractionDigits: 1 })} ton`, 'CO2 evitado estimado, cada año'],
    [`${arboles.toLocaleString('en-US', { maximumFractionDigits: 0 })} árboles`, 'Equivalente en árboles urbanos durante un año'],
    [`${(co2Ton * 25).toLocaleString('en-US', { maximumFractionDigits: 0 })} ton`, 'CO2 evitado acumulado en 25 años (sin degradación)'],
  ]));
  art.append(badgeEstado('supuesto'));
  art.append(avisoCream(`Estimación de referencia: ${FACTOR_CO2_KG_KWH} kg de CO2 evitado por cada kWh generado ` +
    '(factor de emisión del Sistema Eléctrico Nacional, varía por año según lo publicado por SEMARNAT/CFE) y ~' +
    `${CO2_KG_POR_ARBOL_ANIO.toFixed(0)} kg de CO2 absorbido por árbol urbano al año. No es una certificación de bono de carbono ni una medición propia del inmueble.`));
  return art;
}

// ---------- 09: como se obtiene el ahorro ----------
function s09(r, _leido, onToggle) {
  const art = crearSeccion(9, 'Cómo se obtiene el ahorro que se presenta', '¿Qué reglas sigue el modelo para calcular el ahorro?', r, onToggle);
  art.append(p('Se calcula mes a mes la energía neta facturable y la factura resultante. En palabras simples, el modelo sigue estas reglas:'));
  art.append(tabla(['Criterio', 'Aplicación'], [
    ['Compensación', 'Medición neta: lo que generan los paneles se resta directo de su consumo del mes, en vez de vendérselo a CFE aparte. Requiere contrato y medidor autorizados.'],
    ['Energía aplicada', 'Cada mes se compara cuánto consumió contra cuánto generaron los paneles ese mismo mes, y se usa el MENOR de los dos — así nunca se le da más ahorro del que realmente generó (se reserva además un 1% de margen de seguridad).'],
    ['Excedentes entre meses', 'Si algún mes los paneles generan más de lo que consume, ese sobrante no se guarda para el siguiente mes ni se vende aparte: el modelo no le da ningún valor económico.'],
    [listaConceptos(r.meta.noReducibles), 'Se conserva su gasto de referencia proporcional a días, sin presupuestar ahorro adicional.'],
    ['IVA y DAP', 'Se incluye IVA 16%. Se conserva el DAP observado en los pagos modelados.'],
  ]));
  art.append(badgeEstado('comprobado'));
  art.append(avisoCream('Esta estimación no es una refacturación oficial de CFE ni una garantía mínima de ahorro.'));
  return art;
}

// ---------- 10: cuanto pagaria y ahorraria ----------
function s10(r, _leido, onToggle) {
  const art = crearSeccion(10, 'Cuánto pagaría y cuánto ahorraría', 'Comparación directa: factura sin solar vs. con solar.', r, onToggle);
  art.append(barraHorizontal([
    ['Hoy, sin paneles (al año)', r.annualbefore, 'var(--cfe-navy,#163b4c)'],
    ['Con paneles (al año)', r.annualafter, 'var(--cfe-teal,#21798b)'],
  ]));
  art.append(tabla(['Concepto comparable', 'Sin sistema', 'Con sistema estimado'], [
    ['Gasto anual de referencia', M(r.annualbefore), M(r.annualafter)],
    ['Promedio mensual del año', M(r.annualbefore / 12), M(r.annualafter / 12)],
    ['Ahorro anual de factura', '—', M(r.ahorroAnual)],
    ['Ahorro promedio mensual', '—', M(r.ahorroAnual / 12)],
    ['Ahorro total anual', '—', PCT(r.pctAhorro)],
    ['Mantenimiento del primer año', '—', M(r.om1)],
    ['Ahorro neto del primer año', '—', M(r.ahorroAnual - r.om1)],
  ]));
  art.append(p('El ahorro de factura es la diferencia entre pagos de electricidad. El ahorro neto descuenta el ' +
    'mantenimiento; no son cifras que deban sumarse.'));
  art.append(avisoCream('Son estimaciones con las bases descritas. El ahorro real se medirá después de operar, comparando recibos equivalentes y cambios de consumo.'));
  art.append(bloqueCalculo(10, [
    p('Análisis mes a mes del año de referencia: para cada mes se simula el pago real (sin paneles) y el pago con ' +
      'el sistema propuesto, usando la MISMA fórmula de facturación de la sección 3 -- no es un promedio repartido, ' +
      'es un cálculo independiente por mes con la generación solar y el consumo de ese mes.'),
    tabla(['Mes', 'Consumo', 'Generación', 'Sin paneles', 'Con paneles', 'Ahorro', '% del mes'], r.rows.map(row => [
      row.mes, `${Math.round(row.consumoExtrapoladoKwh).toLocaleString('en-US')} kWh`, `${Math.round(row.generacionKwh).toLocaleString('en-US')} kWh`,
      M(row.pagoSinSolarMxn), M(row.pagoConSolarEstimadoMxn), M(row.ahorroEstimadoMxn),
      row.pagoSinSolarMxn ? PCT(row.ahorroEstimadoMxn / row.pagoSinSolarMxn) : '—',
    ]), { small: true }),
    p('El % de ahorro no es igual todos los meses: en los meses donde el consumo real es bajo frente a la ' +
      `generación de los paneles, el ahorro porcentual también es más bajo -- ${listaConceptos(r.meta.noReducibles)} ` +
      'se siguen cobrando completos sin importar cuánta energía solar se produzca ese mes (ver sección 4). En los ' +
      'meses de consumo más alto, el sistema cubre una porción mayor del total y el % de ahorro sube.'),
  ]));
  return art;
}

// ---------- 11: presupuesto resumen ----------
function s11(r, _leido, onToggle) {
  const art = crearSeccion(11, 'Presupuesto y alcance económico', '¿Cuánto cuesta el sistema completo, con IVA?', r, onToggle);
  art.append(tabla(['Resumen de venta', 'Importe'], [
    ['Subtotal', M(r.ventaSinIva)], ['IVA 16%', M(r.iva)], ['INVERSIÓN TOTAL ESTIMADA', M(r.investment)],
  ]));
  const cat = agruparPresupuesto(r.materiales);
  art.append(barraHorizontal(cat.map(([g, v]) => [g, v, 'var(--cfe-navy,#163b4c)'])));
  art.append(p('La inversión contempla los equipos y trabajos agrupados arriba (detalle completo en la sección ' +
    'siguiente): módulos, inversor presupuestado, estructura, conexión, protecciones, monitoreo, ingeniería, ' +
    'gestión, flete, montaje y pruebas dentro de las cantidades previstas.'));
  art.append(avisoCream('Los precios deberán actualizarse y confirmarse antes de contratar. El total ya incluye ' +
    'el IVA modelado. No se supone devolución de IVA, deducciones fiscales, subsidios ni financiamiento.'));
  return art;
}

// ---------- 12: detalle presupuesto ----------
function s12(r, _leido, onToggle) {
  const art = crearSeccion(12, 'Detalle del presupuesto', '¿Qué partidas específicas componen el presupuesto?', r, onToggle);
  art.append(tabla(['Concepto', 'Cantidad prevista', 'Importe sin IVA'],
    r.materiales.map(m => [m.partida, `${m.cantidad.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${m.unidad}`, M(m.importeMxn)]), { small: true }));
  const sumaPartidas = r.materiales.reduce((s, m) => s + m.importeMxn, 0);
  art.append(p(`Subtotal: ${M(r.ventaSinIva)} · IVA: ${M(r.iva)} · Inversión con IVA: ${M(r.investment)}.`));
  art.append(detalle('Ver detalle', p(
    `Verificación: la suma de las ${r.materiales.length} partidas (${M(sumaPartidas)}) coincide con el Subtotal ` +
    `(${M(r.ventaSinIva)}); el IVA se aplica una sola vez sobre ese Subtotal. Los costos de adquisición, ` +
    'contingencia y margen comercial se reparten de forma proporcional dentro del precio de cada partida — no se ' +
    'exponen como un renglón de utilidad aparte en este documento para el cliente.')));
  art.append(avisoCream('Las capacidades, longitudes y accesorios son provisiones. El modelo de inversor, ' +
    'calibres y cantidades finales se ajustarán mediante ingeniería y cotización vigente antes de contratar.'));
  return art;
}

// ---------- 13: recuperacion ----------
function s13(r, _leido, onToggle) {
  const art = crearSeccion(13, 'En cuánto se recuperaría la inversión', '¿Cuándo deja de deber la inversión y empieza a ganar?', r, onToggle);
  const paybackTxt = r.payback ? `${r.payback.toFixed(1)} años` : 'no calculable con el ahorro actual';
  art.append(p(`Esta es la pregunta más importante de todo el estudio. Con este cálculo, la respuesta es ${paybackTxt}.`));
  if (r.flujo25Rows && r.flujo25Rows.length) {
    art.append(curvaFlujo(r.flujo25Rows.map(x => [x.anio, x.acumuladoMxn]), r.recuperacionAcumulada));
  }
  const roi = r.investment ? r.ahorroAnual / r.investment : 0;
  const bc = beneficioCosto(r);
  const reposicionAnio = (r.flujo25Rows || []).find(x => x.reposicionMxn)?.anio;
  const filasInd = [
    ['Recuperación simple', r.payback ? `${r.payback.toFixed(1)} años: inversión / ahorro neto del primer año.` : 'Sin recuperación con el ahorro neto del primer año.'],
    ['Recuperación del flujo', r.recuperacionAcumulada ? `${r.recuperacionAcumulada.toFixed(1)} años, considerando degradación, mantenimiento creciente${reposicionAnio ? ` y reposición del inversor en el año ${reposicionAnio}.` : '.'}` : 'No se recupera dentro del horizonte de 25 años.'],
    ['ROI anual simple', `${PCT(roi)}: ahorro neto del primer año / inversión.`],
    ['TIR (tasa interna de retorno)', r.tir ? `${PCT(r.tir)} del flujo de 25 años: equivale a la ganancia anual de invertir ese dinero ahí en vez de en otra parte. No es una tasa garantizada.` : 'No calculable con un solo cambio de signo.'],
    ['VAN (valor actual neto) al 10%', `${M(r.van)}: cuánto más valen, en pesos de hoy, los ahorros futuros que lo que costó el sistema.`],
  ];
  if (bc != null) filasInd.push(['Beneficio/costo', `${bc.toFixed(2)}: por cada peso invertido (y gastado en mantenimiento), regresa ${bc.toFixed(2)} pesos actualizados en ahorros.`]);
  art.append(tabla(['Indicador estimado', 'Resultado y explicación'], filasInd, { small: true }));
  const escPct = r.escalamientoTarifaPct || 0;
  const escTxt = escPct
    ? `Se supone que la tarifa de CFE sube ${escPct.toFixed(1)}% anual (criterio del estudio, no una cifra oficial de CFE) a partir del año 1.`
    : 'Los precios de electricidad se mantienen constantes como base económica del recibo (sin supuesto de incremento de tarifa).';
  art.append(badgeEstado('supuesto'));
  art.append(avisoCream('Se consideran degradación de 0.5% anual, mantenimiento inicial de 1% de la venta sin ' +
    'IVA que crece 3% anual' + (reposicionAnio ? `, y reposición del inversor en el año ${reposicionAnio}. ` : '. No se incluyó reposición de inversor en este cálculo. ') +
    escTxt + ' No se presentan rendimientos ni recuperación como garantías.'));
  if (r.aplicaIsr) {
    art.append(el('h4', null, 'Deducción fiscal (ISR) -- solo clientes privados/comerciales'));
    art.append(tabla(['Indicador con deducción ISR', 'Resultado'], [
      ['Deducción fiscal estimada', `${M(r.ahorroFiscalIsr)} (${r.tasaIsrPct.toFixed(0)}% de ISR sobre el costo antes de IVA)`],
      ['Inversión neta efectiva', M(r.inversionNetaIsr)],
      ['Recuperación simple con ISR', r.paybackNetoIsr ? `${r.paybackNetoIsr.toFixed(1)} años` : 'no calculable'],
      ['VAN neto con ISR', r.vanNetoIsr != null ? M(r.vanNetoIsr) : 'no calculable'],
      ['TIR neta con ISR', r.tirNetoIsr != null ? PCT(r.tirNetoIsr) : 'no calculable'],
    ], { small: true }));
    art.append(avisoCream('Deducción 100% inmediata de equipo renovable (Art. 34 fracción XIII LISR). Es una ' +
      'estimación general, no asesoría fiscal -- confirmar con el contador o fiscalista del cliente antes de ' +
      'prometerlo en una oferta firme. No aplica a gobierno/instituciones públicas.'));
  }
  art.append(bloqueCalculo(13, [
    p('Fórmulas con los números reales de este estudio:'),
    tabla(['Indicador', 'Fórmula', 'Sustitución'], [
      ['Recuperación simple', 'Inversión ÷ ahorro neto del año 1', `${M(r.investment)} ÷ ${M(r.ahorroAnual - r.om1)} = ${r.payback ? r.payback.toFixed(2) : '—'} años`],
      ['ROI anual simple', 'Ahorro neto del año 1 ÷ inversión', `${M(r.ahorroAnual - r.om1)} ÷ ${M(r.investment)} = ${PCT(roi)}`],
      ['VAN al 10%', 'Σ (flujo neto del año / 1.10^año) − inversión inicial, a 25 años', `${M(r.van)} (ver la curva de flujo arriba)`],
      ['TIR', 'Tasa de descuento que hace VAN = 0 del mismo flujo de 25 años', r.tir ? PCT(r.tir) : 'no calculable (el flujo no cambia de signo una sola vez)'],
    ], { small: true }),
    p('El ahorro de cada año no es el mismo que el del año 1: se degrada 0.5% anual (paneles producen un poco ' +
      `menos con el tiempo)${escPct ? ` y la tarifa de CFE se supone que sube ${escPct.toFixed(1)}% anual` : ''}. El mantenimiento sí crece cada año (3% anual sobre 1% de la venta sin IVA del primer año).`),
  ]));
  return art;
}
function beneficioCosto(r) {
  const flujo25 = r.flujo25Rows || [];
  if (!flujo25.length) return null;
  const beneficioDesc = flujo25.filter(x => x.anio > 0).reduce((s, x) => s + x.ahorroMxn / Math.pow(1.10, x.anio), 0);
  const costoDesc = r.investment + flujo25.filter(x => x.anio > 0).reduce((s, x) => s + x.omMxn / Math.pow(1.10, x.anio), 0);
  return costoDesc ? beneficioDesc / costoDesc : null;
}

// ---------- 14: flujo 25 años ----------
function s14(r, _leido, onToggle) {
  const art = crearSeccion(14, 'Flujo del proyecto durante 25 años', '¿Cómo se ve el dinero del proyecto año por año?', r, onToggle);
  const flujo25 = r.flujo25Rows || [];
  if (flujo25.length) {
    const reposicionAnio = flujo25.find(x => x.reposicionMxn)?.anio;
    const montoReposicion = flujo25.find(x => x.reposicionMxn)?.reposicionMxn || 0;
    art.append(p(`Año cero: inversión de ${M(r.investment)}. El flujo neto descuenta mantenimiento` +
      (reposicionAnio ? ` y, en el año ${reposicionAnio}, ${M(montoReposicion)} de reposición del inversor (precio de hoy del inversor presupuestado, escalado al año ${reposicionAnio}).` : '. No se incluyó reposición de inversor en este cálculo.') +
      ' Importes en MXN.'));
    const filasFlujo = flujo25.filter(x => x.anio > 0).map(x => [
      x.reposicionMxn ? `${x.anio} *` : x.anio, M(x.ahorroMxn), M(x.flujoMxn), M(x.acumuladoMxn)]);
    art.append(detalle('Ver tabla completa', tabla(['Año', 'Ahorro factura', 'Flujo neto', 'Acumulado'], filasFlujo, { small: true })));
    if (reposicionAnio) art.append(p('* Año con reposición de inversor incluida en el Flujo neto.'));
  } else {
    art.append(p('Flujo a 25 años no disponible para este cálculo.'));
  }
  art.append(avisoCream('El cálculo mensual no da valor a excedentes entre meses ni reduce los cargos por ' +
    'demanda; no incluye crédito, efectos fiscales, valor de rescate ni venta de energía.'));
  return art;
}

// ---------- 15: pagos mensuales ----------
function s15(r, _leido, onToggle) {
  const art = crearSeccion(15, 'Pagos estimados por mes del año de referencia', '¿Cómo se ve el pago mes a mes, con y sin paneles?', r, onToggle);
  const mesesAbrev = r.rows.map(x => x.mes.slice(0, 3));
  art.append(barraAgrupada(mesesAbrev, 'Sin solar', r.rows.map(x => x.pagoSinSolarMxn), 'Con solar estimado', r.rows.map(x => x.pagoConSolarEstimadoMxn), { fmt: M }));
  art.append(detalle('Ver tabla mes a mes', tabla(['Mes', 'Sin solar', 'Con solar estimado', 'Ahorro estimado'],
    r.rows.map(x => [x.mes, M(x.pagoSinSolarMxn), M(x.pagoConSolarEstimadoMxn), M(x.ahorroEstimadoMxn)]), { small: true })));
  art.append(p(`Total anual: ${M(r.annualbefore)} sin solar y ${M(r.annualafter)} con solar. Ahorro estimado: ${M(r.ahorroAnual)}.`));
  art.append(avisoCream('Los meses son un año de referencia climático y de consumo extrapolado, no una fecha ' +
    'prometida de instalación. No se presentan meses del historial como si ya hubieran operado con paneles.'));
  return art;
}

// ---------- 16: que tan cerca del 100% ----------
function s16(r, _leido, onToggle) {
  const art = crearSeccion(16, 'Qué tan cerca se puede llegar al 100% de ahorro', '¿Por qué la propuesta no llega al 100% de ahorro?', r, onToggle);
  art.append(gauge(r.pctMaxPeriodo, 'Ahorro máximo posible de este recibo'));
  art.append(p(`Para ahorrar el 100% de un pago recurrente de ${M(r.pagoRecurrentePeriodo)} por ${r.periodoDias || '?'} ` +
    'días, el pago residual tendría que ser $0.00. La generación anual por sí sola no demuestra ese resultado.'));
  art.append(p('La estimación comercial aquí presentada no llega a ese 100%, por DOS razones distintas e independientes entre sí:'));
  art.append(el('h3', null, '1. El piso estructural de su tarifa'));
  art.append(p(`El piso estructural de este recibo es ${M(r.pisoPeriodo)} por período (${PCT(r.pctMaxPeriodo)} de ` +
    'ahorro máximo) — ver sección 4. Sin importar cuántos paneles se instalen, esta parte de la factura no baja a cero.'));
  art.append(el('h3', null, '2. El alumbrado público (DAP), un cobro aparte'));
  art.append(p('La Ley de Ingresos de cada municipio de Puebla suele fijar una cuota mensual de alumbrado público ' +
    '(DAP), con un descuento (estímulo) cuando el consumo de energía baja lo suficiente (en el municipio de ' +
    'Puebla capital, el menor entre la cuota fija y el 6.5% del importe de energía del período). Este cobro no ' +
    'depende de los paneles ni de la tarifa eléctrica: es un trámite municipal aparte. En el recibo observado se ' +
    'paga la cuota completa; conviene verificar la regla vigente para el municipio específico de este inmueble.'));
  art.append(avisoCream('No se ofrece un porcentaje de ahorro garantizado ni se declara un piso absoluto de pago. ' +
    'El contrato deberá usar un compromiso sustentado en medición, ingeniería y reglas de facturación verificadas.'));
  return art;
}

// ---------- 17: que falta ----------
function s17(r, leido, onToggle) {
  const art = crearSeccion(17, 'Qué hace falta para cerrar el ahorro', '¿Qué pendientes hay antes de ofertar en firme?', r, onToggle);
  art.append(badgeEstado('pendiente'));
  art.append(p('Esta cotización se calculó únicamente con la información del recibo de CFE que se cargó o ' +
    'capturó — sin importar si ese recibo venía completo o no, esto SIEMPRE hace falta confirmar antes de ' +
    'poder ofrecer un presupuesto real y firme de este servicio:'));
  art.append(tabla(['Pendiente para un presupuesto real'], REQUISITOS_PRESUPUESTO_REAL.map(x => [x]), { small: true }));
  const notas = r.notas || [];
  art.append(el('h3', null, 'Notas específicas de este cálculo'));
  if (notas.length) {
    for (const n of notas) art.append(avisoCream(n));
  } else {
    art.append(avisoCream('Sin pendientes adicionales detectados automáticamente en este recibo en particular.'));
  }
  void leido;
  return art;
}

// ---------- 18: alcance y condiciones ----------
function s18(r, _leido, onToggle) {
  const art = crearSeccion(18, 'Alcance, exclusiones y condiciones comerciales', '¿Qué incluye y qué NO incluye el presupuesto?', r, onToggle);
  art.append(p('Incluye provisiones para suministro, montaje, conexión, protecciones, puesta a tierra, ' +
    'monitoreo, ingeniería, documentación, preparación y seguimiento de gestión, flete, pruebas y capacitación básica dentro del presupuesto.'));
  art.append(p('No incluye baterías, respaldo en apagones, refuerzo estructural, sustitución de cubierta, ' +
    'impermeabilización general, cambio de transformador, obra de media tensión ni rehabilitación eléctrica ' +
    'ajena al sistema. Cualquier necesidad adicional se cotizará y aceptará por escrito.'));
  art.append(tabla(['Condiciones de pago sugeridas', ''], COMERCIAL.pagos.map(pg => [`${Math.round(pg.porcentaje * 100)}%`, pg.hito])));
  art.append(p(COMERCIAL.naturalezaCondiciones));
  art.append(detalle('Ver cronograma estimado', tabla(['Etapa', 'Plazo estimado'], COMERCIAL.cronograma, { small: true })));
  art.append(badgeEstado('declarado'));
  art.append(avisoCream('Los precios deberán actualizarse antes de contratar. Las garantías serán las ' +
    'documentadas para los equipos y trabajos efectivamente suministrados.'));
  return art;
}

// ---------- 19: entrega y mantenimiento ----------
function s19(r, _leido, onToggle) {
  const art = crearSeccion(19, 'Entrega, mantenimiento y comprobación del ahorro', '¿Qué se entrega, y cómo se comprueba el ahorro ya operando?', r, onToggle);
  art.append(tabla(['Momento', 'Entrega o comprobación'], [
    ['Antes de obra', 'Plano, diagrama unifilar, memoria eléctrica, cálculo de estructura, modelos, protecciones, alcance y contrato.'],
    ['Al terminar', 'Inventario y números de serie, pruebas, documentación de conexión, manuales y garantías, plano final, acceso al monitoreo y capacitación.'],
    ['Durante operación', 'Registrar producción, importaciones, exportaciones, demanda, consumo y recibos. Revisar limpiezas, conexiones y alarmas.'],
    ['Para medir ahorro', 'Comparar factura sin solar ajustada al consumo real con factura efectivamente pagada, en períodos equivalentes. Separar IVA, DAP, adeudos y cambios tarifarios.'],
  ]));
  art.append(p(`El mantenimiento inicial modelado es ${M(r.om1)} al año. Es una provisión económica, no una póliza ` +
    'incluida gratuitamente ni un precio fijo para toda la vida del sistema.'));
  art.append(avisoCream(COMERCIAL.garantiaInstalacion));
  art.append(avisoCream(COMERCIAL.garantiaEquipos));
  return art;
}

// ---------- 20: glosario ----------
function s20(r, _leido, onToggle) {
  const art = crearSeccion(20, 'Glosario: términos usados en este estudio', 'Consulta rápida del significado de los términos técnicos.', r, onToggle);
  art.append(tabla(['Término', 'Qué significa'], [
    ['kWh (kilowatt-hora)', 'La unidad en la que CFE cobra la electricidad: cuánta energía se consumió. Es lo que aparece en su recibo.'],
    ['kW / kWp (kilowatt / kilowatt pico)', 'La potencia (velocidad a la que se consume o se genera electricidad en un instante). "Pico" es la potencia máxima que pueden dar los paneles en condiciones ideales de sol.'],
    ['Demanda contratada', 'En tarifas de negocio/gobierno, la potencia máxima que CFE tiene reservada para ese servicio; se paga por tenerla disponible, exista o no consumo.'],
    ['Medición neta', 'El esquema de CFE donde la energía que generan los paneles se resta de la que se consume, en vez de venderse aparte.'],
    ['Relación de desempeño (PR)', 'Qué tan cerca está la producción real de lo ideal, después de descontar pérdidas (cableado, temperatura, suciedad, eficiencia del inversor).'],
    ['Degradación', 'La pérdida pequeña y normal de producción de los paneles cada año (en este estudio, 0.5% anual).'],
    ['Recuperación simple', 'En cuántos años el ahorro de los primeros años, sumado, iguala lo que costó el sistema — sin considerar que ese ahorro cambia con el tiempo.'],
    ['Recuperación del flujo', 'Lo mismo, pero tomando en cuenta la degradación, el mantenimiento que crece y el cambio de inversor — un cálculo más realista.'],
    ['ROI (retorno sobre la inversión)', 'El ahorro del primer año como porcentaje de lo que costó el sistema.'],
    ['TIR (tasa interna de retorno)', 'La ganancia anual que representa esta inversión, expresada como una tasa de interés — para comparar contra otras inversiones u opciones de ahorro.'],
    ['VAN (valor actual neto)', 'Cuánto vale hoy, en pesos de hoy, el conjunto de ahorros futuros, después de descontar lo que costó el sistema.'],
    ['Beneficio/costo', 'Por cada peso que cuesta el sistema (incluido el mantenimiento), cuántos pesos regresa en ahorros a lo largo de los años.'],
    ['DAP (Derecho de Alumbrado Público)', 'Un cobro aparte que los municipios le piden a CFE que incluya en el recibo, para el alumbrado de las calles — no es parte del consumo de electricidad del predio.'],
    ['CENACE / SCnMEM', 'Cargos que CFE traslada tal cual del operador del mercado eléctrico nacional; no los fija CFE libremente.'],
  ], { small: true }));
  return art;
}

// ---------- 21: fuentes ----------
function s21(r, _leido, onToggle) {
  const art = crearSeccion(21, 'Fuentes y trazabilidad del cálculo', '¿En qué se basa cada número de este estudio?', r, onToggle);
  art.append(tabla(['Elemento', 'Fuente'], [
    ['Documento principal', `Recibo CFE del servicio ${r.noServicio || 'por confirmar'}${r.periodoDias ? ', período ' + r.periodoDias + ' días' : ''}.`],
    ['Producción', r.metodoGeneracion || 'Criterio preliminar de horas-sol fijas (4.5 h/día, 30.5 días/mes), no PVGIS ni irradiancia real del sitio.'],
    ['Marco tarifario', 'Acuerdo CNE 2026, apartados 3.1.2, 5.1, 5.2 y 5.5. sidof.segob.gob.mx/notas/docFuente/5783862'],
    ['Compensación', 'Metodología de medición neta del Anexo I de RES/142/2017 y contrato que corresponda al suministro.'],
    ['DAP', 'Ley de Ingresos del municipio correspondiente para el ejercicio vigente; verificar artículo y porcentaje de estímulo aplicable al inmueble específico.'],
    ['Impacto ambiental', `Factor de emisión de referencia ${FACTOR_CO2_KG_KWH} kg CO2/kWh (Sistema Eléctrico Nacional, SEMARNAT/CFE) y absorción de referencia de árbol urbano.`],
  ]));
  art.append(avisoCream('Se conserva evidencia, archivo de cálculo mensual, presupuesto y flujo financiero. El ' +
    'recibo no acredita un contrato de generación firmado ni un ahorro futuro medido.'));
  return art;
}

const RENDERERS = [s01, s02, s03, s04, s05, s06, s07, s08, s09, s10, s11, s12, s13, s14, s15, s16, s17, s18, s19, s20, s21];

export const TITULOS_SECCIONES = [
  'Su proyecto, explicado en una página', 'Su recibo: datos comprobados', 'Cómo se forma lo que paga a CFE',
  'Qué cargos pueden disminuir', 'Consumo anual: base disponible', 'Sistema propuesto',
  'Cuánta electricidad podría producir', 'Impacto ambiental estimado', 'Cómo se obtiene el ahorro que se presenta',
  'Cuánto pagaría y cuánto ahorraría', 'Presupuesto y alcance económico', 'Detalle del presupuesto',
  'En cuánto se recuperaría la inversión', 'Flujo del proyecto durante 25 años',
  'Pagos estimados por mes del año de referencia', 'Qué tan cerca se puede llegar al 100% de ahorro',
  'Qué hace falta para cerrar el ahorro', 'Alcance, exclusiones y condiciones comerciales',
  'Entrega, mantenimiento y comprobación del ahorro', 'Glosario: términos usados en este estudio',
  'Fuentes y trazabilidad del cálculo',
];

// renderSeccion(numero 1..21, r, leido, onToggle, onEditarTexto, onToggleCalculo,
// onGuardarGlobal, onQuitarGlobal) -> HTMLElement
// onEditarTexto(id, valorONull, textoDefecto): se llama al salir de un parrafo editado
// (valor = texto nuevo) o al pulsar "Restaurar" (valor = null) -- override de ESTE
// proyecto/cliente nada mas.
// onToggleCalculo(bloque, activo): se llama al marcar/desmarcar el bloque "Cómo se
// calculó" de una seccion -- independiente de onToggle (que apaga la seccion entera).
// onGuardarGlobal(id, texto)/onQuitarGlobal(id): predeterminado GLOBAL para todas las
// cotizaciones (actuales y futuras) -- ver textosGlobales.js.
export function renderSeccion(numero, r, leido, onToggle, onEditarTexto, onToggleCalculo, onGuardarGlobal, onQuitarGlobal) {
  _overridesActuales = r.textosEditados || {};
  _onEditarTextoActual = onEditarTexto || (() => {});
  _calculosActivosActual = r.calculosActivos || [];
  _onToggleCalculoActual = onToggleCalculo || (() => {});
  _globalesActuales = leerTextosGlobales();
  _onGuardarGlobalActual = onGuardarGlobal || (() => {});
  _onQuitarGlobalActual = onQuitarGlobal || (() => {});
  const fn = RENDERERS[numero - 1];
  return fn(r, leido, onToggle);
}
