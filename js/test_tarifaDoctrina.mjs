// Pruebas de regresion para js/tarifaDoctrina.js -- Parte 1 del encargo 2026-11-20
// ("Autocorrección de textos con doctrina de otra tarifa"). Caso real que motivo esto:
// el estudio original del COBAEP Plantel 26 (PDBT, servicio 217991104461) traia 2
// textos editados a mano con la doctrina de GDMTO (heredados de un machote equivocado),
// y el candado de exportacion solo detectaba el conflicto sin corregirlo -- obligaba a
// restaurar texto por texto a mano. Corre con:
//   node js/test_tarifaDoctrina.mjs
import { detectarTextosTarifaCruzada, sanearTextosTarifaCruzada } from './tarifaDoctrina.js';

let fallos = 0;
function ok(nombre, cond, detalle = '') {
  if (cond) {
    console.log(`ok    ${nombre}`);
  } else {
    fallos++;
    console.log(`FALLO ${nombre} ${detalle}`);
  }
}

// Mismos 2 textos reales citados en el encargo, sobre un `r` PDBT (sin demanda
// contratada) -- la tarifa real del recibo de este estudio.
const textosEditadosCobaep = {
  's2-t1': 'Tarifa GDMTO: Gran Demanda de Media tension Ordinaria, con cargo fijo mensual de acuerdo a la ' +
    'potencia contratada (demanda)…',
  's4-t0': 'En la Tarifa GDMTO. El recibo de energía eléctrica, los parametros que no disminuyen aunque la ' +
    'energía consumida llegue a cero son el "Suministro" y la "Capacidad" "Distribución" ya que estos dos ' +
    'ultimos se compone por la demanda contratada en kw…',
  's9-t0': 'Este texto no menciona ninguna tarifa ni doctrina de demanda, es redacción pura y no debe tocarse.',
};
const rPdbt = { tarifa: 'PDBT', meta: { tieneDemandaContratada: false } };

// 1. El detector sigue encontrando los 2 conflictos reales (sin regresión del candado).
{
  const conflictos = detectarTextosTarifaCruzada(rPdbt, textosEditadosCobaep);
  ok('detector: encuentra los 2 textos de doctrina GDMTO sobre un recibo PDBT', conflictos.length === 2);
  ok('detector: no marca el texto sin doctrina de tarifa', !conflictos.some((c) => c.id === 's9-t0'));
}

// 2. El saneamiento quita SOLO esas 2 entradas (nunca reescribe, nunca toca las demás).
{
  const { textosEditados, restaurados } = sanearTextosTarifaCruzada(rPdbt, textosEditadosCobaep);
  ok('saneamiento: restaurados trae los 2 ids esperados',
    restaurados.length === 2 && restaurados.some((r) => r.id === 's2-t1') && restaurados.some((r) => r.id === 's4-t0'));
  ok('saneamiento: textosEditados ya NO contiene s2-t1 ni s4-t0',
    !('s2-t1' in textosEditados) && !('s4-t0' in textosEditados));
  ok('saneamiento: s9-t0 se conserva intacto', textosEditados['s9-t0'] === textosEditadosCobaep['s9-t0']);
  ok('saneamiento: detectarTextosTarifaCruzada ya no encuentra nada tras sanear',
    detectarTextosTarifaCruzada(rPdbt, textosEditados).length === 0);
  ok('saneamiento: NUNCA muta el objeto original que se le pasó', textosEditadosCobaep['s2-t1'] !== undefined);
}

// 3. Control inverso (pedido explícito en la verificación del encargo): un estudio
// GDMTO con textos que enuncian la doctrina de demanda de GDMTO (correcta para él) no
// debe tocarse -- el saneamiento no encuentra nada que sanear.
{
  const rGdmto = { tarifa: 'GDMTO', meta: { tieneDemandaContratada: true } };
  const textosGdmto = {
    's2-t1': 'Tarifa GDMTO: Gran Demanda de Media tensión Ordinaria, con cargo fijo mensual de acuerdo a la ' +
      'potencia contratada (demanda) -- correcto para este estudio.',
  };
  const { textosEditados, restaurados } = sanearTextosTarifaCruzada(rGdmto, textosGdmto);
  ok('control inverso: un estudio GDMTO con su propia doctrina no se sanea', restaurados.length === 0);
  ok('control inverso: el texto se conserva exactamente igual', textosEditados['s2-t1'] === textosGdmto['s2-t1']);
}

// 4. Mismo defecto al revés (GDMTH, caso ya conocido de este mismo proyecto): doctrina
// de "sin demanda" (PDBT) sobre un recibo que SÍ tiene demanda contratada.
{
  const rGdmth = { tarifa: 'GDMTH', meta: { tieneDemandaContratada: true } };
  const textosGdmth = { 's4-t0': 'Esta tarifa no tiene cargos por demanda, así que todo baja con los paneles.' };
  const { restaurados } = sanearTextosTarifaCruzada(rGdmth, textosGdmth);
  ok('doctrina "sin demanda" sobre un recibo GDMTH (sí tiene demanda) también se sanea', restaurados.length === 1);
}

// 5. Sin textosEditados, o sin r.tarifa/r.meta (proyecto recien creado, sin calcular
// todavía) -- no debe tronar, regresa vacío.
{
  ok('sin r válido: regresa vacío sin tronar', sanearTextosTarifaCruzada(null, textosEditadosCobaep).restaurados.length === 0);
  ok('sin textosEditados: regresa vacío sin tronar', sanearTextosTarifaCruzada(rPdbt, null).restaurados.length === 0);
}

console.log('\n' + (fallos === 0 ? 'TODO OK' : `${fallos} FALLOS`));
process.exit(fallos === 0 ? 0 : 1);
