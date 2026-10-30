# Cotizador FV CFE — version web (PWA)

Reconstruccion en HTML/JS/CSS puro (sin frameworks) de `cfe-presupuestos/app`
(la app de Streamlit), para que SI pueda instalarse como PWA real -- Streamlit
no lo permite (confirmado tecnicamente: `navigator.serviceWorker.getRegistrations()`
da 0, por como Streamlit sirve sus archivos estaticos). El patron de
`manifest.json`/`service-worker.js` se va a copiar del proyecto `cotizador-soelrb`
(otro proyecto del usuario, ya funciona como PWA instalada) -- ese proyecto
NO se toca, solo se usa como referencia de que esa configuracion si funciona.

Repo git independiente (no es parte del repo de `app/`), proyecto nuevo, no
empujado a GitHub todavia -- preguntar antes de crear el repo remoto.

## Por que existe
La app de Streamlit (`cfe-presupuestos/app`) sigue siendo la fuente de verdad
de TODA la logica de negocio: lectura de recibo (OCR), motor de tarifas con
freno de clasificacion, verificacion aritmetica de reconciliacion, calculo
financiero a 25 anios, generador de PDF de 21 paginas con secciones apagables,
historial de clientes. Esta carpeta es un PORT progresivo de esa logica a
JavaScript, verificado numericamente contra el Python en cada paso -- nunca
se reinventa una formula aqui, solo se traduce.

## Avance
- [x] **Motor de calculo** (`js/motor.js`): tarifas con/sin demanda contratada
      (freno de clasificacion), tarifa domestica por escalones, flujo mensual,
      dimensionamiento por horas-sol, presupuesto con reparto de markup,
      flujo financiero a 25 anios con reposicion de inversor en el ano 13.
      Verificado con `npm test` contra el caso real de Casa del Abue Sur
      (32 verificaciones, todas exactas o dentro de 1 centavo) y contra un
      caso PDBT + el freno de clasificacion lanzando error correctamente.
      **Bug real encontrado y corregido esta sesion**: tanto `js/test_motor.mjs`
      (el "ground truth" de la prueba) como `calcular()` en `js/app.js`
      llamaban a `construirInvoice(...)` con `bt_pct=0.0, fp_bonus_pct=0.0`
      fijos, omitiendo el 2% de baja tension y la bonificacion por factor de
      potencia que el recibo real de Abue SI trae -- daba un ahorro_anual de
      $48,286.64 en vez del $46,860.76 real ya entregado al cliente ($1,425.88
      de diferencia). Se agregaron los campos de UI (checkbox + monto) en la
      seccion 3 de `index.html`, se corrigio `calcular()` para derivar
      `btPct`/`fpBonusPct` de esos campos (misma formula que
      `cotizador_app.py`: `bt_pct = bt_monto/base_aprox`,
      `fp_bonus_pct = bonus_monto/(base_aprox+bt_monto)`), y
      `llenarFormularioDesdeRecibo()` ahora los autollena desde
      `bt_monto`/`bonus_monto` del recibo leido. Revalidado end-to-end en
      navegador real (subir el PDF real de Abue -> autollenado -> Calcular)
      reproduciendo exacto los 8 numeros correctos.
- [x] **manifest.json + service-worker.js**, copiados del patron de
      cotizador-soelrb. Verificado en navegador real (servidor local, no
      Streamlit): `navigator.serviceWorker.getRegistrations()` da 1 registro
      activo en scope raiz -- esto es justo lo que la app de Streamlit NUNCA
      pudo lograr (confirmado tecnicamente esa misma sesion, daba 0). El boton
      de instalar aparecio solo (`beforeinstallprompt` disparado por Chrome).
- [x] **Interfaz minima** (`index.html` + `js/app.js`): formulario de captura
      MANUAL (misma ruta que ya existe en cotizador_app.py cuando no hay OCR)
      para datos del cliente/tarifa, cargos del recibo, columna "$/kW",
      sistema propuesto y tarifa domestica por escalones. Boton Calcular ->
      motor.js -> muestra las 8 metricas de la seccion Resultado de
      Streamlit. Probado en navegador real con los datos reales de Casa del
      Abue Sur: mismos 8 numeros exactos que el motor Python
      ($304,411.97 inversion, $221,864.98 VAN, 17.4% TIR, etc.).
- [x] **Lectura de recibo** (`js/recibo.js` + `js/pdftext.js` + `js/ocr.js` +
      `js/leerRecibo.js`): texto nativo del PDF con pdf.js, con fallback a OCR
      (Tesseract.js, vendorizado en `lib/`) cuando el texto no es legible
      (foto/escaneo, o PDF con fuente codificada -- mismo criterio
      `textoPareceLegible` que Python). Las regex de extraccion de campos
      estan portadas 1:1 desde `leer_recibo.py`, incluida la verificacion
      aritmetica de reconciliacion agregada esta sesion. Conectado a la
      interfaz: subir el archivo en la seccion 1 llena solo el resto del
      formulario (igual que `cotizador_app.py`).
      Verificado con `npm test` (js/test_recibo.mjs) contra el TEXTO real de
      4 recibos ya leidos por Python (GDMTO, GDMTH con 3 franjas horarias,
      PDBT, y un caso OCR con reconciliacion fallida) -- cero diferencias.
      Verificado ademas en navegador real con los ARCHIVOS PDF reales
      (no el texto pre-extraido): Abue y Museo San Pedro de Arte dieron
      exactamente los mismos campos que Python, incluido el flujo completo
      subir PDF -> autollenado -> Calcular -> mismos 8 numeros de siempre.
      El caso de OCR dificil (Secretaria de Finanzas, que Python tambien
      manda a revision manual) corrio end-to-end en 56.5s y la verificacion
      de reconciliacion lo marco correctamente para revisar a mano -- los
      valores especificos que lee el OCR no son identicos a los de Python
      (son dos motores/modelos de OCR distintos), pero la red de seguridad
      funciona igual en ambos.
      Dos bugs reales encontrados y corregidos en el camino: (1) reconstruir
      lineas reordenando todo por Y global mezclaba columnas distintas del
      PDF que comparten altura (el domicilio con la caja de "Total a
      pagar") -- se corrigio para seguir el orden original del content
      stream, igual que pypdf; (2) pdf.js "desprende" el ArrayBuffer la
      primera vez que se abre un PDF, asi que reabrirlo para el fallback de
      OCR reventaba -- se corrigio para abrir el documento una sola vez y
      reusarlo.
      Pendiente: vendorizar el modelo de espanol de Tesseract (hoy se
      descarga del CDN de Tesseract.js la primera vez que se usa OCR,
      requiere internet esa vez; despues el navegador lo cachea).
      `test_pdf.html` queda en el repo como herramienta de depuracion para
      probar un recibo nuevo rapido sin pasar por toda la interfaz.
- [x] **Generador de PDF de 21 paginas con secciones apagables** (`js/propuesta.js`
      + `js/pdfComponents.js`, ambos completos). Las 21 paginas estan portadas 1:1
      desde `app/propuesta.py` (mismo texto, mismas tablas, mismas graficas). El
      filtro de bloques (`BLOQUES_COTIZACION`, portado a `js/bloques.js`) renumera
      las paginas de corrido igual que Python. Verificado en Chrome con
      `test_propuesta.html`: 21 paginas generadas sin error, inspeccion visual de
      paginas 1/2/6/13/16 (tablas, barra, curva de flujo con punto de recuperacion,
      gauge, todas correctas), y el toggle de un bloque reduce correctamente el
      PDF a 20 paginas.
- [x] **App reestructurada en pantallas: Clientes -> 21 secciones navegables**
      (`index.html` + `js/app.js` + `js/secciones.js` + `js/resultado.js` +
      `js/clientes.js` + `js/notas.js` + `js/util.js` + `js/charts.js` +
      `js/comercial.js`). Reemplaza el formulario-de-una-sola-pantalla por:
      - **Pantalla de clientes**, agrupados por tipo (gobierno/particular,
        pedido explicito del usuario -- "no todos van a ser de gobierno").
        Guardados en `localStorage` (clave `cfe_clientes_v1`), cada uno con su
        propio formulario/recibo/condiciones del inmueble/bloques activos.
      - **Auto-deteccion de tarifa + auto-calculo al subir el recibo**: si
        `leerRecibo()` detecta una tarifa soportada y los datos minimos (dias,
        kWh, columna "$/kW"), se calcula solo, sin que el usuario tenga que
        pulsar "Calcular" -- pedido explicito del usuario. Si falta algo, se
        avisa que hace falta revisar el formulario a mano.
      - **Las 21 secciones de `propuesta.py` portadas a HTML interactivo**
        (`js/secciones.js`, NO solo al PDF): cada una con numero "NN de 21",
        pregunta que explica que resuelve, resultado principal, explicacion en
        espanol llano, grafica/tabla (`js/charts.js`: barras horizontales,
        barras agrupadas, gauge, curva de flujo en SVG -- version HTML/CSS de
        las mismas graficas que pdfComponents.js dibuja en el PDF), "Ver detalle
        del calculo" (`<details>`) donde corresponde, y etiquetas de estado
        (Comprobado/Declarado/Supuesto/Pendiente). Los avisos importantes NUNCA
        van dentro de un detalle colapsado.
      - **Boton de apagado en cada seccion** (pedido explicito del usuario):
        cada una de las 21 secciones muestra un checkbox "Incluir en la
        cotizacion final (pantalla y PDF)". Como algunas paginas se refieren
        entre si (ej. pagina 3 remite a la pagina 4), el apagado es por BLOQUE
        (`BLOQUES_COTIZACION`, los mismos 12 de Python) no pagina por pagina --
        mismo criterio ya documentado en `propuesta.py`. El estado se guarda
        por cliente y se usa tanto para la vista en pantalla como para filtrar
        el PDF (misma fuente de datos, nunca se desincronizan).
      - **Indice de secciones navegable**: lista colapsable (boton "☰ Índice de
        secciones", pensada para celular), resalta la seccion visible
        (`IntersectionObserver`), atenua las apagadas, botones "← Anterior" /
        "Siguiente →" dentro de cada seccion, y se conserva el scroll al
        navegar (son anclas `#seccion-N` dentro de la misma pagina, no cambia
        de ruta).
      - **"Condiciones actuales del inmueble"**: dato que NO existia en
        ninguna de las 21 paginas de Python. Siguiendo la instruccion de "no
        agregar una seccion 22 automatica", se integro como una subseccion de
        la seccion 6 ("Sistema propuesto"), con su propio bloque de captura en
        el formulario (actividad, horarios, equipos, tension/fases, tablero,
        transformador, tierra fisica, punto de conexion, cubierta, area
        -medida o estimada-, sombras, sistemas existentes, fecha de visita y
        notas). Si no hay datos capturados, la seccion lo marca como
        "Pendiente" en vez de inventar contenido. **No se capturan fotografias
        en esta version** -- pendiente real, declarado como tal en el propio
        formulario.
      Verificado en Chrome real, con el PDF real de Abue: crear cliente de
      gobierno -> subir recibo -> tarifa GDMTO detectada y calculo automatico
      (mismos 8 numeros exactos de siempre) -> 21 secciones e indice generados
      -> apagar un bloque (impacto ambiental) lo oculta del indice Y reduce el
      PDF de 21 a 20 paginas -> recargar la pagina conserva el cliente, sus
      datos, el resultado recalculado y el bloque apagado -> crear un segundo
      cliente como "particular" y confirmar que se agrupa aparte del de
      gobierno. Sin errores de consola propios de la app (el unico ruido son
      mensajes conocidos de la extension de Chrome, no de este codigo).
- [ ] Fotografias del inmueble (condiciones del inmueble) -- declarado como
      pendiente real, no se construyo esta sesion.
- [ ] Historial/seguimiento agregado entre TODOS los clientes (hoy cada
      cliente vive aislado en `localStorage`; compartir entre dispositivos
      seguiria requiriendo Supabase -- pendiente de decidir con el usuario).
- [ ] Resumen ejecutivo / guia de presentacion (los 2 PDFs de 1 pagina que
      existen en resumen.py).
- [ ] Simulador de financiamiento, editor de precios de materiales y
      deduccion ISR (funcionalidades de `cotizador_app.py` no portadas a esta
      version -- fuera del alcance de "las 21 secciones", deliberadamente no
      tocadas esta sesion).
- [ ] Decidir si esto reemplaza a `app/` o conviven mientras se termina.
- [ ] Decidir si se crea el repo en GitHub y donde se despliega (Vercel,
      igual que las demas apps del usuario, es lo mas consistente).

## Como probarlo en el navegador
```
cd web
python -m http.server 8601
```
Abrir http://localhost:8601 -- el service worker solo se registra bien
sirviendo por HTTP(S) real (localhost cuenta), no abriendo el archivo
directo con file://.

## Como correr las pruebas
```
cd web
npm test
```
