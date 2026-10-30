// Graficas simples en HTML/CSS/SVG para la vista en pantalla (no PDF -- para el PDF
// ver pdfComponents.js, que dibuja con jsPDF). Mismo criterio del resto del proyecto:
// una grafica sencilla ayuda a entender una tabla densa de numeros, pero no se fuerza
// en secciones que se explican mejor con tabla o lista (garantias, fuentes, pendientes).
import { M, PCT } from './util.js';

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

// Barras horizontales comparativas: items = [[etiqueta, valor, colorCss], ...]
export function barraHorizontal(items, { fmt = M } = {}) {
  const max = Math.max(...items.map(([, v]) => v), 1);
  const cont = el('div', 'grafica grafica-h');
  for (const [etiqueta, valor, color] of items) {
    const fila = el('div', 'grafica-h-fila');
    fila.append(el('div', 'grafica-h-etq', etiqueta));
    const pista = el('div', 'grafica-h-pista');
    const barra = el('div', 'grafica-h-barra');
    barra.style.width = `${Math.max((valor / max) * 100, 2)}%`;
    if (color) barra.style.background = color;
    pista.append(barra);
    fila.append(pista);
    fila.append(el('div', 'grafica-h-val', fmt(valor)));
    cont.append(fila);
  }
  return cont;
}

// Barras agrupadas (2 series por categoria), ej. consumo vs generacion por mes.
export function barraAgrupada(categorias, serie1Label, serie1Valores, serie2Label, serie2Valores, { fmt = (v) => v.toLocaleString('en-US', { maximumFractionDigits: 0 }) } = {}) {
  const max = Math.max(...serie1Valores, ...serie2Valores, 1);
  const cont = el('div', 'grafica grafica-agrupada');
  const leyenda = el('div', 'grafica-leyenda');
  leyenda.innerHTML = `<span class="leyenda-chip leyenda-chip-1"></span>${serie1Label}` +
    `<span class="leyenda-chip leyenda-chip-2"></span>${serie2Label}`;
  cont.append(leyenda);
  const barras = el('div', 'grafica-agrupada-barras');
  categorias.forEach((cat, i) => {
    const grupo = el('div', 'grafica-agrupada-grupo');
    const par = el('div', 'grafica-agrupada-par');
    const b1 = el('div', 'grafica-agrupada-barra grafica-agrupada-barra-1');
    b1.style.height = `${Math.max((serie1Valores[i] / max) * 100, 2)}%`;
    b1.title = `${serie1Label}: ${fmt(serie1Valores[i])}`;
    const b2 = el('div', 'grafica-agrupada-barra grafica-agrupada-barra-2');
    b2.style.height = `${Math.max((serie2Valores[i] / max) * 100, 2)}%`;
    b2.title = `${serie2Label}: ${fmt(serie2Valores[i])}`;
    par.append(b1, b2);
    grupo.append(par, el('div', 'grafica-agrupada-etq', cat));
    barras.append(grupo);
  });
  cont.append(barras);
  return cont;
}

// Medidor de porcentaje (gauge lineal), ej. que tan cerca del 100% de ahorro.
export function gauge(pct, label) {
  const cont = el('div', 'grafica grafica-gauge');
  if (label) cont.append(el('div', 'grafica-gauge-label', label));
  const pista = el('div', 'grafica-gauge-pista');
  const relleno = el('div', 'grafica-gauge-relleno');
  relleno.style.width = `${Math.max(Math.min(pct, 1) * 100, 1)}%`;
  pista.append(relleno);
  cont.append(pista);
  const ejes = el('div', 'grafica-gauge-ejes');
  ejes.innerHTML = `<span>0%</span><strong>${PCT(pct)} del recibo</strong><span>100%</span>`;
  cont.append(ejes);
  return cont;
}

// Curva de flujo acumulado a N anios, con eje de cero y el punto de recuperacion
// marcado -- la grafica mas importante de la seccion de recuperacion de inversion.
export function curvaFlujo(puntos, recuperacionAnios) {
  const w = 600, h = 220, padL = 55, padR = 15, padT = 14, padB = 28;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const xs = puntos.map(p => p[0]), ys = puntos.map(p => p[1]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys, 0), yMax = Math.max(...ys, 0);
  const yRange = (yMax - yMin) || 1, xRange = (xMax - xMin) || 1;
  const px = (x) => padL + (x - xMin) / xRange * plotW;
  const py = (v) => padT + plotH - (v - yMin) / yRange * plotH;

  const cont = el('div', 'grafica grafica-curva');
  let svg = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Flujo acumulado a 25 años">`;
  if (recuperacionAnios != null && recuperacionAnios >= xMin && recuperacionAnios <= xMax) {
    svg += `<rect x="${padL}" y="${padT}" width="${px(recuperacionAnios) - padL}" height="${plotH}" fill="var(--cfe-cream, #fff4da)" />`;
  }
  svg += `<line x1="${padL}" y1="${py(0)}" x2="${padL + plotW}" y2="${py(0)}" stroke="var(--cfe-grey,#5e737c)" stroke-width="1" />`;
  svg += `<text x="${padL - 6}" y="${py(0) + 3}" font-size="9" text-anchor="end" fill="var(--cfe-grey,#5e737c)">$0</text>`;
  svg += `<text x="${padL - 6}" y="${padT + 8}" font-size="9" text-anchor="end" fill="var(--cfe-grey,#5e737c)">${M(yMax)}</text>`;
  if (yMin < 0) svg += `<text x="${padL - 6}" y="${padT + plotH}" font-size="9" text-anchor="end" fill="var(--cfe-grey,#5e737c)">${M(yMin)}</text>`;
  const puntosAtrib = puntos.map(([x, y]) => `${px(x)},${py(y)}`).join(' ');
  svg += `<polyline points="${puntosAtrib}" fill="none" stroke="var(--cfe-teal,#21798b)" stroke-width="2.4" />`;
  for (const [x] of puntos) {
    svg += `<text x="${px(x)}" y="${padT + plotH + 16}" font-size="8" text-anchor="middle" fill="var(--cfe-grey,#5e737c)">${Math.trunc(x)}</text>`;
  }
  if (recuperacionAnios != null && recuperacionAnios >= xMin && recuperacionAnios <= xMax) {
    const xr = px(recuperacionAnios);
    svg += `<line x1="${xr}" y1="${padT}" x2="${xr}" y2="${padT + plotH}" stroke="var(--cfe-gold,#c8a654)" stroke-width="1.6" stroke-dasharray="4,3" />`;
    svg += `<text x="${xr}" y="${padT - 2}" font-size="9" font-weight="700" text-anchor="${xr < w - 90 ? 'middle' : 'end'}" fill="var(--cfe-navy,#163b4c)">Recuperas: ${recuperacionAnios.toFixed(1)} años</text>`;
  }
  svg += '</svg>';
  cont.innerHTML = svg;
  return cont;
}
