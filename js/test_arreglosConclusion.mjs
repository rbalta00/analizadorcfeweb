// Pruebas de regresion para el encargo "Arreglar la conclusión vieja y los textos
// guardados" (2026-11-20, hallazgos de la revisión v3 del COBAEP, servicio
// 217991104461) -- partes 2 (saneamiento de doctrina desactualizada, tarifaDoctrina.js)
// y 4 (redondeo/cero negativo, util.js; diferenciaAhorro, resultado.js). Las partes 1
// (párrafo calculado nunca editable) y 3 (gráfica alternativa nunca al cliente) son
// de renderizado DOM -- verificadas en vivo en navegador, no aquí (mismo criterio que
// el resto del proyecto: lo que depende del DOM se prueba en vivo, la lógica pura aquí).
// Corre con:
//   node js/test_arreglosConclusion.mjs
import {
  evaluarTextoDoctrinaDesactualizada, detectarTextosDoctrinaDesactualizada, sanearTextosDoctrinaDesactualizada,
} from './tarifaDoctrina.js';
import { redondear, diferenciaRedondeada, M, PCT } from './util.js';
import { construirResultado } from './resultado.js';
import { COSTOS_COMERCIAL } from './motor.js';

let fallos = 0;
function ok(nombre, cond, detalle = '') {
  if (cond) {
    console.log(`ok    ${nombre}`);
  } else {
    fallos++;
    console.log(`FALLO ${nombre} ${detalle}`);
  }
}

// ---------------------------------------------------------------------------
// Parte 4: redondear/diferenciaRedondeada/M/PCT -- cero negativo y diferencias desde
// valores ya redondeados.
// ---------------------------------------------------------------------------
{
  ok('redondear: -0 se normaliza a 0', Object.is(redondear(-0, 2), 0));
  ok('redondear: un numero MUY cercano a cero pero negativo se normaliza a 0', Object.is(redondear(-0.001, 2), 0));
  ok('redondear: un negativo real se conserva', redondear(-123.456, 2) === -123.46);
  ok('M: nunca imprime "$-0.00"', M(-0.001) === '$0.00', M(-0.001));
  ok('M: un monto negativo real SI conserva el signo', M(-123.456) === '$-123.46', M(-123.456));
  ok('PCT: nunca imprime "-0.0%"', PCT(-0.00001) === '0.0%', PCT(-0.00001));
  ok('PCT: un porcentaje negativo real SI conserva el signo', PCT(-0.012) === '-1.2%', PCT(-0.012));

  // El caso real del encargo: recuperación de 2.5 vs 2.6 años -- la resta cruda
  // (2.46 - 2.54 = -0.08) redondearia a "-0.1" con .toFixed(1) directo aunque ambos
  // valores muestren "2.5 años" en pantalla (2.46 y 2.54 redondean los DOS a 2.5).
  const evPayback = 2.46, rPayback = 2.54;
  ok('diferenciaRedondeada: dos valores que muestran lo MISMO (2.5 y 2.5) dan 0.0, no -0.1',
    diferenciaRedondeada(evPayback, rPayback, 1) === 0 && `${diferenciaRedondeada(evPayback, rPayback, 1).toFixed(1)}` === '0.0',
    `${diferenciaRedondeada(evPayback, rPayback, 1)}`);
  // Caso del ejemplo del encargo: 2.6 (calculado) a 2.5 (verificado) -- diferencia real
  // -0.1, debe conservarse (no es el caso "-0.0").
  ok('diferenciaRedondeada: 2.5 vs 2.6 da exactamente -0.1', diferenciaRedondeada(2.5, 2.6, 1) === -0.1);
}

// ---------------------------------------------------------------------------
// Parte 2: doctrina desactualizada (§3/§4) -- caso real COBAEP (PDBT), Distribución y
// Capacidad SI bajan en este recibo (columna "$/kW" en $0.00).
// ---------------------------------------------------------------------------
const rPdbt = {
  tarifa: 'PDBT',
  meta: { tieneDemandaContratada: false, reducibles: ['energia', 'transmision', 'distribucion', 'capacidad', 'cenace', 'scnmem'], noReducibles: ['suministro'] },
};
{
  // §4: texto guardado heredado de una version mezclada con GDMTO -- omite
  // Distribución y Capacidad de "lo que SÍ baja" (quedaron implícitamente del lado de
  // "no baja", doctrina de demanda contratada que no aplica a este recibo PDBT).
  const textoListaVieja = 'Lo que SÍ baja: Energía + Transmisión + CENACE + SCnMEM. Lo que NO baja: Suministro + Distribución + Capacidad.';
  const r1 = evaluarTextoDoctrinaDesactualizada(textoListaVieja, rPdbt);
  ok('§4: detecta que omite Distribución y Capacidad (sí bajan en este recibo)', !!r1, JSON.stringify(r1));
  ok('§4: el motivo menciona los conceptos omitidos', r1 && /Distribución/.test(r1.motivo) && /Capacidad/.test(r1.motivo), r1 && r1.motivo);

  // Control: la lista ACTUAL/correcta (coincide con r.meta.reducibles) no se marca.
  const textoListaCorrecta = 'Lo que SÍ baja: Energía + Transmisión + Distribución + Capacidad + CENACE + SCnMEM. Lo que NO baja: Suministro.';
  ok('§4: la lista correcta (coincide con r.meta.reducibles) NO se marca', evaluarTextoDoctrinaDesactualizada(textoListaCorrecta, rPdbt) === null);

  // §3: "En palabras simples" explicando Capacidad como cargo por demanda, sin la
  // aclaración PDBT vigente.
  const textoPalabrasViejo = 'En palabras simples: "Suministro" es lo que cuesta que CFE le dé servicio. "Capacidad" es la potencia ' +
    'contratada -- un cargo por demanda que no baja aunque el consumo llegue a cero.';
  const r2 = evaluarTextoDoctrinaDesactualizada(textoPalabrasViejo, rPdbt);
  ok('§3 PDBT: detecta Capacidad explicada como cargo por demanda, sin la aclaración', !!r2, JSON.stringify(r2));

  // Control: el texto con la aclaración vigente (tal cual la genera aclaracionPalabrasSimplesPdbt) no se marca.
  const textoPalabrasCorrecto = 'En palabras simples: "Capacidad" es la potencia contratada. En esta tarifa, Distribución y Capacidad NO ' +
    'son cargos por demanda: son componentes del precio de cada kWh consumido, por eso sí disminuyen con los paneles. El único cargo que ' +
    'no baja es Suministro.';
  ok('§3 PDBT: el texto CON la aclaración vigente no se marca', evaluarTextoDoctrinaDesactualizada(textoPalabrasCorrecto, rPdbt) === null);

  // Un texto libre (saludo, nota) nunca se interpreta -- ni empieza como estos 2 parrafos.
  ok('texto libre (saludo) nunca se marca', evaluarTextoDoctrinaDesactualizada('Gracias por su confianza, quedamos atentos.', rPdbt) === null);

  // §3 en una tarifa CON demanda (GDMTH) -- la aclaración PDBT nunca aplica, el chequeo
  // (b) se omite por completo sin importar el contenido.
  const rGdmth = { tarifa: 'GDMTH', meta: { tieneDemandaContratada: true, reducibles: ['energia_base', 'energia_intermedia'], noReducibles: ['suministro', 'distribucion', 'capacidad', 'energia_punta'] } };
  ok('§3 en GDMTH: nunca se marca (la aclaración PDBT no aplica a esta tarifa)',
    evaluarTextoDoctrinaDesactualizada(textoPalabrasViejo, rGdmth) === null);

  // El caso real completo: detectar + sanear sobre un textosEditados con AMBOS
  // párrafos contaminados + un texto libre que debe sobrevivir intacto.
  const textosEditados = { 's3-t0': textoPalabrasViejo, 's4-t1': textoListaVieja, 's9-t0': 'Nota libre sin doctrina, se conserva tal cual.' };
  const conflictos = detectarTextosDoctrinaDesactualizada(rPdbt, textosEditados);
  ok('detectar: encuentra exactamente los 2 párrafos de doctrina contaminados', conflictos.length === 2,
    JSON.stringify(conflictos.map((c) => c.id)));
  const saneo = sanearTextosDoctrinaDesactualizada(rPdbt, textosEditados);
  ok('sanear: quita s3-t0 y s4-t1', !('s3-t0' in saneo.textosEditados) && !('s4-t1' in saneo.textosEditados));
  ok('sanear: conserva el texto libre s9-t0 intacto', saneo.textosEditados['s9-t0'] === textosEditados['s9-t0']);
  ok('sanear: NUNCA muta el objeto original que se le pasó', 's3-t0' in textosEditados);
  ok('sanear: detectarTextosDoctrinaDesactualizada ya no encuentra nada tras sanear',
    detectarTextosDoctrinaDesactualizada(rPdbt, saneo.textosEditados).length === 0);

  // Control: Zacapoaxtla (GDMTH, 836050403034 en el encargo) con su propia doctrina
  // CORRECTA -- no debe restaurar nada.
  const textoZacapoaxtlaCorrecto = 'Lo que SÍ baja: Energía base + Energía intermedia. Lo que NO baja: Suministro + Distribución + Capacidad + Energía punta.';
  ok('control Zacapoaxtla (GDMTH): su propia doctrina correcta no se sanea',
    evaluarTextoDoctrinaDesactualizada(textoZacapoaxtlaCorrecto, rGdmth) === null);
}

// Sin r válido / sin textosEditados -- no debe tronar.
{
  ok('sin r válido: regresa vacío sin tronar', sanearTextosDoctrinaDesactualizada(null, { a: 'x' }).restaurados.length === 0);
  ok('sin textosEditados: regresa vacío sin tronar', sanearTextosDoctrinaDesactualizada(rPdbt, null).restaurados.length === 0);
}

// ---------------------------------------------------------------------------
// Parte 4 (continuación): diferenciaAhorro en resultado.js -- dos escenarios que
// redondean al MISMO centavo no deben mostrar un residuo de punto flotante.
// ---------------------------------------------------------------------------
{
  const inputBase = {
    titular: 'Cliente de prueba', domicilio: 'Dom.', noServicio: '000',
    tarifa: 'PDBT', esDomestica: false,
    periodoDias: 62, periodoKwh: 12441, dap: 559.9,
    cargos: { suministro: 67.08, distribucion: 14516.16, transmision: 2240.62, cenace: 94.55, energia: 17019.29, capacidad: 10500.2, scnmem: 85.84 },
    rateKw: { distribucion: 0, capacidad: 0 }, btPct: 0, fpBonusPct: 0, recargoFpPct: 0,
    moduloWp: 605, cobertura: 1.0, horasUtiles: 4.5, costos: COSTOS_COMERCIAL, escalamientoPct: 4,
    escalones: null, dapDomestica: null, cargoFijoDomestica: null,
    leido: null, aplicaIsr: false, tasaIsrPct: 0,
    historialManual: [13513, 10473, 12943, 11656, 8987, 13095, 12747, 10740, 11239, 11933, 8078, 12441],
    vigenciaDias: 15,
  };
  // Escenario verificado con el MISMO numero de paneles que calcularia el motor --
  // ambos escenarios deben salir financieramente IGUALES (mismo "n"), asi que
  // diferenciaAhorro debe ser EXACTAMENTE 0 (ni un residuo de punto flotante tipo
  // 0.0000000001 que luego se imprimiria como "-$0.00"/"$0.00" con signo raro).
  const rSinVerif = construirResultado({ ...inputBase, inmueble: null });
  const rConVerifIgual = construirResultado({ ...inputBase, inmueble: { panelesVerificacion: rSinVerif.n } });
  ok('diferenciaAhorro es EXACTAMENTE 0 cuando los 2 escenarios calculan igual (mismo n)',
    Object.is(rConVerifIgual.escenarioVerificado.diferenciaAhorro, 0), rConVerifIgual.escenarioVerificado.diferenciaAhorro);
  ok('M(diferenciaAhorro) imprime "$0.00", nunca "$-0.00"', M(rConVerifIgual.escenarioVerificado.diferenciaAhorro) === '$0.00',
    M(rConVerifIgual.escenarioVerificado.diferenciaAhorro));

  // Escenario con MÁS paneles -- diferenciaAhorro debe seguir siendo un numero real
  // (no forzado a 0 cuando sí hay diferencia genuina).
  const rConVerifMas = construirResultado({ ...inputBase, inmueble: { panelesVerificacion: rSinVerif.n + 10 } });
  ok('diferenciaAhorro con más paneles verificados no es cero (hay diferencia real)',
    rConVerifMas.escenarioVerificado.diferenciaAhorro !== 0, rConVerifMas.escenarioVerificado.diferenciaAhorro);
}

console.log('\n' + (fallos === 0 ? 'TODO OK' : `${fallos} FALLOS`));
process.exit(fallos === 0 ? 0 : 1);
