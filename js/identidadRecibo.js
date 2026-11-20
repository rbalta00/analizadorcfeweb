// "El RPU manda" (encargo 2026-11-20): un estudio = un solo servicio, sin mezclar
// datos de dos recibos. Caso real que motivo esto: el estudio "SEP COLEGIO DE
// BACHILLERE" (PDBT, servicio 217991104461) salio con titular/domicilio/consumo de
// San Juan Totimehuacan (7,294 kWh) pero cargos/recibo adjunto/verificacion del COBAEP
// Plantel 26 de Chachapa, Amozoc -- el RPU real de ese servicio (217991104461, segun
// su propio recibo) trae 12,441 kWh, no 7,294.
//
// Modulo PURO (sin DOM) -- la deteccion/comparacion vive aqui para poder probarla con
// node directo (ver test_identidadRecibo.mjs), igual que tarifaDoctrina.js. La
// orquestacion (dialogos de confirmacion, escribir en el formulario, guardar el
// proyecto) vive en app.js.

// Un RPU se compara como string recortado, nunca como numero -- un numero de servicio
// con ceros a la izquierda no debe tratarse como "el mismo" que uno sin ellos.
export function normalizarRpu(v) {
  return String(v ?? '').trim();
}

// true solo cuando AMBOS numeros de servicio existen y son distintos -- si cualquiera
// de los dos esta vacio (proyecto nuevo sin RPU todavia, o recibo sin no. de servicio
// detectado) no hay "conflicto" que resolver, es simplemente el caso 1 del encargo
// (el RPU del recibo pasa a ser el del estudio).
export function rpuDifiere(rpuActual, rpuNuevo) {
  const a = normalizarRpu(rpuActual), n = normalizarRpu(rpuNuevo);
  return !!a && !!n && a !== n;
}

// Arma el "conjunto sellado" de un recibo a partir de los campos que ya devuelve
// leerReciboMultiple()/recibo.js (snake_case: no_servicio, periodo_dias, periodo_kwh)
// -- mismo shape tanto si se sella al leer un recibo nuevo (Parte 1) como si se
// reconstruye retroactivamente desde proyecto.campos para un estudio viejo sin sello
// todavia (Parte 2.3, ver asegurarReciboSello en app.js). Un campo que el recibo nunca
// detecto queda en null -- diferenciasIdentidadRecibo() nunca compara contra null.
export function construirSelloDesdeCampos(campos, fechaLectura) {
  if (!campos) return null;
  return {
    noServicio: normalizarRpu(campos.no_servicio),
    titular: campos.titular ?? null,
    domicilio: campos.domicilio ?? null,
    periodoDias: campos.periodo_dias != null ? Number(campos.periodo_dias) : null,
    periodoKwh: campos.periodo_kwh != null ? Number(campos.periodo_kwh) : null,
    fechaLectura: fechaLectura || new Date().toISOString(),
  };
}

// Los 4 datos de la §2 del documento que el encargo pide verificar explicitamente.
const CAMPOS_IDENTIDAD = [
  { campo: 'titular', etiqueta: 'Titular', tipo: 'texto' },
  { campo: 'domicilio', etiqueta: 'Domicilio', tipo: 'texto' },
  { campo: 'periodoKwh', etiqueta: 'Consumo del periodo', tipo: 'numero' },
  { campo: 'periodoDias', etiqueta: 'Días del periodo', tipo: 'numero' },
];

function normTexto(v) {
  return String(v ?? '').trim();
}

// Compara lo CAPTURADO ahora mismo (`datos` -- normalmente `r`, el resultado ya
// calculado, que ya trae titular/domicilio/periodoDias/periodoKwh listos sea cual sea
// la tarifa) contra el recibo sellado de este proyecto (`sello`). Regresa solo las
// diferencias reales; un campo del sello en null/vacio (el recibo nunca trajo ese
// dato) nunca se compara, para no bloquear por algo que el propio recibo no tenia.
export function diferenciasIdentidadRecibo(sello, datos) {
  if (!sello || !datos) return [];
  const diffs = [];
  for (const { campo, etiqueta, tipo } of CAMPOS_IDENTIDAD) {
    const valorSello = sello[campo];
    if (valorSello == null || valorSello === '') continue;
    const valorActual = datos[campo];
    const igual = tipo === 'numero'
      ? Number(valorActual) === Number(valorSello)
      : normTexto(valorActual) === normTexto(valorSello);
    if (!igual) diffs.push({ campo, etiqueta, capturado: valorActual, recibo: valorSello });
  }
  return diffs;
}

// Quita de la lista los campos que el usuario ya confirmo explicitamente "mantener mis
// datos capturados" (proyecto.datosCapturadosConfirmados, Parte 2.2.b del encargo) --
// SOLO mientras el valor capturado siga siendo exactamente el que se confirmo; si
// volvio a cambiar, se vuelve a preguntar (el encargo dice "mientras no cambien").
export function diferenciasSinConfirmar(diffs, confirmados) {
  if (!confirmados) return diffs;
  return diffs.filter((d) => {
    if (!(d.campo in confirmados)) return true;
    const def = CAMPOS_IDENTIDAD.find((c) => c.campo === d.campo);
    const confirmado = confirmados[d.campo];
    return def?.tipo === 'numero'
      ? Number(confirmado) !== Number(d.capturado)
      : normTexto(confirmado) !== normTexto(d.capturado);
  });
}
