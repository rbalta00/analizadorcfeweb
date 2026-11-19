# Cotizador por machote entre tarifas distintas (ej. machote GDMTO → estudio GDMTH)

Aclaración fija, pedida por el usuario el 2026-11-17, de cómo se comporta el "Cotizador
por machote" cuando el machote que se usa como referencia es de una tarifa distinta a la
del servicio que se está cotizando. Ver `js/clientes.js` (`aplicarMachoteAProyecto`,
`CAMPOS_EDITORIAL_MACHOTE`) y `js/app.js` (`renderPanelCrearDesdeMachote`,
`todosLosMachotesVerificados`) para el código real.

## Regla

1. **El machote solo aporta lo EDITORIAL** — nunca cálculo:
   - Qué secciones quedaron encendidas/apagadas (`seccionesExcluidas`).
   - Qué gráficas/tablas quedaron visibles u ocultas (`graficosExcluidos`,
     `tablaColumnasOcultas`, `tablaFilasOcultas`).
   - Qué bloques "Cómo se calculó" quedaron activos (`calculosActivos`).
   - Textos editados a mano (filtrando identidad del cliente origen y cifras/
     conclusiones del cálculo del origen — ver `PATRON_POSIBLE_NUMERO_CALCULADO`/
     `PATRON_CONCLUSION_COMPARATIVA` en `clientes.js`).
   - Secciones personalizadas activas (`seccionesPersonalizadas`) y los "pasos de
     entrega" (`pasos`/`pasoActivo`).
   - **Nunca toca** `proyecto.formulario` (tarifa, cargos, periodo, kWh, criterios de
     dimensionamiento) — eso siempre sale del recibo real que se capture para el
     servicio nuevo.

2. **El cálculo siempre es el real de la tarifa del servicio nuevo.** Si el machote es
   de GDMTO y el servicio nuevo es GDMTH, el motor calcula con las reglas y datos reales
   de GDMTH (franjas Base/Intermedia/Punta, demanda, bonificación, etc.) — nunca con
   números ni fórmulas de GDMTO. Esto ya está soportado en la UI: cualquier machote
   verificado se puede usar como referencia para cualquier tarifa (etiqueta
   "🔁 machote de X" en el panel "Cotizar con machote"), precisamente porque el machote
   nunca contamina el cálculo.

3. **Si el cálculo de la tarifa nueva necesita algo que la tarifa del machote nunca
   tuvo, se agrega solo — el machote no puede bloquearlo.** El machote solo puede
   excluir (`seccionesExcluidas`/`graficosExcluidos`/etc.) algo que **ya existía como
   opción** en el servicio de origen y que el usuario apagó a propósito. Si una
   sección/tabla/gráfica es específica de la tarifa nueva (ej. la tabla de franjas de
   energía Base/Intermedia/Punta, propia de GDMTH, que GDMTO ni siquiera muestra como
   opción), su id nunca estuvo en la lista de apagados del machote — no hay nada que
   heredar ahí. La pantalla decide qué mostrar según la tarifa REAL del recibo
   capturado, así que ese contenido aparece con normalidad en cuanto el sistema
   detecta que el servicio es GDMTH.
   - En otras palabras: el machote solo puede apagar lo que el usuario apagó a
     propósito. Nunca puede ocultar algo que no sabía que existía.

## Ejemplo concreto

- Se da de alta un machote con un servicio **GDMTO** (editado/reducido a lo que se
  quiere entregar).
- Se usa ese machote para un estudio nuevo cuyo recibo real es **GDMTH**.
- Resultado: el estudio nuevo hereda la estructura/edición del machote (secciones
  apagadas, textos redactados, etc.), pero:
  - Los números (inversión, ahorro, recuperación, etc.) salen 100% del recibo/tarifa
    real GDMTH capturado para este cliente.
  - La tabla de franjas de energía (Base/Intermedia/Punta), que es propia de GDMTH y
    GDMTO nunca tuvo, se muestra de todas formas — porque nunca estuvo en la lista de
    "apagados" del machote, así que no hay nada que la esté bloqueando.

## No confundir con

- **Plantilla por tarifa** (`js/textosGlobales.js`): un mecanismo aparte, que sí es
  específico de cada tarifa (una plantilla de GDMTO solo se aplica automáticamente a
  proyectos GDMTO). No tiene nada que ver con el "Cotizador por machote", que es
  deliberadamente cruzable entre tarifas.

## Defecto real encontrado y corregido — 2026-11-19 ("Cotización 40", COBAEB Plantel 26
## San Salvador Chachapa, PDBT, servicio 217991104461)

El documento entregado a este cliente decía **"Tarifa GDMTO: Gran Demanda de Media
tensión Ordinaria..."** y aplicaba la doctrina de demanda de GDMTO (Distribución y
Capacidad nunca bajan porque se facturan por kW) sobre un recibo **PDBT** real, donde
esos mismos conceptos SÍ bajan (se facturan por kWh). Los importes del desglose eran
correctos (vienen del recibo real); el error era de interpretación/texto según la
tarifa, no de los números.

**Causa real, confirmada leyendo el código** (no una re-litigación del diseño de
arriba, que ya era correcto en el 95% de los casos): el texto de tarifa/clasificación
en pantalla y PDF (secciones.js §2/§4, propuesta.js página 2/4, resumen.js) YA se
calculaba dinámicamente a partir de `r.tarifa`/`r.meta.tieneDemandaContratada` -- pero
3 huecos reales dejaban pasar doctrina de GDMTO/demanda igual en un documento PDBT:

1. `razonSiReducible()` (secciones.js) citaba literalmente "GDMTO/GDMTH" como ejemplo
   de lo contrario al explicar por qué Distribución/Capacidad SÍ bajan en una tarifa
   sin demanda.
2. El párrafo "Tarifa X. <razón>" de "Qué cargos pueden disminuir" escribía **"No
   tiene demanda contratada: ..."** en el caso SIN demanda -- la frase prohibida
   aparecía hasta en la oración que la estaba negando.
3. Varias etiquetas/notas fijas (mapa de qué dato alimenta qué cálculo, tabla de
   trazabilidad, checklist de pendientes) mencionaban "demanda contratada" como
   boilerplate para CUALQUIER tarifa, sin condicionar a si esta tarifa en particular
   la tiene.

Además, el filtro de `aplicarMachoteAProyecto()` (punto 1 de la regla de arriba, "Textos
editados a mano...") solo descartaba identidad del cliente origen y cifras/conclusiones
del cálculo -- **nunca detectaba que un párrafo editado a mano mencionara la doctrina o
el nombre de OTRA tarifa.** Un machote verificado de GDMTO aplicado a una tarifa sin
machote propio todavía (ej. PDBT, antes de que exista uno) podía dejar ese texto
contaminado sin ningún aviso.

### Corrección

- **Fuente única de la doctrina por tarifa**: `js/tarifaDoctrina.js` (nuevo) --
  `razonCargosPuedenDisminuir(r)` / `razonCargosPuedenDisminuirCorta(r)`, usadas por
  secciones.js (§4), propuesta.js (página 4) y resumen.js (resumen ejecutivo) -- nunca
  más 3 copias que se puedan desincronizar. Los 3 huecos de arriba se reescribieron
  para nunca mencionar "demanda contratada" ni el nombre de otra tarifa cuando la
  tarifa real del recibo no tiene demanda contratada.
- **Candado de consistencia antes de exportar**: `detectarTextosTarifaCruzada(r,
  textosEditados)` (mismo archivo) revisa TODO el texto editado a mano (venga de un
  machote o de una edición directa) contra la tarifa/clasificación real de ESTE
  estudio -- si algo menciona el nombre de otra tarifa o doctrina de demanda que no le
  corresponde, **bloquea** la exportación de PDF/Excel/WhatsApp (`app.js`,
  `confirmarSinTextoTarifaCruzadaAntesDeExportar`) con un aviso que dice exactamente
  qué texto está cruzado. Sin excepciones silenciosas, sin importar si el estudio nació
  de un machote, ya se marcó "verificado", o es un estudio viejo creado antes de este
  fix.
- El mismo candado también alimenta el panel "Plantilla aplicada desde un machote" (el
  mismo que ya avisaba de identidad/cifras sospechosas) con un botón de restaurar de un
  clic -- no hace falta una pantalla nueva.
- **No se tocó `js/motor.js` ni `js/resultado.js`** -- la auditoría del 2026-11-18 ya
  había confirmado que el motor calcula bien con entradas limpias en las 6 tarifas; este
  defecto era 100% de texto/doctrina, nunca de la aritmética. Verificado con las 4
  suites de prueba existentes (`test_motor.mjs`/`test_resultado.mjs`/
  `test_clientes.mjs`/`test_recibo.mjs`, las 4 en verde sin cambios) y en vivo, generando
  el PDF real de dos recibos PDBT distintos (incluido el caso de calibración del COBAEP,
  servicio 217991104461: identidad $44,523.74/$52,207.44 y piso $637.71 exactos) --
  cero apariciones de "GDMTO"/"GDMTH"/"por kW, no por kWh" en el texto completo del PDF
  (pdf.js), salvo la entrada del glosario que define el término en general (ver nota en
  `js/secciones.js`/`js/propuesta.js`, sección/página 24, intencional -- un glosario
  describe un término de CFE en general, no afirma que ESTE cliente lo tenga).
- El candado se probó forzando a mano el caso cruzado exacto reportado (editar el
  párrafo de tarifa de un estudio PDBT para que diga "Tarifa GDMTO: ...") -- la
  exportación se bloqueó con el aviso correcto citando el id del párrafo (`s2-t1`) y el
  motivo; al restaurar el texto, la exportación volvió a funcionar.

### Pendiente: machote PDBT verificado

Este fix fue de CÓDIGO -- no crea por sí solo el machote PDBT verificado (eso vive en
el `localStorage` del navegador real del dueño, no en este repo). Para dejarlo activo:

1. Abre "🧭 Cotizador por machote" → elige la tarifa **PDBT**.
2. Si ya existe un machote GDMTO verificado, aparece el botón "📑 Crear un borrador
   para PDBT desde el machote GDMTO verificado" -- úsalo para clonar la estructura/
   redacción genérica (igual que pide el encargo: "el formato se clona de un GDMTO ya
   terminado"). Si prefieres partir de una cotización PDBT ya trabajada en vez del
   machote GDMTO, usa la lista de abajo ("Verificar una cotización ya trabajada con
   esta tarifa") directamente.
3. En ese borrador, carga/captura el recibo real de PDBT (el del COBAEP, servicio
   217991104461, sirve como caso de calibración) y pulsa Calcular.
4. Revisa el panel "Plantilla aplicada desde un machote" (si aparece) -- con este fix
   ya aplicado, no debería mostrar ningún texto de tarifa cruzada; si por algún motivo
   apareciera uno, usa su botón "🔄 Restaurar estos textos al cálculo de este inmueble"
   antes de seguir.
5. Vuelve a "🧭 Cotizador por machote" → PDBT → en "Verificar una cotización ya
   trabajada con esta tarifa", elige este borrador y pulsa "✅ Verificar como machote
   de PDBT". Al ser el primero de esa tarifa, queda automáticamente como predeterminado.
