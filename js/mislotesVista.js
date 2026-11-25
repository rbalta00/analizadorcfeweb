// Logica del visor "Mis lotes" -- pedido explicito del usuario, 2026-11-24: "y puedo
// crear mis propios lotes". Mismo espiritu que el visor del lote de 40 inmuebles
// (lote40Vista.js): cruza una lista de inmuebles esperados (nombre + RPU) contra las
// cotizaciones reales guardadas en este navegador, por RPU, para ver de un vistazo
// cuantos ya tienen estudio y cuantos faltan -- pero aqui la lista NO es fija, el
// usuario la captura el mismo, tantos lotes como quiera. Vive en su PROPIA pagina
// (mislotes.html), no dentro de la SPA de index.html, mismo patron que lote40.html.
import {
  listarLotesPropios, obtenerLotePropio, crearLotePropio, renombrarLotePropio,
  eliminarLotePropio, agregarInmuebleALote, editarInmuebleDeLote, eliminarInmuebleDeLote,
} from './lotesPropios.js';
import { listarClientes, crearCliente, crearProyecto } from './clientes.js';
import { normalizarRpu } from './lote40.js';
import { ETIQUETAS_TARIFA, ORDEN_TARIFAS } from './tarifas.js';
import { M } from './util.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let loteActivoId = null;

// Cruza los inmuebles de UN lote propio contra TODOS los clientes/proyectos reales
// guardados en este navegador, por RPU -- mismo criterio exacto que datosLote40()
// (lote40Vista.js), duplicado a propósito aquí en vez de importado: ese archivo no
// exporta sus funciones internas, y tocarlo para exportarlas arriesgaría el lote de
// 40 real por un feature distinto.
function datosDelLote(lote) {
  const todosProyectos = [];
  for (const c of listarClientes()) {
    for (const p of (c.proyectos || [])) todosProyectos.push({ cliente: c, proyecto: p });
  }
  return lote.inmuebles.map((inmueble) => {
    const rpusInmueble = [inmueble.rpu, inmueble.rpuAlt].filter(Boolean).map(normalizarRpu);
    const match = todosProyectos.find(({ proyecto: p }) => {
      const rpuCapturado = normalizarRpu(p.formulario?.noServicio);
      if (rpuCapturado && rpusInmueble.includes(rpuCapturado)) return true;
      return rpusInmueble.some((r) => r && (p.nombre || '').replace(/\D+/g, '').includes(r));
    });
    return { inmueble, cliente: match?.cliente || null, proyecto: match?.proyecto || null };
  });
}

function estadoCotizacion(proyecto) {
  if (!proyecto) return { clave: 'sin-crear', etiqueta: '— Sin crear' };
  if (proyecto.definitiva) return { clave: 'definitiva', etiqueta: '✅ Definitiva' };
  if (proyecto.ultimaInversionTotal != null) return { clave: 'calculada', etiqueta: '🧮 Calculada' };
  if (proyecto.formulario) return { clave: 'sin-calcular', etiqueta: '⚠️ Sin calcular' };
  return { clave: 'sin-datos', etiqueta: '⚠️ Sin datos' };
}

// A diferencia del lote de 40 (que trae `tarifaDelRecibo` precapturado del recibo
// real en disco, fuera de esta app), un inmueble recien agregado a un lote propio no
// tiene ninguna tarifa conocida hasta que su cotizacion real ya la capturo -- cae a
// "Sin tarifa" mientras tanto, honesto en vez de adivinar.
function tarifaEfectiva(fila) {
  return fila.proyecto?.formulario?.tarifa || null;
}

function agruparPorTarifa(filas) {
  const grupos = new Map();
  for (const f of filas) {
    const tarifa = tarifaEfectiva(f);
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

function renderTotales(filas) {
  const cont = document.getElementById('totalesLote');
  cont.innerHTML = '';
  const conProyecto = filas.filter((f) => f.proyecto);
  const calculadas = filas.filter((f) => f.proyecto?.ultimaInversionTotal != null);
  const definitivas = filas.filter((f) => f.proyecto?.definitiva);
  const metricas = [
    [`${conProyecto.length} de ${filas.length}`, 'Ya tienen cotización creada en esta app'],
    [String(filas.length - conProyecto.length), 'Sin ninguna cotización todavía'],
    [String(calculadas.length), 'Ya calculadas (con inversión/ahorro)'],
    [String(definitivas.length), '✅ Marcadas como definitivas'],
  ];
  for (const [valor, etiqueta] of metricas) {
    const m = document.createElement('div');
    m.className = 'metrica';
    m.innerHTML = `<div class="valor">${escapeHtml(valor)}</div><div class="etiqueta">${escapeHtml(etiqueta)}</div>`;
    cont.append(m);
  }
}

function crearProyectoPendiente(lote, inmueble) {
  // Revisa de nuevo con datos frescos por si otra pestaña ya creo este mismo proyecto
  // mientras tanto -- evita un duplicado (mismo cuidado que crearProyectoPendiente()
  // en lote40Vista.js).
  const yaExiste = datosDelLote(obtenerLotePropio(lote.id)).find((f) => f.inmueble.id === inmueble.id)?.proyecto;
  if (yaExiste) { renderDetalleLote(lote.id); return; }
  // El cliente destino es uno con el MISMO nombre que el lote (se crea si no existe
  // todavia) -- mismo patron que NOMBRE_CLIENTE_LOTE_40 en lote40Vista.js, pero
  // dinamico por lote en vez de un nombre fijo.
  let cliente = listarClientes().find((c) => c.nombre === lote.nombre);
  if (!cliente) cliente = crearCliente({ nombre: lote.nombre, tipo: 'Gobierno' });
  const nombreProyecto = `${inmueble.rpu ? inmueble.rpu + ' ' : ''}${inmueble.nombre}`.trim();
  const proyecto = crearProyecto(cliente, { nombre: nombreProyecto });
  window.open(`index.html?cliente=${encodeURIComponent(cliente.id)}&proyecto=${encodeURIComponent(proyecto.id)}&editar=1`, '_blank', 'noopener');
  renderDetalleLote(lote.id);
}

function editarInmuebleUI(lote, inmueble) {
  const nombre = prompt('Nombre del inmueble:', inmueble.nombre);
  if (nombre == null) return;
  const limpio = nombre.trim();
  if (!limpio) { alert('El nombre no puede quedar vacío.'); return; }
  const rpu = prompt('RPU (número de servicio):', inmueble.rpu || '');
  if (rpu == null) return;
  editarInmuebleDeLote(lote.id, inmueble.id, { nombre: limpio, rpu: rpu.trim() });
  renderDetalleLote(lote.id);
}

function tarjetaInmueble(fila, lote) {
  const { inmueble, cliente, proyecto } = fila;
  const estado = estadoCotizacion(proyecto);
  const div = document.createElement('div');
  div.className = 'tarjeta-cliente';
  if (!proyecto) div.classList.add('fila-pendiente-lote40'); // mismo atenuado que usa lote40Vista.js para "aun no existe"
  const chipClase = estado.clave === 'sin-crear' || estado.clave === 'sin-datos' || estado.clave === 'sin-calcular' ? 'chip-etapa-negociando' : 'chip-etapa-ganado';
  const cifras = proyecto?.ultimaInversionTotal != null
    ? `Inversión ${M(proyecto.ultimaInversionTotal)}${proyecto.ultimoAhorroAnual != null ? ' · Ahorro anual ' + M(proyecto.ultimoAhorroAnual) : ''} · `
    : '';
  const fecha = proyecto ? `actualizado ${new Date(proyecto.actualizadoEn).toLocaleDateString('es-MX')}` : '';
  const info = document.createElement('div');
  info.className = 'tarjeta-cliente-info';
  info.innerHTML = `<strong>${escapeHtml(inmueble.nombre)}</strong>` +
    `<span class="nota">RPU ${escapeHtml(inmueble.rpu || '—')}</span>` +
    `<span class="chip-etapa ${chipClase}">${estado.etiqueta}</span>` +
    `<span class="nota">${cifras}${fecha}</span>`;
  div.append(info);
  if (proyecto) {
    const aAbrir = document.createElement('a');
    aAbrir.className = 'btn-link';
    aAbrir.textContent = 'Abrir →';
    aAbrir.href = `index.html?cliente=${encodeURIComponent(cliente.id)}&proyecto=${encodeURIComponent(proyecto.id)}&editar=1`;
    aAbrir.target = '_blank';
    div.append(aAbrir);
  } else {
    const btnCrear = document.createElement('button');
    btnCrear.type = 'button';
    btnCrear.className = 'btn-link';
    btnCrear.textContent = '+ Crear';
    btnCrear.title = `Crea una cotización en blanco para "${inmueble.nombre}" bajo el cliente "${lote.nombre}" y la abre para capturar su recibo.`;
    btnCrear.addEventListener('click', () => crearProyectoPendiente(lote, inmueble));
    div.append(btnCrear);
  }
  const btnEditar = document.createElement('button');
  btnEditar.type = 'button';
  btnEditar.className = 'btn-link';
  btnEditar.textContent = '✏️';
  btnEditar.title = 'Corregir el nombre/RPU de este inmueble dentro del lote';
  btnEditar.addEventListener('click', () => editarInmuebleUI(lote, inmueble));
  div.append(btnEditar);
  const btnQuitar = document.createElement('button');
  btnQuitar.type = 'button';
  btnQuitar.className = 'btn-link btn-borrar-cliente';
  btnQuitar.textContent = '🗑';
  btnQuitar.title = 'Quitar este inmueble del lote (su cotización, si ya existe, NO se borra)';
  btnQuitar.addEventListener('click', () => {
    if (!confirm(`¿Quitar "${inmueble.nombre}" de este lote? Su cotización (si ya existe) no se borra.`)) return;
    eliminarInmuebleDeLote(lote.id, inmueble.id);
    renderDetalleLote(lote.id);
  });
  div.append(btnQuitar);
  return div;
}

function renderListaLotes() {
  loteActivoId = null;
  document.getElementById('seccionDetalleLote').hidden = true;
  document.getElementById('seccionListaLotes').hidden = false;
  const cont = document.getElementById('listaLotes');
  cont.innerHTML = '';
  const lotes = listarLotesPropios();
  if (!lotes.length) {
    cont.append(Object.assign(document.createElement('p'), {
      className: 'nota',
      textContent: 'Todavía no has creado ningún lote. Escribe un nombre arriba y da clic en "+ Crear lote".',
    }));
    return;
  }
  for (const lote of lotes) {
    const filas = datosDelLote(lote);
    const conProyecto = filas.filter((f) => f.proyecto).length;
    const div = document.createElement('div');
    div.className = 'tarjeta-cliente';
    div.innerHTML = `<div class="tarjeta-cliente-info"><strong>${escapeHtml(lote.nombre)}</strong>` +
      `<span class="nota">${filas.length} inmueble(s) · ${conProyecto} con cotización · actualizado ${new Date(lote.actualizadoEn).toLocaleDateString('es-MX')}</span></div>`;
    div.addEventListener('click', () => renderDetalleLote(lote.id));
    const btnBorrar = document.createElement('button');
    btnBorrar.type = 'button';
    btnBorrar.className = 'btn-link btn-borrar-cliente';
    btnBorrar.textContent = '🗑';
    btnBorrar.title = 'Eliminar este lote (las cotizaciones que ya tenga NO se borran)';
    btnBorrar.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`¿Eliminar el lote "${lote.nombre}"? Deja de rastrear sus ${filas.length} inmueble(s) aquí -- las cotizaciones que ya tengan creadas NO se borran, se quedan donde están.`)) {
        eliminarLotePropio(lote.id);
        renderListaLotes();
      }
    });
    div.append(btnBorrar);
    cont.append(div);
  }
}

function renderDetalleLote(loteId) {
  const lote = obtenerLotePropio(loteId);
  if (!lote) { renderListaLotes(); return; }
  loteActivoId = loteId;
  history.replaceState(null, '', `mislotes.html?lote=${encodeURIComponent(loteId)}`);
  document.getElementById('seccionListaLotes').hidden = true;
  document.getElementById('seccionDetalleLote').hidden = false;
  document.getElementById('tituloLoteActivo').textContent = lote.nombre;
  document.title = `${lote.nombre} · Mis lotes`;
  const filas = datosDelLote(lote);
  renderTotales(filas);
  const cont = document.getElementById('tablaLote');
  cont.innerHTML = '';
  if (!filas.length) {
    cont.append(Object.assign(document.createElement('p'), {
      className: 'nota',
      textContent: 'Este lote todavía no tiene inmuebles -- agrégalos arriba (nombre + RPU).',
    }));
    return;
  }
  for (const { etiqueta, filas: filasGrupo } of agruparPorTarifa(filas)) {
    const h3 = document.createElement('h3');
    h3.textContent = `${etiqueta} (${filasGrupo.length})`;
    cont.append(h3);
    for (const fila of filasGrupo) cont.append(tarjetaInmueble(fila, lote));
  }
}

document.getElementById('btnCrearLote').addEventListener('click', () => {
  const input = document.getElementById('inputNombreLoteNuevo');
  const nombre = input.value.trim();
  if (!nombre) { alert('Escribe un nombre para el lote nuevo.'); return; }
  const lote = crearLotePropio({ nombre });
  input.value = '';
  renderDetalleLote(lote.id);
});

document.getElementById('btnVolverListaLotes').addEventListener('click', renderListaLotes);

document.getElementById('btnRenombrarLote').addEventListener('click', () => {
  const lote = obtenerLotePropio(loteActivoId);
  if (!lote) return;
  const nombre = prompt('Nuevo nombre para este lote:', lote.nombre);
  if (nombre == null) return;
  const limpio = nombre.trim();
  if (!limpio) { alert('El nombre no puede quedar vacío.'); return; }
  renombrarLotePropio(loteActivoId, limpio);
  renderDetalleLote(loteActivoId);
});

document.getElementById('btnEliminarLote').addEventListener('click', () => {
  const lote = obtenerLotePropio(loteActivoId);
  if (!lote) return;
  if (!confirm(`¿Eliminar el lote "${lote.nombre}"? Las cotizaciones que ya tenga creadas NO se borran, se quedan donde están.`)) return;
  eliminarLotePropio(loteActivoId);
  renderListaLotes();
});

document.getElementById('btnAgregarInmueble').addEventListener('click', () => {
  const inputNombre = document.getElementById('inputNombreInmuebleNuevo');
  const inputRpu = document.getElementById('inputRpuInmuebleNuevo');
  const nombre = inputNombre.value.trim();
  const rpu = inputRpu.value.trim();
  if (!nombre) { alert('Falta el nombre del inmueble.'); return; }
  agregarInmuebleALote(loteActivoId, { nombre, rpu });
  inputNombre.value = '';
  inputRpu.value = '';
  renderDetalleLote(loteActivoId);
});

document.getElementById('btnExportarLoteCsv').addEventListener('click', () => {
  const lote = obtenerLotePropio(loteActivoId);
  if (!lote) return;
  const filas = datosDelLote(lote);
  const encabezado = ['Inmueble', 'RPU', 'Tarifa', 'Estado', 'Inversion', 'Ahorro anual'];
  const lineas = [encabezado.join(',')];
  for (const f of filas) {
    const estado = estadoCotizacion(f.proyecto);
    lineas.push([
      `"${(f.inmueble.nombre || '').replace(/"/g, '""')}"`,
      f.inmueble.rpu || '',
      tarifaEfectiva(f) || '',
      estado.etiqueta,
      f.proyecto?.ultimaInversionTotal ?? '',
      f.proyecto?.ultimoAhorroAnual ?? '',
    ].join(','));
  }
  // BOM UTF-8 al inicio -- mismo patron ya usado en el resto del proyecto (Dashboard,
  // lote40Vista.js) para que Excel no rompa acentos/ñ al abrir el CSV.
  const csv = '﻿' + lineas.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${lote.nombre.replace(/[^a-z0-9]+/gi, '_')}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
});

const params = new URLSearchParams(location.search);
const loteParam = params.get('lote');
if (loteParam && obtenerLotePropio(loteParam)) renderDetalleLote(loteParam);
else renderListaLotes();
