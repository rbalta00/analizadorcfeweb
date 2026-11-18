// Prueba de regresion para construirResultado() (resultado.js) -- no existia NINGUNA
// prueba automatizada de este archivo hasta ahora (motor.js y recibo.js si la tienen,
// pero la orquestacion que los une no). Se agrega enfocada en el bug real reportado
// por el usuario 2026-11-18: "la facturacion de PDBT no es mensual, revisala" --
// diasPorPeriodoHistorial asumia tarifa mensual para CUALQUIER tarifa que no fuera
// domestica/01/DAC, pero PDBT puede facturarse bimestral en la practica (confirmado
// con 2 recibos reales de PDBT en este proyecto: uno ~32 dias, otro -- COBAEB Plantel
// 26 -- de 62 dias). El fix usa el periodoDias REAL de este recibo en vez de adivinar
// por tarifa.
import { construirResultado } from './resultado.js';
import { COSTOS_COMERCIAL } from './motor.js';

let fallos = 0;
function assertCerca(nombre, real, esperado, tolerancia = 0.5) {
  const ok = Math.abs(real - esperado) <= tolerancia;
  console.log(`${ok ? 'ok   ' : 'FALLO'} ${nombre}: real=${real} esperado~=${esperado}`);
  if (!ok) fallos++;
}

// PDBT bimestral (como COBAEB Plantel 26, periodo real de 62 dias) con 3 periodos de
// historial reales (~11,000 kWh cada uno, el consumo real que cubre CADA bimestre
// completo -- NO un consumo mensual). Si diasPorPeriodoHistorial tratara cada entrada
// como si fuera de ~30.5 dias (el bug original), el consumo mensual normalizado
// saldria DOBLE del real (11,000 kWh/mes en vez de ~5,400 kWh/mes).
const inputPdbtBimestral = {
  titular: 'Cliente PDBT bimestral de prueba', domicilio: 'Dom.', noServicio: '000',
  tarifa: 'PDBT', esDomestica: false,
  periodoDias: 62, periodoKwh: 11000, dap: 197,
  cargos: { suministro: 335.36, distribucion: 2424.78, transmision: 1195.13, cenace: 50.44, energia: 17019.29, capacidad: 4652.79, scnmem: 45.79 },
  rateKw: { distribucion: 0, capacidad: 0 }, btPct: 0, fpBonusPct: 0, recargoFpPct: 0,
  moduloWp: 605, cobertura: 1.0, horasUtiles: 4.5, costos: COSTOS_COMERCIAL, escalamientoPct: 4,
  escalones: null, dapDomestica: null, cargoFijoDomestica: null,
  leido: null, inmueble: null, aplicaIsr: false, tasaIsrPct: 0,
  // El ULTIMO periodo del historial coincide a proposito con periodoKwh (asi es en la
  // realidad: el periodo que se factura ahora normalmente YA es el ultimo dato del
  // historial impreso) -- construirResultado() reemplaza el ultimo con periodoKwh de
  // cualquier forma (ver comentario "el ULTIMO periodo del historial..." en
  // resultado.js), evita que ese reemplazo silencioso descuadre el calculo esperado.
  historialManual: [11000, 11200, 11000], // 3 periodos bimestrales reales
  vigenciaDias: 15,
};
const rPdbt = construirResultado(inputPdbtBimestral);
// Consumo mensual esperado: promedio del historial (~11,066.67) normalizado de 62 a
// 30.5 dias -- NO el valor crudo del historial sin escalar.
const promedioHistorialCrudo = (11000 + 11200 + 11000) / 3;
const consumoMensualEsperado = promedioHistorialCrudo / 62 * 30.5; // ~5443.75
console.log('\n=== PDBT bimestral (COBAEB-like, periodoDias=62) ===');
assertCerca('n paneles (debe reflejar ~5,414 kWh/mes, NO ~11,000 kWh/mes)',
  rPdbt.n, Math.ceil(consumoMensualEsperado * 1.0 / (605 / 1000 * 30.5 * 4.5)), 1);
assertCerca('annualKwh (consumo anual extrapolado) es del orden de 65,000 kWh, no 130,000',
  rPdbt.annualKwh, consumoMensualEsperado * 12, 2000);

// Mismo historial, pero para una tarifa mensual real (GDMTO, periodoDias=31) -- debe
// seguir normalizando igual que antes del fix (periodoDias=31≈DIAS_MES_REF=30.5, casi
// sin cambio), para confirmar que el fix no rompe el caso ya validado.
const inputGdmtoMensual = { ...inputPdbtBimestral, tarifa: 'GDMTO', periodoDias: 31, periodoKwh: 2400,
  cargos: { suministro: 353.02, distribucion: 951.6, transmision: 432.24, cenace: 18.24, energia: 3182.4, capacidad: 2134.43, scnmem: 16.56 },
  rateKw: { distribucion: 1, capacidad: 1 }, historialManual: [1920, 400, 2400] }; // ultimo = periodoKwh
const rGdmto = construirResultado(inputGdmtoMensual);
const consumoMensualEsperadoGdmto = ((1920 + 400 + 2400) / 3) / 31 * 30.5; // casi identico al promedio crudo
console.log('\n=== GDMTO mensual (ya validado, no debe cambiar con el fix) ===');
assertCerca('annualKwh GDMTO sigue coherente (periodoDias≈DIAS_MES_REF, cambio minimo)',
  rGdmto.annualKwh, consumoMensualEsperadoGdmto * 12, 200);

console.log('\n' + (fallos === 0 ? 'TODO OK' : `${fallos} FALLOS`));
process.exit(fallos === 0 ? 0 : 1);
