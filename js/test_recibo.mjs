// Prueba de paridad: el texto crudo real de varios recibos (extraido con pypdf en
// Python, guardado tal cual) se pasa por extraerCampos() aqui y se compara campo por
// campo contra lo que leer_recibo() de Python extrajo del MISMO texto. Si este test
// pasa, el port de las regex es correcto -- independiente de si pdf.js extrae el mismo
// texto que pypdf (eso se prueba aparte, ver test_recibo_pdf.mjs).
import { readFileSync } from 'node:fs';
import { extraerCampos } from './recibo.js';
import { elegirMejorCandidato, esLecturaPerfecta } from './leerRecibo.js';

// abue=GDMTO (energia en 1 fila), museo=GDMTH (3 franjas horarias), pdbt=sin demanda,
// secfinanzas=OCR real con varios campos faltantes (debe fallar la reconciliacion),
// cobaeb=PDBT real BIMESTRAL (62 dias, a diferencia de pdbt arriba que es mensual --
// misma tarifa, cadencia distinta, confirmado real -- auditoria 2026-11-18) cuyo
// "Energia (kWh)" trae pegado texto de pie de pagina entre la etiqueta y las lecturas,
// rompiendo los primeros 3 respaldos de periodo_kwh; y cuyo "Cargo Factor de
// Potencia((3))" usa un sinonimo ("Cargo" en vez de "Recargo") para el mismo concepto
// -- ambos hallazgos reales de esa misma auditoria sobre los 40 recibos reales del
// lote de gobierno, no sinteticos.
//
// cobaeb, 3 hallazgos reales MAS (auditoria 2026-11-18, reportados directo por el
// usuario sobre este mismo cliente ya guardado -- no sinteticos): (1) titular/domicilio
// nunca se detectaban porque el patron exigia el anclaje "Ciudad de Mexico" antes del
// bloque, pero este recibo no trae ese preambulo -- el nombre/domicilio son literalmente
// las primeras lineas del texto; (2) el historial de consumo se imprime como "del DD MES
// AA al DD MES AA  kWh  $  $" (rango de fechas), un formato que el patron de historial
// de arriba (pensado para "MES AA  N  kWh...") nunca reconocia -- historial salia null
// pese a que el recibo SI trae las 11 filas completas; (3) una vez agregado el soporte
// para ese formato, historial_anual_kwh/meses_cubiertos asumian "cada periodo = 1 mes"
// (arrastrado del formato mensual) y sobreestimaban el consumo anual casi al doble para
// un historial bimestral, ademas de marcar cada periodo consecutivo como un "hueco" falso.
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

// Seleccion por puntaje entre reconstrucciones de texto -- pedido explicito del
// usuario, 2026-11-20: el recibo real GDMTH del Antiguo Edificio de la Secretaria de
// Finanzas (220890101496) se lee perfecto cuando pdf.js entrega los items en el orden
// "correcto", pero si el mismo PDF entrega el stream con las columnas en otro orden, el
// mismo lector pierde periodo_kwh/dap/bonus_monto/subtotal_resumen y mezcla el
// domicilio con la caja de "Total a pagar". No se puede reproducir la reordenacion
// geometrica real de pdf.js aqui (los fixtures son texto plano, sin x/y) -- en vez de
// eso, esta prueba fija el caso real que SI se puede probar sin abrir un PDF: dados dos
// resultados de extraerCampos() ya calculados (uno de un candidato que leyo mal, como
// el que produciria una reconstruccion que mezcla columnas; otro de un candidato que
// leyo bien), elegirMejorCandidato() debe quedarse SIEMPRE con el que reconcilia,
// nunca con el que "parecia legible primero". La logica de generar los 3 candidatos en
// si (pdftext.js: reconstruirLineas/reconstruirPorRenglon/reconstruirPorColumnas) vive
// en el navegador (necesita pdf.js) -- se verifico en vivo contra la app real, ver
// reporte de verificacion del encargo.
console.log('\n=== seleccion por puntaje (Finanzas GDMTH, 220890101496) ===');
const textoFinanzasCorrecto = readFileSync(new URL('./fixtures/recibo_texto_finanzas_correcto.txt', import.meta.url), 'utf8');
const textoFinanzasMezclado = readFileSync(new URL('./fixtures/recibo_texto_finanzas_mezclado.txt', import.meta.url), 'utf8');
const camposCorrecto = extraerCampos(textoFinanzasCorrecto, false);
const camposMezclado = extraerCampos(textoFinanzasMezclado, false);

// Primero, confirma que los fixtures de verdad reproducen el defecto real: el
// candidato "mezclado" SI pierde exactamente los 4 campos que reporto el usuario, y el
// candidato "correcto" SI es una lectura perfecta -- si cualquiera de los dos dejara
// de ser cierto, la prueba de seleccion de abajo dejaria de probar lo que dice probar.
const perdidosEsperados = ['periodo_kwh', 'dap', 'bonus_monto', 'subtotal_resumen'];
for (const campo of perdidosEsperados) {
  const valor = camposMezclado[campo];
  if (valor === null || valor === undefined) {
    console.log(`ok    fixture mezclado SI pierde ${campo} (como el caso real)`);
  } else {
    fallosTotal++;
    console.log(`FALLO fixture mezclado deberia perder ${campo}, pero dio ${JSON.stringify(valor)} -- el fixture ya no reproduce el defecto real`);
  }
}
if (esLecturaPerfecta(camposCorrecto)) {
  console.log('ok    fixture correcto SI es una lectura perfecta');
} else {
  fallosTotal++;
  console.log(`FALLO fixture correcto deberia ser una lectura perfecta -- reconciliacion_diff=${camposCorrecto.reconciliacion_diff}, campos_no_encontrados=${JSON.stringify(camposCorrecto.campos_no_encontrados)}`);
}

// La prueba real: la seleccion debe quedarse con el candidato correcto, sin importar
// en que orden se le den los dos (simula que el candidato "mezclado" sea A, B o C).
for (const [nombre, lista] of Object.entries({
  'mezclado primero': [camposMezclado, camposCorrecto],
  'correcto primero': [camposCorrecto, camposMezclado],
})) {
  const elegido = elegirMejorCandidato(lista);
  if (elegido === camposCorrecto) {
    console.log(`ok    elegirMejorCandidato (${nombre}) -> se queda con el candidato correcto`);
  } else {
    fallosTotal++;
    console.log(`FALLO elegirMejorCandidato (${nombre}) -> se quedo con el candidato equivocado`);
  }
}

// La lectura perfecta final (la que devolveria leerReciboMultiple en este caso) debe
// traer exactamente los valores reales del recibo.
const elegidoFinal = elegirMejorCandidato([camposMezclado, camposCorrecto]);
const esperadosFinales = {
  reconciliacion_diff: 0,
  periodo_kwh: 51159,
  dap: 197,
  bonus_monto: -3169.27,
};
for (const [campo, esperado] of Object.entries(esperadosFinales)) {
  const real = elegidoFinal[campo];
  if (Math.abs(real - esperado) < 0.01) {
    console.log(`ok    lectura final ${campo}: ${real}`);
  } else {
    fallosTotal++;
    console.log(`FALLO lectura final ${campo}: real=${JSON.stringify(real)} esperado=${esperado}`);
  }
}
const franjas = ['energia_base', 'energia_intermedia', 'energia_punta'];
if (franjas.every(k => elegidoFinal[k] != null)) {
  console.log(`ok    lectura final trae las 3 franjas GDMTH: base=${elegidoFinal.energia_base} intermedia=${elegidoFinal.energia_intermedia} punta=${elegidoFinal.energia_punta}`);
} else {
  fallosTotal++;
  console.log(`FALLO lectura final deberia traer las 3 franjas GDMTH -- base=${elegidoFinal.energia_base} intermedia=${elegidoFinal.energia_intermedia} punta=${elegidoFinal.energia_punta}`);
}

console.log('\n' + (fallosTotal === 0 ? 'TODO OK' : `${fallosTotal} FALLOS`));
process.exit(fallosTotal === 0 ? 0 : 1);
