// Pruebas de regresion para js/identidadRecibo.js -- encargo "El RPU manda" (un estudio
// = un solo servicio, sin mezclar datos de dos recibos), 2026-11-20. Caso real que lo
// motivo: el estudio "SEP COLEGIO DE BACHILLERE" (PDBT, servicio 217991104461) salio
// con titular/domicilio/consumo de San Juan Totimehuacan (7,294 kWh) pero cargos/
// recibo adjunto/verificacion del COBAEP Plantel 26 de Chachapa, Amozoc -- el RPU real
// de ese servicio trae 12,441 kWh, no 7,294. Corre con:
//   node js/test_identidadRecibo.mjs
import {
  normalizarRpu, rpuDifiere, construirSelloDesdeCampos, diferenciasIdentidadRecibo, diferenciasSinConfirmar,
} from './identidadRecibo.js';

let fallos = 0;
function ok(nombre, cond, detalle = '') {
  if (cond) {
    console.log(`ok    ${nombre}`);
  } else {
    fallos++;
    console.log(`FALLO ${nombre} ${detalle}`);
  }
}

// El recibo real del COBAEP Plantel 26 (RPU 217991104461) -- lo que leerReciboMultiple()
// devolveria (snake_case).
const camposCobaep = {
  no_servicio: '217991104461',
  titular: 'COBAEP PLANTEL 26 CHACHAPA',
  domicilio: 'CHACHAPA, AMOZOC, PUEBLA',
  periodo_dias: 62,
  periodo_kwh: 12441,
};

// 1. construirSelloDesdeCampos arma el conjunto sellado correcto, sin mutar lo que se
// le pasa.
{
  const sello = construirSelloDesdeCampos(camposCobaep, '2026-10-01T00:00:00.000Z');
  ok('sello: no. de servicio normalizado', sello.noServicio === '217991104461');
  ok('sello: titular/domicilio/periodo tal cual el recibo', sello.titular === camposCobaep.titular &&
    sello.domicilio === camposCobaep.domicilio && sello.periodoDias === 62 && sello.periodoKwh === 12441);
  ok('sello: fecha de lectura respetada', sello.fechaLectura === '2026-10-01T00:00:00.000Z');
  ok('construirSelloDesdeCampos: sin campos regresa null', construirSelloDesdeCampos(null) === null);
}

// 2. rpuDifiere -- base de la Parte 1 (al leer/aplicar un recibo).
{
  ok('rpuDifiere: mismo RPU no difiere', !rpuDifiere('217991104461', '217991104461'));
  ok('rpuDifiere: RPU distinto SI difiere', rpuDifiere('217991104461', '836050403034'));
  ok('rpuDifiere: espacios de mas no cuentan como distinto', !rpuDifiere(' 217991104461 ', '217991104461'));
  ok('rpuDifiere: proyecto sin RPU todavia -- caso 1, nunca "difiere"', !rpuDifiere('', '217991104461'));
  ok('rpuDifiere: recibo sin no. de servicio detectado -- nunca "difiere"', !rpuDifiere('217991104461', ''));
}

// 3. El caso real: el sello es el del COBAEP (RPU correcto), pero el formulario quedo
// con el titular/domicilio/consumo de "SEP COLEGIO DE BACHILLERE" en San Juan
// Totimehuacan (el otro servicio) -- esto es justo lo que el candado de exportacion
// (Parte 2) debe atrapar. Los dias del periodo SI coinciden (62).
{
  const sello = construirSelloDesdeCampos(camposCobaep);
  const rMezclado = {
    noServicio: '217991104461', // el no. de servicio SI quedo correcto -- el problema es el resto
    titular: 'SEP COLEGIO DE BACHILLERE',
    domicilio: 'SAN JUAN TOTIMEHUACAN',
    periodoDias: 62,
    periodoKwh: 7294,
  };
  const diffs = diferenciasIdentidadRecibo(sello, rMezclado);
  ok('caso real: detecta exactamente 3 diferencias (titular, domicilio y consumo)', diffs.length === 3,
    JSON.stringify(diffs));
  ok('caso real: titular listado con el valor capturado y el del recibo', diffs.some((d) =>
    d.campo === 'titular' && d.capturado === 'SEP COLEGIO DE BACHILLERE' && d.recibo === camposCobaep.titular));
  ok('caso real: domicilio listado con el valor capturado y el del recibo', diffs.some((d) =>
    d.campo === 'domicilio' && d.capturado === 'SAN JUAN TOTIMEHUACAN' && d.recibo === camposCobaep.domicilio));
  ok('caso real: consumo del periodo listado (7,294 capturado vs 12,441 del recibo)', diffs.some((d) =>
    d.campo === 'periodoKwh' && Number(d.capturado) === 7294 && Number(d.recibo) === 12441));
  ok('caso real: dias del periodo NO se marca (coincide)', !diffs.some((d) => d.campo === 'periodoDias'));

  // "Usar los datos del recibo": tras corregir, ya no debe haber diferencias.
  const rCorregido = { ...rMezclado, titular: sello.titular, domicilio: sello.domicilio, periodoKwh: sello.periodoKwh };
  ok('caso real: tras usar los datos del recibo, cero diferencias', diferenciasIdentidadRecibo(sello, rCorregido).length === 0);
}

// 4. "Mantener mis datos capturados" -- no se vuelve a preguntar mientras no cambien,
// pero SI se vuelve a preguntar si el usuario edita otra vez ese mismo campo.
{
  const sello = construirSelloDesdeCampos(camposCobaep);
  const rMezclado = { noServicio: '217991104461', titular: 'SEP COLEGIO DE BACHILLERE', domicilio: camposCobaep.domicilio, periodoDias: 62, periodoKwh: 7294 };
  const diffs = diferenciasIdentidadRecibo(sello, rMezclado);
  const confirmados = { titular: rMezclado.titular, domicilio: rMezclado.domicilio, periodoKwh: rMezclado.periodoKwh };
  ok('confirmados: las 3 diferencias quedan filtradas', diferenciasSinConfirmar(diffs, confirmados).length === 0,
    JSON.stringify(diferenciasSinConfirmar(diffs, confirmados)));
  // El usuario vuelve a editar el titular a un tercer valor distinto al confirmado --
  // debe volver a aparecer.
  const rEditadoDeNuevo = { ...rMezclado, titular: 'OTRO NOMBRE MAS' };
  const diffs2 = diferenciasIdentidadRecibo(sello, rEditadoDeNuevo);
  const sinConfirmar2 = diferenciasSinConfirmar(diffs2, confirmados);
  ok('confirmados: un campo editado de nuevo (valor distinto al confirmado) se vuelve a marcar',
    sinConfirmar2.length === 1 && sinConfirmar2[0].campo === 'titular');
}

// 5. Control inverso -- un estudio normal de un solo RPU (formulario = recibo sellado)
// no genera ninguna diferencia (el candado no debe aparecer).
{
  const sello = construirSelloDesdeCampos({
    no_servicio: '836050403034', titular: 'ZACAPOAXTLA', domicilio: 'ZACAPOAXTLA, PUEBLA', periodo_dias: 30, periodo_kwh: 2400,
  });
  const rNormal = { noServicio: '836050403034', titular: 'ZACAPOAXTLA', domicilio: 'ZACAPOAXTLA, PUEBLA', periodoDias: 30, periodoKwh: 2400 };
  ok('estudio normal: sin diferencias', diferenciasIdentidadRecibo(sello, rNormal).length === 0);
  ok('normalizarRpu: coincide', normalizarRpu(rNormal.noServicio) === normalizarRpu(sello.noServicio));
}

// 6. Un campo que el recibo nunca detecto (null) nunca bloquea -- no se compara contra
// algo que el propio recibo no traia.
{
  const selloIncompleto = construirSelloDesdeCampos({ no_servicio: '111', titular: null, domicilio: null, periodo_dias: 30, periodo_kwh: 1000 });
  const rCualquiera = { noServicio: '111', titular: 'Lo que sea', domicilio: 'Cualquier domicilio', periodoDias: 30, periodoKwh: 1000 };
  ok('campo no detectado por el recibo: nunca se compara', diferenciasIdentidadRecibo(selloIncompleto, rCualquiera).length === 0);
}

// 7. Sin sello, o sin datos -- no debe tronar, regresa vacio.
{
  ok('sin sello: regresa vacio sin tronar', diferenciasIdentidadRecibo(null, { titular: 'x' }).length === 0);
  ok('sin datos: regresa vacio sin tronar', diferenciasIdentidadRecibo(construirSelloDesdeCampos(camposCobaep), null).length === 0);
  ok('sin confirmados: regresa las diferencias tal cual', diferenciasSinConfirmar([{ campo: 'titular' }], null).length === 1);
}

console.log('\n' + (fallos === 0 ? 'TODO OK' : `${fallos} FALLOS`));
process.exit(fallos === 0 ? 0 : 1);
