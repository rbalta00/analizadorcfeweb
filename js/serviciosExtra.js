// Servicios nuevos del tablero del lote de 40 inmuebles -- anexados al lote (si el
// cliente lo amplía) o independientes (fuera del lote) -- pedido explícito del
// usuario, 2026-11-24, v3 ("REGLA #1: no se toca NADA de lo que ya está hecho").
// Este módulo es TODO AGREGADO: no modifica LOTE_40_INMUEBLES (lote40.js), ni
// clientes.js, ni el lector de recibos (leerRecibo.js/recibo.js) -- solo los reusa tal
// cual, igual que ya reusa el resto de este proyecto (misma filosofía que
// datosLote40() en lote40Vista.js, que tampoco toca nada ajeno).
//
// Persistencia: colección nueva y propia en localStorage (misma técnica que
// clientes.js/cfe_clientes_v1, pero una llave aparte -- los 40 originales NUNCA viven
// aquí, solo los extras). Cada entrada tiene la MISMA forma que una entrada de
// LOTE_40_INMUEBLES ({ id, tarifaDelRecibo, inmueble, rpu, rpuAlt, reciboLocalizado,
// verificacionLocalizada, estadoDocs, pendientes }) más `modo` ('anexado' |
// 'independiente') y `creadoEn` -- así tarjetaLote40() (lote40Vista.js) puede
// renderizar un extra exactamente igual que uno de los 40, sin ninguna rama especial.
import { normalizarRpu } from './lote40.js';
import { listarClientes, crearCliente, crearProyecto, guardarProyecto } from './clientes.js';
import { leerRecibo } from './leerRecibo.js';
import { supabaseSubirArchivo } from './supabase.js';
import { escalaCostosParaTarifa } from './motor.js';

const CLAVE_SERVICIOS_EXTRA = 'cfe_servicios_extra_v1';
export const NOMBRE_CLIENTE_LOTE_40 = '40 inmuebles';
const DOMESTICAS = new Set(['01', 'DAC']);
const TARIFAS_SOPORTADAS = new Set(['GDMTO', 'GDMTH', 'GDBT', 'PDBT', '01', 'DAC']);

function uuid() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function listarServiciosExtra() {
  try {
    const crudo = localStorage.getItem(CLAVE_SERVICIOS_EXTRA);
    const lista = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function guardarListaServiciosExtra(lista) {
  localStorage.setItem(CLAVE_SERVICIOS_EXTRA, JSON.stringify(lista));
}

export function eliminarServicioExtra(id) {
  const lista = listarServiciosExtra().filter((e) => e.id !== id);
  guardarListaServiciosExtra(lista);
  return lista;
}

// Mismos 2 textos ya usados en LOTE_40_INMUEBLES (lote40.js) -- no se inventa
// redacción nueva, para que un extra se vea y se lea exactamente igual que uno de los
// 40 originales en el mismo estado de documentación.
function estadoDocsYPendientes(reciboOk, verificacionOk) {
  if (reciboOk && verificacionOk) {
    return {
      estadoDocs: 'Recibo y verificación localizados',
      pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.',
    };
  }
  if (reciboOk && !verificacionOk) {
    return { estadoDocs: 'Documentación inicial incompleta', pendientes: 'Falta verificación en sitio' };
  }
  if (!reciboOk && verificacionOk) {
    return { estadoDocs: 'Documentación inicial incompleta', pendientes: 'Falta recibo' };
  }
  return { estadoDocs: 'Documentación inicial incompleta', pendientes: 'Falta recibo y verificación en sitio' };
}

// Busca un RPU contra las 3 fuentes que NO deben duplicarse (pedido explícito del
// usuario): los 40 originales, los extras ya dados de alta (cualquier modo), y
// cualquier proyecto real ya existente en cualquier cliente (por si ya se había
// capturado a mano antes de que existiera este alta). Regresa null si no hay match.
export function buscarRpuExistente(rpuInput, loteActual) {
  const rpu = normalizarRpu(rpuInput);
  if (!rpu) return null;
  const enLote = (loteActual || []).find((d) => [d.rpu, d.rpuAlt].filter(Boolean).map(normalizarRpu).includes(rpu));
  if (enLote) return { tipo: 'lote40', inmueble: enLote.inmueble };
  const enExtra = listarServiciosExtra().find((d) => [d.rpu, d.rpuAlt].filter(Boolean).map(normalizarRpu).includes(rpu));
  if (enExtra) return { tipo: 'extra', inmueble: enExtra.inmueble, modo: enExtra.modo };
  for (const c of listarClientes()) {
    for (const p of (c.proyectos || [])) {
      if (normalizarRpu(p.formulario?.noServicio) === rpu) return { tipo: 'proyecto', cliente: c, proyecto: p };
    }
  }
  return null;
}

// Convierte `campos` (extraerCampos() de recibo.js, snake_case) al MISMO objeto
// `formulario` que guarda cualquier proyecto normal -- mismo campo-por-campo que
// llenarFormularioDesdeReciboCampos()/leerFormulario() (app.js/formularioRecibo.js),
// pero sin tocar el DOM (esta página no tiene el formulario de index.html). Mismos
// defaults que aplicarFormulario(null) cuando el recibo no trae un dato (605 Wp, 1.0
// cobertura, 4.5 h-sol, 4.0% escalamiento, sin ISR) -- para que un extra calculado se
// comporte exactamente como cualquier cotización nueva de siempre, para CUALQUIER
// tarifa.
function formularioDesdeCamposLeidos(campos, { tarifaElegida, nombreEscrito, rpuEscrito }) {
  const c = campos || {};
  const tarifaFinal = (c.tarifa && TARIFAS_SOPORTADAS.has(c.tarifa)) ? c.tarifa : tarifaElegida;
  const esDom = DOMESTICAS.has(tarifaFinal);
  const base = {
    titular: c.titular || nombreEscrito || 'Cliente',
    domicilio: c.domicilio || '',
    noServicio: c.no_servicio || rpuEscrito || '',
    tarifa: tarifaFinal,
    moduloWp: 605, cobertura: 1.0, horasUtiles: 4.5,
    escalaCostos: escalaCostosParaTarifa(tarifaFinal), escalamiento: 4.0,
    aplicaIsr: false, tasaIsr: 30,
    dBasicoKwh: 150, dBasicoRate: 1.140, dInterKwh: 130, dInterRate: 1.385, dExcedRate: 4.054,
    dDap: 0, dCargoFijo: 0, dPeriodoDias: 60, dPeriodoKwh: 400,
    historialNoDom: [], historialDom: [],
    periodoDias: 30, periodoKwh: 1000, dap: 197,
    cargos: {}, rkDist: 'demanda', rkCap: 'demanda',
    traeBt: false, btMonto: 0, traeBonus: false, bonusMonto: 0, traeRecargoFp: false, recargoFpMonto: 0,
  };
  if (!esDom) {
    base.periodoDias = c.periodo_dias ?? 30;
    base.periodoKwh = c.periodo_kwh ?? 1000;
    base.dap = c.dap ?? 197;
    const cargos = {
      suministro: c.suministro ?? 0, distribucion: c.distribucion ?? 0, transmision: c.transmision ?? 0,
      cenace: c.cenace ?? 0, capacidad: c.capacidad ?? 0, scnmem: c.scnmem ?? 0,
    };
    if (c.energia_base != null || c.energia_intermedia != null || c.energia_punta != null) {
      cargos.energiaBase = c.energia_base ?? 0; cargos.energiaIntermedia = c.energia_intermedia ?? 0; cargos.energiaPunta = c.energia_punta ?? 0;
    } else {
      cargos.energia = c.energia ?? 0;
    }
    base.cargos = cargos;
    if (c.rate_kw_detectado) {
      base.rkDist = c.rate_kw_detectado.distribucion > 0 ? 'demanda' : 'mercado';
      base.rkCap = c.rate_kw_detectado.capacidad > 0 ? 'demanda' : 'mercado';
    }
    if (c.bt_monto) { base.traeBt = true; base.btMonto = c.bt_monto; }
    if (c.bonus_monto) { base.traeBonus = true; base.bonusMonto = Math.abs(c.bonus_monto); }
    if (c.recargo_fp_monto) { base.traeRecargoFp = true; base.recargoFpMonto = Math.abs(c.recargo_fp_monto); }
    if (c.historial && c.historial.length) base.historialNoDom = c.historial.slice(-12).map((h) => h.kwh);
  } else {
    base.dPeriodoDias = c.periodo_dias ?? 60;
    base.dPeriodoKwh = c.periodo_kwh ?? 400;
    base.dDap = c.dap ?? 0;
    if (c.historial && c.historial.length) base.historialDom = c.historial.slice(-6).map((h) => h.kwh);
  }
  return base;
}

function clienteLote40() {
  let cliente = listarClientes().find((c) => c.nombre === NOMBRE_CLIENTE_LOTE_40);
  if (!cliente) cliente = crearCliente({ nombre: NOMBRE_CLIENTE_LOTE_40, tipo: 'Gobierno' });
  return cliente;
}

// Alta completa de un servicio nuevo: valida duplicados, opcionalmente lee el/los
// recibo(s) adjuntos con el MISMO lector que usa cualquier cotización normal
// (leerRecibo, reusado sin cambios -- funciona igual para las 6 tarifas), crea (o
// vincula) el proyecto real, sube los documentos adjuntos a la nube igual que
// cualquier otra cotización, y agrega la entrada a la colección de extras. Nunca
// toca LOTE_40_INMUEBLES ni ningún proyecto existente salvo el que crea/vincula.
export async function altaServicioNuevo({ nombre, rpu, tarifa, modo, archivoRecibo, archivoVerificacion, loteActual, vincularSiExiste }) {
  const nombreEscrito = (nombre || '').trim();
  const rpuEscrito = (rpu || '').trim();
  if (!rpuEscrito) throw new Error('Captura el RPU del servicio.');
  if (!TARIFAS_SOPORTADAS.has(tarifa)) throw new Error('Elige una tarifa válida.');
  if (modo !== 'anexado' && modo !== 'independiente') throw new Error('Elige el destino: anexar al lote o servicio independiente.');

  let campos = null;
  if (archivoRecibo) campos = await leerRecibo(archivoRecibo);

  const rpuDelRecibo = campos?.no_servicio ? normalizarRpu(campos.no_servicio) : null;
  const rpuTecleadoNorm = normalizarRpu(rpuEscrito);
  let avisoRpu = null;
  if (rpuDelRecibo && rpuDelRecibo !== rpuTecleadoNorm) {
    avisoRpu = `El RPU capturado (${rpuEscrito}) no coincide con el del recibo leído (${campos.no_servicio}) -- se usó el del recibo, que es el que manda.`;
  }
  const rpuFinal = rpuDelRecibo || rpuTecleadoNorm;

  const existente = buscarRpuExistente(rpuFinal, loteActual);
  if (existente && existente.tipo !== 'proyecto') {
    throw new Error(`Ese RPU ya está dado de alta (${existente.tipo === 'lote40' ? 'es uno de los 40 originales' : `ya es un servicio ${existente.modo}`}: "${existente.inmueble}"). No se duplica.`);
  }
  if (existente && existente.tipo === 'proyecto' && !vincularSiExiste) {
    return { ok: false, requiereConfirmarVinculo: true, existente, avisoRpu };
  }

  const nombreFinal = nombreEscrito || campos?.titular || 'Servicio nuevo';
  const tarifaFinal = (campos?.tarifa && TARIFAS_SOPORTADAS.has(campos.tarifa)) ? campos.tarifa : tarifa;

  let cliente, proyecto;
  if (existente && existente.tipo === 'proyecto') {
    cliente = existente.cliente;
    proyecto = existente.proyecto;
  } else {
    cliente = clienteLote40();
    proyecto = crearProyecto(cliente, { nombre: `${rpuFinal} ${nombreFinal}` });
    proyecto.formulario = formularioDesdeCamposLeidos(campos, { tarifaElegida: tarifaFinal, nombreEscrito: nombreFinal, rpuEscrito: rpuFinal });
    proyecto.campos = campos;
  }

  if (archivoRecibo) proyecto.archivosRecibo = [await supabaseSubirArchivo('cotizaciones', archivoRecibo)];
  if (archivoVerificacion) proyecto.archivosVerificacion = [await supabaseSubirArchivo('verificaciones', archivoVerificacion)];
  guardarProyecto(cliente, proyecto);

  const { estadoDocs, pendientes } = estadoDocsYPendientes(!!archivoRecibo, !!archivoVerificacion);
  const entry = {
    id: uuid(),
    modo,
    tarifaDelRecibo: tarifaFinal,
    inmueble: nombreFinal,
    rpu: rpuFinal,
    rpuAlt: null,
    reciboLocalizado: !!archivoRecibo,
    verificacionLocalizada: !!archivoVerificacion,
    estadoDocs,
    pendientes,
    creadoEn: new Date().toISOString(),
  };
  const lista = listarServiciosExtra();
  lista.push(entry);
  guardarListaServiciosExtra(lista);
  return { ok: true, entry, avisoRpu };
}
