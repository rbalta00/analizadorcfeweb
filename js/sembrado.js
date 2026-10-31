// Herramienta interactiva para dibujar la distribucion de paneles sobre una foto aerea
// del inmueble (ej. captura de Google Earth) -- puerto de app/sembrar_paneles.py
// (Streamlit, PIL) a Canvas2D. Mismo criterio: el usuario marca 2 puntos + la
// distancia real conocida entre ellos para calibrar la escala (px/metro), despues 2
// esquinas opuestas del area del techo, y se dibujan los paneles YA CALCULADOS
// (r.n, el resultado del cotizador) en filas/columnas segun quepan, numerados, con el
// mismo aviso que ya traia Streamlit: es una referencia conceptual, NO un plano de
// ingenieria ni una validacion de cabida real.
import { cargarImagenDesdeArchivo } from './imagenes.js';

const NAVY = '#163b4c', TEAL = '#21798b', GOLD = '#c8a654';
const MAX_ANCHO_CANVAS = 900;

let estado = null; // { img, canvas, ctx, cotaPuntos: [], techoPuntos: [], onClick }

function limpiarDibujo() {
  const { ctx, canvas, img } = estado;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
}

function dibujarPunto(p, color, etiqueta) {
  const { ctx } = estado;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
  ctx.fill();
  if (etiqueta) {
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(etiqueta, p.x + 8, p.y - 8);
  }
}

function dibujarLinea(p1, p2, color) {
  const { ctx } = estado;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
}

function dibujarRectTecho(a, b) {
  const { ctx } = estado;
  ctx.save();
  ctx.strokeStyle = TEAL;
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 2;
  ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  ctx.restore();
}

function redibujarPuntosGuia() {
  limpiarDibujo();
  estado.cotaPuntos.forEach((p, i) => dibujarPunto(p, GOLD, `C${i + 1}`));
  if (estado.cotaPuntos.length === 2) dibujarLinea(estado.cotaPuntos[0], estado.cotaPuntos[1], GOLD);
  estado.techoPuntos.forEach((p, i) => dibujarPunto(p, TEAL, `T${i + 1}`));
  if (estado.techoPuntos.length === 2) dibujarRectTecho(estado.techoPuntos[0], estado.techoPuntos[1]);
}

function estadoActual() {
  return {
    pasoCota: estado.cotaPuntos.length < 2,
    pasoTecho: estado.cotaPuntos.length === 2 && estado.techoPuntos.length < 2,
    listoParaDibujar: estado.cotaPuntos.length === 2 && estado.techoPuntos.length === 2,
  };
}

// Abre el editor: carga `imgFile` en `canvas` (ya redimensionado) y conecta los clics
// para ir marcando los 4 puntos (2 de cota + 2 de techo). `onCambioEstado(info)` se
// llama tras cada clic/deshacer, para que quien use este modulo actualice textos/
// botones segun en que paso va.
export async function iniciarEditorSembrado({ canvas, imgFile, onCambioEstado }) {
  const img = await cargarImagenDesdeArchivo(imgFile);
  const escala = Math.min(1, MAX_ANCHO_CANVAS / img.naturalWidth);
  canvas.width = Math.round(img.naturalWidth * escala);
  canvas.height = Math.round(img.naturalHeight * escala);
  estado = { img, canvas, ctx: canvas.getContext('2d'), cotaPuntos: [], techoPuntos: [] };
  limpiarDibujo();
  const onClick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const p = {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
    if (estado.cotaPuntos.length < 2) estado.cotaPuntos.push(p);
    else if (estado.techoPuntos.length < 2) estado.techoPuntos.push(p);
    redibujarPuntosGuia();
    onCambioEstado(estadoActual());
  };
  canvas.addEventListener('click', onClick);
  estado.onClick = onClick;
  onCambioEstado(estadoActual());
}

export function deshacerUltimoPuntoSembrado() {
  if (!estado) return null;
  if (estado.techoPuntos.length) estado.techoPuntos.pop();
  else if (estado.cotaPuntos.length) estado.cotaPuntos.pop();
  redibujarPuntosGuia();
  return estadoActual();
}

// Calcula px/metro a partir de los 2 puntos de cota + la distancia real, y dibuja los
// `nPaneles` ya calculados por el cotizador en una cuadricula dentro del rectangulo de
// techo marcado -- mismas formulas que sembrar_paneles.py (columnas = techo_ancho_px /
// panel_ancho_px, filas = ceil(n/columnas)).
export function dibujarPanelesSembrado({ distanciaRealM, nPaneles, anchoM, altoM, vertical }) {
  if (!estado || estado.cotaPuntos.length !== 2 || estado.techoPuntos.length !== 2) return null;
  if (!distanciaRealM || distanciaRealM <= 0 || !nPaneles) return null;
  const { ctx, canvas, cotaPuntos, techoPuntos } = estado;
  limpiarDibujo();

  const distPx = Math.hypot(cotaPuntos[1].x - cotaPuntos[0].x, cotaPuntos[1].y - cotaPuntos[0].y);
  const pxPorMetro = distPx / distanciaRealM;
  let aM = anchoM, hM = altoM;
  if (!vertical) [aM, hM] = [hM, aM];
  const panelW = aM * pxPorMetro, panelH = hM * pxPorMetro;

  const [a, b] = techoPuntos;
  const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
  const techoW = Math.abs(b.x - a.x);

  const columnas = Math.max(1, Math.min(nPaneles, panelW > 0 ? Math.round(techoW / panelW) : Math.ceil(Math.sqrt(nPaneles))));
  const filas = Math.ceil(nPaneles / columnas);
  const gap = Math.max(1, panelW * 0.04);

  let contador = 0;
  for (let fila = 0; fila < filas; fila++) {
    for (let col = 0; col < columnas; col++) {
      if (contador >= nPaneles) break;
      const px = x0 + col * (panelW + gap);
      const py = y0 + fila * (panelH + gap);
      contador++;
      ctx.globalAlpha = 0.78;
      ctx.fillStyle = contador % 2 === 0 ? TEAL : NAVY;
      ctx.fillRect(px, py, panelW, panelH);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px, py, panelW, panelH);
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(9, panelH * 0.26)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(contador).padStart(2, '0'), px + panelW / 2, py + panelH / 2);
    }
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  const leyenda = 'DISTRIBUCIÓN CONCEPTUAL · NO ES PLANO DE INGENIERÍA · VALIDAR EN SITIO';
  ctx.font = 'bold 11px sans-serif';
  const lw = ctx.measureText(leyenda).width;
  ctx.fillStyle = 'rgba(22,59,76,0.88)';
  ctx.fillRect(0, canvas.height - 22, lw + 16, 22);
  ctx.fillStyle = '#fff';
  ctx.fillText(leyenda, 8, canvas.height - 7);

  return { columnas, filas, paneles: contador, pxPorMetro };
}

export function exportarCanvasSembrado(calidad = 0.85) {
  return { dataUrl: estado.canvas.toDataURL('image/jpeg', calidad), ancho: estado.canvas.width, alto: estado.canvas.height };
}

export function cerrarEditorSembrado() {
  if (estado && estado.onClick) estado.canvas.removeEventListener('click', estado.onClick);
  estado = null;
}
