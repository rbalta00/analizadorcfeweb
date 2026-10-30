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
