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
- [ ] Lectura de recibo (OCR / texto de PDF) -- pendiente. En Python usa
      Tesseract + PyMuPDF + regex; en el navegador requeriria algo como
      Tesseract.js + pdf.js. Es la pieza mas grande que falta.
- [ ] Interfaz (lo que hoy es `cotizador_app.py`, los 4 tabs de Streamlit).
- [ ] Generador de PDF de 21 paginas (hoy usa reportlab en Python; en el
      navegador algo como jsPDF o pdf-lib).
- [ ] Historial / seguimiento de clientes (hoy CSV local; en el navegador
      necesitaria localStorage como minimo, o Supabase si se quiere
      compartir entre dispositivos -- pendiente de decidir con el usuario).
- [ ] manifest.json + service-worker.js (copiar el patron de cotizador-soelrb).
- [ ] Decidir si esto reemplaza a `app/` o conviven mientras se termina.

## Como correr las pruebas
```
cd web
npm test
```
