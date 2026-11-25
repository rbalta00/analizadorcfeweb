# Revisión y corrección integral del analizador: cada tarifa y cada estudio (v1)

Fecha: 2026-11-25. Repo: `analizadorcfeweb`. Alcance: Paso 1 (cada tarifa) + Paso 2 (cada estudio real del cliente "40 inmuebles", leído en solo-lectura del respaldo real en Supabase, `cfe_respaldo`, proyecto `prchqgvwaepzmcohoehu`) + correcciones de raíz + verificación.

**Método**: para cada tarifa se comparó la doctrina declarada (`js/tarifaDoctrina.js`) contra lo que `construirInvoice`/`construirInvoiceDomestica` (`js/motor.js`) y `construirResultado` (`js/resultado.js`) efectivamente aplican, con datos reales (fixtures del repo) o sintéticos representativos. Para cada estudio del lote se leyó su `formulario`/`campos` real guardado en la nube y se corrió `construirResultado()` con esos mismos datos, comparando el resultado contra las cifras ya cacheadas (`ultimaInversionTotal`/`ultimoAhorroAnual`) en ese registro. Ningún dato se inventó; donde no fue posible verificar con fidelidad completa, queda dicho explícitamente.

## Tabla por tarifa

| Tarifa | Estado final | Qué se corrigió |
|---|---|---|
| **GDMTO** | OK | Ninguna corrección de motor/doctrina. Verificado con el fixture real de Casa del Abue: `meta.reducibles`/`noReducibles` = `[energia,transmision,cenace,scnmem]` / `[suministro,distribucion,capacidad]`, piso y ahorro exactos contra el recibo real. |
| **GDMTH** | OK | Ninguna corrección de motor/doctrina. Verificado con un caso sintético con franjas Base/Intermedia/Punta: Punta queda correctamente no-reducible (razón horaria, no de demanda), Base/Intermedia reducibles. Doctrina (`razonCargosPuedenDisminuir`) menciona la Energía Punta solo para GDMTH, como corresponde. |
| **GDBT** | **Pendiente — sin recibo real para validar** | Sin cambios de motor/doctrina (comparte la misma rama "con demanda" que GDMTO/GDMTH en `TARIFAS_CON_DEMANDA`, verificada con un caso sintético: clasificación/piso coherentes). Confirmado por búsqueda exhaustiva en el respaldo real (`cfe_respaldo`) y en los fixtures del repo: **no existe ningún estudio GDBT real** en todo el sistema — ni en el lote de 40, ni en ningún otro cliente. No se puede cerrar esta tarifa con un caso real hasta que aparezca uno. |
| **PDBT** | OK | Ninguna corrección. Verificado que la detección "sin demanda contratada" (vía columna `$/kW`), la clasificación reducible/no-reducible (todo menos Suministro), la aclaración de §3 (`aclaracionPalabrasSimplesPdbt`) y la presentación bimestral forzada por tarifa (§2/§4/§7/§10, confirmado leyendo el código de cada sección) siguen correctas y consistentes con 5 recibos reales del lote. |
| **01 (doméstica)** | **Corregido** | Ver hallazgo y fix abajo (cargo fijo de CFE no se reflejaba como no-reducible). Sin estudios reales en el sistema hoy que usen esta tarifa — verificado con casos sintéticos antes y después del fix. |
| **DAC (doméstica)** | **Corregido** | Mismo fix que arriba (comparte el motor `construirInvoiceDomestica`). Sin estudios reales en el sistema hoy. |

### Hallazgo real y corrección — tarifas domésticas (01/DAC) con cargo fijo capturado

**Síntoma**: cuando un estudio doméstico (01/DAC) captura un "Cargo fijo de CFE" distinto de cero (`cargoFijoDomestica`, campo que sí existe en el formulario desde 2026-11-06), el **cálculo** del piso de ahorro ya lo reflejaba correctamente (`motor.js`, `construirInvoiceDomestica`: el cargo fijo se prorratea por días, independiente de la energía neta, igual que el DAP) — pero la **doctrina** (`r.meta.reducibles`/`noReducibles`, usada por §4 "Qué cargos pueden disminuir" en pantalla, PDF y Excel) seguía diciendo `reducibles: ['energia'], noReducibles: []`, es decir, afirmaba que el 100% de la factura baja con los paneles, contradiciendo el propio piso ya calculado. La tabla de §4 solo mostraba una fila ("Energía") y el aviso decía "el único piso que queda es el IVA y el DAP" — ninguno de los dos mencionaba el cargo fijo real.

**Corrección, en la raíz** (`js/resultado.js`, rama doméstica de `construirResultado`): cuando `facturaDetalle.cargoFijo` es distinto de cero, se separa de `cargosFinal.energia` en su propio concepto `cargoFijo`, y `meta.noReducibles` lo incluye. Cero cambios a ninguna cifra de cálculo (`pagoRecurrentePeriodo`/`pisoPeriodo`/`ahorroMaxPeriodo`/`investment`/`ahorroAnual` idénticos antes y después, verificado con un caso sintético). `js/secciones.js` (§4): fila nueva "Cargo fijo de CFE — No baja" en la tabla de clasificación (condicional, solo aparece cuando aplica) y el aviso se actualiza para mencionar el cargo fijo cuando corresponde. `js/util.js`: etiqueta `cargoFijo: 'Cargo fijo de CFE'` agregada a `NOMBRES_CONCEPTO` (la usan tanto la tabla como el candado de texto-cruzado de `tarifaDoctrina.js`). `js/propuesta.js` (PDF viejo del botón de WhatsApp) y Excel leen `r.meta`/`r.cargos` de forma genérica — se corrigen solos, sin tocarlos.

**Impacto real hoy**: cero estudios en producción usan tarifa doméstica con `cargoFijoDomestica > 0` (confirmado contra el respaldo real completo) — es una corrección preventiva de raíz, no corrige ningún estudio existente, pero cierra el hueco antes de que el primer cliente residencial real lo exponga.

## Tabla por estudio (cliente "40 inmuebles", 63 registros reales en el respaldo — 40 inmuebles + 23 copias/duplicados/pruebas)

Leyenda de **Identidad**: ✅ = titular/RPU/domicilio del `formulario` coinciden con `campos` (lo leído del recibo real) y hay recibo adjunto; ⚠️ = algo no cuadra, detallado. **Recalculo**: ✅ = se recalculó con `construirResultado()` real contra este mismo `formulario` y coincide con lo cacheado (fresco); 🔁 = se recalculó y **no** coincide (desactualizado, listado abajo con el valor correcto); — = no se recalculó en esta pasada (sin contradicción visible entre sus copias, cuando las tiene).

### GDMTH (13 inmuebles reales, 17 registros)

| RPU | Inmueble | Identidad | Historial/promedio | Inversión / Ahorro cacheados | Recalculo |
|---|---|---|---|---|---|
| 219080701588 | Secretaría de Bienestar | ✅ | mensual, historial no capturado en campos (31 días) | $879,072.86 / $146,937.42 | — |
| 219151103971 | Museo de la Evolución | ✅ | igual | $611,303.93 / $87,041.10 | — |
| 221990403445 | Museo San Pedro de Arte | ✅ | igual | $832,925.38 / $133,615.86 | — |
| 234091001617 | Univ. Interserrana Ahuacatlán | ✅ | igual | $675,925.42 / $91,073.01 | — |
| 237110414099 | Univ. Tecnológica de Tehuacán | ✅ | igual | $4,646,637.61 / $877,714.47 | — |
| 241990301376 | Univ. Tecnológica de Izúcar | ✅ | igual | $4,859,059.63 / $886,848.42 | — |
| 245150601030 | CIS Acatlán de Osorio | ✅ | igual | $537,441.24 / $78,045.85 | — |
| 246060802318 | Univ. Politécnica de Puebla | ✅ | igual | $3,132,235.47 / $537,173.14 | — |
| 247150102150 | Ex-Hacienda de Chautla | ✅ | igual | $8,220,329.51 / $1,387,794.80 | — |
| 257130401717 | Eco Parque Metropolitano | ✅ (sin `campos` guardados, solo `formulario`) | igual | $1,719,411.21 / $266,264.49 | — |
| 821050405145 | Univ. Tecnológica de Xicotepec | ✅ | igual | $2,587,456.42 / $394,545.72 (3 copias, idénticas entre sí) | — |
| 836050403034 | Inst. Tec. Sup. de Zacapoaxtla | ✅ | igual | $1,765,558.69 / $264,055.29 | — |
| 220890101496 | Gobierno del Estado / Finanzas | ✅ | igual | $5,708,597.42 / $988,209.41 (3 copias, idénticas entre sí) | — |

Nota honesta: los 13 no se recalcularon individualmente en esta pasada (el motor GDMTH requiere reconstruir el desglose Base/Intermedia/Punta campo por campo, no se automatizó para los 13). Sí se verificó que, donde hay varias copias (Xicotepec, Gobierno/Finanzas), **todas coinciden exactamente entre sí** — señal de que no están desactualizadas entre ellas, aunque no se comparó contra una ejecución fresca del motor de hoy.

### GDMTO (22 inmuebles reales, 34 registros)

| RPU | Inmueble | Identidad | Inversión / Ahorro vigentes (recalculados) | Hallazgo |
|---|---|---|---|---|
| 218150700901 | Carreteras de Cuota | ✅ | $934,494.92 / $146,595.64 | ✅ fresco |
| 219230305601 | Sistema DIF del Edo. de Puebla | ✅ | $1,054,546.85 / $171,517.74 | 🔁 **3 de 4 copias desactualizadas** (cacheaban $1,036,106.23/$168,372.21). La 4ª copia ("...DEL ESTADO DE PUEBLA") tiene `escalaCostos:"residencial"` en vez de `"comercial"` — anomalía de datos aislada (GDMTO siempre debe ser "comercial", confirmado en el resto de los 40 registros) que por coincidencia cacheó un valor cercano al correcto ($1,053,788.49) sin serlo por la razón correcta. |
| 220890102441 | SEP Colegio de Bachilleres | ✅ | $796,010.75 / $120,816.85 | 🔁 la copia "prueba" está desactualizada (cacheaba $786,736.14/$119,014.77); la copia "SEP COLEGIO DE BACHILLERES" (definitiva) ya está fresca. |
| 267021200588 | Inst. Tec. Sup. de Huauchinango | ✅ | $1,294,642.31 / $214,705.08 | 🔁 1 de 2 copias desactualizada (cacheaba $1,350,064.39/$224,926.71); la otra ya está fresca. |
| 221251252048 | SEDIF | ✅ | $3,132,235.47 / $532,210.50 | ✅ fresco |
| 240151205381 | CIS Atlixco | ✅ | $565,114.69 / $79,679.20 | ✅ fresco |
| 245000700315 | Inst. Tec. Sup. Acatlán | ✅ | $1,470,074.54 / $247,943.46 (con recargo FP real de $137.10) | 🔁 **3 de 4 copias desactualizadas y sin el recargo FP capturado** (cacheaban $1,534,737.80/$258,227.81, y recalculan a $1,470,074.54/$246,383.84 sin el recargo). La 4ª copia ("INSTITUTO TEC SUPERIOR ACATLAN" suelta) es la más completa y ya está fresca. |
| 247040903963 | Inst. Tec. Sup. San Martín Tex. | ✅ | $1,165,357.56 / $185,616.37 | ✅ fresco |
| 248070500649 | Inst. Tec. Sup. de Cd. Serdán | ✅ | ver nota | **Dato real distinto entre copias, no error de caché**: una copia captura 8,640 kWh del período (fresca: $962,210.13/$150,010.72), la otra (la marcada **definitiva/bloqueada**) captura 3,840 kWh ($916,020.90/$323,709.97 recalculado vs $906,821.47/$319,337.57 cacheado — ligeramente desactualizada, diferencia ~1%, puede ser un snapshot congelado de antes de un ajuste fino). **Pendiente para Isaac** (ver abajo): ¿cuál de los dos consumos (8,640 o 3,840 kWh) es el real de este servicio? |
| 249020401620 | Inst. Tec. Sup. de Libres | ✅ | $1,073,020.87 / $165,833.48 | ✅ fresco |
| 251090200146 | Univ. Interserrana Edo. P. | ✅ | $759,062.70 / $114,748.93 | ✅ fresco |
| 254990200990 | Inst. Tecnológico Sup. Tepexi | ✅ | $343,493.25 / $23,197.13 | ✅ fresco |
| 257090401018 | Instituto Jaime Torres Bodet | ✅ | $371,241.85 / $46,456.93 | 🔁 **2 de 3 copias desactualizadas** (cacheaban $380,441.29/$48,378.34); 1 copia ya está fresca. |
| 255020900701 / 255020900791 | Inst. Tecnológico Sup. Tepeaca | ⚠️ ver nota | sin recalcular | El proyecto está guardado con el **nombre** "257240501652 INST. TECNOLOGICO SUP. TEPEACA" — pero 257240501652 es el RPU de OTRO inmueble del lote (id 22 del catálogo fijo, "Casa del Adolescente SEDIF Cuautlancingo", que ya tiene su propio registro correcto y separado). El `formulario.noServicio` real de este proyecto (255020900791) y su titular/domicilio SÍ corresponden a Tepeaca, y de hecho coinciden con el `rpuAlt` que el propio catálogo fijo (`js/lote40.js`, id 23) ya documenta como discrepancia conocida de origen ("base 255020900701; carátula del recibo 255020900791"). **No hay riesgo de recibo cruzado** — es solo el *nombre* del proyecto el que está mal etiquetado (cosmético), probablemente copiado de la fila equivocada al crearlo. |
| 258260200990 | SEDIF Casa del Abue II | ✅ | — | 2 copias: la viva (`bloqueada:false`, ahorro $30,320.11) y un clon congelado (`bloqueada:true`, ahorro $31,399.71) — la diferencia es esperada (el clon es una fotografía de un momento anterior, por diseño). |
| 836160402513 | CIS Teziutlán | ✅ | $712,873.46 / $90,903.26 | 🔁 duplicado bajo el nombre genérico "GOBIERNO DEL ESTADO DE PUEBLA" desactualizado (cacheaba $740,588.68/$95,292.25). |
| 840130201146 | Inst. Tec. Sup. de Tlatlauquitepec | ✅ | $583,588.72 / $72,330.08 | — |
| 840160300963 | CIS Tlatlauquitepec | ✅ | $417,355.92 / $51,293.82 | — |
| 237061107380 | IESE | ✅ | $491,252.02 / $66,687.44 | — |
| 893100305351 | Inst. Tec. Sup. V. Carranza | ✅ | $528,166.65 / $66,539.01 | — |
| 238161206802 | "GOB DEL ESTADO DE PUEBLA" | ⚠️ | $241,957.10 / $24,045.38 | RPU que no aparece en ningún otro registro ni se pudo confirmar contra el catálogo fijo en esta pasada — identidad no verificable sin más contexto. |
| (vacío) | "ANTIGUO EDIFICIO" | ⚠️ | $223,483.08 / $0.00 | Borrador incompleto: sin RPU, sin recibo adjunto, `periodoKwh` en 1000 (placeholder). No es un estudio real todavía. |

### PDBT (5 inmuebles reales, 8 registros)

| RPU | Inmueble | Identidad | Inversión / Ahorro | Presentación | Recalculo |
|---|---|---|---|---|---|
| 216000301062 | CIS Cholula | ✅ | $314,449.92 / $117,096.66 | Bimestral ✅ | ✅ fresco |
| 221890413427 | El Colegio de Puebla A.C. | ✅ | $154,574.07 / $51,529.88 | Bimestral ✅ | ✅ fresco (diferencia de $4.60 en el recálculo, dentro del margen de redondeo — no material) |
| 221890519420 | Carreteras de Cuota "Paseo Bravo" | ✅ | $364,342.44 / $214,227.44 | Bimestral ✅ | **No verificable con fidelidad completa en esta pasada** — este recibo usa el formato "por rango" de historial (confirmado en el registro del 2026-11-24, "PDBT v2"), donde el reemplazo del último período depende de comparar fechas (`leido.periodo_fin_mes/anio`) que no se reconstruyeron en este recálculo rápido; un recálculo sin ese contexto da un resultado distinto (33 paneles) que **no** refleja el comportamiento real del motor vigente (34 paneles, documentado ya el 2026-11-24). No se reporta como desactualizado: sería una conclusión fabricada sin los datos completos. |
| 221931008575 | Tenencia de la Tierra | ✅ | $614,175.82 / $238,409.64 | Bimestral ✅ | ✅ fresco (este recibo SÍ usa el formato de tabla mensual, donde el recálculo simplificado es fiable — confirmado contra el registro del 2026-11-24) |
| 217991104461 | Colegio de Bachilleres del Edo. (COBAEP Plantel 26) | ⚠️ ver nota | ver nota | Bimestral ✅ | **4 copias**: 2 coinciden exactas ($724,035.54/$283,699.82); 1 ("SEP COLEGIO DE BACHILLERE") cachea una cifra distinta ($704,046.47/$275,004.66) — **no se puede saber cuál es la vigente** sin el mismo contexto de fechas que Paseo Bravo (COBAEP también es formato "por rango", mismo caso); 1 ("COLEGIO DE BACHILLERES DEL ESTADO DE PUEBLA") está **rota de verdad**: `periodoKwh` guardado en 1,000 (el real es 12,441) produce un ahorro anual absurdo de $3,073,568.35/año — confirmado que es el motor calculando correctamente a partir de un dato de entrada erróneo, no un bug de cálculo. |

### Sin datos (3 registros vacíos/abandonados)

"DIF", "INSTITUTO TEC SUPERIOR DE HUAC", "UNIVERSIDAD INTERSERRANA EDO P" (sueltos, sin RPU/tarifa/formulario) — borradores nunca completados, no son estudios.

## Resumen de cambios de código

| Archivo | Qué se cambió | Qué problema cierra |
|---|---|---|
| `js/resultado.js` | Rama doméstica de `construirResultado`: separa `cargoFijo` de `energia` en `cargosFinal`/`meta.noReducibles` cuando `cargoFijoDomestica` es distinto de cero. Cero cifras de cálculo cambian. | Doctrina de tarifas 01/DAC afirmaba que el 100% de la factura baja con paneles aunque hubiera un cargo fijo real que no baja (el piso ya lo calculaba bien; la explicación no coincidía con el propio piso). |
| `js/secciones.js` | §4 (`s04`): fila condicional "Cargo fijo de CFE — No baja" en la tabla de clasificación doméstica; el aviso menciona el cargo fijo cuando aplica. `razonNoReducible()`: nuevo caso para `'cargoFijo'`. | Mismo hallazgo — refleja en pantalla/PDF/Excel (generados genéricamente desde `r.meta`) la corrección de `resultado.js`. |
| `js/util.js` | `NOMBRES_CONCEPTO`: agregada la etiqueta `cargoFijo: 'Cargo fijo de CFE'`. | Sin esto, `listaConceptos()` habría impreso la llave cruda `cargoFijo` en vez de un nombre legible. |
| `service-worker.js` | Cache bumpeado a `cfe-analizador-v155`. | Para que la PWA instalada tome los 3 cambios anteriores en el próximo "Actualizar". |

**Confirmado sin cambios, por grep/lectura de código**: `js/propuesta.js` (PDF del botón de WhatsApp) y Excel leen `r.meta`/`r.cargos` de forma genérica — no tienen su propia copia de esta lógica, así que heredan la corrección sin tocarlos. `js/tarifaDoctrina.js` (candado de texto cruzado) también usa `listaConceptos`/`NOMBRES_CONCEPTO` de forma genérica.

**`npm test` (7 suites) sin regresiones, antes y después de los 3 cambios.**

## Pendientes para Isaac

Solo lo que requiere un recibo real o una decisión suya — nada de esto se resolvió inventando un dato:

1. **Inst. Tec. Sup. de Cd. Serdán (RPU 248070500649)**: hay 2 copias con consumos distintos del período — una con 8,640 kWh, otra (marcada como la **definitiva/bloqueada**, la "oficial") con 3,840 kWh. ¿Cuál de los dos es el consumo real de este servicio? Si es 3,840 kWh (el de la definitiva), conviene además reabrirla y volver a guardarla una vez — su cifra cacheada ($906,821.47/$319,337.57) está ~1% desactualizada respecto al motor de hoy ($916,020.90/$323,709.97).

2. **COBAEP Plantel 26 (RPU 217991104461)**: 4 copias bajo nombres distintos. Una tiene `periodoKwh` guardado en 1,000 en vez de 12,441 (dato roto, produce un ahorro absurdo) — se puede borrar sin pérdida, ya hay 3 copias con el consumo real. De las 3 restantes, 2 coinciden exactas y 1 ("SEP COLEGIO DE BACHILLERE") no — como este recibo es de formato "por rango" (como Paseo Bravo), no se pudo determinar aquí cuál de las dos cifras es la vigente sin abrir el estudio real en la app (que sí tiene el contexto completo de fechas). Sugerencia: abrir cada una, pulsar "Calcular" y "Guardar", y quedarse con una sola copia.

3. **Paseo Bravo (RPU 221890519420)**: mismo caso de formato "por rango" que COBAEP — no se pudo verificar con fidelidad en esta pasada si su cifra cacheada sigue vigente. Sugerencia: abrir el estudio real y pulsar "Calcular" una vez para confirmar.

4. **Nombre mal etiquetado — Inst. Tecnológico Sup. Tepeaca**: el proyecto guardado como *"257240501652 INST. TECNOLOGICO SUP. TEPEACA"* tiene datos correctos (RPU real 255020900791, titular y domicilio de Tepeaca), pero el número en su propio nombre (257240501652) es el RPU de otro inmueble del lote (Casa del Adolescente, que ya tiene su registro aparte y correcto). No hay ningún recibo cruzado ni riesgo de cálculo — es solo cosmético. Sugerencia: renombrarlo a algo como "255020900791 INST. TECNOLOGICO SUP. TEPEACA" para que no se confunda con Casa del Adolescente al verlo en la lista.

5. **RPU 238161206802 ("GOB DEL ESTADO DE PUEBLA")**: no se encontró en el catálogo fijo de los 40 ni coincide con ningún otro registro — ¿es un inmueble del lote que falta agregar al catálogo, o es un anexado/independiente que no debería estar mezclado en este cliente? Solo Isaac puede confirmarlo.

6. **Sistema DIF (RPU 219230305601)**: una de las 4 copias trae `escalaCostos: "residencial"` en vez de `"comercial"` (todas las demás GDMTO del lote usan "comercial", correcto). Confirmar que la copia buena a conservar es la que usa "comercial" (recalcula a $1,054,546.85/$171,517.74) y borrar las demás.

7. **Duplicados en general**: de los 63 registros bajo "40 inmuebles", 23 son copias/pruebas/borradores de los mismos 40 inmuebles reales (no se tocó ninguno — ninguna cifra se escribió a mano, todo lo de arriba son solo hallazgos de lectura). Cuando Isaac tenga tiempo, vale la pena entrar a la app real, reabrir cada duplicado señalado arriba, recalcular y guardar la versión buena, y borrar las demás — así el tablero del lote de 40 (`lote40Vista.js`) deja de mostrar cifras distintas para el mismo RPU según cuál copia cruce primero.
