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
- [ ] Fotografias de condiciones generales del inmueble (sombras, cubierta, etc.,
      mas alla de la foto del sembrado) -- sigue sin construirse, declarado como
      pendiente en la propia seccion 6 ("No se capturan fotografías en esta versión").
- [ ] Conectar el texto editado de las 21 secciones tambien al PDF exportado (hoy
      solo se ve en pantalla, ver nota arriba).
- [ ] Simulador de financiamiento, editor de precios de materiales y
      deduccion ISR (funcionalidades de `cotizador_app.py` no portadas a esta
      version -- fuera del alcance de "las 21 secciones", deliberadamente no
      tocadas esta sesion).
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
