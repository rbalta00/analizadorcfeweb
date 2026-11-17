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
