// Generador de PDF que lee DIRECTO el contenido ya renderizado en #contenedorSecciones
// (con las ediciones de texto/tablas del usuario YA aplicadas) en vez de usar el texto
// fijo de propuesta.js -- pedido explicito del usuario, 2026-11-07, tras varias rondas
// donde "Cotizacion completa" seguia sin reflejar ediciones.
//
// Por que no se "conectaron" los textos editados a propuesta.js en su lugar (lo que se
// intento primero): propuesta.js y secciones.js NO comparten la misma redaccion
// parrafo por parrafo -- son dos documentos escritos por separado (el PDF condensado
// para caber en pocas paginas, la pantalla mas extensa/educativa). Intentar sustituir
// "el parrafo N de la pantalla" en el lugar del "parrafo N del PDF" por posicion
// producia contenido MAL EMPATADO (ej. informacion duplicada o perdida, porque cada
// uno agrupa las cosas distinto) -- peor que no tener la edicion. La unica forma
// honesta de que el PDF lleve exactamente lo editado es leerlo de donde vive de
// verdad: el DOM ya renderizado.
//
// Las secciones 17/18 (documentos adjuntos: recibo/verificacion) y 19/20 (comparativo
// vs. verificacion en sitio) SI siguen usando las funciones dedicadas de propuesta.js
// (paginaDocumentoRecibo/paginaDocumentoVerificacion/paginaProyectoVerificado/
// paginaComparativoVerificacion) -- ya estan probadas y funcionando, y manejan datos
// (imagenes remotas, escenario verificado) que no viven como texto plano en el DOM.
// Todo lo demas (1-16, 21-25) se dibuja genericamente desde el DOM.
import {
  crearDoc, headX, subX, bodyX, spacer, cardsRow, notice,
  CONTENT_W, CONTENT_TOP, CONTENT_BOTTOM, MARGIN_L, NAVY, GREY, WHITE, BLACK, LINE,
} from './pdfComponents.js';

// OJO: ni 'detalle-calculo' (la clase del <details> real que arma detalle(), para
// "Ver detalle completo") ni 'calculo-detalle' (la clase del <div> que arma
// bloqueCalculo(), para "📐 Cómo se calculó") van en esta lista -- bug real reportado
// por el usuario ("no veo la seccion 06"): esVisible() corre ANTES que el chequeo de
// tagName==='DETAILS' en recorrer(), asi que tener la primera aqui descartaba ese
// bloque ENTERO antes de llegar al codigo que sí lo procesa. 'calculo-detalle-apagado'
// SI va -- esa es la clase que SI corresponde omitir (el toggle individual de "Cómo se
// calculó" de bloqueCalculo() esta apagado). 'seccion-numero' tampoco va aqui -- es el
// "NN de XX" que el usuario usa para confirmar que no falta nada, se queda como
// contenido real (ver el fallback generico de texto "huerfano" en recorrer()).
const CLASES_OMITIR = [
  'toggle-seccion', 'btn-restaurar-texto', 'btn-icono-global',
  'btn-ocultar-texto', 'nota-texto-global', 'nota-texto-oculto', 'th-accion-tabla',
  'td-accion-tabla', 'grafico-apagado', 'campo-oculto', 'col-oculta-tabla',
  'calculo-detalle-apagado',
  'fila-oculta-tabla', 'documento-adjunto-pdf',
];

function tieneClaseOmitida(nodo) {
  return CLASES_OMITIR.some((c) => nodo.classList && nodo.classList.contains(c));
}

function esVisible(nodo) {
  if (nodo.nodeType !== 1) return false;
  if (nodo.tagName === 'BUTTON') return false;
  if (tieneClaseOmitida(nodo)) return false;
  return true;
}

// jsPDF con las fuentes estandar (helvetica) solo soporta WinAnsi/Latin-1 -- un emoji
// u otro caracter fuera de ese rango (☀️⚡🏠🔌📐✓🚫, usados en varias secciones de
// pantalla) corrompe TODA la linea de texto (bytes nulos intercalados entre cada
// caracter) -- bug real encontrado probando esta funcion en vivo (seccion 6, "☀️
// Paneles → ⚡ Inversor..."). Se quitan en vez de intentar soportarlos; los acentos y
// ñ/¿/¡ del espanol SI quedan (viven dentro de Latin-1, 0-255).
function limpiarParaPdf(texto) {
  return String(texto)
    // Flechas/separadores usados en varios lados (ej. el esquema "☀️ Paneles → ⚡
    // Inversor → 🏠 Inmueble ↔ 🔌 Red CFE" de la seccion 6) -- se reemplazan por su
    // equivalente en ASCII ANTES de quitar lo que esta fuera de Latin-1, si no el
    // texto quedaba pegado sin ningun separador ("Paneles Inversor Inmueble Red" en
    // vez de "Paneles -> Inversor -> Inmueble <-> Red") -- bug real visto en vivo.
    .replace(/[→➜➔⇒↦]/g, ' -> ')
    .replace(/[↔⇔]/g, ' <-> ')
    .replace(/[•‣▪]/g, '-')
    .replace(/[^\x00-\xFF]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Si el cursor ya esta muy cerca del margen inferior, abre pagina nueva ANTES de
// dibujar lo que sigue -- igual de "ingenuo" que el resto de este proyecto (dibujar y
// recortar si no cabe, ver pdfComponents.js), pero revisado ANTES en vez de despues
// para no cortar whole elementos a la mitad en la mayoria de los casos.
//
// OJO: `altura` debe ser la altura REAL del elemento completo que se va a dibujar a
// continuacion, no un margen generico chico -- bug real reportado por el usuario
// ("se cortan entre hojas"): la primera version solo revisaba un colchon fijo de
// 40pt antes de un parrafo entero (a veces de varias lineas), asi que un parrafo
// largo podia EMPEZAR a dibujarse cerca del fondo y sus ultimas lineas quedaban
// cortadas en el borde de la pagina en vez de saltar completo a la siguiente.
function continuarSiNecesario(doc, y, altura) {
  if (y + altura > CONTENT_BOTTOM) {
    doc.addPage();
    return CONTENT_TOP;
  }
  return y;
}

// --- Estimacion de altura ANTES de dibujar (mismas formulas que pdfComponents.js,
// que no las expone por separado -- ver dibujarParrafo/notice/table ahi). ---
function contarLineas(doc, texto, ancho, size) {
  doc.setFontSize(size);
  return doc.splitTextToSize(String(texto), ancho).length;
}

function dibujarTexto(doc, nodo, y) {
  const texto = limpiarParaPdf(nodo.textContent);
  if (!texto) return y;
  const tag = nodo.tagName;
  const cls = nodo.className || '';
  if (tag === 'H2') {
    const lineas = (() => { doc.setFontSize(14); return doc.splitTextToSize(texto, CONTENT_W); })();
    y = continuarSiNecesario(doc, y, lineas.length * 18 + 4);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(NAVY);
    for (const l of lineas) { doc.text(l, MARGIN_L, y + 12); y += 18; }
    return y + 4;
  }
  if (tag === 'H3' || tag === 'H4' || tag === 'H5') {
    y = continuarSiNecesario(doc, y, contarLineas(doc, texto, CONTENT_W, 11.5) * 15 + 8 + 11.5);
    return subX(doc, y, texto);
  }
  if (cls.includes('seccion-pregunta')) {
    const lineas = (() => { doc.setFontSize(9.5); return doc.splitTextToSize(texto, CONTENT_W); })();
    y = continuarSiNecesario(doc, y, lineas.length * 12 + 4 + 9);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9.5); doc.setTextColor(GREY);
    for (const l of lineas) { doc.text(l, MARGIN_L, y + 9); y += 12; }
    return y + 4;
  }
  if (cls.includes('aviso-cream')) {
    const n = contarLineas(doc, texto, CONTENT_W - 20, 9.5);
    y = continuarSiNecesario(doc, y, n * 13 + 20);
    return notice(doc, y, texto);
  }
  // Parrafo normal, celda chica de tarjeta/leyenda, nota, badge, etc.
  y = continuarSiNecesario(doc, y, contarLineas(doc, texto, CONTENT_W, 10) * 13.5 + 6 + 10);
  return bodyX(doc, y, texto);
}

// Ancho de columna proporcional al texto mas largo que le toca mostrar (encabezado o
// cualquier celda de esa columna), con un piso minimo para que una columna de texto
// corto no quede comicamente angosta. No es exacto (no mide el ancho real de fuente,
// solo cuenta caracteres) pero evita el encimado de encabezados largos en tablas de
// muchas columnas sin tener que afinar "widths" a mano por cada tabla posible.
function anchosProporcionales(headers, rows) {
  const pesos = headers.map((h, i) => {
    const valores = [h, ...rows.map((r) => String(r[i] || ''))];
    return Math.max(...valores.map((v) => v.length), 3);
  });
  const total = pesos.reduce((a, b) => a + b, 0) || headers.length;
  const anchosCrudos = pesos.map((p) => (p / total) * CONTENT_W);
  // Piso POR COLUMNA basado en el ancho real que necesita su propio ENCABEZADO (que
  // table() nunca envuelve a varias lineas) -- un piso generico fijo (ej. 12% del
  // ancho) no bastaba: bug real visto en vivo con "Parte del sistema" encimandose con
  // "Cantidad y función" porque la OTRA columna tenia valores de oraciones completas
  // (70+ caracteres) que dominaban el reparto proporcional, dejando a "Parte del
  // sistema" (17 caracteres) por debajo de lo que su propio encabezado necesita.
  const pisos = headers.map((h) => Math.max(CONTENT_W * 0.1, String(h).length * 4.6 + 14));
  const faltante = anchosCrudos.reduce((suma, a, i) => suma + Math.max(pisos[i] - a, 0), 0);
  if (!faltante) return anchosCrudos;
  const totalPorEncimaDePiso = anchosCrudos.reduce((suma, a, i) => suma + (a > pisos[i] ? a : 0), 0) || 1;
  return anchosCrudos.map((a, i) => (a < pisos[i] ? pisos[i] : a - faltante * (a / totalPorEncimaDePiso)));
}

// Version de table() (pdfComponents.js) que SI pagina -- bug real encontrado probando
// en vivo ("sigue sin verse completa la cotizacion"): table() dibuja TODAS las filas
// que se le den en una sola pasada, sin revisar si se paso del fondo de la pagina.
// jsPDF no dibuja nada fuera del area de la hoja -- no tira error, simplemente esas
// filas "desaparecian" en silencio (visto con una tabla de 7 filas donde solo la
// primera aparecia en el PDF). Antes esto nunca se notaba porque las tablas fijas de
// propuesta.js siempre estan calibradas a mano para caber en una sola pagina -- las
// tablas genericas de aqui leen el texto REAL de pantalla (mucho mas largo) y pueden
// necesitar varias paginas. Si una fila no cabe, se abre pagina nueva y se repite el
// encabezado antes de seguir.
function dibujarTablaPaginada(doc, y, headers, rows, widths, small) {
  const padX = 6, padY = 5;
  const sizeH = small ? 8 : 9, sizeB = small ? 8 : 9;
  const lineH = (small ? 10 : 11.5) + padY * 2;
  function dibujarEncabezado(yActual) {
    doc.setFillColor(NAVY);
    doc.rect(MARGIN_L, yActual, CONTENT_W, lineH, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(sizeH); doc.setTextColor(WHITE);
    let x = MARGIN_L;
    headers.forEach((h, i) => {
      doc.text(String(h), x + padX, yActual + lineH / 2 + sizeH / 2 - 1);
      x += widths[i];
    });
    return yActual + lineH;
  }
  if (y + lineH > CONTENT_BOTTOM) { doc.addPage(); y = CONTENT_TOP; }
  y = dibujarEncabezado(y);
  for (const fila of rows) {
    doc.setFontSize(sizeB);
    const celdasLineas = fila.map((c, i) => doc.splitTextToSize(String(c), widths[i] - padX * 2));
    const nLineas = Math.max(...celdasLineas.map((l) => l.length), 1);
    const alturaFila = nLineas * (small ? 10 : 11.5) + padY * 2;
    if (y + alturaFila > CONTENT_BOTTOM) {
      doc.addPage();
      y = CONTENT_TOP;
      y = dibujarEncabezado(y);
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(sizeB); doc.setTextColor(BLACK);
    let x = MARGIN_L;
    fila.forEach((c, i) => {
      const alinDer = i > 0;
      celdasLineas[i].forEach((linea, li) => {
        const ly = y + padY + (small ? 8 : 9) + li * (small ? 10 : 11.5);
        if (alinDer) doc.text(linea, x + widths[i] - padX, ly, { align: 'right' });
        else doc.text(linea, x + padX, ly);
      });
      x += widths[i];
    });
    doc.setDrawColor(LINE); doc.setLineWidth(0.5);
    doc.line(MARGIN_L, y + alturaFila, MARGIN_L + CONTENT_W, y + alturaFila);
    y += alturaFila;
  }
  return y;
}

function dibujarTabla(doc, tabla, y) {
  const filasHead = Array.from(tabla.querySelectorAll('thead tr'));
  const filasBody = Array.from(tabla.querySelectorAll('tbody tr')).filter((tr) => !tr.classList.contains('fila-oculta-tabla'));
  if (!filasHead.length) return y;
  const celdasHead = Array.from(filasHead[0].children).filter((th) => !th.classList.contains('col-oculta-tabla') && !th.classList.contains('th-accion-tabla'));
  const headers = celdasHead.map((th) => limpiarParaPdf(th.textContent));
  const rows = filasBody.map((tr) =>
    Array.from(tr.children)
      .filter((td) => !td.classList.contains('col-oculta-tabla') && !td.classList.contains('td-accion-tabla'))
      .map((td) => limpiarParaPdf(td.textContent))
  );
  if (!headers.length || !rows.length) return y;
  // table() (pdfComponents.js) no envuelve el texto del ENCABEZADO (solo el de las
  // celdas) -- con columnas de ancho igual (el default sin "widths"), un encabezado
  // largo se encima con el de la columna siguiente en tablas con muchas columnas o
  // texto largo (bug real visto en vivo: "Monto" encimado con "Ahorro máximo..." en
  // la tabla de clasificacion de cargos). Las paginas fijas de propuesta.js siempre
  // le dan "widths" a mano por tabla -- aqui se calcula un ancho proporcional al
  // texto mas largo de cada columna (encabezado o celda), generico para cualquier
  // tabla que venga del DOM.
  const widths = anchosProporcionales(headers, rows);
  y = dibujarTablaPaginada(doc, y, headers, rows, widths, true);
  return spacer(y, 8);
}

// Lee el textContent de un nodo quitando cualquier <button> descendiente -- el icono
// ✓/🌐✕ de textoChico()/etiquetaTarjeta() (secciones.js) viaja DENTRO del mismo nodo
// que el texto editable, asi que un simple ".textContent" sobre el contenedor lo pega
// al final del texto real. Bug real encontrado 2026-11-09 (reportado por el usuario
// sobre un elemento distinto, encontrado por auditoria del resto del codigo de PDF):
// "Inversion total✓" en vez de "Inversion total" en tarjetas/leyendas/gauge del PDF.
// Mismo criterio que textoPlano() en charts.js (usado ahi solo para el atributo title),
// pero generalizado aqui para cualquier nodo que se lea por su textContent completo.
function textoSinIconos(nodo) {
  if (!nodo) return '';
  const clon = nodo.cloneNode(true);
  clon.querySelectorAll('button').forEach((b) => b.remove());
  return clon.textContent.trim();
}

function dibujarTarjetas(doc, cont, y) {
  const metricas = Array.from(cont.querySelectorAll(':scope > .metrica'));
  if (!metricas.length) return y;
  const items = metricas.map((m) => {
    const valor = m.querySelector('.valor');
    const etiqueta = m.querySelector('.etiqueta');
    return [valor ? limpiarParaPdf(valor.textContent) : '', etiqueta ? limpiarParaPdf(textoSinIconos(etiqueta)) : ''];
  });
  // cardsRow() dibuja siempre en filas de 3 -- si hay mas de 3 tarjetas, se agrupan.
  // Altura FIJA de cardsRow (56) + spacer(8) = 64, no una estimacion.
  for (let i = 0; i < items.length; i += 3) {
    y = continuarSiNecesario(doc, y, 64);
    y = cardsRow(doc, y, items.slice(i, i + 3));
    y = spacer(y, 8);
  }
  return y;
}

// Graficas (barra horizontal/agrupada/gauge/curva) -- en vez de redibujarlas como
// grafica vectorial (requeriria los datos crudos de `r`, no solo el DOM), se muestran
// como una tabla chica con las mismas etiquetas/valores que ya se ven en pantalla.
// Mas sencillo que la grafica visual, pero con los mismos numeros reales -- y sin
// depender de capturar una imagen (ver ESTADO.md: html2canvas no funciono de forma
// confiable con este layout).
function dibujarGraficaComoTabla(doc, cont, y) {
  let filas = [];
  if (cont.classList.contains('grafica-h')) {
    filas = Array.from(cont.querySelectorAll('.grafica-h-fila')).map((f) => [
      textoSinIconos(f.querySelector('.grafica-h-etq')),
      textoSinIconos(f.querySelector('.grafica-h-val')),
    ]);
  } else if (cont.classList.contains('grafica-agrupada')) {
    const leyenda = Array.from(cont.querySelectorAll('.grafica-leyenda > *')).map((n) => textoSinIconos(n)).filter(Boolean);
    const [s1 = 'Serie 1', s2 = 'Serie 2'] = leyenda;
    filas = Array.from(cont.querySelectorAll('.grafica-agrupada-grupo')).map((g) => {
      const cat = textoSinIconos(g.querySelector('.grafica-agrupada-etq'));
      const [b1, b2] = g.querySelectorAll('.grafica-agrupada-barra-1, .grafica-agrupada-barra-2');
      return [cat, b1?.title.split(':').slice(1).join(':').trim() || '', b2?.title.split(':').slice(1).join(':').trim() || ''];
    });
    if (filas.length) filas.unshift([`(${s1} / ${s2})`, '', '']);
  } else if (cont.classList.contains('grafica-gauge')) {
    const label = textoSinIconos(cont.querySelector('.grafica-gauge-label'));
    const valor = textoSinIconos(cont.querySelector('.grafica-gauge-ejes strong'));
    filas = [[label || 'Avance', valor]];
  } else if (cont.classList.contains('grafica-curva')) {
    // La curva mezcla texto fijo + numero en el mismo <text> del SVG (ver charts.js) --
    // se listan tal cual, ya incluyen el numero calculado.
    filas = Array.from(cont.querySelectorAll('svg text')).map((t) => t.textContent.trim()).filter(Boolean)
      .map((t) => [t, '']);
  }
  if (!filas.length) return y;
  const headers = cont.classList.contains('grafica-agrupada') ? ['Categoría', 'Serie 1', 'Serie 2'] : ['Dato', 'Valor'];
  const filasLimpias = filas.map((f) => {
    const completa = f.length === headers.length ? f : [...f, ...Array(headers.length - f.length).fill('')];
    return completa.map((c) => limpiarParaPdf(c));
  });
  const widths = anchosProporcionales(headers, filasLimpias);
  y = dibujarTablaPaginada(doc, y, headers, filasLimpias, widths, true);
  return spacer(y, 8);
}

// Dibuja una sola imagen (dataURL local, nunca remota) con salto de pagina si no cabe.
// Compartida por dibujarDocumentoAdjunto() y por el dispatch directo de <img> en
// recorrer() -- ver el comentario ahi sobre el bug real que esto corrige (2026-11-08).
// Alto minimo que se le exige a la pagina actual antes de dibujar la foto -- si no
// alcanza, mejor empezar pagina nueva que dejar la foto chiquita en el huequito que
// haya quedado. Bug real reportado por el usuario ("la imagen quedo muy pequeña"): el
// umbral viejo (150pt) era casi cualquier huequito, asi que casi nunca forzaba pagina
// nueva -- la foto terminaba encogida al espacio sobrante en vez de usar la pagina
// completa (~700pt de alto util en A4).
const ALTO_MINIMO_FOTO = 380;

function dibujarImagenDataUrl(doc, img, y) {
  if (!img || !img.src || !img.src.startsWith('data:')) return y;
  if (CONTENT_BOTTOM - y < ALTO_MINIMO_FOTO) { y = continuarSiNecesario(doc, y, ALTO_MINIMO_FOTO); }
  const maxAncho = CONTENT_W, maxAlto = CONTENT_BOTTOM - y - 10;
  const ratio = (img.naturalWidth && img.naturalHeight) ? img.naturalWidth / img.naturalHeight : 1.4;
  let w = maxAncho, h = w / ratio;
  if (h > maxAlto) { h = maxAlto; w = h * ratio; }
  doc.addImage(img.src, 'JPEG', MARGIN_L, y, w, h);
  return y + h + 8;
}

function dibujarDocumentoAdjunto(doc, cont, y) {
  return dibujarImagenDataUrl(doc, cont.querySelector('img'), y);
}

function recorrer(doc, nodo, y) {
  for (const hijo of Array.from(nodo.children)) {
    if (!esVisible(hijo)) continue;
    const cls = hijo.className || '';
    if (cls.includes('texto-editable') || cls.includes('texto-editable-chico')) {
      y = dibujarTexto(doc, hijo, y);
    } else if (hijo.tagName === 'TABLE') {
      y = dibujarTabla(doc, hijo, y);
    } else if (cls.includes('tarjetas-metricas')) {
      y = dibujarTarjetas(doc, hijo, y);
    } else if (cls.includes('grafica') && (hijo.classList.contains('grafica-h') || hijo.classList.contains('grafica-agrupada') || hijo.classList.contains('grafica-gauge') || hijo.classList.contains('grafica-curva'))) {
      y = dibujarGraficaComoTabla(doc, hijo, y);
    } else if (cls.includes('documento-adjunto') && !cls.includes('documento-adjunto-pdf')) {
      y = dibujarDocumentoAdjunto(doc, hijo, y);
    } else if (hijo.tagName === 'IMG') {
      // Bug real reportado por el usuario ("sigue sin aparecer la seccion del sembrado
      // de paneles"): la foto de sembrado (r.fotoSembrado, seccion 6) y las fotos de
      // condiciones del inmueble (r.fotosInmueble, dentro de <figure> en una galeria)
      // NO estan envueltas en un contenedor con clase "documento-adjunto" en
      // secciones.js (es un <img class="seccion-img-sembrado"> suelto, o un <img>
      // suelto dentro de <figure>) -- la rama de arriba nunca las agarraba, y como un
      // <img> no tiene hijos ni texto propio, tampoco caian en el fallback de "texto
      // huerfano" ni en el contenedor generico (ambos de mas abajo). Se perdian en
      // silencio. Un <img> siempre es hoja (sin hijos), asi que dibujarlo aqui
      // directo es seguro sin duplicar nada.
      y = dibujarImagenDataUrl(doc, hijo, y);
    } else if (hijo.tagName === 'DETAILS') {
      // "Ver detalle del calculo" -- se incluye el contenido siempre (el PDF no tiene
      // "clic para expandir"), saltando el <summary> (solo es el texto del control).
      for (const nieto of Array.from(hijo.children)) {
        if (nieto.tagName === 'SUMMARY') continue;
        y = recorrer(doc, nieto, y);
      }
    } else if (!hijo.children.length && hijo.textContent.trim()) {
      // Texto "huerfano" -- un div/span con su propio texto que no cayo en ninguno de
      // los casos reconocidos arriba (ej. .seccion-numero "06 de 18", .badge-estado
      // "Comprobado"/"Pendiente"). Bug real reportado por el usuario ("no veo la
      // seccion 06 de 18"): sin este fallback, estos nodos se recorrian como
      // contenedor generico, no tenian hijos ELEMENTO (solo un nodo de texto), y su
      // contenido se perdia en silencio sin dibujar nada.
      y = dibujarTexto(doc, hijo, y);
    } else {
      // Contenedor generico (div envoltorio, campo-editable, seccion-header, etc.) --
      // sigue bajando por sus hijos en el mismo orden visual.
      y = recorrer(doc, hijo, y);
    }
  }
  return y;
}

// Lee el texto ACTUAL (con su edicion aplicada) de un parrafo editable dentro de una
// seccion que NO usa dibujarSeccionGenerica -- ej. paginaDocumentoAdjunto() en
// propuesta.js (secciones 17/18), que necesita su propia funcion por las imagenes
// (dataURL ya descargado, no puede leerse del DOM) pero el PARRAFO explicativo de
// arriba SI es texto plano normal, sin ninguna razon real para no leerlo del DOM como
// todo lo demas. Bug real reportado por el usuario ("oculte un parrafo y sigue
// apareciendo en el PDF", 2026-11-09): antes este parrafo era texto fijo en
// propuesta.js, nunca pasaba por el sistema de edicion/ocultado aunque en pantalla SI
// se veia con los controles ✓/🙈 (confunde al usuario, que no tiene forma de saber
// que esos controles no aplican ahi). Regresa: el texto limpio si esta visible,
// 'oculto' si el usuario lo apago, o 'no-encontrado' si el selector no hallo nada
// (seccion vieja sin este nodo, o no se paso seccionEl) -- en ese ultimo caso el
// llamador debe usar su propio texto fijo de respaldo, nunca dejar el parrafo vacio.
export function textoVisibleDe(seccionEl, selector) {
  const nodo = seccionEl && seccionEl.querySelector(selector);
  if (!nodo) return 'no-encontrado';
  if (nodo.closest('.campo-oculto')) return 'oculto';
  return limpiarParaPdf(nodo.textContent);
}

// Dibuja UNA seccion (ya resuelta en el DOM, con sus ediciones aplicadas), empezando
// en pagina nueva -- el encabezado global (titulo del estudio + titular + numero de
// pagina) lo pone aparte dibujarHeaderFooter() en cada pagina fisica (ver
// generarPdfCompletaDesdeVista en propuesta.js), igual que ya hacia buildPdf() para
// las paginas de siempre -- aqui solo se dibuja el CONTENIDO (el h2 real de la
// seccion, ya con sus ediciones, es parte de ese contenido).
// OJO: no llama doc.addPage() -- el llamador (generarPdfCompletaDesdeVista en
// propuesta.js) decide cuando abrir pagina nueva de forma uniforme para TODAS las
// secciones (genericas o con funcion dedicada), para no duplicar ese control aqui.
export function dibujarSeccionGenerica(doc, seccionEl) {
  recorrer(doc, seccionEl, CONTENT_TOP);
}
