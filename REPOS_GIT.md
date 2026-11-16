# Qué repo de GitHub usar — IMPORTANTE, leer antes de pushear nada

**Fecha de esta nota: 2026-11-15.**

## Repo correcto, el que hay que usar de ahora en adelante
**`rbalta00/analizadorcfeweb`** — https://github.com/rbalta00/analizadorcfeweb
(público). Es el que usa el agente Mause y el que está desplegado de verdad.

## Repo viejo — YA NO USAR
`rbalta00/cotizador-fv-cfe-web` (privado) — https://github.com/rbalta00/cotizador-fv-cfe-web.
**Corregido el 2026-11-16** (ver actualización abajo): el `git remote origin` de esta
carpeta ya NO apunta aquí, ya apunta a `analizadorcfeweb`.

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

## Actualización 2026-11-15: merge hecho localmente, falta el push
Se hizo el merge real de los 27+22 commits (commit local `d77c79f`, rama
`master` de esta carpeta). Los 6 archivos con conflicto real (`index.html`,
`js/app.js`, `js/clientes.js`, `js/excel.js`, `js/secciones.js`,
`service-worker.js`, 20 bloques en total) se resolvieron a mano, caso por
caso, nunca "el último que gana" -- el detalle completo de qué se conservó
de cada lado y por qué está en el mensaje del commit `d77c79f`
(`git show d77c79f` en esta carpeta). `node --check` en los 6 archivos y
`npm test` (motor/recibo/clientes) siguen en `TODO OK` después del merge.

## Actualización 2026-11-16: push hecho, origin corregido — YA ESTÁ COMPLETO
Antes del push se verificó el merge completo en vivo en Chrome (servidor local,
nunca tocó producción): carga sin errores, terminología correcta, cálculo GDMTO
con datos reales, toggles "Cómo se calculó"/"apagado = ausente del DOM", y
exportación a Excel con celdas numéricas reales — los 3 puntos más riesgosos
del merge sobrevivieron intactos.

Con autorización explícita de Isaac, se corrió `git push analizador master`:
`4da7c90..d77c79f  master -> master` — **`analizadorcfeweb` ya tiene TODO el
trabajo de ambos lados (los 27 commits que le faltaban + sus 22 propios)**.
Ya no le falta nada.

También se corrió `git remote set-url origin https://github.com/rbalta00/analizadorcfeweb.git`
en esta carpeta — `origin` y `analizador` ya apuntan los dos a `analizadorcfeweb`.
Un `git push` sin especificar remoto ya va al lugar correcto.

**Único pendiente real que queda**: avisarle a Mause que ya se subió el merge,
para que no reconstruya por su cuenta algo que ya llegó de este lado (esto no lo
puede hacer Claude, requiere que Isaac le avise directamente). También sigue
pendiente, de menor prioridad, revisar si la URL de Vercel citada en `ESTADO.md`
sigue siendo la correcta ahora que el repo canónico es `analizadorcfeweb`.
