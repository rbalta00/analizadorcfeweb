// Respaldo manual en la nube (Supabase, tabla cfe_respaldo) de los clientes/
// cotizaciones que normalmente viven solo en localStorage de este navegador -- pedido
// explicito del usuario: "lo que trabaje en la app web se queda guardado donde sea que
// lo trabaje" -- localStorage es por navegador/dispositivo, asi que para verlo desde
// otro lado hace falta subirlo y despues bajarlo ahi.
//
// A PROPOSITO es manual (subir/bajar con botones), no sincronizacion automatica en
// tiempo real: dos dispositivos escribiendo al mismo tiempo sin que el usuario lo vea
// podria pisar datos reales en silencio -- el mismo tipo de error que ya paso una vez
// esta sesion con localStorage.clear() (ver memoria). "Bajar de la nube" siempre
// avisa antes de reemplazar lo que hay en este dispositivo.
//
// Es una sola fila (singleton): no hay login en esta app, asi que no hay "mi nube" vs
// "la de otro" -- es un respaldo compartido para Isaac, igual que envios_cliente.
import { supabaseListar, supabaseInsertar, supabaseActualizar } from './supabase.js';
import { listarClientes, reemplazarTodosLosClientes } from './clientes.js';

const TABLA = 'cfe_respaldo';
let idFilaCache = null;

async function obtenerFilaActual() {
  const filas = await supabaseListar(TABLA, 'select=id,clientes,actualizado_en&order=actualizado_en.desc&limit=1');
  return filas[0] || null;
}

export async function subirANube() {
  const clientes = listarClientes();
  const fila = await obtenerFilaActual();
  const cambios = { clientes, actualizado_en: new Date().toISOString(), actualizado_desde: navigator.userAgent.slice(0, 120) };
  if (fila) {
    await supabaseActualizar(TABLA, fila.id, cambios);
    idFilaCache = fila.id;
  } else {
    const nueva = await supabaseInsertar(TABLA, cambios);
    idFilaCache = nueva ? nueva.id : null;
  }
  return { numClientes: clientes.length };
}

export async function consultarNube() {
  const fila = await obtenerFilaActual();
  if (!fila) return null;
  idFilaCache = fila.id;
  return { numClientes: (fila.clientes || []).length, actualizadoEn: fila.actualizado_en };
}

// Reemplaza TODOS los clientes de este dispositivo por lo que haya en la nube -- quien
// llame esta funcion debe haber confirmado con el usuario antes (ver app.js), no hay
// deshacer una vez que se llama.
export async function bajarDeNube() {
  const fila = await obtenerFilaActual();
  if (!fila) throw new Error('Todavía no hay ningún respaldo guardado en la nube.');
  reemplazarTodosLosClientes(fila.clientes || []);
  return { numClientes: (fila.clientes || []).length, actualizadoEn: fila.actualizado_en };
}

// Lista los clientes que hay AHORA MISMO en el respaldo de la nube (no los de este
// dispositivo) -- para el selector de "Eliminar un cliente de la nube" en app.js.
export async function listarClientesEnNube() {
  const fila = await obtenerFilaActual();
  return (fila && fila.clientes) || [];
}

// Quita UN cliente especifico (y sus cotizaciones) del respaldo en la nube, sin tocar
// nada de este dispositivo ni del resto del respaldo -- pedido explicito del usuario,
// 2026-11-06: poder limpiar algo que se subio por accidente (o que ya se borro aqui)
// sin tener que reemplazar TODO el respaldo con "Guardar copia en la nube" (eso
// subiria la lista actual completa, que es justo lo que se quiere evitar si el punto
// es limpiar un residuo viejo sin arrastrar cambios sin terminar de este dispositivo).
export async function eliminarClienteDeNube(clienteId) {
  const fila = await obtenerFilaActual();
  if (!fila) throw new Error('Todavía no hay ningún respaldo guardado en la nube.');
  const clientes = fila.clientes || [];
  const clientesFiltrados = clientes.filter((c) => c.id !== clienteId);
  if (clientesFiltrados.length === clientes.length) {
    throw new Error('Ese cliente ya no está en el respaldo de la nube (puede que ya se haya quitado).');
  }
  await supabaseActualizar(TABLA, fila.id, {
    clientes: clientesFiltrados,
    actualizado_en: new Date().toISOString(),
    actualizado_desde: navigator.userAgent.slice(0, 120),
  });
  idFilaCache = fila.id;
  return { numClientesRestantes: clientesFiltrados.length };
}
