# Cotizador FV CFE — version web (PWA)

Reconstruccion en HTML/JS/CSS puro (sin frameworks) de `cfe-presupuestos/app`
(la app de Streamlit), para que SI pueda instalarse como PWA real -- Streamlit
no lo permite (confirmado tecnicamente: `navigator.serviceWorker.getRegistrations()`
da 0, por como Streamlit sirve sus archivos estaticos). El patron de
`manifest.json`/`service-worker.js` se va a copiar del proyecto `cotizador-soelrb`
(otro proyecto del usuario, ya funciona como PWA instalada) -- ese proyecto
NO se toca, solo se usa como referencia de que esa configuracion si funciona.

Repo git independiente (no es parte del repo de `app/`). Repo privado en GitHub:
`rbalta00/cotizador-fv-cfe-web` — https://github.com/rbalta00/cotizador-fv-cfe-web

**Publicado**: https://cotizador-fv-cfe-web.vercel.app (Vercel, conectado al repo de
GitHub, cada push a `master` redespliega solo). Backend compartido en Supabase
(proyecto `cotizador-fv-cfe`, id `prchqgvwaepzmcohoehu`) -- ver la seccion de avance
mas abajo, "Publicado en Vercel, con backend compartido".

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
- [x] **Resumen ejecutivo (1 pagina) + Guia de presentacion (1 pagina, generica)**
      (`js/resumen.js`, port 1:1 de `app/resumen.py`). Dos botones nuevos en la
      pestana de PDF: "Resumen ejecutivo" (usa el `r` ya calculado del cliente
      abierto) y "Guia para presentar" (no depende de ningun caso). Verificado
      visualmente en Chrome contra el caso real de Abue -- mismos numeros.
      **Bug real encontrado y corregido**: la flecha Unicode "->" en 3 frases de
      la guia salia como un glifo roto en el PDF (jsPDF + Helvetica estandar no
      soporta ese caracter, a diferencia del navegador en pantalla) -- se
      reemplazo por "->" en el texto que va al PDF.
- [x] **Texto editable de las 21 secciones** (`js/secciones.js`, `textoEditable()`):
      cada parrafo y aviso de cada seccion se puede editar directo en pantalla (clic,
      escribir, clic afuera para guardar -- se marca en dorado). Vaciar el campo o
      pulsar "Restaurar texto original" regresa al texto de fabrica. Guardado por
      proyecto/cotizacion, persiste entre sesiones. **Limitacion conocida, no
      resuelta**: la edicion solo aplica a la vista en pantalla -- el PDF exportado
      (`propuesta.js`) arma los mismos parrafos con llamadas propias en un orden que
      no siempre coincide 1:1 con el de pantalla, asi que conectar las dos fuentes
      de texto es trabajo aparte, no hecho todavia (quedo explicito en la app, no
      oculto). Tambien: en secciones con contenido condicional (ej. la 17, que lista
      una cantidad variable de notas segun el recibo), el id de cada parrafo depende
      del ORDEN en que aparece, asi que una edicion podria desalinearse si cambia la
      cantidad de parrafos tras recalcular con datos distintos -- riesgo aceptado,
      no se construyo un id mas robusto (por contenido) por tiempo.
- [x] **Un cliente puede tener varias cotizaciones/proyectos** (pedido explicito del
      usuario). Modelo de datos migrado: `cliente.proyectos[]`, cada uno con su
      propio formulario/recibo/condiciones del inmueble/bloques activos/textos
      editados (antes vivian directo en el cliente). Los clientes guardados ANTES de
      este cambio se migran solos la primera vez que se leen (se verifico con el
      cliente real del usuario en su propio `localStorage`: sus datos quedaron
      intactos, envueltos en una sola cotizacion). Pantalla nueva "Cotizaciones de
      este cliente" entre Clientes y la vista de captura/secciones: lista de
      cotizaciones, "+ Cotización en blanco", y subir un recibo AHI crea una
      cotizacion nueva con los datos ya detectados (vs. subir un recibo DENTRO de
      una cotizacion ya abierta, que sigue actualizando esa misma cotizacion, no
      crea una nueva cada vez que se corrige un dato -- distincion explicada al
      usuario, no asumida en silencio).
- [x] **Boton "↻ Refrescar"** en la barra superior (visible en toda la app):
      recarga la lista segun la pantalla activa, o recalcula la cotizacion abierta
      con los datos actuales.
- [x] **Boton "Enviar por WhatsApp"** (pestana de PDF): abre `wa.me` con un resumen
      en texto (titular, inversion, ahorro, payback, VAN) ya escrito, al numero que
      dio el usuario. Limitacion real explicada en la propia interfaz: WhatsApp no
      permite adjuntar un archivo desde un enlace, asi que el PDF (ya descargado con
      los botones de al lado) se adjunta a mano.
- [x] **Boton "Guardar cotización con este cliente"** (pestana de PDF, reemplaza al
      boton "Guia para presentar" que vivia ahi -- pedido explicito del usuario). Los
      datos de la cotizacion ya se autoguardan en cada calculo; este boton deja ademas
      un registro visible (`proyecto.cotizacionGuardadaEn`) de que esa cotizacion
      especifica se reviso y se dio por buena, mostrado en la lista de cotizaciones
      del cliente ("✓ cotización guardada el DD/MM/AAAA") en vez del generico "con
      datos capturados". La "Guia para presentar" (generica, no depende de ningun
      cliente) se reubico en la pantalla de Clientes, con descarga directa -- no se
      elimino la funcionalidad, solo se saco de la pestana de PDF de una cotizacion
      especifica, que no era su lugar natural.
      **Extension pedida por el usuario**: el boton de guardar ahora trae un selector
      "Guardar esta cotización con el cliente" con TODOS los clientes registrados
      (agrupados gobierno/particular), no solo el cliente desde el que se abrio --
      si se elige uno distinto, la cotizacion se MUEVE a ese cliente
      (`clientes.moverProyecto()`, saca el proyecto del cliente origen y lo mete al
      destino, ambos persistidos). Verificado en Chrome: mover una cotizacion de
      prueba de un cliente a otro y de regreso, sin perder datos.
- [x] **Checklist fijo de "qué hace falta para un presupuesto real"** (pedido
      explicito del usuario: "esta cotizacion esta hecha unicamente con la
      informacion del recibo... independientemente de que el recibo este completo
      tambien indica las notas aclaratorias de todo lo que se necesita"). Nuevo
      `REQUISITOS_PRESUPUESTO_REAL` en `js/notas.js` (10 items: levantamiento en
      sitio, tension/fases reales, tablero/interruptor/punto de conexion, distancia
      de cableado, precios vigentes con proveedor, historial de 12 meses, confirmar
      tarifa con CFE, tramite de interconexion, verificar titular/domicilio, obra
      adicional no incluida) -- SIEMPRE se muestra en la seccion 17, sin importar
      que tan completo haya venido el recibo (a diferencia de `generarNotas()`, que
      solo avisa de problemas puntuales de ESE recibo en particular; ambas listas
      conviven, separadas con su propio encabezado).
      **Division de pagina en el PDF**: agregar el checklist fijo + las notas del
      recibo ya no cabian juntas en una sola hoja A4 (el PDF no tiene paginacion
      automatica). Se dividio la pagina 17 de Python en DOS paginas propias de este
      port (`pagina17` = checklist fijo, `pagina17b` = notas de ese recibo), ambas
      dentro del mismo bloque apagable `pendientes` -- el PDF completo pasa de 21 a
      22 paginas cuando todos los bloques estan activos. Las 21 SECCIONES en
      pantalla NO cambian (la division es solo del lado del PDF; en pantalla no hay
      limite de alto, ambos bloques de contenido caben en la seccion 17 de
      siempre). Verificado visualmente en Chrome: paginas 17 y 18 del PDF completo,
      ninguna se desborda.
- [x] **Recibo en varias fotos** (pedido explicito: "a veces me mandan dos fotos
      del recibo"). Los dos inputs de recibo (`archivoRecibo` y
      `archivoReciboNuevoProyecto`) ahora aceptan multiples archivos a la vez.
      `leerReciboMultiple()` (`js/leerRecibo.js`) extrae el texto de cada archivo
      por separado y los CONCATENA antes de buscar los campos una sola vez -- asi un
      dato que solo aparece en una de las fotos (ej. la tabla de desglose en el
      reverso) se detecta igual que si viniera en un solo documento. Verificado en
      Chrome subiendo el mismo PDF dos veces: mismos campos exactos que subiendolo
      una sola vez, sin duplicar ni corromper nada.
- [x] **Campos no detectados marcados en el formulario** (pedido explicito: "te
      pongo que tarifa, te adjunto el recibo y me marcas los datos que no se
      leyeron" -- antes solo salian en una lista de texto). `marcarCamposNoDetectados()`
      en `js/app.js` resalta en naranja/dorado (`.campo-no-detectado`, CSS nuevo)
      los inputs del formulario que corresponden a campos que el lector no encontro
      solo; la marca se quita sola en cuanto el usuario escribe algo en ese campo
      (listener delegado en `#tabCaptura`). Verificado en Chrome: campos marcados
      correctamente y la marca desaparece al escribir.
- [x] **Foto del "sembrado" de paneles en la cotización** (pedido explicito, nuevo
      boton en la seccion 4 del formulario). `js/imagenes.js` comprime cualquier
      imagen o PDF de una pagina a un JPEG chico (max 1400px de ancho, calidad
      ~72%) ANTES de guardarlo -- importante porque `localStorage` tiene una cuota
      total de ~5-10MB para TODA la app, no por imagen, y una foto de celular sin
      comprimir facilmente pesa varios MB. La foto se guarda por proyecto
      (`proyecto.fotoSembrado = {dataUrl, ancho, alto}`), aparece en la seccion 6 en
      pantalla, y se agrega como una PAGINA CONDICIONAL nueva del PDF
      (`pagina06b` en `js/propuesta.js`, solo existe si hay foto cargada, dentro
      del bloque `consumo_sistema`) -- separada de la pagina 6 normal porque esa ya
      usa casi todo el espacio de una hoja A4 sin paginacion automatica. Verificado
      en Chrome de punta a punta (incluido renderizar la pagina del PDF resultante
      con pdf.js para confirmarla visualmente, porque el visor de PDF embebido no
      renderizaba en el entorno de prueba de Edge): imagen de prueba subida,
      comprimida, mostrada en pantalla, e incrustada correctamente en una pagina
      nueva "07 | Distribución de paneles..." con renumeracion dinamica correcta.
- [x] **Simulador de financiamiento, editor de precios de materiales y deducción ISR**
      -- este checklist decía "no portadas a esta versión" pero SÍ se construyeron en
      una sesión posterior sin actualizar esta nota (`renderFinanciamiento`/
      `renderEditorPrecios` en `app.js`, deducción ISR en `resultado.js`/`secciones.js`)
      -- corregido 2026-11-03 tras una auditoría pedida por el usuario ("revisa si no
      nos falta otra funcionalidad") que encontró este checklist desactualizado.
- [x] **Fotografías de condiciones generales del inmueble** (sombras, cubierta, tablero,
      etc., distinto de la foto del sembrado) -- 2026-11-03. Hasta 6 fotos por
      cotización (`proyecto.fotosInmueble[]`, comprimidas más agresivo que
      `fotoSembrado` -- 900px/0.6 de calidad -- para no comerse la cuota de
      localStorage entre varias), cada una con etiqueta corta editable. Se ven en la
      sección 6 (galería bajo "Condiciones actuales del inmueble") y en una página
      condicional nueva del PDF (`pagina06c` en `propuesta.js`, grid de hasta 3
      columnas, solo existe si hay al menos 1 foto).
- [x] **Aviso cuando el texto editado en pantalla no va a reflejarse en el PDF**
      (2026-11-03) -- la limitación real sigue sin resolverse (conectar las dos
      fuentes de texto requiere rehacer `propuesta.js` para que cada página use el
      mismo esquema de ids secuenciales que `secciones.js`, con riesgo real de
      desalinear texto entre las 22+ páginas del generador -- no se intentó por ese
      riesgo). Lo que SÍ se agregó: antes de generar cualquiera de las 3 variantes de
      la cotización completa (`confirmarSiHayTextoEditadoSinReflejarEnPdf` en
      `app.js`), si hay párrafos editados para ese proyecto, se avisa cuántos y se
      pide confirmar -- antes la limitación solo vivía documentada aquí, nadie se
      enteraba al momento de exportar.
- [x] **Aviso de tarifa GDBT sin validar contra un recibo real** (2026-11-03) --
      GDBT usa el mismo motor que GDMTO/GDMTH (ya probado con varios recibos reales),
      pero sigue siendo la única de las 6 tarifas soportadas sin un caso real propio
      que la confirme. No se puede "arreglar" con código -- hace falta un recibo real
      de un cliente con esta tarifa. Mientras no aparezca uno, se avisa explícito en
      pantalla (sección 3) y en el PDF (página 3) cada vez que se calcula con GDBT.
- [x] **`cliente.html` ahora exige los campos de cargos antes de enviar** (2026-11-03)
      -- antes solo se validaban días/kWh del período; los 7 campos de cargos (y el
      período) vienen prellenados con valores de EJEMPLO en el formulario (para que no
      se vea vacío/roto), así que alguien podía pulsar "Enviar" sin tocar nada y el
      envío se veía "completo" con datos ficticios. Se agregaron dos candados: (1)
      mismo bloqueo que ya existía en `index.html` -- si se subió un recibo y algo
      quedó marcado en naranja (no detectado), no se puede enviar sin llenarlo; (2)
      casilla nueva obligatoria "Confirmo que estos datos son de mi recibo real" --
      cubre el caso que (1) no cubre, cuando NUNCA se subió ningún recibo y por lo
      tanto nada se marcó en naranja.
- [ ] Conectar el texto editado de las 21 secciones tambien al PDF exportado de forma
      real (hoy solo hay un aviso de que no está conectado, ver arriba) -- pendiente
      real, requiere una revisión cuidadosa página por página de `propuesta.js`.
- [ ] Autenticación del editor (`index.html`) -- agregado 2026-11-03 un
      `middleware.js` (mismo patrón ya probado en `administradorinvitamx`, HTTP Basic
      Auth vía variable de entorno `ADMIN_PASSWORD` en Vercel) que protege SOLO `/` y
      `/index.html` -- `cliente.html` y todos los archivos compartidos (js/css/lib/
      assets/manifest/service-worker) se dejan pasar siempre, sin login. **Mientras no
      se configure `ADMIN_PASSWORD` en Vercel, no bloquea nada** (sigue público, igual
      que hoy) -- pendiente que el usuario configure esa variable si quiere activarlo.
      Antes de este cambio, cualquiera con la URL del deploy veía datos de clientes
      reales sin ninguna restricción.
- [ ] Decidir si esto reemplaza a `app/` o conviven mientras se termina.
- [x] **Publicado en Vercel, con backend compartido (Supabase)** -- pedido explicito
      del usuario: "que cualquier cliente pueda cargar sus datos, le mande un link...
      y se cargue automaticamente en el servidor". Esto cruzo una decision que venia
      pendiente varias sesiones: la app ya NO es puramente local/`localStorage`.
      - **Desplegado**: `https://cotizador-fv-cfe-web.vercel.app` (proyecto Vercel
        `isaacrbs-projects/cotizador-fv-cfe-web`, conectado al repo de GitHub --
        cada push a `master` deberia redesplegar solo). Verificado con `curl` y en
        Chrome real contra el dominio de produccion (no solo local).
      - **Proyecto de Supabase nuevo**: `cotizador-fv-cfe` (id `prchqgvwaepzmcohoehu`,
        misma organizacion que los demas proyectos del usuario). Una sola tabla,
        `envios_cliente` (ver migracion `crear_envios_cliente` +
        `renombrar_bt_bonus_a_montos`). RLS abierto a la anon key para
        insert/select/update/delete -- **mismo modelo de seguridad que TODOS los
        demas proyectos del usuario** (sin autenticacion, la anon key es publica por
        diseno) -- pero aqui vale la pena remarcarlo mas fuerte porque esta tabla
        guarda datos de TERCEROS (clientes del usuario), no solo datos propios del
        negocio: cualquiera con la anon key (visible en el codigo fuente de
        `cliente.html`) podria en teoria leer todos los envios directo via la API de
        Supabase, no solo insertar los suyos. Es una decision consciente, consistente
        con el resto de los proyectos, pero el usuario debe saber que existe ese
        riesgo si algun dia maneja datos mas sensibles ahi.
      - **Pagina publica nueva** (`cliente.html` + `js/clienteForm.js`): CUALQUIERA
        con el link puede cargar los datos de su propio recibo, SIN instalar nada ni
        tener cuenta. Lo primero que elige es su tarifa (pedido explicito), despues
        puede subir su recibo (reusa el mismo OCR/lectura que la app interna, incluido
        el resaltado de campos no detectados) o llenarlo a mano, pone su nombre/
        telefono, y envia -- queda guardado en `envios_cliente`, nunca toca
        `localStorage` ni requiere que el navegador del cliente tenga nada previo.
      - **Bandeja de entrada nueva en la app interna** ("📥 Envíos de clientes",
        pantalla entre Clientes y el resto): lista los envios pendientes desde
        Supabase, con boton para asignarlos a un cliente YA REGISTRADO o crear uno
        nuevo ahi mismo (mini-formulario inline, sin `prompt()`/dialogos nativos que
        bloquean la pestaña) -- al asignar, crea la cotizacion, llena el formulario
        con los datos del envio, autocalcula, abre la cotizacion, y marca el envio
        como `asignado` en Supabase (con el id de cliente/proyecto local, para
        trazabilidad). "Descartar" lo marca como `descartado` (no se borra).
      - **Refactor**: la logica de captura del formulario (tarifa, cargos, $/kW,
        cargos extra, escalones domesticos) se extrajo a `js/formularioRecibo.js`,
        compartida entre `js/app.js` (cotizacion interna) y `js/clienteForm.js`
        (formulario publico) -- evita mantener dos copias que se puedan
        desincronizar. El helper `$()` de ese modulo es tolerante a campos
        ausentes (`cliente.html` usa un subconjunto mas chico de campos que
        `index.html`, sin los escalones domesticos).
      - **Bug real encontrado y corregido durante las pruebas**: `leerFormularioRecibo()`
        asumia que TODOS los campos de `index.html` existian en cualquier pagina que
        usara el modulo -- en `cliente.html` (que deliberadamente no pide los
        escalones domesticos) tronaba con `Cannot read properties of null`. Se
        corrigio haciendo el helper `$()` tolerante por diseno (devuelve un elemento
        "vacio" seguro si el id no existe) en vez de asumir que todos los campos
        estan siempre presentes.
      - **Nuevo cliente REST minimo para Supabase** (`js/supabase.js`): sin el SDK
        `supabase-js`, solo `fetch` directo a PostgREST -- consistente con el resto
        del proyecto (sin frameworks/dependencias).
      - Verificado de punta a punta, dos veces (local y contra el dominio real de
        Vercel): llenar `cliente.html` -> aparece en la bandeja de `index.html` con
        contador -> asignar a cliente nuevo -> cotizacion creada y calculada
        automaticamente -> envio marcado como `asignado` en Supabase.
      - **Boton nuevo: "💬 Enviar formulario por WhatsApp"** (pantalla Clientes, junto
        a "📥 Envíos de clientes") -- comparte el link de `cliente.html` por WhatsApp
        para CUALQUIER cliente, no uno fijo: usa `wa.me/?text=...` (sin numero en la
        URL) para que Isaac elija el contacto desde su propio WhatsApp, a diferencia
        del boton de WhatsApp de una cotizacion ya calculada (ese si manda a un
        numero fijo). Verificado interceptando `window.open` en consola: el texto y
        el link (`https://cotizador-fv-cfe-web.vercel.app/cliente.html`) salen
        correctos.
      - **El calculo ahora SE BLOQUEA si faltan datos marcados en naranja** -- pedido
        explicito del usuario ("debes pedir todo completo para que no hagas mal los
        calculos" + "lo que si tienes que marcar en la app los datos que faltan").
        Antes, el marcado naranja de campos no detectados por el recibo (ver
        "Recibo en varias fotos..." mas abajo) era solo cosmetico: si el usuario no
        los llenaba, el calculo seguia adelante usando el valor por defecto del
        campo (normalmente $0.00), dando un resultado incorrecto sin avisar.
        - Nueva funcion `faltantesVisiblesParaCalcular()` (`js/app.js`) -- fuente de
          verdad unica: escanea `#tabCaptura` por elementos `.campo-no-detectado`
          actualmente VISIBLES (ignora los del bloque domestico/no-domestico que
          esta oculto segun la tarifa elegida). La columna "$/kW" (radios
          `rkDist`/`rkCap`, que no son un input/select simple) se agrupo en un nuevo
          `<div id="grupoRateKw">` para poder marcarlo/limpiarlo igual que un campo
          normal -- se limpia con un `click` en el grupo (no `change`, porque si el
          usuario deja la opcion ya marcada por defecto un `change` no dispara).
        - Gatea los 3 lugares donde se calcula: boton "Calcular" (bloquea y hace
          scroll al primer campo faltante), auto-calculo al leer un recibo nuevo
          (ya no calcula solo si falta algo, solo lo marca y pide completar), y al
          REABRIR un proyecto ya guardado (antes recalculaba a ciegas con
          `proyectoActual.formulario` guardado; ahora si `proyectoActual.campos`
          trae `campos_no_encontrados`, se vuelven a marcar y se bloquea otra vez).
          Este ultimo caso es el que mas importaba: un envio asignado desde la
          bandeja (📥 Envíos de clientes) nunca pasa por el boton "Calcular", así
          que sin este cambio se habria calculado en silencio con cargos en $0.00
          si el cliente no los lleno bien en `cliente.html`.
        - La captura 100% manual (sin leer ningun recibo, `ultimoLeido`/
          `proyectoActual.campos` null) NO se bloquea -- no hay nada que marcar, es
          el caso legitimo donde Isaac decide los numeros el mismo.
        - **Hueco conocido, no cerrado todavia**: `cliente.html` (la pagina publica)
          no exige que el cliente llene los 7 conceptos de cargos antes de enviar
          (solo valida tarifa + dias/kWh + nombre) -- un cliente podria enviar el
          formulario con los cargos en su valor por defecto sin que nada lo marque
          como "no detectado" (`campos_leidos` solo se llena si de verdad subio un
          recibo y el OCR corrio). Si esto pasa, la nueva validacion de arriba SI
          lo atrapa al abrir el proyecto (no calcula solo), pero depende de que
          Isaac note el aviso y revise a mano -- no hay honestamente ningun marcado
          naranja en ese caso porque nunca se leyo un recibo. Pendiente si se quiere
          cerrar: exigir los 7 campos en `cliente.html` tambien cuando no se adjunta
          recibo.
        - Verificado en Chrome real (sin UI completa, inyectando los eventos):
          marcar `c_distribucion`/`c_capacidad`/`grupoRateKw` -> Calcular bloquea
          con el mensaje y los nombres correctos -> llenar los campos + click en
          el grupo "$/kW" -> Calcular procede y calcula normal. Tambien verificado
          que la captura 100% manual (sin marcas) calcula sin bloquear.
      - **3 funciones que solo existian en la app de Streamlit ahora tambien estan
        aqui** -- pedido explicito del usuario tras aclarar que tenia dos apps
        distintas confundidas ("quiero pasar las secciones que le faltan a la web").
        Son herramientas del panel interno (`index.html`), NO del formulario publico
        (`cliente.html`) -- igual que en Streamlit, donde tampoco aparecen ahi.
        - **Editor de precios de materiales** (panel nuevo, debajo de las 21
          secciones): tabla con el "Importe" de cada partida editable + boton
          "Recalcular con estos precios". Puerto 1:1 de
          `dimensionamiento.recalcular_desde_materiales()` ->
          `recalcularDesdeMateriales()` en `js/motor.js`. El ahorro de factura NO
          cambia (depende del consumo/tarifa, no del costo del sistema); solo se
          vuelve a calcular venta/IVA/inversion/flujo a 25 anios/payback (y ISR si
          aplica). Verificado: cambiar el precio del panel y recalcular actualiza
          en vivo la seccion 11-13 Y el panel de financiamiento (la inversion nueva
          se refleja en el enganche).
        - **Deduccion fiscal ISR** (Art. 34 fraccion XIII LISR, checkbox en la
          seccion 4 "Sistema propuesto"): solo clientes privados/comerciales que
          pagan ISR, nunca gobierno. Puerto 1:1 del calculo de `cotizador_app.py` --
          vive en `construirResultado()` (`js/resultado.js`), agrega
          `ahorroFiscalIsr`/`inversionNetaIsr`/`vanNetoIsr`/`tirNetoIsr`/
          `paybackNetoIsr` a `r` y una nota aclaratoria automatica (misma redaccion
          que Python). Se muestra como bloque extra dentro de la seccion 13
          ("En cuanto se recuperaria la inversion") solo si `r.aplicaIsr` es true --
          no es una seccion nueva de las 21, es contenido condicional de una ya
          existente (mismo criterio que se uso para el inmueble en la seccion 6).
        - **Simulador de financiamiento** (panel nuevo, debajo del editor de
          precios): enganche/tasa/plazo -> pago mensual de credito (amortizacion
          francesa) comparado contra el ahorro mensual estimado. Puerto 1:1 de
          `pago_mensual_credito()` -> `pagoMensualCredito()` en `js/motor.js`.
          Explicitamente NO entra al PDF (tampoco en Streamlit) -- es solo para la
          conversacion con el cliente en pantalla. Recalcula en vivo con cada
          cambio en los 3 campos (sin boton "Calcular" aparte).
        - **NO se porto** "fotos de condiciones del inmueble" (el 4o punto que se
          penso que faltaba): se investigo y en realidad NUNCA se construyo en
          Streamlit tampoco -- solo existe como nota pendiente en el propio
          `cotizador_app.py`. No hay nada que portar; si el usuario lo quiere,
          seria una funcionalidad nueva en las dos apps, no un port.
        - Verificado en Chrome real: tarifa GDMTO + ISR activado -> Calcular ->
          aparecen los 3 paneles -> el bloque de ISR aparece en la seccion 13 con
          la tasa correcta -> editar el precio del panel y Recalcular actualiza
          inversion/enganche/ISR consistentemente. `node js/test_motor.mjs` sigue
          reproduciendo exacto los 8 numeros de Abue (no se rompio nada existente).
      - **Bug real encontrado y corregido, mismo dia**: el usuario pidio revisar que
        `cliente.html` pidiera TODOS los datos necesarios para calcular, "cada
        tarifa tendra datos distintos... no le vas a pedir los mismos datos a un
        cliente residencial que a un GDMTO". Al revisar se encontraron dos huecos
        reales, uno de ellos un bug de calculo silencioso (no solo un hueco del
        formulario):
        - **GDMTH (tarifa por horario) perdia su cargo de Energia por completo.**
          `recibo.js` SI detecta correctamente los 3 renglones "Generacion Base/
          Intermedia/Punta" de un recibo GDMTH real (confirmado en la auditoria del
          2026-10-27), pero no existia NINGUN campo en el formulario (ni interno ni
          publico) para mostrarlos o capturarlos a mano -- la unica casilla que
          habia era "Energia" (singular), que para GDMTH se quedaba siempre en $0.00
          porque nada la llenaba. Como "energia" no esta en la lista de conceptos
          reducibles especial de GDMTH (ver `CONCEPTO_PUNTA` en motor.js), esto NO
          era solo un campo faltante: **todo el cargo de Energia desaparecia del
          calculo**, subestimando brutalmente el consumo/ahorro de cualquier cliente
          GDMTH procesado por la app web (la app de Streamlit no tiene este bug --
          ahi tampoco hay captura manual, pero el motor de Python si arma bien el
          cargo desde `leer_recibo.py`... revisar si la web realmente heredaba el
          mismo problema o era exclusivo de esta migracion, no confirmado a fondo,
          pero el fix aplica igual).
          - Arreglado: nuevo grupo de 3 campos "Energía Base/Intermedia/Punta"
            (`c_energia_base`/`c_energia_intermedia`/`c_energia_punta`), que
            reemplaza al campo unico "Energía" SOLO cuando la tarifa es GDMTH (toggle
            en `conectarEventosFormularioRecibo`, igual patron que domestica/no
            domestica). `llenarFormularioDesdeReciboCampos` ahora SI mapea
            `campos.energia_base/intermedia/punta` detectados por OCR a estos 3
            campos. `calcularYRenderizar()` arma `cargos.energia_base/intermedia/
            punta` en vez de `cargos.energia` cuando la tarifa es GDMTH -- el motor
            (`motor.js`) ya sabia tratar `energia_punta` como NO reducible (el sol no
            genera en horario punta), simplemente nunca recibia el dato.
          - El bloqueo de calculo incompleto (ver arriba) se extendio para cubrir
            este caso especifico: como `energia_base/intermedia/punta` NO se
            inicializan en `null` dentro de `extraerCampos()` salvo que se detecten
            de verdad (a proposito, para no generar falsas alarmas en tarifas que no
            son GDMTH), nunca aparecian en `campos_no_encontrados` -- se agrego una
            verificacion aparte en `marcarCamposNoDetectados()` que los marca en
            naranja directo contra `campos` cuando la tarifa es GDMTH y siguen sin
            detectarse, para que un recibo GDMTH no legible no se quede calculando
            en silencio con $0 en energia.
          - Mismo cambio en `cliente.html`, con copy claro para el cliente final
            ("tu recibo trae la Energía partida en 3 renglones... copia el importe
            de cada uno").
        - **Los escalones de la tarifa domestica (01/DAC) no se podian capturar a
          mano en `cliente.html`** -- a proposito, decision original: "no hace falta
          llenarlos, se usan valores de fabrica". Esto chocaba con el pedido nuevo
          del usuario (el cliente debe poder meter TODO a mano si hace falta) y
          tenia un efecto secundario real: como el helper `$()` compartido devuelve
          un elemento "vacio" (`value: ''`) para un campo que no existe en la
          pagina, `leerFormularioRecibo()` mandaba `escalones: {basicoKwh: '', ...}`
          (string vacio, NO `null`) a Supabase -- y como `formularioDesdeEnvio()` usa
          `??` (que solo substituye en `null`/`undefined`, no en `''`), Isaac
          hubiera visto los campos de escalon EN BLANCO (no los valores por defecto
          razonables) al asignar un envio domestico desde la bandeja. Arreglado
          agregando los mismos 3 campos de escalones que ya tiene `index.html`
          (Basico/Intermedio/Excedente, limites y tarifas) a `cliente.html`, con
          copy que le dice al cliente donde buscarlos en su propio recibo -- esto
          tambien resuelve el bug de las cadenas vacias de raiz (ya no hay campos
          ausentes, hay valores reales).
        - Verificado en Chrome real: `cliente.html` con tarifa GDMTH muestra los 3
          campos de energia (no el unico) y con tarifa 01 muestra los escalones con
          sus valores por defecto; envio de prueba interceptando `fetch` confirma que
          `cargos.energiaBase/energiaIntermedia/energiaPunta` SI viajan en el payload
          enviado a Supabase. En `index.html`: marcar los 3 campos de energia GDMTH
          como no detectados bloquea el calculo con el mensaje correcto; llenarlos y
          calcular reproduce "Energía base/intermedia/punta" en la seccion de
          desglose de cargos. `node js/test_motor.mjs` sigue en verde.
      - **Historial de consumo, ahora capturable a mano y usado de verdad en el
        calculo** (antes solo se mostraba como texto de contexto si el OCR lo
        detectaba -- el dimensionamiento siempre usaba un solo periodo). Pedido del
        usuario: "es importante... la idea es entregar bien calculado el sistema" --
        si el cliente no lo llena, "lo hago yo o el equipo", asi que se agrego en las
        DOS paginas (`index.html` Y `cliente.html`), no solo una.
        - Nueva funcion `consumoMensualDesdeHistorial()` en `motor.js`: promedia los
          periodos capturados (kWh por periodo) a un consumo mensual normalizado.
          Distingue tarifas que se facturan mensual (GDMTO/GDMTH/GDBT/PDBT, ~30.5
          dias/periodo) de las domesticas (01/DAC, que se facturan BIMESTRAL, ~61
          dias/periodo) -- sin esto, promediar kWh/periodo directo habria subestimado
          a la mitad el consumo real de un cliente domestico (cada periodo cubre 2
          meses, no 1).
        - `construirResultado()` (`resultado.js`) prefiere el historial (manual si se
          capturo, si no el que trajo el OCR del recibo) sobre la extrapolacion de un
          solo periodo, cuando hay al menos 1 periodo con dato. Tambien ajusta
          `dailyKwh` (la simulacion mes a mes de la factura) al mismo promedio -- si
          no, el sistema quedaria dimensionado para el consumo promedio real pero el
          ahorro se calcularia contra el periodo mas reciente (que puede ser un mes
          atipico), dando numeros inconsistentes entre si. Sin historial, el
          comportamiento es IDENTICO al de antes (verificado: Abue sigue
          reproduciendo exacto sin tocar nada de historial).
        - UI: grupo de campos numericos generado por JS (`inicializarGridsHistorial()`
          en `formularioRecibo.js`, para no duplicar 18 inputs casi identicos entre
          las 2 paginas) -- 12 casillas para tarifas que se facturan mensual, 6 para
          domesticas, dentro del bloque de cada familia de tarifa (se muestran/
          ocultan con el mismo toggle que ya existia). Opcional, no bloquea el
          calculo si se deja vacio -- es mejora de precision, no dato obligatorio.
        - Si el OCR SI detecta el historial impreso en el recibo, se precarga en
          estos mismos campos (visible y editable, no solo guardado internamente).
        - `cliente.html`: el historial capturado a mano viaja al envio (columna nueva
          `historial` jsonb en `envios_cliente`, migracion `agrega_historial_a_envios_cliente`
          aplicada a Supabase) y `formularioDesdeEnvio()` en `app.js` lo recupera al
          asignar el envio a un cliente -- no se pierde en el camino.
        - Verificado en Chrome real: llenar 3 periodos a mano en `index.html`
          (1200/1300/1100) recalcula "Consumo normalizado promedio de 3 periodos
          reales de historial: 1200.00 kWh/mes" (promedio exacto); en tarifa
          domestica, 2 periodos (400/600) da "250.00 kWh/mes" (promedio 500/bimestre
          ÷ 61 dias × 30.5 = mitad, confirma el ajuste bimestral); sin historial
          sigue igual que antes. En `cliente.html`, envio de prueba interceptando
          `fetch` confirma `historial: [150, 180]` en el payload. `node
          js/test_motor.mjs` sigue en verde (no se rompio nada ya validado).

### Bug real encontrado por el usuario probando con recibos reales (2026-10-30, noche)
- El usuario pidio confirmar que subir un recibo marca en naranja lo que no se
  detecto. Se probo con 3 recibos REALES (no fixtures): Abue (GDMTO, `index.html`),
  Museo San Pedro de Arte (GDMTH, `index.html`) y COBAEP Plantel 26 (PDBT, via OCR,
  `cliente.html`) -- los primeros dos salieron perfectos (todo detectado, nada
  marcado, calculo automatico correcto, incluyendo las bandas de energia GDMTH y el
  historial precargado). El tercero (COBAEP) expuso un bug real: el mensaje decia
  "quedaron marcados en naranja abajo" pero **0 campos se marcaban de verdad**.
- **Causa**: `campos_no_encontrados` tambien incluye campos internos sin casilla en
  el formulario (`multiplicador`, `demanda_contratada_kw`, `historial_anual_kwh`,
  `historial_meses_cubiertos` -- estos 2 ultimos CASI SIEMPRE van a faltar ahora,
  porque la mayoria de los recibos no traen la grafica de historial impresa). El
  mensaje (`mostrarEstadoLecturaRecibo` en `app.js`, y su copia en `clienteForm.js`)
  contaba TODO lo que viniera en esa lista para decidir si decir "quedaron
  marcados", sin filtrar por si de verdad tenian un input que marcar -- mientras que
  `marcarCamposNoDetectados()` (la funcion que SI marca) siempre filtro
  correctamente por `CAMPO_A_INPUT`. Dos logicas distintas que se desincronizaron.
- **Arreglado** en las dos paginas: el mensaje ahora filtra `campos_no_encontrados`
  por `CAMPO_A_INPUT` (lo mismo que ya usaba el marcado real) antes de decidir si
  decir "quedaron marcados" -- y de paso, en vez de listar los nombres tecnicos en
  ingles/snake_case (`c_distribucion`), ahora usa las mismas etiquetas legibles que
  ya existian para el bloqueo de calculo (`ETIQUETA_CAMPO`, ej. "Distribución").
  **El marcado en si NUNCA estuvo roto** -- el bloqueo de calculo de `index.html`
  (que escanea `.campo-no-detectado` directo en el DOM, no la lista cruda) nunca se
  vio afectado por este bug, solo el texto del mensaje era enganoso.
- Reverificado con el mismo recibo real de COBAEP tras el fix: el mensaje ahora dice
  "¡Todo se detectó!" (correcto, los 4 campos sin casilla no cuentan). `node
  js/test_motor.mjs` y `node js/test_recibo.mjs` siguen en verde.

### Respaldo manual en la nube (2026-10-30, noche) -- "lo que trabaje se queda guardado donde sea"
- Pedido del usuario tras el incidente de perdida de datos (ver arriba): quiere poder
  ver sus clientes/cotizaciones desde cualquier dispositivo, no solo en el navegador
  donde los capturo. Los clientes/proyectos siguen viviendo en `localStorage`
  (`cfe_clientes_v1`) -- eso NO cambio -- pero ahora hay una copia opcional en
  Supabase para llevarlos a otro lado.
- **A PROPOSITO es manual** (botones "Subir"/"Traer"), no sincronizacion automatica en
  tiempo real: dos dispositivos escribiendo al mismo tiempo sin que el usuario se
  entere podria pisar datos reales en silencio -- el mismo tipo de error que ya paso
  esta sesion con `localStorage.clear()`. "Traer de la nube" siempre pide confirmar
  explicitamente antes de reemplazar lo que hay en el dispositivo actual.
- Tabla nueva en Supabase (`cfe_respaldo`, migracion `crea_cfe_respaldo`): una sola
  fila (singleton, sin login en esta app) con la lista COMPLETA de clientes como jsonb
  -- mismo formato exacto que `cfe_clientes_v1`, sin transformar a tablas relacionales,
  para no arriesgar bugs de conversion. RLS abierta a `anon` (mismo modelo que
  `envios_cliente`).
- `js/nube.js` (nuevo): `subirANube()` (lee `listarClientes()`, hace upsert de la unica
  fila), `bajarDeNube()` (trae la fila y llama `reemplazarTodosLosClientes()`, nueva
  funcion exportada en `clientes.js`), `consultarNube()` (solo consulta, sin bajar).
- UI: 2 botones nuevos en la pantalla de Clientes ("☁️ Guardar copia en la nube" /
  "⬇️ Traer de la nube") + nota explicando que el guardado normal es solo de este
  dispositivo.
- Verificado en Chrome real: subir con 1 cliente de prueba -> confirmado en Supabase
  (`jsonb_array_length` correcto) -> borrar el cliente local (simula "otro
  dispositivo vacio") -> Traer de la nube -> el cliente vuelve exacto. Limpiado
  despues (cliente de prueba + fila de prueba en `cfe_respaldo`).

### Renumeración sin huecos, vigencia de la oferta, comparación de escenarios (2026-10-30, noche)
- Investigación pedida por el usuario sobre que le podría faltar a la app (software
  profesional de cotización solar + requisitos reales de interconexión CFE). De 4
  hallazgos, pidió los 4, "al final cada sección la puedo apagar si no la necesito" --
  y de paso pidió que al apagar una sección, las que queden se renumeren 1..N sin
  brincos (como ya hacía el PDF, pero la vista en pantalla no).
- **Renumeración en pantalla**: nueva función `seccionesActivasEnOrden(r)`
  (`secciones.js`, exportada) -- antes el header de cada sección y el índice siempre
  mostraban el número fijo 1-21 aunque estuviera apagada (solo se atenuaba). Ahora
  las activas van 01..N sin huecos (N = total activas) y las apagadas dicen
  "Desactivada" en vez de ocupar un número, igual en el índice lateral. El PDF
  (`propuesta.js`) ya renumeraba así desde antes -- ahora pantalla y PDF coinciden.
  Verificado en Chrome real: apagar 3 bloques (que en cascada apagaron 7 secciones)
  deja activas exactamente 01 de 14 .. 14 de 14, sin saltos.
- **Vigencia de la cotización**: campo nuevo "Vigencia (días)" (default 15) en la
  captura. `util.js` nueva función `fechaVigenciaEs()`. Se muestra como aviso en la
  sección 1 (pantalla) y como nota al final de la página 1 del PDF: "Esta cotización
  es válida hasta el [fecha] ([N] días)". Los precios de materiales son una
  provisión de mercado (no cotización fija de proveedor), así que ahora queda
  explícito que no son válidos indefinidamente.
- **Comparación de escenarios**: panel nuevo (`#tabComparacion`, siempre visible,
  no es una de las 21 secciones) con botón "➕ Agregar escenario actual" -- guarda
  paneles/kWp/inversión/ahorro/%/payback/VAN/TIR del cálculo actual en
  `cliente.escenariosComparacion[]` (persistido por CLIENTE, no por cotización
  individual, para poder comparar entre varias cotizaciones del mismo cliente;
  sobrevive cerrar la app). "🗑 Limpiar comparación" borra todo (con confirmación).
  Streamlit ya tenía esto pero solo en memoria de sesión (se perdía al cerrar); la
  web lo mejora guardándolo persistente -- no se tocó Streamlit (regla vigente).
  Verificado: calcular 2 tamaños distintos del mismo cliente (cambiando cobertura)
  y agregar ambos a la comparación muestra las 2 filas con sus números correctos.
- **Seguimiento tipo CRM** (etapa + notas, por cotización): select de etapa
  (Cotizado/Negociando/Ganado/Perdido/Instalado) y lista de notas con fecha, en una
  tarjeta nueva siempre visible al abrir una cotización (`#tabSeguimiento`, no es una
  de las 21 secciones). La etapa se ve como chip de color en la tarjeta de cada
  cotización en la lista del cliente, para ver el estatus sin tener que abrir cada
  una. Verificado en Chrome real: cambiar etapa a "Negociando" + agregar una nota se
  guarda y se ve el chip correcto en la lista.
- **Documentación de apoyo para el trámite de interconexión CFE** (la última de las
  4): nuevo PDF descargable aparte ("📐 Anexo trámite CFE", junto al resumen
  ejecutivo), NO una de las 21 páginas de la cotización -- es un documento de apoyo
  distinto. Contiene: checklist de lo que pide CFE para activar el contrato de
  interconexión (solicitud, croquis, diagrama unifilar, copia de recibo, NOM), un
  link clickeable a Google Maps con el domicilio del recibo (`doc.textWithLink`,
  mismo patrón que el link de Maps de Streamlit), y un **diagrama unifilar de
  referencia** (5 cajas con flechas: Paneles FV → Inversor → Protecciones DC/AC →
  Medidor bidireccional → Red CFE) dibujado directo en el PDF con los datos YA
  calculados del caso (paneles, kWp, kW AC estimado del inversor -- nuevo campo
  `r.acKw` en `resultado.js`).
  - **Deliberadamente NO se presenta como el diagrama certificado que exige CFE** --
    el PDF dice explícito en dos lugares (aviso superior + pie de página) que es
    orientación y que el instalador/perito responsable debe firmar la versión
    final con los datos reales de la instalación. No se fabrica un documento
    oficial, es honesto sobre su propio límite.
  - `js/resumen.js`: nueva función `generarAnexoInterconexion(r)`, con helpers
    locales `cajaDiagrama()`/`flechaDiagrama()`/`diagramaUnifilarReferencia()`
    dibujando directo con primitivas de jsPDF (`roundedRect`/`line`/`triangle`),
    mismo patrón de cursor-Y manual que el resto de `pdfComponents.js`.
  - Verificado en Chrome real: generado el PDF, renderizado a un canvas con pdf.js
    para inspeccionar visualmente (mismo truco que se uso para el sembrado) -- las
    5 cajas y las flechas salen limpias y legibles, el checklist y el link de Maps
    se ven bien.

### Dos bugs reales encontrados y corregidos el mismo día (2026-10-30, noche)
- **Subir una 2a foto del mismo recibo por separado borraba la 1a** -- el usuario
  preguntó "¿no puedes leer fotos?" porque en la práctica solo lograba subir un
  archivo a la vez. La causa real: un `<input type="file">` normal REEMPLAZA la
  selección anterior cada vez que se usa de nuevo (comportamiento estándar del
  navegador, no un bug de HTML) -- si el cliente toma la foto 1, la app la procesa, y
  luego toma la foto 2 aparte, la 2a reemplazaba a la 1a en vez de sumarse, perdiendo
  los datos que solo traía la primera. Para el input `archivoReciboNuevoProyecto`
  (crear cotización nueva) el problema era peor: cada foto adicional creaba una
  cotización NUEVA en vez de agregarse a la ya creada.
  - Arreglado con un acumulador compartido `archivosReciboAcumulados` (modulo-level en
    `app.js`): cada `change` del input SUMA los archivos nuevos a los ya
    seleccionados (en vez de reemplazar) y vuelve a correr `leerReciboMultiple()`
    sobre el conjunto COMPLETO -- así una foto nueva completa/corrige los datos en
    vez de perder lo que ya se había leído. `e.target.value = ''` después de cada
    lectura para poder reusar el mismo input. El handler de "nuevo proyecto" ya NO
    crea un proyecto por cada foto -- solo en la primera; las siguientes actualizan
    el mismo proyecto recién creado.
  - El acumulador se reinicia solo al abrir un proyecto SIN `camposIniciales`
    (proyecto ya guardado, o uno en blanco) y al entrar a la lista de proyectos de
    un cliente -- para no arrastrar fotos de un cliente/cotización distinta.
  - Verificado en Chrome real con 2 fotos reales (no simuladas): subir la 1a, luego
    la 2a por separado -- con un log temporal se confirmó que la 2a lectura usó los
    2 archivos acumulados, no solo el nuevo (se quitó el log antes de pushear).
- **Los paneles nuevos (editor de precios, financiamiento, comparación,
  seguimiento) no se podían apagar** -- a diferencia de las 21 secciones, no tenían
  el mismo interruptor. Se agregó el mismo patrón `.toggle-seccion` a cada uno
  (checkbox "Mostrar este panel" en su propio header), guardado por PROYECTO en
  `proyectoActual.panelesActivos` (igual que `seccionesActivas`) -- persiste al
  cambiar de cotización y volver. Verificado en Chrome real: apagar financiamiento,
  salir del proyecto, volver a entrar -- sigue apagado.

### Herramienta interactiva de distribución de paneles sobre foto aérea (2026-10-30, noche)
- El usuario preguntó si la web podía "insertar y distribuir los paneles sobre las
  azoteas" al calcular, o si solo se podía subir una foto ya hecha. Se revisó: la web
  solo tenía el upload simple; la app de Streamlit SÍ tenía una herramienta
  interactiva (`sembrar_paneles.py` + `streamlit-image-coordinates`) para marcar
  puntos en una foto aérea y dibujar los paneles a escala. El usuario pidió portarla
  también a la web.
- `js/sembrado.js` (nuevo): puerto a Canvas2D de `sembrar_paneles.py`. El usuario sube
  una foto aérea/satelital (ej. captura de Google Earth), hace clic en 2 puntos cuya
  distancia real conoce (para calibrar px/metro) y despues en las 2 esquinas opuestas
  del área del techo -- la herramienta calcula solas las columnas/filas que caben con
  el numero de paneles YA CALCULADO (`r.n`, no hay que volver a capturarlo) y los
  dibuja numerados, con el mismo aviso de Streamlit: "DISTRIBUCIÓN CONCEPTUAL · NO ES
  PLANO DE INGENIERÍA · VALIDAR EN SITIO". Tamaño del panel configurable (default
  1.134 × 2.278 m, mismo default que Streamlit), con opción vertical/horizontal.
- UI: modal nuevo (`#modalSembrado`) con el canvas y los controles, abierto por un
  botón nuevo "🧩 Dibujar distribución sobre una foto aérea" junto al upload normal
  de "Foto del sembrado" en la sección 4. Al guardar, el resultado se exporta como
  imagen comprimida y se asigna a `proyectoActual.fotoSembrado` -- **reusa exactamente
  el mismo flujo de guardado/visualización/PDF que ya existía** para la foto subida a
  mano (sección 6 en pantalla + página del PDF), no se tocó esa parte.
- Requiere haber calculado primero (usa `ultimoResultado.n`) -- si no, avisa y no deja
  abrir la herramienta.
- `imagenes.js`: se exportó `cargarImagenDesdeArchivo` (ya existía, antes privada) para
  reusarla en el editor.
- Verificado en Chrome real con una foto de prueba real: subir foto → marcar 2 puntos
  + escribir 20 m → marcar 2 esquinas del techo → "Dibujar paneles" dibujó
  correctamente 13 paneles (13 columnas × 1 fila, el mismo número ya calculado) con
  el aviso de distribución conceptual → "Guardar" → aparece en la sección 6 en
  pantalla y el PDF se generó sin errores.

### Reencuadre: "Analizador de sistemas fotovoltaicos" + pasos de entrega + numeración de todo lo editable (2026-11-09, noche)
- El usuario aclaró el propósito real de la app a lo largo de la sesión: no es un
  "cotizador", es un analista/diseñador de sistemas fotovoltaicos (industrial,
  comercial, residencial, las 6 tarifas CFE) -- la cotización es un SUBPRODUCTO del
  análisis, no la identidad de la herramienta. También pidió, en una sola sesión larga
  y por mensajes sueltos: (1) poder seguir editando él mismo a su conveniencia todo lo
  que ya está construido, sin que se le restrinja; (2) numeración visible de cada
  elemento editable para poder reportar "el número N no funciona" en vez de describir
  texto; (3) revisar botones redundantes y simplificar; (4) poder trabajar "a pasos" --
  entregar un análisis preliminar mientras avanza la negociación, SIN perder ni
  duplicar la cotización ya validada como completa, y poder usar esa validada como
  machote para clientes nuevos.
- **Rebranding** (`index.html`, `manifest.json`): título/h1/descripción/nombre de la
  PWA cambiados de "Cotizador FV CFE" a "Analizador FV CFE" / "Analizador de sistemas
  fotovoltaicos — CFE", con la leyenda "la cotización sale del análisis, no al revés".
  `cliente.html` (la página pública para el cliente final) NO se tocó -- ya estaba
  enfocada en la acción ("Envía los datos de tu recibo CFE"), no en el nombre de la
  herramienta interna. Cache del service worker bumpeado a `v25` para que la PWA
  instalada tome el titulo/manifest nuevos.
- **Pasos de entrega** (nuevo, `js/clientes.js`): cada cotización ahora guarda
  `proyecto.pasos` (`{id: {nombre, seccionesExcluidas, graficosExcluidos,
  tablaColumnasOcultas, tablaFilasOcultas}}`) + `proyecto.pasoActivo`. Es una capa de
  PERSISTENCIA encima de los 4 campos sueltos que YA existían y que YA lee toda la app
  (secciones.js/propuesta.js nunca se enteran de que "pasos" existe) -- cada paso es
  solo una foto de qué se muestra/exporta, el contenido (textos, cifras calculadas)
  es siempre el mismo. "Análisis completo" se crea siempre como primer paso y nunca se
  puede borrar (protegido en la función `eliminarPaso` y en la UI). Nuevo panel
  "📑 Paso de entrega de esta cotización" (encima de las secciones, en `index.html`):
  selector de paso + "+ Nuevo paso desde aquí" (copia el estado actual con un nombre
  nuevo, ej. "Análisis preliminar", sin tocar el paso de origen) + renombrar + eliminar
  (deshabilitado para "Análisis completo" o si solo queda un paso). El botón
  "Cotización completa" ahora muestra una leyenda ("📑 Vas a generar: ...") con el
  nombre del paso activo, para que nunca sea ambiguo qué se está exportando.
  Proyectos guardados ANTES de esto se migran solos (`asegurarPasos`, llamada al abrir
  cualquier proyecto) sin perder lo que ya tuvieran apagado.
- **"Desde cotización ya validada" ahora también clona los pasos** (no solo la tarifa/
  cargos, que ya clonaba desde el 2026-11-06): al usar una cotización marcada como
  buena como machote para un cliente nuevo, el cliente nuevo arranca con los mismos
  pasos ya armados (ej. ya trae listo "Análisis preliminar" + "Análisis completo"),
  solo falta su recibo real.
- **Numeración visible de TODO el contenido editable** (nuevo,
  `numerarContenidoEditable()` en `js/app.js`, corre dentro de `renderSecciones()`
  cada vez que se renderiza): no fue necesario mantener una lista nueva -- cada
  párrafo/título/subtítulo (`campoEditableConId`), celda de tabla (`celdaEditable`) y
  etiqueta de tarjeta/leyenda de gráfica (`textoChico`) YA le pone a su elemento
  `dataset.textoId` desde hace semanas; solo se recorren en orden de aparición y se
  les pega un número correlativo visible (№1, №2...) justo antes de cada uno
  (`.badge-num-editable`, CSS nuevo). El número NO se guarda -- se recalcula desde 1
  sobre lo que está VISIBLE en cada render, así que apagar una sección o cambiar de
  paso simplemente renumera lo que queda, nunca deja huecos. Contador total visible
  junto al índice de secciones (`#contadorEditables`).
- **Botones revisados y reorganizados, sin quitar funciones** (pantalla Clientes,
  `index.html`): los 7 botones que vivían en una sola fila sin orden ("+ Nuevo
  cliente", dashboard, definitivas, envíos, WhatsApp, formulario, guía) se agruparon
  en 3 bloques con su propio `<h4>` -- "Cliente nuevo" / "Captar un cliente (antes de
  registrarlo)" / "Revisar / organizar lo ya capturado" -- más el bloque de "Respaldo
  entre dispositivos" que ya existía aparte. Ningún id ni función se quitó -- todos
  hacían algo real y distinto (confirmado contra este mismo archivo), el problema era
  de agrupación/etiquetado, no de redundancia. En la pestaña de exportar PDF se agregó
  una nota explícita: solo "Cotización completa" cambia según el paso activo;
  "Resumen ejecutivo" y "Anexo trámite CFE" son documentos de formato fijo, siempre
  iguales sin importar qué esté apagado.
- **Deliberadamente NO se tocó**: `motor.js`, `resultado.js`, `recibo.js` (todo el
  cálculo y la clasificación por tarifa) -- todo lo de esta sesión es una capa de
  presentación/persistencia encima de lo ya calculado. `node js/test_motor.mjs` y
  `node js/test_recibo.mjs` siguen en verde sin cambios, confirmando que no se
  rompió ningún número ya validado de ninguna tarifa.
- **Pendiente de verificación real**: la extensión de Chrome in Chrome no se conectó
  esta sesión (`tabs_context_mcp` devolvió "Browser extension is not connected" dos
  veces) -- todo lo de arriba se verificó por lectura de código, cruce de ids entre
  `index.html`/`js/app.js`, `node --check` en los 5 archivos JS tocados, balance de
  llaves de `css/styles.css`, y las 2 suites de prueba (`test_motor.mjs`/
  `test_recibo.mjs`) en verde -- pero NO se hizo clic real en el navegador sobre el
  selector de pasos ni sobre la numeración. Queda pendiente que el usuario (o una
  sesión futura con la extensión conectada) confirme en vivo: crear un paso nuevo,
  cambiar entre pasos, que el PDF "Cotización completa" refleje el paso activo, y que
  los números aparezcan y se recorran bien al apagar/prender secciones.

### Continuación misma sesión: 2 botones por elemento, número de página, blindaje contra que la numeración se cuele al PDF (2026-11-09, más tarde)
- Se creó `VISION_Y_REQUISITOS.md` -- transcribe, por tema y con citas textuales, todo lo
  que el usuario fue dictando esta sesión larga (identidad del producto, flujo de
  trabajo, principio de edición, pasos de entrega, numeración solo-editor, separación
  editor/PDF, 2 botones, coherencia por tarifa, formato del PDF). Léerlo antes de tocar
  cualquiera de estas funciones en una sesión futura -- explica el "por qué", no solo
  el "qué".
- **Exactamente 2 botones por elemento editable** (pedido explícito: "uno de apagar y
  otro de guardar... el de guardar... esa versión se pueda usar como machote"). En
  `js/secciones.js` (`campoEditableConId`/`celdaEditable`/`textoChico`) se quitaron
  los controles sueltos que había (↺ restaurar, ✓/✕ aplicar/quitar de todas) y quedan
  **🙈/👁 Apagar/Mostrar** + **💾 Guardar**. `onGuardarTextoGlobal()` (`js/app.js`) ahora
  hace las 2 cosas en un clic: guarda el override para esta cotización Y lo promueve
  como predeterminado global/machote. Vaciar el texto y guardar revierte ambos lados.
  CSS: `.btn-guardar-texto`(-chico/-celda) reemplaza a `.btn-icono-global`/
  `.btn-restaurar-texto` (eliminadas, ya no usadas).
- **Bug real encontrado y corregido en la propia revisión de este cambio**: el número
  del editor (`.badge-num-editable`) NO estaba excluido del lector de texto del PDF
  (`js/propuestaDom.js`) -- se habría colado como "№12Distribución" en el documento
  generado, violando directamente lo que el usuario pidió ("la numeración es solo en
  el editor, en el PDF solo está enumerado las secciones"). 3 puntos de contaminación
  encontrados y corregidos: `CLASES_OMITIR` (excluye el badge si aparece como nodo
  propio), `textoSinIconos()` (ahora también quita `.badge-num-editable`, no solo
  `<button>`, al leer el texto completo de un contenedor -- tarjetas/leyendas/gauge),
  y `dibujarTabla()` (headers/celdas de tabla genérica ahora usan `textoSinIconos()`
  en vez de `.textContent` directo, mismo motivo).
- **Número de página regresado al PDF** (pedido explícito: "ponle número de página al
  PDF resultante") -- `dibujarHeaderFooter()` en `js/pdfComponents.js` ahora dibuja
  "Página N de M" centrado abajo de cada hoja, SIN reintroducir el aviso legal que se
  quitó a propósito en una sesión anterior (`aviso` se sigue ignorando).
- **Verificado en navegador real** (servidor local efímero, puerto nuevo cada vez por
  el cacheo agresivo de módulos ES ya documentado; cliente de prueba `TEST-PASOS-NUM`,
  tarifa GDMTO con los datos reales de Abue, `localStorage` de un puerto que nunca
  tocó datos reales del usuario):
  - Cada párrafo mostró exactamente 2 botones ("💾 Guardar" + "🙈 Apagar"); cada celda
    de tabla mostró "💾" junto al "✕" de ocultar columna/fila (botón distinto, no
    redundante).
  - Clic real en "💾 Guardar" sobre un párrafo editado confirmó -- leyendo
    `localStorage` directo, no solo la pantalla -- que el texto quedó guardado TANTO
    en `proyecto.textosEditados` COMO en `cfe_textos_globales_v1` (el machote) con un
    solo clic.
  - Clic real en "🙈 Apagar"/"👁 Mostrar" confirmó el toggle funcionando.
  - Se generó el PDF "Cotización completa" real (32 páginas) y se leyó con `pdf.js`
    (ya vendorizado en el proyecto): las 32 páginas traen "Página N de 32"; **cero**
    apariciones de "№" en todo el documento (confirma el fix de contaminación);
    el texto editado y guardado SÍ aparece en el PDF cuando el párrafo está visible,
    y correctamente NO aparece cuando se apaga (probado explícitamente alternando
    ambos estados sobre el mismo párrafo).
  - Revisión de márgenes/cortes (pedido explícito: "revisa el formato de las
    secciones que no se corte que tenga sus márgenes bien") -- barrido programático
    de la posición de CADA elemento de texto en las 32 páginas contra los límites de
    contenido reales (`MARGIN_L`/`MARGIN_R`/`CONTENT_BOTTOM` de `pdfComponents.js`):
    **0 elementos** se salen del margen horizontal, **0 elementos** se desbordan del
    margen inferior. Inspección visual adicional de la página 1 (renderizada a canvas
    con `pdf.js`): tarjetas de métricas alineadas, texto completo, sin cortes.
    **No se revisaron visualmente las 32 páginas una por una** (solo la 1, más el
    barrido programático de las 32) -- si el usuario ve un caso puntual de corte real
    en una tabla específica, pedir cuál página/sección para revisarla a fondo.
  - `node js/test_motor.mjs` y `node js/test_recibo.mjs` en verde antes y después de
    todo este bloque -- no se tocó el motor de cálculo en ningún momento.
- Cache del service worker bumpeado a `v27` (cubre este bloque completo, sobre el
  `v26` de los números de página).
- **Rebranding** ("Analizador FV CFE") y **pasos de entrega** (análisis completo/
  preliminar) documentados en la entrada anterior de esta misma fecha, más arriba.

### Vista previa en ventana/pantalla aparte, se actualiza sola (2026-11-09, más tarde todavía)
- Pedido explícito del usuario: "uso dos pantallas, en una pongo el editor que ya
  tenemos y en el otro que se abra y se vea la página de previsualización" -- quería
  una aproximación visual al PDF (no el PDF real) que se actualizara sola mientras
  edita en la otra ventana, con un botón propio para generar el PDF real desde ahí.
- **Archivos nuevos**: `vista-previa.html`, `js/vistaPrevia.js`, `css/vista-previa.css`.
  Página independiente (como `cliente.html`), con su propio `#contenedorSecciones` --
  se abre con `?cliente=ID&proyecto=ID` en la URL, lee ese proyecto de `localStorage`
  y lo renderiza con el MISMO `renderSeccion()` de `secciones.js` que usa el editor
  (sin reinventar ningún renderizado).
- **Se actualiza sola de verdad, sin servidor ni polling**: usa el evento nativo
  `window.addEventListener('storage', ...)` del navegador, que SOLO se dispara en
  OTRAS pestañas/ventanas del mismo origen cuando cambia una llave de `localStorage`
  (nunca en la pestaña que hizo el cambio) -- exactamente el caso de "edito en una
  ventana, veo en la otra". Probado en vivo con 2 pestañas reales: editar y guardar un
  párrafo en una pestaña actualizó la otra sola, sin ningún refresco manual.
- **Estilo "hoja" que imita el PDF real, sin pretender ser pixel-perfecto** (aceptado
  explícitamente por el usuario): `css/vista-previa.css` usa las MISMAS medidas en
  puntos que `pdfComponents.js` (595.28×841.89pt, márgenes 40/70/40/40) y los mismos
  colores (navy/gold/grey), oculta TODOS los controles de edición (botones Guardar/
  Apagar, numeración del editor, checkboxes) vía CSS, y deshabilita `contentEditable`
  por JS para que un clic accidental no intente "editar" nada ahí.
- **Las secciones apagadas se QUITAN del todo de esta vista** (a diferencia del editor,
  que las deja atenuadas a propósito para que Isaac las siga viendo -- ver
  VISION_Y_REQUISITOS.md sección 5) -- la vista previa representa "cómo queda la
  cotización", no el editor, así que aquí debía comportarse como el PDF. Probado en
  vivo: apagar una sección en el editor la quitó por completo de la vista previa
  (22→21 secciones), no solo la atenuó.
- **Botón "🖥️ Abrir vista previa en otra ventana"** nuevo en `index.html` (pestaña de
  exportar PDF, arriba de "Cotización completa") -- usa un nombre de ventana fijo
  (`window.open(url, 'vistaPreviaCFE', ...)`) para que, si ya está abierta en el
  segundo monitor, el navegador reuse esa misma ventana en vez de abrir una nueva cada
  vez que se pulsa el botón.
- **Botón "📄 Generar PDF" propio** en la vista previa -- llama a la MISMA función real
  (`generarPdfCompletaDesdeVista`, importada de `propuesta.js`), nunca una copia.
- **2 bugs reales encontrados y corregidos durante la propia construcción/prueba**:
  1. `construirResultado()` no acepta `proyecto.formulario` (el snapshot crudo del
     formulario) directo -- espera el objeto "input" ya derivado que normalmente arma
     `leerInputCalculo()` leyendo el DOM en vivo (`rateKw`/`btPct`/`fpBonusPct`
     calculados, `costos` resuelto a un objeto). Sin esto, `construirResultado()`
     tronaba (`ErrorDeClasificacion: rate_kw es obligatorio`) porque nunca llegaba
     nada a `rateKw`. Se escribió `construirInputDesdeFormulario()` en
     `vistaPrevia.js`, que replica exactamente la misma derivación de
     `leerInputCalculo()` pero leyendo del snapshot guardado en vez del DOM.
  2. `vista-previa.html` no cargaba `lib/jspdf.umd.min.js` -- el botón "Generar PDF"
     tronaba (`Cannot destructure property 'jsPDF' of 'window.jspdf'`). Agregado el
     mismo `<script>` que ya tiene `index.html`.
- **Verificado de punta a punta con 2 pestañas reales** (servidor local efímero,
  cliente de prueba GDMTO con los datos reales de Abue, puerto nuevo cada vez por el
  cacheo de módulos ya documentado): edición en vivo propagada sola a la otra pestaña,
  sección apagada desaparece de la vista previa, y el PDF generado DESDE la vista
  previa (31 páginas) se verificó con `pdf.js` -- con numeración de página, sin
  ninguna contaminación de "№" del editor, con la edición reflejada, y sin la sección
  apagada. `node js/test_motor.mjs`/`test_recibo.mjs` en verde, sin tocar el motor.
- `vista-previa.html`/`js/vistaPrevia.js`/`css/vista-previa.css` agregados al cache
  del service worker (`ARCHIVOS_APP_SHELL`) -- bump a `v28`.

### Bug real: la vista previa no mostraba la foto del recibo/verificación en el PDF (2026-11-09, más tarde todavía)
- El usuario reportó: "note que cuando le di generar pdf no se ven la foto del recibo
  y de la verificación en sitio". Reproducido en vivo (servidor local efímero,
  cliente de prueba GDMTO con un archivo inyectado en `archivosRecibo`/
  `archivosVerificacion`): con una imagen PNG de prueba SÍ se embebía bien en ambos
  botones ("Cotización completa" del editor y "Generar PDF" de la vista previa) --
  el bug solo aparecía con un **PDF** como adjunto (el caso más común en la realidad,
  ya que el recibo normalmente se sube como PDF, no como foto).
- **Causa real**: `archivoAImagenComprimida()` (`js/imagenes.js`) necesita
  `window.pdfjsLib` para leer un PDF adjunto (vía `abrirPdf()` en `pdftext.js`) --
  `vista-previa.html` (la página nueva de esta misma sesión) cargaba `jspdf.umd.min.js`
  (para GENERAR el PDF de salida) pero nunca `lib/pdf.min.js` (para LEER los PDF
  adjuntos). La conversión fallaba en silencio (atrapada por el `try/catch` de
  `convertirTodos()`), así que la imagen simplemente se omitía sin avisar -- de ahí
  que "no se vea". `index.html` nunca tuvo este bug porque ya cargaba `pdf.min.js`
  desde antes (por el lector de recibos con OCR).
- **Arreglado**: `vista-previa.html` ahora también carga `lib/pdf.min.js`;
  `js/vistaPrevia.js` configura `window.pdfjsLib.GlobalWorkerOptions.workerSrc`,
  mismo patrón que `app.js`/`clienteForm.js`.
- **Verificado en vivo con un PDF de prueba real** (generado a mano, 1 página, válido
  -- confirmado abriéndolo con `pdf.js` antes de usarlo): con el fix, tanto "Cotización
  completa" (editor) como "Generar PDF" (vista previa) embebieron correctamente la
  imagen en las páginas "Documento: recibo original de CFE" y "Documento: verificación
  en sitio" (confirmado inspeccionando la lista de operadores de cada página del PDF
  resultante con `pdf.js` -- `paintImageXObject`/`paintJpegXObject` presente en ambas).
  `node js/test_motor.mjs`/`test_recibo.mjs` en verde, sin tocar el motor.
- Cache del service worker bumpeado a `v29`.

### Link de vista previa compartida (colaborador en otro dispositivo) + limpieza de botones (2026-11-09, más tarde todavía)
- Pedido explícito del usuario: "puedes hacer un link para compartir y que también vea
  el colaborador la vista previa en tiempo real" -- a diferencia de `vista-previa.html`
  (mismo dispositivo, localStorage + evento `storage`), esto es para alguien en OTRO
  dispositivo/navegador.
- **Refactor previo, sin cambio de comportamiento**: se extrajo a `js/vistaPreviaComun.js`
  toda la lógica que antes vivía solo en `vistaPrevia.js` (`construirInputDesdeFormulario`,
  `construirRDesdeProyecto`, `renderEnContenedor`, `generarYMostrarPdf`) -- ahora la
  comparten `vista-previa.html` y la página nueva, para que nunca se desincronicen.
  `vista-previa.html` se re-probó completa después del refactor (misma suite de
  pruebas de la entrada anterior) -- sin regresión.
- **Backend**: tabla nueva `vista_compartida` en el proyecto Supabase de este repo
  (`cotizador-fv-cfe`, `prchqgvwaepzmcohoehu`) -- `token` (llave primaria),
  `cliente_id`/`proyecto_id`/`cliente_nombre`, `proyecto` (jsonb, el proyecto
  COMPLETO), `actualizado_en`. RLS abierta a la anon key (mismo modelo que el resto
  del proyecto -- `envios_cliente`, `cliente.html`, etc.) -- cualquiera con el link ve
  los datos de esa cotización, decisión consciente ya aceptada por el usuario.
  `js/supabase.js` ganó 3 helpers genéricos nuevos (`supabaseUpsertar`,
  `supabaseActualizarPorFiltro`, `supabaseEliminarPorFiltro`) para tablas cuya llave
  primaria no se llama `id`.
- **Editor** (`index.html`/`js/app.js`): botón nuevo "🔗 Compartir vista previa en vivo
  (link)" -- genera un token corto, empuja el proyecto completo a Supabase, y muestra
  el link con botones de copiar/WhatsApp. Cada vez que algo cambia (`renderSecciones()`,
  llamada tras cualquier edición/toggle) se vuelve a empujar el estado, con un debounce
  de 900ms para no mandar una fila por cada clic/tecla seguidos. Botón "🛑 Dejar de
  compartir" borra la fila y el link deja de funcionar.
- **Página pública nueva** (`vista-previa-compartida.html` + `js/vistaPreviaCompartida.js`):
  toma `?token=...`, hace **polling** cada 4s a la tabla (no Supabase Realtime/
  websockets, para no sumar una dependencia nueva -- consistente con el resto del
  proyecto, que ya usa `fetch` directo a PostgREST en vez del SDK `supabase-js`) y
  re-renderiza solo cuando `actualizado_en` cambió. Mismo botón "Generar PDF" real que
  las otras vistas.
- **Verificado en vivo con 3 "dispositivos" simulados** (3 pestañas aisladas, servidor
  local efímero): generar el link desde el editor confirmó la fila en Supabase (vía
  SQL directo); una pestaña NUEVA que nunca tocó `localStorage` (solo leyó el link)
  mostró la cotización completa; editar un párrafo en el editor se reflejó solo en esa
  pestaña del "colaborador" tras el polling, sin tocarla; "Dejar de compartir" borró
  la fila de verdad (confirmado por SQL, count 0).
- **Limpieza de botones, pedido explícito del usuario**: se quitaron "Resumen
  ejecutivo (1 página, fijo)" y "Anexo trámite CFE (fijo)" de la pestaña de exportar
  PDF -- quedó solo "Cotización completa" + WhatsApp. Las funciones que los generaban
  (`generarResumenEjecutivo`/`generarAnexoInterconexion`) se dejaron intactas en
  `resumen.js` (sin botón que las llame) por si se piden de vuelta -- "Guía para
  presentar (genérica)" (botón distinto, pantalla de Clientes) no se tocó.
- **Flujo de "machote" reubicado y consolidado**, pedido explícito del usuario: "ya
  hay un botón de nuevo cliente al final de la cotización donde se trabaja... permite
  elegir qué cliente, el nombre de la cotización y qué cotización final usar como
  machote -- ya están los botones, solo arréglalos... y quita lo repetido". Se quitó
  el flujo aparte "📋 Desde cotización ya validada" (pantalla "Cotizaciones de este
  cliente", requería tener el cliente destino ya fijado de antemano) y se reemplazó
  por un panel "📋 ¿Partir de una cotización ya validada?" al PRINCIPIO del formulario
  de captura de cualquier cotización (recién creada en blanco o no) -- reusa el
  nombre/cliente que YA se deciden en el panel "Guardar cotización" de esa misma
  cotización, solo aplica tarifa/cargos/pasos encima de la que ya está abierta
  (`aplicarMachoteAProyecto()` en `clientes.js`, comparte la misma lógica de limpieza
  de campos que `crearProyectoDesdeOrigen()`, que se dejó intacta por si se usa en
  otro lado después).
  - **Bug real encontrado probando esto mismo**: el panel se puso primero dentro de
    "2. Genera el PDF" (`tabPdf`), que solo se muestra DESPUÉS de calcular por primera
    vez -- una cotización recién creada en blanco nunca había calculado nada, así que
    el panel nunca se habría visto. Movido al inicio de "Datos y recibo" (`tabCaptura`),
    visible desde que se abre la cotización, antes de capturar nada.
  - Verificado en vivo: cliente origen con una cotización marcada ✅ definitiva (GDMTO),
    cliente destino con una cotización en blanco -- el panel mostró la definitiva de
    inmediato al abrir la cotización en blanco; aplicarla copió tarifa/cargos
    correctamente, dejó titular/período en blanco, mostró el aviso "esta cotización se
    creó a partir de otra ya guardada", y permitió completar+calcular normal.
- `node js/test_motor.mjs`/`test_recibo.mjs` en verde en todo momento -- no se tocó el
  motor de cálculo. Cache del service worker bumpeado a `v30` (cubre este bloque
  completo: `vistaPreviaComun.js`/`vistaPreviaCompartida.js`/
  `vista-previa-compartida.html` agregados a `ARCHIVOS_APP_SHELL`).

### Auditoría exhaustiva del motor de cálculo: 2 bugs reales corregidos (2026-11-10)
- Pedido explícito del usuario: "revisa exhaustivamente los cálculos de todo el
  contenido completo". Se corrió una auditoría dedicada de `js/motor.js`/
  `js/resultado.js` línea por línea, más contraste de los ~13 bloques "📐 Cómo se
  calculó" de `js/secciones.js` contra las fórmulas reales, con verificación manual
  independiente (no solo lectura) de GDMTH, amortización de crédito, deducción ISR, y
  el año 13 del flujo a 25 años (reposición de inversor + degradación + escalamiento
  simultáneos). Las 2 suites de prueba (`test_motor.mjs`/`test_recibo.mjs`, 32+
  aserciones contra el caso real de Abue) sirvieron de terreno conocido-correcto, sin
  tocarlas. Veredicto: el motor es confiable para cotizaciones reales -- los 2 bugs
  encontrados son de "explicación engañosa" (el total que paga el cliente SIEMPRE fue
  correcto en ambos casos), no de "cobro incorrecto".
- **Bug 1, `js/secciones.js` (`calculoReciboDomestico`, tarifas 01/DAC)**: el Paso 1
  de la tabla "Cómo se calculó" de la sección 3 mostraba `fd.base` etiquetado SOLO
  como "Cargo de energía", pero `fd.base = energiaMonto + cargoFijo` (ver `invoice()`
  en `motor.js`) -- escondía el cargo fijo capturable (`d_cargoFijo`, campo existente
  desde 2026-11-06) cuando el cliente SÍ lo trae en su recibo real. Corregido:
  el Paso 1 ahora muestra solo el monto de energía (`fd.base - fd.cargoFijo`), y se
  agrega un Paso "1b" condicional ("Cargo fijo de CFE del período") solo cuando aplica
  -- el Paso 2 (Subtotal) explica la suma correctamente en cualquiera de los 2 casos.
  Verificado en vivo con tarifa 01 + cargo fijo de $50: Paso 1 = $432.13 (solo
  energía), Paso 1b = $50.00, Subtotal = $482.13 (coincide exacto), total final sin
  cambios ($609.27, el mismo de siempre -- el bug nunca afectó el monto cobrado).
- **Bug 2, `js/secciones.js` (`g05-calc-formula`, sección 5, todas las tarifas)**: la
  fila "Consumo mensual normalizado" mostraba `r.annualKwh / 12`, pero
  `r.annualKwh` dejó de ser `consumoMensual × 12` desde el 2026-11-06 (hallazgo 9 de
  esa auditoría -- ahora se calcula con los días reales del calendario, a propósito,
  para que coincida con el resto del documento) -- el número real que decide cuántos
  paneles se proponen (`consumoMensual`, usado directo en `dimensionarHorasSol()`)
  nunca se exponía en `r`, así que esta fila mostraba una cifra ligeramente distinta
  (diferencia típica <0.5%, sin efecto en el número de paneles, pero la explicación no
  coincidía con el cálculo real). Corregido: la fila ahora calcula el promedio
  directo de `r.consumosMensualesUsados` (el mismo arreglo que ya usa la fila de
  arriba, "Suma de los períodos"), en vez de derivarlo de `annualKwh`. Verificado en
  vivo con un historial de 3 períodos (2000/2500/2400 kWh, el último
  siempre reemplazado por el período facturado actual -- diseño ya documentado desde
  2026-11-01, no es parte de este bug): la tabla ahora muestra 2,300 kWh/mes (el
  promedio real, `6900/3`), no los 2,293.75 kWh/mes que habría dado `annualKwh/12`.
- `node js/test_motor.mjs`/`test_recibo.mjs` en verde antes y después de ambos fixes
  -- ninguno de los dos toca `motor.js`/`resultado.js`, son correcciones puramente de
  presentación en `secciones.js` (import nuevo de `R` desde `motor.js`, sin cambios al
  motor mismo). Cache del service worker bumpeado a `v31`.

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
