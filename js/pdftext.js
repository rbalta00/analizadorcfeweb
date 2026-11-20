// Extrae el texto nativo de un PDF con pdf.js, reconstruyendo lineas por posicion Y
// (pdf.js entrega "text items" sueltos con sus coordenadas, no lineas ya armadas como
// pypdf en Python) -- necesario para que las regex de recibo.js (escritas contra el
// formato de salida de pypdf) encuentren los mismos patrones. Requiere que
// `window.pdfjsLib` ya este cargado (ver lib/pdf.min.js) y su worker configurado.

// abrirPdf/extraerTextoDeDocumento estan separados (en vez de una sola funcion que
// reciba los bytes) porque pdf.js "transfiere" (desprende) el ArrayBuffer que se le
// pasa a getDocument() -- si se necesita reabrir el mismo PDF despues (ej. para
// renderizar paginas a imagen si el texto no fue legible, ver leerRecibo.js), hay que
// reusar el documento YA ABIERTO, no volver a llamar getDocument con el mismo buffer
// (eso revienta con "Cannot perform Construct on a detached ArrayBuffer").
export async function abrirPdf(arrayBuffer) {
  return window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
}

export async function extraerTextoDeDocumento(pdf) {
  const partes = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const contenido = await page.getTextContent();
    partes.push(reconstruirLineas(contenido.items));
  }
  return partes.join('\n');
}

export async function extraerTextoPdfNativo(arrayBuffer) {
  const pdf = await abrirPdf(arrayBuffer);
  return extraerTextoDeDocumento(pdf);
}

// Varias reconstrucciones del MISMO texto, a partir de los MISMOS items de pdf.js por
// pagina -- pedido explicito del usuario, 2026-11-20: el recibo real GDMTH del Antiguo
// Edificio de Finanzas (220890101496) se lee perfecto con reconstruirLineas() (orden
// original del stream) cuando pdf.js entrega los items en el orden "esperado", pero si
// el generador de ESE PDF en particular entrega el stream con las columnas en otro
// orden, reconstruirLineas() pierde periodo_kwh/dap/bonus_monto/subtotal_resumen y
// mezcla el domicilio con la caja de "Total a pagar" -- el mismo problema que ya forzo
// varios respaldos a mano en recibo.js (ver comentarios ahi, 2026-11-18). En vez de
// adivinar una regla nueva para ESTE formato (que rompera con el siguiente), se generan
// 3 reconstrucciones candidatas y leerRecibo.js (extraerCampos) decide cual ganar segun
// que tan bien reconcilia -- la correccion vive en la SELECCION, nunca en las regex de
// recibo.js ni en el motor.
//
// Candidato A (reconstruirLineas, sin cambios): el primario de siempre, orden original
// del stream con salto de linea solo cuando el siguiente item cae mas abajo en Y. Es
// el que mejor funciona en la gran mayoria de los recibos reales de este proyecto.
//
// Candidato B (orden por renglon): ordena TODOS los items de la pagina por Y
// descendente y luego X ascendente -- agrupa primero por renglon visual (arriba hacia
// abajo), despues de izquierda a derecha dentro de cada renglon. Este orden global por
// Y se evito como PRIMARIO (mezcla columnas que comparten la misma altura, ej. el
// domicilio del cliente y la caja de "Total a pagar" de este mismo formato de recibo),
// pero como candidato evaluado por puntaje (nunca usado a ciegas) es seguro: si mezcla
// columnas, reconciliacion_diff/campos_no_encontrados lo van a penalizar y perder
// contra otro candidato.
//
// Candidato C (stream con cortes por columna): mismo orden original del stream que A,
// pero un salto horizontal grande entre dos items consecutivos (texto.x cambia mas de
// ~120pt) se trata TAMBIEN como salto de linea, no solo como espacio -- separa bloques
// de columnas que el stream trae pegados en el mismo renglon (misma Y) sin tocar el
// resto del comportamiento de A.
function agruparItemsConPosicion(items) {
  return items
    .filter(it => it.str !== undefined && it.str !== '')
    .map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));
}

function reconstruirPorRenglon(items, saltoMinimoY = 4) {
  const conPos = [...agruparItemsConPosicion(items)].sort((a, b) => (b.y - a.y) || (a.x - b.x));
  let texto = '';
  let anterior = null;
  for (const it of conPos) {
    if (anterior === null) {
      texto += it.str;
    } else if (anterior.y - it.y > saltoMinimoY) {
      texto += '\n' + it.str;
    } else if (it.x - (anterior.x + anterior.str.length * 4) > 3) {
      texto += ' ' + it.str;
    } else {
      texto += it.str;
    }
    anterior = it;
  }
  return texto;
}

function reconstruirPorColumnas(items, saltoMinimoY = 4, saltoMinimoX = 120) {
  const conPos = agruparItemsConPosicion(items);
  let texto = '';
  let anterior = null;
  for (const it of conPos) {
    if (anterior === null) {
      texto += it.str;
    } else if (anterior.y - it.y > saltoMinimoY) {
      texto += '\n' + it.str;
    } else if (Math.abs(it.x - anterior.x) > saltoMinimoX) {
      // Mismo renglon del stream (misma Y), pero un salto horizontal grande -- casi
      // seguro es otro bloque/columna pegado ahi, no continuacion natural del texto.
      texto += '\n' + it.str;
    } else if (it.x - (anterior.x + anterior.str.length * 4) > 3) {
      texto += ' ' + it.str;
    } else {
      texto += it.str;
    }
    anterior = it;
  }
  return texto;
}

export async function extraerTextosCandidatosDeDocumento(pdf) {
  const porPagina = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const contenido = await page.getTextContent();
    porPagina.push({
      a: reconstruirLineas(contenido.items),
      b: reconstruirPorRenglon(contenido.items),
      c: reconstruirPorColumnas(contenido.items),
    });
  }
  return [
    porPagina.map(p => p.a).join('\n'),
    porPagina.map(p => p.b).join('\n'),
    porPagina.map(p => p.c).join('\n'),
  ];
}

// Recorre los text items en su orden ORIGINAL (el orden en que pdf.js los entrega,
// que sigue el orden del content stream del PDF -- igual que pypdf.extract_text()),
// sin reordenar globalmente por posicion. Insertar una linea nueva cuando el siguiente
// item cae mas abajo en la pagina (salto de Y hacia abajo) reproduce el comportamiento
// de pypdf; reordenar todo por Y (lo que se intento primero) mezcla columnas distintas
// que comparten altura en el PDF -- ej. el domicilio del cliente (columna izquierda) y
// la caja de "Total a pagar" (columna derecha), que en este formato de recibo CFE caen
// casi en la misma Y pero son bloques de texto completamente distintos en el stream.
function reconstruirLineas(items, saltoMinimoY = 4) {
  const conPos = items
    .filter(it => it.str !== undefined && it.str !== '')
    .map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));

  let texto = '';
  let anterior = null;
  for (const it of conPos) {
    if (anterior === null) {
      texto += it.str;
    } else if (anterior.y - it.y > saltoMinimoY) {
      // el siguiente item esta mas abajo en la pagina -> nueva linea
      texto += '\n' + it.str;
    } else if (it.x - (anterior.x + anterior.str.length * 4) > 3) {
      // mismo renglon pero con un hueco horizontal notorio -> espacio
      texto += ' ' + it.str;
    } else {
      texto += it.str;
    }
    anterior = it;
  }
  return texto;
}
