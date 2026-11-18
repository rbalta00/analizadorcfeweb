// Prueba de paridad: el texto crudo real de varios recibos (extraido con pypdf en
// Python, guardado tal cual) se pasa por extraerCampos() aqui y se compara campo por
// campo contra lo que leer_recibo() de Python extrajo del MISMO texto. Si este test
// pasa, el port de las regex es correcto -- independiente de si pdf.js extrae el mismo
// texto que pypdf (eso se prueba aparte, ver test_recibo_pdf.mjs).
import { readFileSync } from 'node:fs';
import { extraerCampos } from './recibo.js';

// abue=GDMTO (energia en 1 fila), museo=GDMTH (3 franjas horarias), pdbt=sin demanda,
// secfinanzas=OCR real con varios campos faltantes (debe fallar la reconciliacion)
const CASOS = { abue: false, museo: false, pdbt: false, secfinanzas: true }; // valor = uso_ocr real de ese caso
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

console.log('\n' + (fallosTotal === 0 ? 'TODO OK' : `${fallosTotal} FALLOS`));
process.exit(fallosTotal === 0 ? 0 : 1);
