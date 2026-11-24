// Servicios nuevos del tablero del lote de 40 inmuebles -- anexados al lote (si el
// cliente lo amplía) o independientes (fuera del lote) -- pedido explícito del
// usuario, 2026-11-24, v3 ("REGLA #1: no se toca NADA de lo que ya está hecho").
// Este módulo es TODO AGREGADO: no modifica LOTE_40_INMUEBLES (lote40.js), ni
// clientes.js, ni formulariosPorTarifa.js/leerRecibo.js -- solo los reusa tal cual,
// igual que ya reusa el resto de este proyecto (misma filosofía que datosLote40() en
// lote40Vista.js, que tampoco toca nada ajeno). El formulario de captura EN SÍ (que
// depende de la tarifa elegida -- cargos, historial, demanda, escalones) vive en
// lote40Vista.js reusando formulariosPorTarifa.js (el mismo módulo que ya usa
// cliente.html) -- este archivo solo recibe `f` ya leído (leerFormularioTarifa) y lo
// convierte al `formulario` que guarda cualquier proyecto.
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
import { supabaseSubirArchivo } from './supabase.js';
import { escalaCostosParaTarifa } from './motor.js';

const CLAVE_SERVICIOS_EXTRA = 'cfe_servicios_extra_v1';
export const NOMBRE_CLIENTE_LOTE_40 = '40 inmuebles';
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

// Convierte `f` (leerFormularioTarifa(tarifa) de formulariosPorTarifa.js -- el MISMO
// objeto "envio" que ya arma cliente.html para cualquier tarifa, con sus cargos/
// historial/demanda ya leídos del formulario PROPIO de esa tarifa, a mano o
// precargados de un recibo) al objeto `formulario` que guarda cualquier proyecto
// normal -- mismo mapeo que formularioDesdeEnvio() (app.js, panel interno), replicado
// aquí sin importar ese archivo. Mismos defaults que aplicarFormulario(null) para lo
// que `f` no trae (605 Wp, 1.0 cobertura, 4.5 h-sol, 4.0% escalamiento, sin ISR) --
// para que un extra se comporte exactamente como cualquier cotización nueva, para
// CUALQUIER tarifa.
function formularioDesdeFormularioTarifa(f, { tarifa, dom, titular, domicilio, noServicio }) {
  const esc = f.escalones || {};
  if (dom) {
    return {
      titular: titular || 'Cliente', domicilio: domicilio || '', noServicio: noServicio || '',
      tarifa,
      periodoDias: Number(f.periodoDias) || 60, periodoKwh: Number(f.periodoKwh) || 400, dap: Number(f.dap) || 0,
      cargos: {}, rkDist: 'demanda', rkCap: 'demanda',
      traeBt: false, btMonto: 0, traeBonus: false, bonusMonto: 0, traeRecargoFp: false, recargoFpMonto: 0,
      dBasicoKwh: esc.basicoKwh ?? 150, dBasicoRate: esc.basicoRate ?? 1.140,
      dInterKwh: esc.interKwh ?? 130, dInterRate: esc.interRate ?? 1.385, dExcedRate: esc.excedRate ?? 4.054,
      dDap: Number(f.dap) || 0, dCargoFijo: 0,
      dPeriodoDias: Number(f.periodoDias) || 60, dPeriodoKwh: Number(f.periodoKwh) || 400,
      historialNoDom: [], historialDom: (f.historial || []).filter((v) => v != null).map(Number),
      moduloWp: 605, cobertura: 1.0, horasUtiles: 4.5, escalaCostos: escalaCostosParaTarifa(tarifa), escalamiento: 4.0,
      aplicaIsr: false, tasaIsr: 30,
    };
  }
  return {
    titular: titular || 'Cliente', domicilio: domicilio || '', noServicio: noServicio || '',
    tarifa,
    periodoDias: Number(f.periodoDias) || 30, periodoKwh: Number(f.periodoKwh) || 1000, dap: Number(f.dap) || 197,
    cargos: f.cargos || {},
    rkDist: f.rateKw?.distribucion ? 'demanda' : 'mercado',
    rkCap: f.rateKw?.capacidad ? 'demanda' : 'mercado',
    traeBt: !!f.traeBt, btMonto: Number(f.btMonto) || 0,
    traeBonus: !!f.traeBonus, bonusMonto: Number(f.bonusMonto) || 0,
    traeRecargoFp: false, recargoFpMonto: 0,
    dBasicoKwh: 150, dBasicoRate: 1.140, dInterKwh: 130, dInterRate: 1.385, dExcedRate: 4.054, dDap: 0, dCargoFijo: 0,
    dPeriodoDias: 60, dPeriodoKwh: 400,
    historialNoDom: (f.historial || []).filter((v) => v != null).map(Number), historialDom: [],
    moduloWp: 605, cobertura: 1.0, horasUtiles: 4.5, escalaCostos: escalaCostosParaTarifa(tarifa), escalamiento: 4.0,
    aplicaIsr: false, tasaIsr: 30,
  };
}

function clienteLote40() {
  let cliente = listarClientes().find((c) => c.nombre === NOMBRE_CLIENTE_LOTE_40);
  if (!cliente) cliente = crearCliente({ nombre: NOMBRE_CLIENTE_LOTE_40, tipo: 'Gobierno' });
  return cliente;
}

// Alta completa de un servicio nuevo: valida duplicados, crea (o vincula) el proyecto
// real con el formulario YA LEÍDO del formulario propio de esa tarifa (f =
// leerFormularioTarifa(tarifa), ver formulariosPorTarifa.js -- la misma lectura que ya
// usa cliente.html, a mano o precargada de un recibo con llenarFormularioTarifaDesdeRecibo
// en la capa de DOM, lote40Vista.js), sube los documentos adjuntos a la nube igual que
// cualquier otra cotización, y agrega la entrada a la colección de extras. Nunca toca
// LOTE_40_INMUEBLES ni ningún proyecto existente salvo el que crea/vincula. `campos`
// (extraerCampos(), opcional) solo se usa para el aviso de "el RPU del recibo manda" y
// para precargar titular/domicilio si el recibo los trae -- la lectura del PDF en sí
// ya pasó en la capa de DOM antes de llamar esta función.
export async function altaServicioNuevo({ nombre, rpu, tarifa, dom, f, modo, campos, archivoRecibo, archivoVerificacion, loteActual, vincularSiExiste }) {
  const nombreEscrito = (nombre || '').trim();
  const rpuEscrito = (rpu || '').trim();
  if (!rpuEscrito) throw new Error('Captura el RPU del servicio.');
  if (!tarifa || !TARIFAS_SOPORTADAS.has(tarifa)) throw new Error('Elige una tarifa válida.');
  if (modo !== 'anexado' && modo !== 'independiente') throw new Error('Elige el destino: anexar al lote o servicio independiente.');

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

  let cliente, proyecto;
  if (existente && existente.tipo === 'proyecto') {
    cliente = existente.cliente;
    proyecto = existente.proyecto;
  } else {
    cliente = clienteLote40();
    proyecto = crearProyecto(cliente, { nombre: `${rpuFinal} ${nombreFinal}` });
    proyecto.formulario = formularioDesdeFormularioTarifa(f, {
      tarifa, dom, titular: campos?.titular || nombreFinal, domicilio: campos?.domicilio, noServicio: rpuFinal,
    });
    proyecto.campos = campos || null;
  }

  if (archivoRecibo) proyecto.archivosRecibo = [await supabaseSubirArchivo('cotizaciones', archivoRecibo)];
  if (archivoVerificacion) proyecto.archivosVerificacion = [await supabaseSubirArchivo('verificaciones', archivoVerificacion)];
  guardarProyecto(cliente, proyecto);

  const { estadoDocs, pendientes } = estadoDocsYPendientes(!!archivoRecibo, !!archivoVerificacion);
  const entry = {
    id: uuid(),
    modo,
    tarifaDelRecibo: tarifa,
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
