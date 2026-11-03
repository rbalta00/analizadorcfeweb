// Bloques de paginas que se pueden apagar/prender independientemente al generar la
// cotizacion -- MISMA estructura que BLOQUES_COTIZACION en app/propuesta.py (no
// reinventar aqui: un cambio en uno debe reflejarse en el otro). Agrupados en bloques,
// no pagina por pagina, porque algunas paginas se refieren entre si dentro del mismo
// bloque (ej. la pagina 3 dice "explicada en la pagina siguiente" sobre contenido de
// la pagina 4) -- apagar una sin la otra rompería esa referencia. 'resumen' (pagina 1)
// nunca se apaga: es la unica pagina que de verdad le importa a un cliente nuevo que
// solo ve una pagina.
export const BLOQUES_COTIZACION = [
  ['resumen', 'Resumen (página 1) — siempre incluida', true],
  ['recibo_cargos', 'Su recibo y cómo se forma el pago (págs. 2–4)', false],
  ['consumo_sistema', 'Consumo anual y sistema propuesto (págs. 5–6)', false],
  ['produccion', 'Producción estimada mes a mes (pág. 7)', false],
  ['ambiental', 'Impacto ambiental (pág. 8)', false],
  ['ahorro_pagos', 'Cómo se obtiene el ahorro y pagos con/sin paneles (págs. 9–10)', false],
  ['presupuesto', 'Presupuesto resumen y detalle de materiales (págs. 11–12)', false],
  ['recuperacion', 'Recuperación de la inversión y flujo a 25 años (págs. 13–14)', false],
  ['pagos_100', 'Pagos mensuales y qué tan cerca del 100% de ahorro (págs. 15–16)', false],
  ['documentos', 'Documentos adjuntos: recibo y verificación en sitio (págs. 17–18)', false],
  ['comparativo_verificacion', 'Proyecto y comparativo según la verificación en sitio (págs. 19–20)', false],
  ['pendientes', 'Qué falta para cerrar el ahorro, requisitos y notas del recibo (pág. 21)', false],
  ['alcance', 'Alcance, condiciones, entrega y mantenimiento (págs. 22–23)', false],
  ['glosario_fuentes', 'Glosario y fuentes (págs. 24–25)', false],
];

export function todosLosBloques() {
  return BLOQUES_COTIZACION.map(([clave]) => clave);
}

// Dos presets de bloques para las versiones "mas cortas" de la cotizacion completa
// (mismo formato de 24/25 paginas, solo con menos bloques activos) -- pedido explicito
// del usuario, 2026-11-03: "un poco mas cortas para que las entienda mas el cliente".
// No reemplazan seccionesActivas del proyecto (eso lo sigue controlando el usuario a
// mano en el indice); son generaciones puntuales aparte, para mandar algo mas digerible
// sin tener que desactivar/reactivar bloques cada vez.
//
// 9 secciones: solo lo que decide la compra -- que se propone, cuanto ahorra, cuando
// se paga solo, cuanto cuesta. (resumen=1 + consumo_sistema=2 + ahorro_pagos=2 +
// presupuesto=2 + recuperacion=2 = 9 paginas)
export const BLOQUES_SECCIONES_9 = ['resumen', 'consumo_sistema', 'ahorro_pagos', 'presupuesto', 'recuperacion'];

// 14 secciones: lo anterior + como se lee SU recibo real (confianza/transparencia) y
// que tan cerca llega al 100% de ahorro. (9 + recibo_cargos=3 + pagos_100=2 = 14 paginas)
export const BLOQUES_SECCIONES_14 = [
  'resumen', 'recibo_cargos', 'consumo_sistema', 'ahorro_pagos', 'presupuesto', 'recuperacion', 'pagos_100',
];

// Mapea 1..25 a la clave de bloque a la que pertenece esa pagina/seccion. Orden
// narrativo (pedido explicito del usuario, 2026-11-01): resumen -> calculo ->
// documentos/verificacion en sitio/comparativo -> cierre administrativo.
const MAPA_SECCION_BLOQUE = {
  1: 'resumen', 2: 'recibo_cargos', 3: 'recibo_cargos', 4: 'recibo_cargos',
  5: 'consumo_sistema', 6: 'consumo_sistema', 7: 'produccion', 8: 'ambiental',
  9: 'ahorro_pagos', 10: 'ahorro_pagos', 11: 'presupuesto', 12: 'presupuesto',
  13: 'recuperacion', 14: 'recuperacion', 15: 'pagos_100', 16: 'pagos_100',
  17: 'documentos', 18: 'documentos', 19: 'comparativo_verificacion', 20: 'comparativo_verificacion',
  21: 'pendientes', 22: 'alcance', 23: 'alcance', 24: 'glosario_fuentes', 25: 'glosario_fuentes',
};

export function bloqueDeSeccion(numeroSeccion) {
  return MAPA_SECCION_BLOQUE[numeroSeccion];
}

// Varias secciones comparten un mismo bloque apagable (ver comentario de
// BLOQUES_COTIZACION arriba) -- el checkbox "Incluir este detalle" de cada bloque de
// calculo (bloqueCalculo() en secciones.js) apaga/prende ese bloque COMPLETO, no solo la
// seccion individual donde se hizo clic. Antes el texto del checkbox no lo decia, lo que
// hacia parecer que cada seccion era independiente (hallazgo de la auditoria de
// 2026-11-01). Usado para avisar en el propio checkbox cuales otras secciones comparten
// el mismo interruptor.
export function seccionesDelBloque(bloqueClave) {
  return Object.keys(MAPA_SECCION_BLOQUE)
    .map(Number)
    .filter((n) => MAPA_SECCION_BLOQUE[n] === bloqueClave)
    .sort((a, b) => a - b);
}
