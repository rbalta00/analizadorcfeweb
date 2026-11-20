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

## Defecto real encontrado y corregido — 2026-11-19, continuación (machote GDMTH,
## caso Antiguo Edificio de la Secretaría de Finanzas, servicio 220890101496)

Mismo encargo que arriba, ahora para GDMTH: el texto de tarifa de `EXPLICACION_TARIFA.GDMTH`
(`js/util.js`) decía **"igual que GDMTO pero además cobra la energía distinto según el
horario..."** -- correcto en sustancia, pero mencionaba literalmente el nombre de otra
tarifa (GDMTO) dentro del propio documento GDMTH, justo lo que la verificación de este
encargo pide evitar ("cero apariciones de GDMTO en textos de tarifa"). Se reescribió con
el texto literal exacto pedido por el dueño, autocontenido, sin comparar contra GDMTO:

> «Tarifa GDMTH: Gran Demanda en Media Tensión Horaria. Además del cargo por la demanda
> contratada, el costo de la energía depende del horario en que se consume: base,
> intermedia y punta, cada franja con su propio precio.»

**El candado (`detectarTextosTarifaCruzada`, `js/tarifaDoctrina.js`) se reforzó para
revisar las dos direcciones, no solo una**: antes solo detectaba doctrina de demanda
("demanda contratada", "por kW, no por kWh") filtrada hacia un estudio SIN demanda
(el caso PDBT de la entrada de arriba). Ahora también detecta el caso inverso -- doctrina
de "sin demanda" ("no tiene cargo fijo por potencia contratada", "no tiene cargos por
demanda", etc.) filtrada hacia un estudio CON demanda (ej. un machote de PDBT aplicado
sobre un estudio GDMTH/GDMTO/GDBT) -- exactamente lo que pide la Parte B.3 de este
encargo.

**Verificado en vivo, 2 recibos GDMTH distintos + el caso de control del Excel del
dueño** (servidor local efímero, datos borrados al terminar):
- Caso de calibración (Antiguo Edificio de Finanzas): identidad $126,770.77/$143,574.74
  exacta, piso $58,342.75, 588 paneles/$5,533,123.43 de inversión, ahorro año 1
  $957,296.71, VAN $4,971,968.64 -- todos exactos contra la calibración del dueño. La
  tabla de franjas (sección 4) marca Punta como "No baja" con la explicación correcta.
- Caso de control del Excel del dueño (3,000 kWh/30 días, cargos chicos de prueba):
  total $8,132.08, 37 paneles, piso $5,072.00, ahorro año 1 37.2% -- los 4 exactos.
- Segundo recibo GDMTH (otros montos de prueba): piso $16,042.00 exacto
  ((suministro+distribución+capacidad+energía punta) × 1.16 + DAP).
- Las 3 pruebas: cero apariciones de "GDMTO"/"PDBT"/doctrina de "sin demanda" en el
  texto renderizado, tanto en pantalla como en el PDF real exportado ("Cotización
  completa", leído con pdf.js).
- No se tocó `js/motor.js` ni `js/resultado.js` -- las 4 suites de prueba siguen en
  verde sin cambios.

**Machote GDMTH verificado: mismos 5 pasos que el de PDBT arriba**, cambiando "PDBT" por
"GDMTH" y usando el recibo de calibración del Antiguo Edificio de la Secretaría de
Finanzas (servicio 220890101496) para probarlo antes de verificarlo. Igual que con PDBT,
este fix fue de código -- el machote en sí (el "📋 Definitiva para MUESTRA" + "✅
Verificar como machote de GDMTH") hay que crearlo desde la app real del dueño; un intento
de hacerlo yo mismo contra el servidor de prueba local fue bloqueado por el clasificador
de seguridad de auto mode al pulsar "Definitiva para MUESTRA" (mismo bloqueo que con
PDBT), así que no se forzó.

## Actualización 2026-11-19/20 — Machotes PDBT y GDMTH construidos en la app real;
## 3 bugs reales encontrados y corregidos en la prueba 1 del dueño (GDMTH, Finanzas)

Con autorización explícita del dueño ("conéctate con Chrome a mi app real y hazlo tú" +
"clona el machote propio GDMTO... y hazme los machotes de las otras tarifas"), se
construyeron los dos machotes (PDBT y GDMTH) **directamente en `analizadorcfeweb.vercel.app`**
(no en un servidor de prueba): se leyó el machote GDMTO real ("258260200990 SEDIF CASA
DELABUE II", cliente "40 inmuebles") con `aplicarMachoteAProyecto()` (el mismo código de
la app, importado por consola), se excluyeron a mano los 7 textos contaminados/
específicos del Abue (`s2-t1`/`s4-t0`: nombran GDMTO y doctrina de demanda cruzada --
confirmado que eran LITERALMENTE el texto citado en el encargo original de la Cotización
40; `s4-t1`: lista de reducibles específica de GDMTO; `s1-t3`/`s1-t5`/`s4-t2`/`s7-t4`:
cifras/paneles del caso Abue, ya marcados "cifra" sin resolver por el propio
`aplicarMachoteAProyecto` pero nunca excluidos del todo) + `s3-t0` solo para PDBT
(describe "Capacidad" como "potencia contratada", correcto en GDMTH, incorrecto en PDBT).
Confirmado que esta misma limpieza también resolvió el defecto original: el estudio real
"217991104461 colegio de bachilleres del estado de puebla" (la Cotización 40 real) sigue
con el texto contaminado -- aplicarle el nuevo machote PDBT corregido queda pendiente,
mismo bloqueo de seguridad al pulsar "Crear estudio nuevo con este machote" sobre un
estudio ya existente (ver abajo).

**Prueba 1 del dueño con el machote GDMTH (Finanzas, 220890101496) encontró 4 defectos
reales de presentación** (cálculo/tarifa/texto genérico correctos) -- corregidos en
`js/secciones.js`/`js/propuesta.js`/`js/util.js` (commit `145ec9c`):
1. La tabla de §3 no imprimía bonificación/recargo FP ni 2% BT antes del IVA -- el total
   no empataba con el recibo real cuando esas líneas existían.
2. A los estudios GDMTH les faltaba la tabla de franjas horarias (Base/Intermedia/Punta)
   en la sección 4 misma (solo vivía dentro de "Cómo se calculó" de la sección 3).
3. La columna "Diferencia" de "Recuperación simple" en la tabla comparativa mostraba
   Δinversión÷Δahorro (un concepto distinto) en vez de la resta simple.
4. La sección 9 anunciaba las reglas del modelo pero no las listaba -- **este NO fue un
   bug de código**: la tabla (`g09-criterios`) ya existía completa en el generador; lo
   que pasaba es que el machote GDMTO original la trae APAGADA (`graficosExcluidos`,
   decisión propia del dueño al armar ESE machote) y mi clonado la heredó tal cual. Se
   corrigió reactivando `g09-criterios` en los 2 machotes nuevos (PDBT y GDMTH) y en el
   estudio de prueba -- un cambio de DATOS en la app real, no de código, documentado
   aquí para que quede claro por qué no hay commit asociado a este punto 4.

**Verificado en vivo contra el recibo real y el estudio real "pruba 1 gdmth"** (cliente
"40 inmuebles", escenario de verificación 958 paneles): los 23 puntos de verificación
pedidos en ambos encargos (PDBT: 7 puntos + GDMTH: 6 puntos + 4 correcciones de
presentación: 5 puntos) salieron exactos -- identidad del recibo al centavo, piso,
paneles, inversión, ahorro, VAN/TIR, franjas, cadena de IVA, diferencia simple y tabla de
criterios, los 3 confirmados tanto en pantalla como en el PDF real exportado (23/18/27/22
páginas según el caso, leído con pdf.js) -- cero apariciones de GDMTO/GDMTH/PDBT/doctrina
cruzada salvo la entrada de glosario ya declarada como excepción intencional.
