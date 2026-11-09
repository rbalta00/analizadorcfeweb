# Inventario de secciones, textos, tablas y graficas -- cotizador-fv-cfe-web

Generado automaticamente leyendo `js/secciones.js` (no a mano) -- 2026-11-09.
Sirve para saber, de un vistazo, que contenido tiene cada una de las 25 secciones
de la cotizacion, y que tan cubierto esta por el generador de PDF desde pantalla
(`generarPdfCompletaDesdeVista` en `propuesta.js`, que usa `dibujarSeccionGenerica`/
`recorrer()` en `propuestaDom.js`).

**Como se mantiene actualizado**: correr `python scripts/generar_inventario_secciones.py`
(lee `js/secciones.js` con expresiones regulares, no requiere abrir el navegador) cada
vez que se agregue/cambie una seccion, tabla o grafica -- vuelve a escribir este archivo
entero. Si una seccion nueva no aparece aqui despues de correrlo, revisar que siga el
mismo patron `crearSeccion(numero, 'titulo', 'pregunta', r, onToggle)` dentro de una
funcion `function sNN(r, _leido, onToggle) { ... }`.

| # | Titulo | Parrafos editables (aprox.) | "Como se calculo" | Tarjetas | Graficas/tablas con toggle propio |
|---|---|---|---|---|---|
| 1 | Su proyecto, explicado en una página | 8 | no | si | `g01-comparativo-verificacion` |
| 2 | Su recibo: datos comprobados | 4 | si | no | `g02-datos-recibo`<br>`g02-calc-mapa`<br>`g02-calc-trazabilidad` |
| 3 | Cómo se forma lo que paga a CFE | 4 | si | no | `g03-cargos`<br>`g03-calc-franjas`<br>`g03-calc-pasos`<br>`g03-calc-tramos` |
| 4 | Qué cargos pueden disminuir | 5 | si | no | `g04-reducibles`<br>`g04-calc-clasificacion` |
| 5 | Consumo anual: base disponible | 5 | si | no | `g05-historial`<br>`g05-historial-tabla`<br>`g05-base-trabajo`<br>`g05-calc-periodos`<br>`g05-calc-formula` |
| 6 | Sistema propuesto: ${r.n} paneles de ${r.moduloWp} W | 10 | si | no | `g06-sistema`<br>`g06-inmueble`<br>`g06-calc-formula` |
| 7 | Cuánta electricidad podría producir | 7 | si | si | `g07-historial`<br>`g07-extrapolado`<br>`g07-calc-formula` |
| 8 | Impacto ambiental estimado | 1 | si | si | `g08-calc-formula` |
| 9 | Cómo se obtiene el ahorro que se presenta | 1 | no | no | `g09-criterios` |
| 10 | Cuánto pagaría y cuánto ahorraría | 3 | si | no | `g10-anual`<br>`g10-tabla-comparativa`<br>`g10-calc-mensual` |
| 11 | Presupuesto y alcance económico | 2 | si | no | `g11-resumen-venta`<br>`g11-presupuesto`<br>`g11-calc-formula` |
| 12 | Detalle del presupuesto | 1 | no | no | `g12-detalle-presupuesto` |
| 13 | En cuánto se recuperaría la inversión | 3 | si | no | `g13-curva`<br>`g13-indicadores`<br>`g13-isr`<br>`g13-calc-formula` |
| 14 | Flujo del proyecto durante 25 años | 2 | si | no | `g14-calc-formula` |
| 15 | Pagos estimados por mes del año de referencia | 3 | si | no | `g15-mensual` |
| 16 | Qué tan cerca se puede llegar al 100% de ahorro | 5 | si | no | `g16-gauge` |
| 17 | Documento: recibo original de CFE | 1 | no | no | — |
| 18 | Documento: verificación en sitio | 0 | no | no | — |
| 19 | Su proyecto según la verificación en sitio | 2 | si | si | `g19-indicador-adicional`<br>`g19-calc-formula` |
| 20 | Comparativo: calculado vs. verificación en sitio | 3 | si | si | `g20-calc-formula` |
| 21 | Qué hace falta para cerrar el ahorro | 3 | no | no | `g21-pendientes` |
| 22 | Alcance, exclusiones y condiciones comerciales | 1 | no | no | `g22-condiciones-pago` |
| 23 | Entrega, mantenimiento y comprobación del ahorro | 2 | no | no | `g23-entrega` |
| 24 | Glosario: términos usados en este estudio | 0 | no | no | `g24-glosario` |
| 25 | Fuentes y trazabilidad del cálculo | 1 | no | no | `g25-fuentes` |

## Detalle por seccion

### Seccion 1: Su proyecto, explicado en una página

**Pregunta que responde:** Resultado principal: ¿cuánto cuesta y en cuánto se paga solo?

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~8
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): no
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): si
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g01-comparativo-verificacion` -- Tabla comparativa calculado vs. verificación en sitio
- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):
  - `g01-comparativo-verificacion`

### Seccion 2: Su recibo: datos comprobados

**Pregunta que responde:** ¿Qué dice el recibo real, tal como se leyó?

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~4
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): si
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): no
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g02-datos-recibo` -- Tablas de datos verificados y total del recibo
  - `g02-calc-mapa` -- Tabla de qué dato alimenta qué cálculo
  - `g02-calc-trazabilidad` -- Tabla de trazabilidad: cómo se obtuvo cada dato
- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):
  - `g02-calc-mapa`
  - `g02-calc-trazabilidad`
  - `g02-datos-recibo-a`
  - `g02-datos-recibo-b`

### Seccion 3: Cómo se forma lo que paga a CFE

**Pregunta que responde:** ¿En qué conceptos se divide el recibo?

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~4
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): si
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): no
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g03-cargos` -- Tabla de componentes del recibo
  - `g03-calc-franjas` -- Tabla de franjas horarias (GDMTH)
  - `g03-calc-pasos` -- Tabla de pasos del cálculo del recibo
  - `g03-calc-tramos` -- Tabla de tramos de consumo
- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):
  - `g03-calc-franjas`
  - `g03-calc-pasos`
  - `g03-calc-tramos`
  - `g03-cargos`

### Seccion 4: Qué cargos pueden disminuir

**Pregunta que responde:** ¿Cuánto de la factura SÍ baja con paneles solares, y cuánto no?

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~5
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): si
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): no
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g04-reducibles` -- Gráfica de lo que sí baja vs. lo que no baja
  - `g04-calc-clasificacion` -- Tabla de clasificación de conceptos
- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):
  - `g04-calc-clasificacion`

### Seccion 5: Consumo anual: base disponible

**Pregunta que responde:** ¿Con qué consumo anual se dimensiona el sistema?

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~5
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): si
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): no
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g05-historial` -- Gráfica de consumo normalizado por período
  - `g05-historial-tabla` -- Tabla de consumo facturado por período
  - `g05-base-trabajo` -- Tabla de base de trabajo y consumo anual de referencia
  - `g05-calc-periodos` -- Tabla de períodos usados
  - `g05-calc-formula` -- Tabla de fórmula del consumo anual
- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):
  - `g05-base-trabajo`
  - `g05-calc-formula`
  - `g05-calc-periodos`
  - `g05-historial-tabla`

### Seccion 6: Sistema propuesto: ${r.n} paneles de ${r.moduloWp} W

**Pregunta que responde:** Paneles → inversor → inmueble ↔ red. ¿Qué se instalaría?

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~10
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): si
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): no
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g06-sistema` -- Tabla de partes del sistema propuesto
  - `g06-inmueble` -- Tabla de condiciones actuales del inmueble
  - `g06-calc-formula` -- Tabla de fórmula de dimensionamiento
- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):
  - `g06-calc-formula`
  - `g06-inmueble`
  - `g06-sistema`

### Seccion 7: Cuánta electricidad podría producir

**Pregunta que responde:** ¿Cuánta energía generarían los paneles al año?

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~7
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): si
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): si
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g07-historial` -- Generación vs. su consumo REAL del historial
  - `g07-extrapolado` -- Generación vs. consumo EXTRAPOLADO (los 12 meses)
  - `g07-calc-formula` -- Tabla de fórmula de generación anual
- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):
  - `g07-calc-formula`
  - `g07-detalle-mensual`

### Seccion 8: Impacto ambiental estimado

**Pregunta que responde:** ¿Cuánto CO2 evitaría generar su propia electricidad?

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~1
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): si
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): si
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g08-calc-formula` -- Tabla de fórmulas de impacto ambiental
- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):
  - `g08-calc-formula`

### Seccion 9: Cómo se obtiene el ahorro que se presenta

**Pregunta que responde:** ¿Qué reglas sigue el modelo para calcular el ahorro?

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~1
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): no
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): no
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g09-criterios` -- Tabla de criterios del modelo de ahorro
- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):
  - `g09-criterios`

### Seccion 10: Cuánto pagaría y cuánto ahorraría

**Pregunta que responde:** Comparación directa: factura sin solar vs. con solar.

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~3
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): si
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): no
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g10-anual` -- Gráfica anual: sin paneles vs. con paneles
  - `g10-tabla-comparativa` -- Tabla comparativa sin/con sistema
  - `g10-calc-mensual` -- Tabla mensual detallada
- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):
  - `g10-calc-mensual`
  - `g10-tabla-comparativa`

### Seccion 11: Presupuesto y alcance económico

**Pregunta que responde:** ¿Cuánto cuesta el sistema completo, con IVA?

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~2
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): si
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): no
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g11-resumen-venta` -- Tabla de resumen de venta
  - `g11-presupuesto` -- Gráfica del presupuesto agrupado por categoría
  - `g11-calc-formula` -- Tabla de fórmula de inversión
- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):
  - `g11-calc-formula`
  - `g11-resumen-venta`

### Seccion 12: Detalle del presupuesto

**Pregunta que responde:** ¿Qué partidas específicas componen el presupuesto?

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~1
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): no
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): no
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g12-detalle-presupuesto` -- Tabla de detalle del presupuesto
- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):
  - `g12-detalle-presupuesto`

### Seccion 13: En cuánto se recuperaría la inversión

**Pregunta que responde:** ¿Cuándo deja de deber la inversión y empieza a ganar?

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~3
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): si
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): no
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g13-curva` -- Curva de flujo acumulado a 25 años
  - `g13-indicadores` -- Tabla de indicadores (recuperación, ROI, TIR, VAN)
  - `g13-isr` -- Tabla de indicadores con deducción ISR
  - `g13-calc-formula` -- Tabla de fórmulas de indicadores
- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):
  - `g13-calc-formula`
  - `g13-indicadores`
  - `g13-isr`

### Seccion 14: Flujo del proyecto durante 25 años

**Pregunta que responde:** ¿Cómo se ve el dinero del proyecto año por año?

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~2
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): si
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): no
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g14-calc-formula` -- Tabla de fórmula año por año
- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):
  - `g14-calc-formula`
  - `g14-detalle-flujo`

### Seccion 15: Pagos estimados por mes del año de referencia

**Pregunta que responde:** ¿Cómo se ve el pago mes a mes, con y sin paneles?

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~3
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): si
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): no
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g15-mensual` -- Gráfica mensual: sin solar vs. con solar
- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):
  - `g15-detalle-mensual`

### Seccion 16: Qué tan cerca se puede llegar al 100% de ahorro

**Pregunta que responde:** ¿Por qué la propuesta no llega al 100% de ahorro?

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~5
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): si
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): no
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g16-gauge` -- Medidor de ahorro máximo posible

### Seccion 17: Documento: recibo original de CFE

**Pregunta que responde:** El recibo tal como se adjuntó, sin ningún dato extraído ni modificado.

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~1
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): no
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): no
- Graficas/tablas con toggle propio: ninguna

### Seccion 18: Documento: verificación en sitio

**Pregunta que responde:** El documento de verificación en campo (gobierno u otro emisor), tal como se adjuntó.

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~0
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): no
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): no
- Graficas/tablas con toggle propio: ninguna

### Seccion 19: Su proyecto según la verificación en sitio

**Pregunta que responde:** El mismo resumen de la sección ${refSeccion(1, r)}, pero con los paneles que propone la verificación en campo.

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~2
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): si
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): si
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g19-indicador-adicional` -- Tabla de indicadores adicionales (VAN, TIR)
  - `g19-calc-formula` -- Tabla de fórmula del escenario verificado
- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):
  - `g19-calc-formula`
  - `g19-indicador-adicional`

### Seccion 20: Comparativo: calculado vs. verificación en sitio

**Pregunta que responde:** ¿Qué tanto cambia el proyecto según cuál de los dos criterios se use?

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~3
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): si
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): si
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g20-calc-formula` -- Tabla de fórmula de la diferencia
- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):
  - `g20-calc-formula`

### Seccion 21: Qué hace falta para cerrar el ahorro

**Pregunta que responde:** ¿Qué pendientes hay antes de ofertar en firme?

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~3
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): no
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): no
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g21-pendientes` -- Tabla de pendientes para un presupuesto real
- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):
  - `g21-pendientes`

### Seccion 22: Alcance, exclusiones y condiciones comerciales

**Pregunta que responde:** ¿Qué incluye y qué NO incluye el presupuesto?

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~1
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): no
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): no
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g22-condiciones-pago` -- Tabla de condiciones de pago sugeridas
- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):
  - `g22-condiciones-pago`
  - `g22-detalle-cronograma`

### Seccion 23: Entrega, mantenimiento y comprobación del ahorro

**Pregunta que responde:** ¿Qué se entrega, y cómo se comprueba el ahorro ya operando?

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~2
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): no
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): no
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g23-entrega` -- Tabla de entrega y comprobación
- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):
  - `g23-entrega`

### Seccion 24: Glosario: términos usados en este estudio

**Pregunta que responde:** Consulta rápida del significado de los términos técnicos.

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~0
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): no
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): no
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g24-glosario` -- Tabla de glosario de términos
- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):
  - `g24-glosario`

### Seccion 25: Fuentes y trazabilidad del cálculo

**Pregunta que responde:** ¿En qué se basa cada número de este estudio?

- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~1
- Bloque "Como se calculo" (detalle tecnico, toggle independiente): no
- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): no
- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):
  - `g25-fuentes` -- Tabla de fuentes y trazabilidad
- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):
  - `g25-fuentes`
