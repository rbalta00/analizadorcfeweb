# Qué repo de GitHub usar — IMPORTANTE, leer antes de pushear nada

**Fecha de esta nota: 2026-11-15.**

## Repo correcto, el que hay que usar de ahora en adelante
**`rbalta00/analizadorcfeweb`** — https://github.com/rbalta00/analizadorcfeweb
(público). Es el que usa el agente Mause y el que está desplegado de verdad.

## Repo viejo — YA NO USAR
`rbalta00/cotizador-fv-cfe-web` (privado) — https://github.com/rbalta00/cotizador-fv-cfe-web.
Esta misma carpeta (`cfe-presupuestos/web`) todavía tiene su `git remote origin`
apuntando aquí (no se ha corregido todavía, ver pendiente abajo). `ESTADO.md`
(línea 11-12) también sigue citando este repo viejo como si fuera el actual —
desactualizado, no corregido en esta pasada porque solo se pidió hacer esta nota.

## Hallazgo importante: NO tienen el mismo contenido — faltan cosas en los dos lados
Se comparó el historial de git de ambos repos (`git merge-base` confirma que sí
vienen del mismo proyecto, se separaron en algún punto, no son cosas distintas
sin relación). Resultado al 2026-11-15:

### `analizadorcfeweb` (el nuevo/correcto) le FALTA todo esto, que sí existe en `cotizador-fv-cfe-web`:
27 commits de trabajo real, de varias sesiones recientes, entre ellos:
- **Todo el trabajo de hoy/ayer (2026-11-14/15)**: los 3 commits de "apagados ya no
  se ven difuminados" (secciones completas, gráficas/tablas, "cómo se calculó",
  párrafos/títulos), "Cotizador por machote" reforzado (reutilizable entre
  tarifas, "Agregar sección o texto"), auditoría metodológica (fraseo de
  sección 20, aviso de desfase sembrado-vs-calculado).
- Visor "Estado del lote de 40 inmuebles" completo (agrupado por tarifa,
  filtro, ventana independiente).
- Varios fixes reales de guardado: `eliminarProyecto`/`crearProyecto`/
  `clonar*`/`bloquear`/`desbloquear`/`moverProyecto` ya no pierden ni
  revierten cotizaciones; `guardarProyecto` ya no pisa en silencio proyectos
  editados en otra pestaña.
- Fix real: DAP no se prorrateaba por días en tarifas con demanda
  (GDMTO/GDMTH/GDBT/PDBT).
- Fix real: el machote pisaba titular/domicilio/No. de servicio del recibo
  nuevo; identidad del proyecto origen se colaba como predeterminado
  global/por tarifa.
- Búsqueda de cotizaciones por nombre (ignora acentos/mayúsculas) y por
  tarifa; lista de cotizaciones con avance por inmueble.
- "Mi formato fijo" / plantillas por tarifa, incluido en el respaldo a la nube.
- Botones flotantes de subir/bajar página; franja teal de "esto sí sale en
  el PDF".

**Lista completa de los 27 commits**: correr `git log` en esta carpeta desde
el commit `1361538` (el ancestro común) hasta `HEAD`, o pedirle a Claude que
la vuelva a generar.

### `cotizador-fv-cfe-web` (el viejo) le FALTA todo esto, que sí existe en `analizadorcfeweb`:
22 commits, entre ellos:
- Cambio de terminología completo: "cotización"→"estudio", "cotizador"→"analizador".
- Mejoras grandes de exportación a Excel (anchos de columna, orientación
  landscape, indicadores financieros completos: VAN/TIR/payback/ISR,
  nombres de propiedades corregidos).
- Configuración de Vercel corregida para que despliegue como sitio estático
  (varios intentos, incluido un `vercel.json` arreglado hoy mismo, 2026-11-15).
- Intento de GitHub Pages (agregado y luego removido).
- Corrección: "guardar machotes completos sin filtrar redacción".

## Pendiente, no resuelto en esta nota
Esta carpeta local sigue sin apuntar al repo correcto, y los dos repos siguen
sin unificarse — nadie ha hecho el merge real de los 27+22 commits. Mientras
eso no pase, cualquiera de los dos lados (tú trabajando aquí, Mause trabajando
en `analizadorcfeweb`) puede seguir perdiendo el trabajo del otro sin darse
cuenta. Cuando se decida unificar, avisar para hacerlo con cuidado (hay
archivos que cambiaron en ambos lados, como `service-worker.js` y
`vercel.json`, que van a necesitar resolver conflicto a mano, no solo un
merge automático).
