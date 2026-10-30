// Prueba de paridad numerica: mismo caso real (Casa del Abue Sur, GDMTO) ya calculado
// con el motor Python, verificado linea por linea contra este port en JS. Correr con:
//   node js/test_motor.mjs
import {
  construirInvoice, pisoDeAhorro, flujoMensualAnual, dimensionarHorasSol,
  normalizarConsumoMensual, presupuestar, costoInversor, flujo25Anios, COSTOS_RESIDENCIAL,
} from './motor.js';

let fallos = 0;
function cerca(nombre, real, esperado, tol = 0.02) {
  const ok = Math.abs(real - esperado) <= tol;
  if (!ok) {
    fallos++;
    console.log(`FALLO ${nombre}: real=${real} esperado=${esperado} diff=${(real - esperado).toFixed(4)}`);
  } else {
    console.log(`ok    ${nombre}: ${real}`);
  }
}

// Datos reales del recibo de Casa del Abue Sur (ya leidos por leer_recibo.py en Python)
const tarifa = 'GDMTO', periodoDias = 32, periodoKwh = 2400.0;
const cargos = { suministro: 353.02, distribucion: 951.6, transmision: 432.24, cenace: 18.24,
                 capacidad: 2134.43, scnmem: 16.56, energia: 3182.4 };
const rateKw = { distribucion: 1.0, capacidad: 1.0 };
const dap = 197.0;

const { invoice } = construirInvoice(tarifa, periodoDias, periodoKwh, cargos, rateKw, dap, 0.0, 0.0);
const consumoMensual = normalizarConsumoMensual(periodoKwh, periodoDias);
const { n, kwp, genMensual, genAnual } = dimensionarHorasSol(consumoMensual, 605, 1.0, 4.5);
cerca('n paneles', n, 28, 0);
cerca('kwp', kwp, 16.94);
cerca('gen_mensual', genMensual, 2325.02);
cerca('gen_anual', genAnual, 27900.24);

const monthlyE = Array(12).fill(genAnual / kwp);
const pres = presupuestar(n, kwp, 605, COSTOS_RESIDENCIAL);
cerca('directo', pres.directo, 182238.96);
cerca('venta_sin_iva', pres.ventaSinIva, 262424.11);
cerca('iva', pres.iva, 41987.86);
cerca('inversion', pres.inversion, 304411.97);
cerca('materiales suman inversion con iva', pres.materiales.reduce((s, m) => s + m.importeMxn, 0), pres.ventaSinIva);

const dailyKwh = periodoKwh / periodoDias;
const pagoRecurrente = invoice(periodoDias, periodoKwh, false).total;
cerca('pago_recurrente', pagoRecurrente, 8419.65);

const { piso, ahorroMax, pct } = pisoDeAhorro(periodoDias, pagoRecurrente, invoice);
cerca('piso', piso, 4186.3);
cerca('ahorro_max', ahorroMax, 4233.35);
cerca('pct_max', pct, 0.5027940591354748, 0.0001);

const rows = flujoMensualAnual(invoice, dailyKwh, monthlyE, kwp, 1);
cerca('enero pago_sin_solar', rows[0].pagoSinSolarMxn, 8162.69);
cerca('enero pago_con_solar', rows[0].pagoConSolarEstimadoMxn, 4061.63);
cerca('febrero pago_sin_solar', rows[1].pagoSinSolarMxn, 7391.82);

const annualbefore = Math.round(rows.reduce((s, x) => s + x.pagoSinSolarMxn, 0) * 100) / 100;
const annualafter = Math.round(rows.reduce((s, x) => s + x.pagoConSolarEstimadoMxn, 0) * 100) / 100;
const ahorroAnual = Math.round((annualbefore - annualafter) * 100) / 100;
cerca('annualbefore', annualbefore, 96153.57);
cerca('annualafter', annualafter, 47866.93);
cerca('ahorro_anual', ahorroAnual, 48286.64);

const costoInv = costoInversor(pres.materiales);
cerca('costo_inversor', costoInv, 44732.16);

const flujo25 = flujo25Anios(pres.inversion, ahorroAnual, 0.10, 25, 0.04, 0.01, 0.03, 0.005, costoInv);
cerca('van', flujo25.van, 221864.98, 1.0);
cerca('tir', flujo25.tir, 0.17369130228309404, 0.0005);
cerca('recuperacion', flujo25.recuperacionAcumulada, 6.143327880671512, 0.01);

const fila13 = flujo25.flujo.find(x => x.anio === 13);
cerca('flujo13.ahorro', fila13.ahorroMxn, 72795.42);
cerca('flujo13.om', fila13.omMxn, 4340.19);
cerca('flujo13.reposicion', fila13.reposicionMxn, 63777.36);
cerca('flujo13.flujo_neto', fila13.flujoMxn, 4677.87);
cerca('flujo13.acumulado', fila13.acumuladoMxn, 361338.81, 1.0);

const fila1 = flujo25.flujo.find(x => x.anio === 1);
cerca('flujo1.flujo_neto', fila1.flujoMxn, 45242.52);
cerca('flujo1.acumulado', fila1.acumuladoMxn, -259169.45);

const fila25 = flujo25.flujo.find(x => x.anio === 25);
cerca('flujo25.flujo_neto', fila25.flujoMxn, 103556.0, 0.5);
cerca('flujo25.acumulado', fila25.acumuladoMxn, 1396586.52, 2.0);

console.log('\n' + (fallos === 0 ? `TODO OK (${24} verificaciones)` : `${fallos} FALLOS`));
process.exit(fallos === 0 ? 0 : 1);
