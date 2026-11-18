// Prueba de paridad: el texto crudo real de varios recibos (extraido con pypdf en
// Python, guardado tal cual) se pasa por extraerCampos() aqui y se compara campo por
// campo contra lo que leer_recibo() de Python extrajo del MISMO texto. Si este test
// pasa, el port de las regex es correcto -- independiente de si pdf.js extrae el mismo
// texto que pypdf (eso se prueba aparte, ver test_recibo_pdf.mjs).
import { readFileSync } from 'node:fs';
import { extraerCampos } from './recibo.js';

// abue=GDMTO (energia en 1 fila), museo=GDMTH (3 franjas horarias), pdbt=sin demanda,
// secfinanzas=OCR real con varios campos faltantes (debe fallar la reconciliacion),
// cobaeb=PDBT real BIMESTRAL (62 dias, a diferencia de pdbt arriba que es mensual --
// misma tarifa, cadencia distinta, confirmado real -- auditoria 2026-11-18) cuyo
// "Energia (kWh)" trae pegado texto de pie de pagina entre la etiqueta y las lecturas,
// rompiendo los primeros 3 respaldos de periodo_kwh; y cuyo "Cargo Factor de
// Potencia((3))" usa un sinonimo ("Cargo" en vez de "Recargo") para el mismo concepto
// -- ambos hallazgos reales de esa misma auditoria sobre los 40 recibos reales del
// lote de gobierno, no sinteticos.
const CASOS = { abue: false, museo: false, pdbt: false, secfinanzas: true, cobaeb: false }; // valor = uso_ocr real de ese caso
let fallosTotal = 0;

for (const [caso, usoOcr] of Object.entries(CASOS)) {
  console.log(`\n=== ${caso} ===`);
  const texto = readFileSync(new URL(`./fixtures/recibo_texto_${caso}.txt`, import.meta.url), 'utf8');
  const esperado = JSON.parse(readFileSync(new URL(`./fixtures/recibo_campos_${caso}.json`, import.meta.url), 'utf8'));
  const real = extraerCampos(texto, usoOcr);

  for (const [campo, valorEsperado] of Object.entries(esperado)) {
    const valorReal = real[campo];
    let ok;
    if (campo === 'historial' || campo === 'rate_kw_detectado') {
      ok = JSON.stringify(valorReal) === JSON.stringify(valorEsperado);
    } else if (campo === 'campos_no_encontrados') {
      ok = JSON.stringify([...valorReal].sort()) === JSON.stringify([...valorEsperado].sort());
    } else if (typeof valorEsperado === 'number') {
      ok = Math.abs(valorReal - valorEsperado) < 0.01;
    } else {
      ok = valorReal === valorEsperado;
    }
    if (!ok) {
      fallosTotal++;
      console.log(`FALLO ${campo}: real=${JSON.stringify(valorReal)} esperado=${JSON.stringify(valorEsperado)}`);
    } else {
      console.log(`ok    ${campo}: ${JSON.stringify(valorReal)}`);
    }
  }
}

// Deteccion de tarifa '01' (domestica basica) -- texto sintetico, no un recibo real
// completo: nunca hubo un recibo real de tarifa 01 en este repo para probar contra el
// texto completo (ver auditoria 2026-11-18, TARIFAS_CONOCIDAS no incluia '01'). Cubre
// solo el patron de deteccion en si -- si aparece un recibo real de tarifa 01, agregar
// sus fixtures como los demas casos de arriba en vez de dejar esto como unica prueba.
console.log('\n=== tarifa 01 (sintetico) ===');
const CASOS_TARIFA_01 = [
  ['TARIFA: 1\nNO. DE SERVICIO: 123456789012\n', '01'],
  ['TARIFA:01\n', '01'],
  ['TARIFA 1B\n', '01'], // sufijo regional pre-2024
  ['TARIFA:PDBT\n', 'PDBT'], // no debe romper la deteccion de otras tarifas
  ['TARIFA:GDMTH\n', 'GDMTH'],
  ['algo con 01 cosas que no son tarifa, pagina 01 de 02\n', null], // sin "TARIFA" cerca, no debe detectar nada
];
for (const [texto, esperado] of CASOS_TARIFA_01) {
  const real = extraerCampos(texto, false).tarifa;
  if (real === esperado) {
    console.log(`ok    "${texto.replace(/\n/g, ' ')}" -> ${JSON.stringify(real)}`);
  } else {
    fallosTotal++;
    console.log(`FALLO "${texto.replace(/\n/g, ' ')}" -> real=${JSON.stringify(real)} esperado=${JSON.stringify(esperado)}`);
  }
}

// Marcador de nota al pie en superindice unicode ((³) en vez de (3)) -- hallazgo real,
// auditoria 2026-11-18, recibo real "10 ITS Huahuchinango" del lote de 40 inmuebles:
// "Bonificación Factor de Potencia(³) -410.38" nunca se detectaba porque \d (digito
// normal) no reconoce "³" (superindice unicode). Texto sintetico porque guardar el
// recibo completo como fixture no agrega cobertura nueva sobre lo que ya prueba cobaeb
// arriba (mismo tipo de concepto, otro formato de nota al pie).
console.log('\n=== nota al pie en superindice unicode (sintetico) ===');
const bonusSuperindice = extraerCampos('Energía  33,845.57\nBonificación Factor de Potencia(³)  -410.38\nSubtotal  33,788.20\n', false);
if (Math.abs(bonusSuperindice.bonus_monto - (-410.38)) < 0.01) {
  console.log(`ok    bonus_monto con "(³)" -> ${bonusSuperindice.bonus_monto}`);
} else {
  fallosTotal++;
  console.log(`FALLO bonus_monto con "(³)" -> real=${bonusSuperindice.bonus_monto} esperado=-410.38`);
}

// Etiqueta de varias palabras partida en 2 lineas por el PDF -- hallazgo real,
// auditoria 2026-11-18, recibo real "34 Carreteras de Cuota Paseo Bravo": "Bonificación
// Factor de\nPotencia((3)) -359.49" -- el patron antes tenia un ESPACIO LITERAL entre
// "de" y "Potencia", que nunca empata un salto de linea real de PDF.
console.log('\n=== etiqueta partida en 2 lineas (sintetico) ===');
const bonusPartido = extraerCampos('Energía  18,853.26\nBonificación Factor de\nPotencia((3)) -359.49\nSubtotal  18,560.85\n', false);
if (Math.abs(bonusPartido.bonus_monto - (-359.49)) < 0.01) {
  console.log(`ok    bonus_monto con etiqueta partida en 2 lineas -> ${bonusPartido.bonus_monto}`);
} else {
  fallosTotal++;
  console.log(`FALLO bonus_monto con etiqueta partida en 2 lineas -> real=${bonusPartido.bonus_monto} esperado=-359.49`);
}

// "Cargo Factor de Potencia" (sin el prefijo "Re") como sinonimo real de "Recargo
// Factor de Potencia" -- ya cubierto end-to-end por el fixture cobaeb de arriba, pero
// se deja tambien aqui aislado (sin el resto del recibo) para que una regresion futura
// en SOLO este patron falle aqui mismo, mas facil de diagnosticar que un fallo de
// reconciliacion en un fixture completo.
console.log('\n=== "Cargo Factor de Potencia" sin prefijo "Re" (sintetico) ===');
const recargoSinRe = extraerCampos('Energía  45,346.18\nCargo Factor de Potencia((3))  137.10\nSubtotal  45,836.29\n', false);
if (Math.abs(recargoSinRe.recargo_fp_monto - 137.10) < 0.01) {
  console.log(`ok    recargo_fp_monto con "Cargo..." (sin "Re") -> ${recargoSinRe.recargo_fp_monto}`);
} else {
  fallosTotal++;
  console.log(`FALLO recargo_fp_monto con "Cargo..." (sin "Re") -> real=${recargoSinRe.recargo_fp_monto} esperado=137.10`);
}

console.log('\n' + (fallosTotal === 0 ? 'TODO OK' : `${fallosTotal} FALLOS`));
process.exit(fallosTotal === 0 ? 0 : 1);
