# Visión y requisitos de este repo, tal como los dio el usuario

Documento fuente de verdad sobre **qué es esta herramienta y cómo debe comportarse**,
recopilado palabra por palabra de lo que el usuario fue dictando en una sesión larga
(2026-11-09), para no perder ningún matiz en sesiones futuras. No es un registro de
cambios técnicos (eso vive en `ESTADO.md`) ni un inventario de contenido (eso vive en
`INVENTARIO_SECCIONES.md`) -- esto es la intención detrás de ambos.

## 1. Qué es esto, en sus propias palabras

> "En sí no es un cotizador, es un analista de diseño de sistemas fotovoltaicos
> industriales y comerciales, residenciales con todas las tarifas de CFE incluidas,
> claro de ahí también salen las cotizaciones."

> "Piensa como este cotizador de SFV podría ser el mejor diseñador de sistemas
> fotovoltaicos. A lo mejor me equivoqué con el nombre y no es cotizador, la
> cotización sale del diseño de los sistemas fotovoltaicos que este cotizador me hace
> a partir de la información de sus recibos. Si le tienes que cambiar el nombre,
> cámbiaselo -- al final la cotización es parte del análisis."

**Traducción operativa**: la identidad del producto es **analizar/diseñar un sistema
fotovoltaico** (industrial, comercial, residencial, las 6 tarifas CFE: GDMTO, GDMTH,
GDBT, PDBT, 01, DAC) a partir del recibo real del cliente. La cotización/propuesta
económica es un **subproducto** de ese análisis, no la identidad de la app. Por eso se
renombró (2026-11-09) de "Cotizador FV CFE" a **"Analizador FV CFE"** / "Analizador de
sistemas fotovoltaicos — CFE", con la leyenda "la cotización sale del análisis, no al
revés" (`index.html`, `manifest.json`). `cliente.html` (la página pública que llena el
cliente final) se dejó sin tocar a propósito -- ya estaba enfocada en la acción, no en
el nombre de la herramienta interna.

## 2. El flujo de trabajo real, en sus propias palabras

> "Al final su función principal es que yo le meto los recibos al cotizador, me
> extrae los datos, uso el machote que ya validé y lo utilizo para lo que necesito;
> mientras lo necesito avanzo, entonces enciendo la demás información, así, etc."

Flujo: **recibo → extracción automática de datos → aplicar un machote ya validado →
entregar solo lo necesario en ese momento → ir "encendiendo" más contenido conforme
avanza la negociación con el cliente.** Esto es exactamente lo que resuelven los
"pasos de entrega" (sección 4 de este documento).

## 3. Principio de edición: todo es editable, el usuario manda

> "Y además, aunque tú hiciste la propuesta del cotizador, yo lo voy mejorando, por
> eso te pido que me permitas editar a mi consideración."

> "Tú lo creaste pero yo lo edito a como me conviene entregarlo, basándome en lo que
> tú creaste y la información que me das."

Ninguna estructura que se construya debe quedar rígida/bloqueada -- textos, tablas,
qué se muestra, nombres de pasos, todo debe quedar abierto a que el usuario lo seguir
ajustando él mismo, sin pedir permiso por código cada vez. Esto ya era el criterio de
sesiones anteriores (textos editables, plantillas por tarifa) -- se reafirma aquí como
principio general, no solo para una función puntual.

## 4. Pasos de entrega -- "análisis a medida" sin perder el análisis completo

> "La idea es que la cotización que ya decidimos que está bien se pueda utilizar como
> machote para otras, pero que se siga conservando la original, que representa todo
> el análisis completo. Pero tal vez a veces necesitaremos entregar un análisis
> previo, por eso deja que podamos trabajar en pasos."

> "Respetando el análisis completo, hazlo que podamos hacer los análisis a medida."

**Construido** (`js/clientes.js`: `asegurarPasos`/`aplicarPaso`/`crearPasoDesdeActual`/
`renombrarPaso`/`eliminarPaso`; panel "📑 Paso de entrega" en `index.html`): cada
cotización guarda varios "pasos" nombrados (ej. "Análisis completo", "Análisis
preliminar"), cada uno es solo una foto de qué secciones/gráficas/tablas se muestran y
se incluyen en el PDF -- el contenido real (textos, cifras calculadas) es el mismo
para todos los pasos. **"Análisis completo" nunca se puede borrar** (protegido en
código y en la UI). El machote ("Desde cotización ya validada") también clona los
pasos ya armados a clientes nuevos, no solo la tarifa/cargos.

## 5. Separación editor vs. PDF -- qué ve Isaac vs. qué ve el cliente

> "Aunque el editor es el cálculo general de un recibo y una tarifa, te pedí que se
> pudiera editar para poder mostrar al cliente solo lo que me interesa que vea el
> cliente. La información que calculas y que decido no mostrar a mí sí me sirve, por
> eso en el editor sí requiero que aparezca toda -- yo decido qué ve el cliente
> mediante el PDF final."

**Regla fija, ya construida desde antes de esta sesión y reconfirmada aquí**: apagar
algo (sección, párrafo, gráfica, tabla, columna, fila) **nunca lo quita de la vista en
pantalla** (el editor) -- se queda atenuado, visible para Isaac, con su propio botón
para reactivarlo. Solo desaparece de verdad en el **PDF generado**. El editor siempre
muestra el 100% del análisis calculado; el PDF muestra exactamente lo que el paso
activo tiene encendido.

## 6. Numeración de contenido editable -- solo en el editor, nunca en el PDF

> "Ponle numeración a cada texto editable... la numeración sería para revisar que
> todo esté bien o decirte cuál no está funcionando."

> "Y que esté enumerado cada texto, obvio la numeración es solo en el editor, en el
> PDF solo está enumerado las secciones."

**Construido** (`numerarContenidoEditable()` en `js/app.js`, clase CSS
`.badge-num-editable`): cada párrafo, título, celda de tabla, etiqueta de tarjeta y
leyenda de gráfica lleva un número correlativo visible (№1, №2...) en el editor,
recalculado en cada render. **Verificado y corregido que el número NUNCA se cuela en
el PDF** -- se encontraron y corrigieron 3 puntos reales de contaminación
(`js/propuestaDom.js`: `CLASES_OMITIR`, `textoSinIconos()`, `dibujarTabla()`) donde el
badge se habría pegado al texto real dentro del documento generado.

## 7. Simplicidad: exactamente 2 botones por elemento editable

> "Yo digo que la edición de cualquier cosa solo tenga dos botones: uno de apagar y
> otro de guardar. El de apagar pues se apaga, todo ya no se ve. El de guardar pues
> se guardan los cambios, los textos nuevos, y esa versión se pueda usar como machote
> para nuevas cotizaciones."

**Construido** (`js/secciones.js`: `campoEditableConId`/`celdaEditable`/`textoChico`;
`js/app.js`: `onGuardarTextoGlobal`): se quitaron los controles sueltos que había antes
(↺ "Restaurar a predeterminado", ✓/✕ "aplicar/quitar de todas") y quedaron
exactamente 2: **🙈/👁 Apagar/Mostrar** (toggle único) y **💾 Guardar** (un solo clic
guarda el texto para esta cotización Y lo deja como machote para las futuras). Vaciar
el texto y guardar revierte ambos lados al original de fábrica -- no hace falta un
botón aparte para "restaurar".

Relacionado, pedido en texto libre sin ejemplo puntual pero confirmado al revisar:
> "Tal vez haya muchos botones redundantes, revísalos y haz que me dé lo que
> necesito."

Se reorganizaron (sin quitar ninguna función) los botones de la pantalla de Clientes
en 3 grupos con encabezado ("Cliente nuevo" / "Captar un cliente" / "Revisar y
organizar"), y se aclaró en la pestaña de exportar PDF cuáles documentos respetan el
paso activo y cuáles son de formato fijo.

## 8. Nunca romper la coherencia de cálculo por tarifa

> "Siempre y cuando todo esté sincronizado, respeta el contenido que corresponde a
> los cálculos de cada tarifa y que tenga toda coherencia como lo hemos visto desde
> el principio."

**Regla dura para cualquier sesión futura**: nada de lo pedido en esta sesión (pasos,
numeración, botones, nombre) debe tocar `js/motor.js`, `js/resultado.js` ni
`js/recibo.js` -- el motor de cálculo y la clasificación por tarifa (GDMTO/GDMTH/
GDBT/PDBT/01/DAC) son la fuente de verdad, ya validados contra recibos reales durante
muchas sesiones (ver `ESTADO.md`). Todo lo de esta sesión es una capa de
presentación/persistencia ENCIMA de lo ya calculado. `node js/test_motor.mjs` y
`node js/test_recibo.mjs` deben seguir en verde después de cualquier cambio futuro
relacionado con el editor -- si algo los rompe, el problema está fuera del alcance de
"solo presentación" y hay que detenerse a revisar.

## 9. Formato del PDF: número de página, sin cortes, márgenes correctos

> "Y ponle número de página al PDF resultante."

> "Y revisa el formato de las secciones, que no se corte, que tenga sus márgenes
> bien."

El pie de página con el aviso legal se había quitado a propósito en una sesión
anterior (el usuario no quería el texto de "Presupuesto preliminar..." repetido en
cada hoja) -- **el número de página se regresó por separado** (`js/pdfComponents.js`,
`dibujarHeaderFooter()`), sin reintroducir ese aviso. Pendiente de una revisión
dedicada, no completada todavía en esta sesión: confirmar en vivo que ninguna sección
se corte entre páginas y que los márgenes se respeten en todos los tipos de contenido
(tablas largas, texto largo, imágenes) -- ver `ESTADO.md` para el estado exacto de esa
revisión al cierre de la sesión.

## Cómo usar este documento

Si una sesión futura necesita entender **por qué** la app está hecha de cierta forma
(pasos de entrega, numeración, 2 botones, el nombre "Analizador" en vez de
"Cotizador"), este documento es la referencia -- no asumir que un cambio futuro puede
simplificar o "limpiar" algo de esto sin releer primero la razón de por qué existe.
