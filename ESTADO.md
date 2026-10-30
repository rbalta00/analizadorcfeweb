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
- [~] Generador de PDF con secciones apagables (hoy usa reportlab en Python;
      jsPDF ya esta vendorizado en `lib/` para esto). Construida la libreria
      de componentes visuales (`js/pdfComponents.js`: colores, tarjetas,
      tablas, avisos, graficas de barras/curva/gauge, armado de documento) --
      ojo, jsPDF tiene el eje Y invertido respecto a reportlab (Y=0 arriba,
      crece hacia abajo; reportlab es Y=0 abajo) -- hubo que corregir
      `CONTENT_TOP`/`CONTENT_BOTTOM` por este motivo. Portada la **pagina 1
      (resumen)** en `js/propuesta.js`, verificada visualmente en Chrome con
      `test_propuesta.html` (dev tool, igual que `test_pdf.html`) contra los
      numeros reales de Abue ya corregidos. Falta: paginas 2-21, y conectar
      el parametro `secciones` (hoy aceptado pero sin usar) a los
      `BLOQUES_COTIZACION` del lado Python para el toggle de secciones.
- [ ] Historial / seguimiento de clientes (hoy CSV local; en el navegador
      necesitaria localStorage como minimo, o Supabase si se quiere
      compartir entre dispositivos -- pendiente de decidir con el usuario).
- [ ] Resumen ejecutivo / guia de presentacion (los 2 PDFs de 1 pagina que
      existen en resumen.py).
- [ ] Simulador de financiamiento y editor de precios de materiales (las 2
      ultimas funcionalidades agregadas a la app de Streamlit).
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
