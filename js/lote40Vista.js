// Logica del visor "Estado del lote de 40 inmuebles" -- pedido explicito del usuario,
// 2026-11-14: un boton que muestre cuantas de las 40 cotizaciones ya se generaron y
// cuantas faltan, agrupadas por tarifa. Vive en su PROPIA pagina (lote40.html), no
// dentro de la SPA de index.html -- pedido explicito de seguimiento del usuario, mismo
// dia: "que me abra en una ventana independiente", para poder tener el analizador y
// este visor abiertos al mismo tiempo en pestañas/ventanas distintas sin que se pisen.
// Lee el MISMO localStorage (mismo origen que index.html) via clientes.js -- es
// solo lectura, nunca escribe nada aqui.
import { listarClientes } from './clientes.js';
import { LOTE_40_INMUEBLES, normalizarRpu } from './lote40.js';
import { ETIQUETAS_TARIFA, ORDEN_TARIFAS } from './tarifas.js';
import { M } from './util.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Cruza LOTE_40_INMUEBLES (lista fija, ver lote40.js) contra TODOS los clientes/
// proyectos reales guardados en este navegador, por RPU -- no depende de que esten
// bajo un cliente con un nombre en particular.
function datosLote40() {
  const todosProyectos = [];
  for (const c of listarClientes()) {
    for (const p of (c.proyectos || [])) todosProyectos.push({ cliente: c, proyecto: p });
  }
  return LOTE_40_INMUEBLES.map((def) => {
    const rpusDef = [def.rpu, def.rpuAlt].filter(Boolean).map(normalizarRpu);
    // Match principal por el RPU capturado en el formulario; si el proyecto nunca
    // llego a capturar RPU (ej. se creo pero no se le subio el recibo todavia), se
    // intenta tambien contra el nombre del proyecto -- la convencion de esta misma
    // app para este lote es nombrar cada cotizacion "<RPU> <institucion>".
    const match = todosProyectos.find(({ proyecto: p }) => {
      const rpuCapturado = normalizarRpu(p.formulario?.noServicio);
      if (rpuCapturado && rpusDef.includes(rpuCapturado)) return true;
      return rpusDef.some((r) => r && (p.nombre || '').replace(/\D+/g, '').includes(r));
    });
    return { def, cliente: match?.cliente || null, proyecto: match?.proyecto || null };
  });
}

// La tarifa de un inmueble NO esta en la lista fija de los 40 (el control de
// documentos nunca la capturo) -- se agrupa por `proyecto.formulario.tarifa` cuando
// ya existe cotizacion con eso capturado; los que todavia no tienen cotizacion (o la
// tienen pero sin tarifa leida) caen en un grupo aparte al final. Mismo orden/
// etiquetas que el resto de la app (ORDEN_TARIFAS/ETIQUETAS_TARIFA, tarifas.js).
function agruparLote40PorTarifa(filas) {
  const grupos = new Map();
  for (const f of filas) {
    const tarifa = f.proyecto?.formulario?.tarifa || null;
    if (!grupos.has(tarifa)) grupos.set(tarifa, []);
    grupos.get(tarifa).push(f);
  }
  const ordenTarifas = [...ORDEN_TARIFAS, ...[...grupos.keys()].filter((t) => t && !ORDEN_TARIFAS.includes(t))];
  const resultado = [];
  for (const tarifa of ordenTarifas) {
    if (grupos.has(tarifa)) resultado.push({ tarifa, etiqueta: ETIQUETAS_TARIFA[tarifa] || tarifa, filas: grupos.get(tarifa) });
  }
  if (grupos.has(null)) resultado.push({ tarifa: null, etiqueta: 'Sin tarifa capturada todavía (sin cotización, o cotización sin recibo leído)', filas: grupos.get(null) });
  return resultado;
}

function estadoCotizacionLote40(proyecto) {
  if (!proyecto) return { clave: 'sin-crear', etiqueta: '— Sin crear' };
  if (proyecto.definitiva) return { clave: 'definitiva', etiqueta: '✅ Definitiva' };
  if (proyecto.ultimaInversionTotal != null) return { clave: 'calculada', etiqueta: '🧮 Calculada' };
  if (proyecto.formulario) return { clave: 'sin-calcular', etiqueta: '⚠️ Sin calcular' };
  return { clave: 'sin-datos', etiqueta: '⚠️ Sin datos' };
}

function renderTotales(filas) {
  const cont = document.getElementById('lote40Totales');
  cont.innerHTML = '';
  const conProyecto = filas.filter((f) => f.proyecto);
  const calculadas = filas.filter((f) => f.proyecto?.ultimaInversionTotal != null);
  const definitivas = filas.filter((f) => f.proyecto?.definitiva);
  const bloqueadas = filas.filter((f) => f.def.estadoDocs !== 'Recibo y verificación localizados');
  const metricas = [
    [`${conProyecto.length} de ${filas.length}`, 'Ya tienen cotización creada en esta app'],
    [String(filas.length - conProyecto.length), 'Sin ninguna cotización todavía'],
    [String(calculadas.length), 'Ya calculadas (con inversión/ahorro)'],
    [String(definitivas.length), '✅ Marcadas como definitivas'],
    [String(bloqueadas.length), '⚠️ Con pendiente de documentación/identidad conocido'],
  ];
  for (const [valor, etiqueta] of metricas) {
    const m = document.createElement('div');
    m.className = 'metrica';
    m.innerHTML = `<div class="valor">${valor}</div><div class="etiqueta">${etiqueta}</div>`;
    cont.append(m);
  }
}

// Tarjetas apiladas (mismo componente visual `tarjeta-cliente` que usa el resto de la
// app para listas de clientes/proyectos, que si es responsivo) en vez de una tabla
// ancha -- una tabla de 10 columnas apretaba tanto el texto largo ("pendiente
// conocido") que se partia letra por letra en una pantalla normal.
function tarjetaLote40(fila) {
  const { def, cliente, proyecto } = fila;
  const estado = estadoCotizacionLote40(proyecto);
  const docsOk = def.reciboLocalizado && def.verificacionLocalizada;
  const docsTexto = `${def.reciboLocalizado ? '📄 recibo' : '❌ sin recibo'} · ${def.verificacionLocalizada ? '🔍 verificación' : '❌ sin verificación'}`;
  const div = document.createElement('div');
  div.className = 'tarjeta-cliente';
  if (!proyecto) div.classList.add('fila-pendiente-lote40'); // atenuado SIN tachado -- "no existe todavia", no "se excluyo a proposito"
  const chipClase = estado.clave === 'sin-crear' || estado.clave === 'sin-datos' || estado.clave === 'sin-calcular' ? 'chip-etapa-negociando' : 'chip-etapa-ganado';
  const cifras = proyecto?.ultimaInversionTotal != null
    ? `Inversión ${M(proyecto.ultimaInversionTotal)}${proyecto.ultimoAhorroAnual != null ? ' · Ahorro anual ' + M(proyecto.ultimoAhorroAnual) : ''} · `
    : '';
  const info = document.createElement('div');
  info.className = 'tarjeta-cliente-info';
  info.innerHTML = `<strong>${def.id}. ${escapeHtml(def.inmueble)}</strong>` +
    `<span class="chip-etapa ${chipClase}">${estado.etiqueta}</span>` +
    `<span class="nota">RPU ${escapeHtml(def.rpu)}${def.rpuAlt ? ` (alt. ${escapeHtml(def.rpuAlt)})` : ''}` +
    (proyecto ? ` · ${escapeHtml(cliente.nombre)} · ${escapeHtml(proyecto.nombre)}` : '') + `</span>` +
    (proyecto ? `<span class="nota">${cifras}actualizado ${new Date(proyecto.actualizadoEn).toLocaleDateString('es-MX')}</span>` : '') +
    `<span class="nota${docsOk ? '' : ' aviso'}">${docsTexto}</span>` +
    (def.pendientes ? `<span class="nota">⚠️ ${escapeHtml(def.pendientes)}</span>` : '');
  div.append(info);
  if (proyecto) {
    // Abre index.html en OTRA pestaña nueva, directo en esa cotización (ver el
    // bloque "?cliente=&proyecto=" en el arranque de app.js) -- no se puede llamar
    // abrirProyecto() de alla desde aqui, son paginas/contextos de JS distintos.
    const a = document.createElement('a');
    a.className = 'btn-link';
    a.textContent = 'Abrir';
    a.target = '_blank';
    a.rel = 'noopener';
    a.href = `index.html?cliente=${encodeURIComponent(cliente.id)}&proyecto=${encodeURIComponent(proyecto.id)}`;
    div.append(a);
  }
  return div;
}

function renderTabla(filas) {
  const cont = document.getElementById('lote40Tabla');
  cont.innerHTML = '';
  for (const { tarifa, etiqueta, filas: filasGrupo } of agruparLote40PorTarifa(filas)) {
    const wrap = document.createElement('div');
    wrap.className = 'grupo-proyectos';
    const h4 = document.createElement('h4');
    h4.textContent = `${tarifa ? `Tarifa ${tarifa} — ${etiqueta}` : etiqueta} (${filasGrupo.length})`;
    wrap.append(h4);
    const lista = document.createElement('div');
    lista.className = 'lista-clientes';
    for (const f of filasGrupo) lista.append(tarjetaLote40(f));
    wrap.append(lista);
    cont.append(wrap);
  }
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportarCsv() {
  const grupos = agruparLote40PorTarifa(datosLote40());
  const lineas = [['#', 'Inmueble', 'Tarifa', 'RPU', 'RPU alterno', 'Recibo localizado', 'Verificación localizada', 'Pendiente de documentación',
    'Cliente en esta app', 'Cotización en esta app', 'Estado de la cotización', 'Inversión', 'Ahorro anual', 'Actualizado', 'Definitiva'].join(',')];
  for (const { tarifa, filas } of grupos) {
    for (const { def, cliente, proyecto } of filas) {
      const estado = estadoCotizacionLote40(proyecto);
      lineas.push([
        def.id, csvEscape(def.inmueble), csvEscape(tarifa || ''), def.rpu, csvEscape(def.rpuAlt || ''),
        def.reciboLocalizado ? 'Sí' : 'No', def.verificacionLocalizada ? 'Sí' : 'No', csvEscape(def.pendientes || ''),
        csvEscape(cliente?.nombre || ''), csvEscape(proyecto?.nombre || ''), csvEscape(estado.etiqueta),
        proyecto?.ultimaInversionTotal ?? '', proyecto?.ultimoAhorroAnual ?? '',
        proyecto ? csvEscape(new Date(proyecto.actualizadoEn).toLocaleDateString('es-MX')) : '',
        proyecto?.definitiva ? 'Sí' : 'No',
      ].join(','));
    }
  }
  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `estado_lote_40_inmuebles_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function render() {
  const filas = datosLote40();
  renderTotales(filas);
  renderTabla(filas);
}

document.getElementById('btnRefrescarLote40').addEventListener('click', render);
document.getElementById('btnExportarLote40Csv').addEventListener('click', exportarCsv);
render();
