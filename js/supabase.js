// Cliente REST minimo para Supabase -- sin el SDK supabase-js (consistente con el
// resto del proyecto: sin frameworks/dependencias, solo fetch directo a PostgREST).
// Mismo modelo de seguridad que los demas proyectos del usuario: la anon key es
// publica por diseno (va en el codigo fuente de esta pagina, igual que una API key de
// Google Maps), protegida por RLS en la base, no por un login -- esta app no tiene
// autenticacion. Ver ESTADO.md para la nota completa.
export const SUPABASE_URL = 'https://prchqgvwaepzmcohoehu.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_6vWVxCZKR80VfK4tabqtcg_MXWqnJFA';

const BASE = `${SUPABASE_URL}/rest/v1`;
const HEADERS_BASE = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

async function manejarRespuesta(resp) {
  if (!resp.ok) {
    const texto = await resp.text().catch(() => '');
    throw new Error(`Supabase ${resp.status}: ${texto || resp.statusText}`);
  }
  if (resp.status === 204) return null;
  return resp.json();
}

export async function supabaseInsertar(tabla, fila) {
  const resp = await fetch(`${BASE}/${tabla}`, {
    method: 'POST',
    headers: { ...HEADERS_BASE, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(fila),
  });
  const filas = await manejarRespuesta(resp);
  return filas ? filas[0] : null;
}

// supabaseListar('envios_cliente', 'estado=eq.pendiente&order=creado_en.desc')
export async function supabaseListar(tabla, query = '') {
  const resp = await fetch(`${BASE}/${tabla}?${query}`, { headers: HEADERS_BASE });
  return (await manejarRespuesta(resp)) || [];
}

export async function supabaseActualizar(tabla, id, cambios) {
  const resp = await fetch(`${BASE}/${tabla}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...HEADERS_BASE, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(cambios),
  });
  await manejarRespuesta(resp);
}

export async function supabaseEliminar(tabla, id) {
  const resp = await fetch(`${BASE}/${tabla}?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: HEADERS_BASE,
  });
  await manejarRespuesta(resp);
}

// Variantes con filtro arbitrario -- para tablas cuya llave primaria NO se llama "id"
// (ej. vista_compartida, llave "token"). `filtro` es un query string de PostgREST tal
// cual (ej. "token=eq.abc123").
export async function supabaseActualizarPorFiltro(tabla, filtro, cambios) {
  const resp = await fetch(`${BASE}/${tabla}?${filtro}`, {
    method: 'PATCH',
    headers: { ...HEADERS_BASE, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(cambios),
  });
  await manejarRespuesta(resp);
}

export async function supabaseEliminarPorFiltro(tabla, filtro) {
  const resp = await fetch(`${BASE}/${tabla}?${filtro}`, {
    method: 'DELETE',
    headers: HEADERS_BASE,
  });
  await manejarRespuesta(resp);
}

// Inserta o actualiza en un solo paso si ya existe una fila con el mismo valor en
// `onConflict` (nombre de columna con constraint unico/primary key) -- usado por la
// vista previa compartida para "empujar el estado mas reciente" sin tener que saber
// de antemano si ya existe la fila.
export async function supabaseUpsertar(tabla, fila, onConflict) {
  const resp = await fetch(`${BASE}/${tabla}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: 'POST',
    headers: { ...HEADERS_BASE, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(fila),
  });
  const filas = await manejarRespuesta(resp);
  return filas ? filas[0] : null;
}

// Sube un archivo (PDF o foto de un recibo) al bucket publico "recibos" y regresa su
// URL de descarga directa. `carpeta` agrupa los archivos (ej. "cotizaciones" o
// "envios") para poder distinguirlos en el bucket; `nombreOriginal` se sanea porque
// la ruta del archivo en Storage no acepta espacios ni acentos de forma confiable.
function nombreSeguro(nombre) {
  const base = (nombre || 'archivo').normalize('NFD').replace(/[̀-ͯ]/g, '');
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
}

export async function supabaseSubirArchivo(carpeta, file) {
  const ruta = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${nombreSeguro(file.name)}`;
  const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/recibos/${ruta}`, {
    method: 'POST',
    headers: { ...HEADERS_BASE, 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!resp.ok) {
    const texto = await resp.text().catch(() => '');
    throw new Error(`No se pudo subir "${file.name}" (${resp.status}): ${texto || resp.statusText}`);
  }
  return {
    nombre: file.name,
    tipo: file.type || 'application/octet-stream',
    ruta,
    url: `${SUPABASE_URL}/storage/v1/object/public/recibos/${ruta}`,
  };
}

export async function supabaseEliminarArchivo(ruta) {
  const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/recibos/${ruta}`, {
    method: 'DELETE',
    headers: HEADERS_BASE,
  });
  if (!resp.ok && resp.status !== 404) {
    const texto = await resp.text().catch(() => '');
    throw new Error(`No se pudo borrar el archivo (${resp.status}): ${texto || resp.statusText}`);
  }
}

// Lista los archivos que hay AHORA MISMO en una carpeta del bucket "recibos" (panel
// "Archivos en la nube" de app.js, 2026-11-06) -- el endpoint de "list" de Storage NO
// es recursivo (trata "/" como separador de carpeta, igual que un listado de
// directorio), asi que hay que pedirlo carpeta por carpeta (cotizaciones/envios/
// verificaciones, las 3 que usa supabaseSubirArchivo en este proyecto) en vez de una
// sola vez con prefix vacio.
export async function supabaseListarArchivos(carpeta) {
  const resp = await fetch(`${SUPABASE_URL}/storage/v1/object/list/recibos`, {
    method: 'POST',
    headers: { ...HEADERS_BASE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: carpeta, limit: 1000, sortBy: { column: 'created_at', order: 'desc' } }),
  });
  const items = await manejarRespuesta(resp);
  // Las carpetas listadas aparecen como objetos sin id (son sub-carpetas, nunca pasa
  // aqui porque ya pedimos con el prefijo exacto, pero por si acaso se filtran).
  return (items || []).filter((it) => it && it.id);
}
