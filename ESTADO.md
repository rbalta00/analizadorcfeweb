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
- [ ] Lectura de recibo (OCR / texto de PDF) -- pendiente, sigue siendo la
      pieza mas grande que falta. Hoy la interfaz solo soporta captura
      manual. En Python usa Tesseract + PyMuPDF + regex; en el navegador
      requeriria algo como Tesseract.js + pdf.js (pdf.js ya esta vendorizado
      en `lib/`, falta Tesseract.js y portar las regex de leer_recibo.py).
- [ ] Generador de PDF de 21 paginas con secciones apagables (hoy usa
      reportlab en Python; jsPDF ya esta vendorizado en `lib/` para esto).
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
