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
  crearDoc, headX, subX, bodyX, spacer, cardsRow, notice, table,
  CONTENT_W, CONTENT_TOP, CONTENT_BOTTOM, MARGIN_L, NAVY, GREY,
} from './pdfComponents.js';

// OJO: 'detalle-calculo' NO va aqui -- bug real reportado por el usuario ("no veo la
// seccion 06"): esVisible() corre ANTES que el chequeo de tagName==='DETAILS' en
// recorrer(), asi que tenerlo en esta lista lo descartaba ENTERO antes de llegar al
// codigo que sí lo procesa (saltando el <summary>, recorriendo el resto) -- todos los
// bloques "📐 Cómo se calculó" de TODAS las secciones genericas se perdian en
// silencio. 'seccion-numero' tampoco va aqui -- es el "06 de 18" que el usuario usa
// para confirmar que no falta nada, se queda como contenido real (ver el fallback
// generico de texto "huerfano" en recorrer()).
const CLASES_OMITIR = [
  'toggle-seccion', 'btn-restaurar-texto', 'btn-icono-global',
  'btn-ocultar-texto', 'nota-texto-global', 'nota-texto-oculto', 'th-accion-tabla',
  'td-accion-tabla', 'grafico-apagado', 'campo-oculto', 'col-oculta-tabla',
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

// Altura real de table() (pdfComponents.js) para headers+rows+widths dados -- misma
// formula que esa funcion usa internamente para calcular alturaFila por renglon
// (lineas envueltas en la celda mas alta de la fila × leading + padY*2), mas la fila
// de encabezado (lineH fijo). Necesaria para decidir ANTES de dibujar si hace falta
// saltar de pagina (ver continuarSiNecesario).
function alturaTabla(doc, headers, rows, widths, small) {
  const padX = 6, padY = 5;
  const lineH = (small ? 10 : 11.5) + padY * 2;
  let total = lineH;
  for (const fila of rows) {
    let nLineas = 1;
    fila.forEach((c, i) => {
      doc.setFontSize(small ? 8 : 9);
      const n = doc.splitTextToSize(String(c), widths[i] - padX * 2).length;
      if (n > nLineas) nLineas = n;
    });
    total += nLineas * (small ? 10 : 11.5) + padY * 2;
  }
  return total;
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
  y = continuarSiNecesario(doc, y, alturaTabla(doc, headers, rows, widths, true));
  y = table(doc, y, headers, rows, { small: true, widths });
  return spacer(y, 8);
}

function dibujarTarjetas(doc, cont, y) {
  const metricas = Array.from(cont.querySelectorAll(':scope > .metrica'));
  if (!metricas.length) return y;
  const items = metricas.map((m) => {
    const valor = m.querySelector('.valor');
    const etiqueta = m.querySelector('.texto-editable-chico, .etiqueta');
    return [valor ? limpiarParaPdf(valor.textContent) : '', etiqueta ? limpiarParaPdf(etiqueta.textContent) : ''];
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
      f.querySelector('.grafica-h-etq')?.textContent.trim() || '',
      f.querySelector('.grafica-h-val')?.textContent.trim() || '',
    ]);
  } else if (cont.classList.contains('grafica-agrupada')) {
    const leyenda = Array.from(cont.querySelectorAll('.grafica-leyenda > *')).map((n) => n.textContent.trim()).filter(Boolean);
    const [s1 = 'Serie 1', s2 = 'Serie 2'] = leyenda;
    filas = Array.from(cont.querySelectorAll('.grafica-agrupada-grupo')).map((g) => {
      const cat = g.querySelector('.grafica-agrupada-etq')?.textContent.trim() || '';
      const [b1, b2] = g.querySelectorAll('.grafica-agrupada-barra-1, .grafica-agrupada-barra-2');
      return [cat, b1?.title.split(':').slice(1).join(':').trim() || '', b2?.title.split(':').slice(1).join(':').trim() || ''];
    });
    if (filas.length) filas.unshift([`(${s1} / ${s2})`, '', '']);
  } else if (cont.classList.contains('grafica-gauge')) {
    const label = cont.querySelector('.grafica-gauge-label')?.textContent.trim();
    const valor = cont.querySelector('.grafica-gauge-ejes strong')?.textContent.trim() || '';
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
  const widths = headers.map(() => CONTENT_W / headers.length);
  y = continuarSiNecesario(doc, y, alturaTabla(doc, headers, filasLimpias, widths, true));
  y = table(doc, y, headers, filasLimpias, { small: true });
  return spacer(y, 8);
}

function dibujarDocumentoAdjunto(doc, cont, y) {
  // Dentro de secciones genericas (no 17/18, que usan su propia funcion dedicada en
  // propuesta.js) un "documento-adjunto" es la foto del sembrado o de condiciones del
  // inmueble (seccion 6) -- esas SI viven como dataURL local (r.fotoSembrado/
  // r.fotosInmueble), nunca una URL remota, asi que se pueden dibujar sin fetch.
  const img = cont.querySelector('img');
  if (!img || !img.src || !img.src.startsWith('data:')) return y;
  // Si queda muy poco espacio en esta pagina, mejor empezar una nueva que encoger la
  // imagen a una tira inservible.
  if (CONTENT_BOTTOM - y < 150) { y = continuarSiNecesario(doc, y, 150); }
  const maxAncho = CONTENT_W, maxAlto = CONTENT_BOTTOM - y - 10;
  const ratio = (img.naturalWidth && img.naturalHeight) ? img.naturalWidth / img.naturalHeight : 1.4;
  let w = maxAncho, h = w / ratio;
  if (h > maxAlto) { h = maxAlto; w = h * ratio; }
  doc.addImage(img.src, 'JPEG', MARGIN_L, y, w, h);
  return y + h + 8;
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
