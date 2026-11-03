// Sembrador automatico de paneles: dado un rectangulo del techo (2 esquinas marcadas a
// mano sobre una foto satelital/aerea que el usuario sube) y la escala real (2 puntos +
// distancia conocida, tambien marcados a mano), coloca en rejilla los N paneles que ya
// calculo el cotizador (r.n -- no se recalcula aqui, para no tener dos criterios de
// dimensionamiento distintos corriendo a la vez). Port directo de
// sembrar_paneles.py/planear_techo.py y editor_paneles.html (repo cotizador-fv-cfe,
// carpeta sembrador_de_paneles/, 2026-11-02) a JS puro, sin librerias de geometria --
// version rectangular (no poligonal), pensada para ajustarse a mano despues con el mismo
// editor de arrastrar/girar que ya se probo ahi.
//
// Alcance deliberado, dicho explicitamente: no detecta el techo solo, no evita
// obstaculos automaticamente -- el usuario marca el rectangulo y, si hace falta, borra o
// mueve a mano los paneles que caen sobre un tinaco/equipo despues de sembrar. Es una
// distribucion conceptual, no un plano de ingenieria (misma leyenda que ya usa el PDF).

export const PANEL_ANCHO_M = 1.1;
export const PANEL_ALTO_M = 2.1;

// panelesEnRectangulo: elige columnas x filas que quepan en el rectangulo del techo
// (en pixeles), prefiriendo un bloque sin huecos y, si hay empate, el que mas se parezca
// a la proporcion del techo -- mismo criterio que bloque_en_techo() de planear_techo.py.
// Regresa los paneles centrados en el rectangulo, ya en el sistema de pixeles de la
// imagen (cx, cy, w, h, ang).
export function panelesEnRectangulo({ x0, y0, x1, y1, n, panelWpx, panelHpx, gapPx = 0, angulo = 0 }) {
  const techoW = Math.abs(x1 - x0), techoH = Math.abs(y1 - y0);
  const minX = Math.min(x0, x1), minY = Math.min(y0, y1);
  if (!(n > 0) || panelWpx <= 0 || panelHpx <= 0) return { paneles: [], colocados: 0, cabenTodos: false };

  let mejor = null;
  for (let cols = 1; cols <= n; cols++) {
    const filas = Math.ceil(n / cols);
    const bw = cols * panelWpx + (cols - 1) * gapPx;
    const bh = filas * panelHpx + (filas - 1) * gapPx;
    if (bw > techoW || bh > techoH) continue;
    const huecos = cols * filas - n;
    const error = Math.abs(bw / bh - techoW / techoH);
    if (!mejor || (huecos > 0 ? 1 : 0) < mejor.rango || ((huecos > 0 ? 1 : 0) === mejor.rango && error < mejor.error)) {
      mejor = { rango: huecos > 0 ? 1 : 0, error, cols, filas, bw, bh };
    }
  }
  if (!mejor) return { paneles: [], colocados: 0, cabenTodos: false };

  const { cols, filas, bw, bh } = mejor;
  const bx = minX + (techoW - bw) / 2, by = minY + (techoH - bh) / 2;
  const cx0 = bx + panelWpx / 2, cy0 = by + panelHpx / 2;
  const centro = { x: minX + techoW / 2, y: minY + techoH / 2 };
  const rad = (angulo || 0) * Math.PI / 180;

  const paneles = [];
  let contador = 0;
  for (let fila = 0; fila < filas && contador < n; fila++) {
    for (let col = 0; col < cols && contador < n; col++) {
      let cx = cx0 + col * (panelWpx + gapPx);
      let cy = cy0 + fila * (panelHpx + gapPx);
      if (angulo) {
        const dx = cx - centro.x, dy = cy - centro.y;
        cx = centro.x + dx * Math.cos(rad) - dy * Math.sin(rad);
        cy = centro.y + dx * Math.sin(rad) + dy * Math.cos(rad);
      }
      paneles.push({ cx: round2(cx), cy: round2(cy), w: round2(panelWpx), h: round2(panelHpx), ang: angulo || 0 });
      contador++;
    }
  }
  return { paneles, colocados: contador, cabenTodos: contador >= n };
}

function round2(x) { return Math.round(x * 100) / 100; }

// ---------------------------------------------------------------------------
// Editor interactivo: mover (arrastrar panel), girar (arrastrar el circulo blanco),
// seleccion multiple (shift+clic), teclado (flechas/[ ]/Supr). Mismo comportamiento que
// editor_paneles.html del repo cotizador-fv-cfe -- probado en vivo ahi antes de portarlo
// (mover y girar funcionan igual). Aqui se adapta a un <svg> ya existente en la pagina
// (en vez de una pagina standalone), con getters/setters para sincronizar con el estado
// del proyecto en app.js.
const SVGNS = 'http://www.w3.org/2000/svg';

export function crearEditorPaneles(svgEl) {
  let paneles = [];
  let seleccion = new Set();
  let modo = null;      // 'mover' | 'girar' | null
  let inicio = null;
  let onCambio = () => {};

  function puntoSvg(e) {
    const pt = svgEl.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svgEl.getScreenCTM().inverse());
  }

  function construir() {
    svgEl.innerHTML = '';
    paneles.forEach((d, i) => {
      const g = document.createElementNS(SVGNS, 'g');
      g.dataset.i = i;
      g.setAttribute('transform', `translate(${d.cx} ${d.cy}) rotate(${d.ang})`);

      const r = document.createElementNS(SVGNS, 'rect');
      r.setAttribute('x', -d.w / 2); r.setAttribute('y', -d.h / 2);
      r.setAttribute('width', d.w); r.setAttribute('height', d.h);
      r.setAttribute('class', 'panel-sembrador' + (seleccion.has(i) ? ' sel' : ''));
      g.appendChild(r);

      const linea = document.createElementNS(SVGNS, 'line');
      linea.setAttribute('x1', 0); linea.setAttribute('y1', -d.h / 2);
      linea.setAttribute('x2', 0); linea.setAttribute('y2', -d.h / 2 - Math.max(8, d.h * 0.35));
      linea.setAttribute('class', 'guia-sembrador');
      g.appendChild(linea);

      const c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('cx', 0); c.setAttribute('cy', -d.h / 2 - Math.max(8, d.h * 0.35));
      c.setAttribute('r', Math.max(4, d.w * 0.3));
      c.setAttribute('class', 'handle-sembrador');
      c.dataset.girar = i;
      g.appendChild(c);

      svgEl.appendChild(g);
    });
    onCambio(paneles);
  }

  function refrescarTransformaciones() {
    svgEl.querySelectorAll('g').forEach((g) => {
      const d = paneles[Number(g.dataset.i)];
      g.setAttribute('transform', `translate(${d.cx} ${d.cy}) rotate(${d.ang})`);
    });
  }

  function refrescarSeleccion() {
    svgEl.querySelectorAll('rect.panel-sembrador').forEach((r) => {
      const i = Number(r.parentNode.dataset.i);
      r.setAttribute('class', 'panel-sembrador' + (seleccion.has(i) ? ' sel' : ''));
    });
  }

  svgEl.addEventListener('pointerdown', (e) => {
    if (svgEl.dataset.modoMarcado) return; // mientras se marca escala/techo, el editor no roba el clic
    const girar = e.target.dataset && e.target.dataset.girar;
    const g = e.target.closest ? e.target.closest('g[data-i]') : null;
    if (girar === undefined && !g) {
      if (!e.shiftKey) seleccion.clear();
      refrescarSeleccion();
      return;
    }
    const i = girar !== undefined ? Number(girar) : Number(g.dataset.i);
    if (e.shiftKey) {
      seleccion.has(i) ? seleccion.delete(i) : seleccion.add(i);
    } else if (!seleccion.has(i)) {
      seleccion = new Set([i]);
    }
    refrescarSeleccion();
    if (!seleccion.has(i)) return;

    const p = puntoSvg(e);
    modo = girar !== undefined ? 'girar' : 'mover';
    const d = paneles[i];
    inicio = {
      x: p.x, y: p.y, i,
      angulo0: Math.atan2(p.y - d.cy, p.x - d.cx),
      datos: [...seleccion].map((k) => ({ k, cx: paneles[k].cx, cy: paneles[k].cy, ang: paneles[k].ang })),
    };
    svgEl.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  svgEl.addEventListener('pointermove', (e) => {
    if (!modo || !inicio) return;
    const p = puntoSvg(e);
    if (modo === 'mover') {
      const dx = p.x - inicio.x, dy = p.y - inicio.y;
      inicio.datos.forEach((o) => { paneles[o.k].cx = o.cx + dx; paneles[o.k].cy = o.cy + dy; });
    } else {
      const d = paneles[inicio.i];
      const angulo = Math.atan2(p.y - d.cy, p.x - d.cx);
      const delta = (angulo - inicio.angulo0) * 180 / Math.PI;
      inicio.datos.forEach((o) => { paneles[o.k].ang = o.ang + delta; });
    }
    refrescarTransformaciones();
  });

  function terminarArrastre() {
    if (modo) onCambio(paneles);
    modo = null; inicio = null;
  }
  svgEl.addEventListener('pointerup', terminarArrastre);
  svgEl.addEventListener('pointercancel', terminarArrastre);

  function onKeydown(e) {
    if (!seleccion.size || svgEl.hidden || (e.target && e.target.tagName === 'INPUT')) return;
    const paso = e.shiftKey ? 10 : 1;
    const giro = e.shiftKey ? 5 : 1;
    let cambio = true;
    if (e.key === 'ArrowLeft') seleccion.forEach((k) => paneles[k].cx -= paso);
    else if (e.key === 'ArrowRight') seleccion.forEach((k) => paneles[k].cx += paso);
    else if (e.key === 'ArrowUp') seleccion.forEach((k) => paneles[k].cy -= paso);
    else if (e.key === 'ArrowDown') seleccion.forEach((k) => paneles[k].cy += paso);
    else if (e.key === '[') seleccion.forEach((k) => paneles[k].ang -= giro);
    else if (e.key === ']') seleccion.forEach((k) => paneles[k].ang += giro);
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      paneles = paneles.filter((_, i) => !seleccion.has(i));
      seleccion.clear();
      construir();
      return;
    } else cambio = false;
    if (cambio) { e.preventDefault(); refrescarTransformaciones(); onCambio(paneles); }
  }
  document.addEventListener('keydown', onKeydown);

  return {
    cargar(nuevosPaneles) {
      paneles = (nuevosPaneles || []).map((d) => ({ ...d }));
      seleccion = new Set();
      construir();
    },
    obtener() { return paneles.map((d) => ({ ...d })); },
    onCambio(fn) { onCambio = fn || (() => {}); },
    destruir() { document.removeEventListener('keydown', onKeydown); },
  };
}

// ---------------------------------------------------------------------------
// hornearImagenSembrado: dibuja la imagen base + los paneles numerados + la leyenda en
// un canvas, y regresa {dataUrl, ancho, alto} -- MISMO formato que
// archivoAImagenComprimida() de imagenes.js, para que fotoSembrado no cambie de forma en
// ningun otro archivo (secciones.js/propuesta.js lo siguen leyendo exactamente igual,
// vengan de la foto manual o de aqui).
const NAVY = '#163b4c', TEAL = '#0f8b8d', GOLD = '#c99a2e', WHITE = '#fff';

export function hornearImagenSembrado(imgEl, paneles, { maxAncho = 1600, calidad = 0.85 } = {}) {
  const anchoNat = imgEl.naturalWidth, altoNat = imgEl.naturalHeight;
  const factor = anchoNat > maxAncho ? maxAncho / anchoNat : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(anchoNat * factor);
  canvas.height = Math.round(altoNat * factor);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);

  paneles.forEach((d, i) => {
    const cx = d.cx * factor, cy = d.cy * factor, w = d.w * factor, h = d.h * factor;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(d.ang * Math.PI / 180);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = i % 2 === 0 ? NAVY : TEAL;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = WHITE;
    ctx.font = `${Math.max(9, Math.min(w, h) * 0.3)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1).padStart(2, '0'), 0, 0);
    ctx.restore();
  });

  const leyenda = 'DISTRIBUCIÓN CONCEPTUAL · NO ES PLANO A ESCALA DE INGENIERÍA · VALIDAR EN SITIO';
  const tamFuente = Math.max(11, canvas.height * 0.022);
  ctx.font = `${tamFuente}px sans-serif`;
  const tw = ctx.measureText(leyenda).width;
  const pad = 8, lh = tamFuente + pad * 2;
  ctx.fillStyle = 'rgba(22,59,76,0.92)';
  ctx.fillRect(0, canvas.height - lh, Math.min(canvas.width, tw + pad * 2), lh);
  ctx.fillStyle = WHITE; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(leyenda, pad, canvas.height - lh / 2);

  return { dataUrl: canvas.toDataURL('image/jpeg', calidad), ancho: canvas.width, alto: canvas.height };
}
