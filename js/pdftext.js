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
