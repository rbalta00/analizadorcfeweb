// Lista maestra del lote de 40 inmuebles de gobierno (Puebla, lote ACB) -- pedido
// explicito del usuario, 2026-11-14: "un visor donde se muestre el status de cada
// cotizacion del proyecto 40 inmuebles para saber cuantos se han generado y cuantos
// faltan". Los 40 nunca cambian (es un lote cerrado ya definido desde antes de esta
// app), asi que se dejan como datos fijos aqui en vez de tener que capturarlos a mano
// en la interfaz -- misma fuente que `CONTROL_40_INMUEBLES.csv`/`MANIFIESTO_40.json`
// del motor Python (`cfe-presupuestos/05_TRABAJO_40_INMUEBLES`), copiados tal cual
// para no depender de ese archivo (vive fuera de este repo, en el filesystem local).
//
// `reciboLocalizado`/`verificacionLocalizada`/`estadoDocs`/`pendientes` son el estado
// de RECOPILACION DE DOCUMENTOS (si ya se tiene el recibo/verificacion en sitio del
// inmueble), NO el estado de la cotizacion en esta app -- son cosas independientes:
// un inmueble puede tener sus documentos completos y aun asi no tener ninguna
// cotizacion creada todavia aqui, o viceversa (aunque lo segundo no deberia pasar,
// ya que la cotizacion necesita el recibo para calcularse). Ver datosLote40() en
// lote40Vista.js, que cruza esta lista contra los clientes/proyectos reales guardados
// en localStorage por RPU para saber el avance real.
//
// `tarifaDelRecibo` -- pedido explicito del usuario, 2026-11-14 ("si le puedes poner
// la tarifa ya que esta en su recibo"): extraida leyendo el texto real (nativo, o la
// version OCR cuando el PDF no trae texto) de "01_RECIBO_CFE.pdf" de cada uno de los
// 40 (buscando el campo "TARIFA:" impreso en el propio recibo de CFE) -- no es un
// dato inventado ni copiado de otra sesion. Verificada de 3 formas antes de usarse:
// (1) coincide 40/40 con la clasificacion ya existente en
// AUDITORIA_40_INMUEBLES_2026-11-12/{GDMTH,GDMTO,PDBT}/ (hecha en otra pasada,
// independiente); (2) coincide con los 3 casos ya validados a fondo en sesiones
// anteriores de este proyecto (21 CIS Teziutlan=GDMTO, 26 Museo San Pedro de
// Arte=GDMTH, 36 Casa del Abue Sur=GDMTO); (3) los 3 casos donde el recibo pega
// "TARIFA:PDBTNO..." sin espacio (19, 34, 39) se resolvieron tomando el PREFIJO mas
// largo que coincide con un codigo de tarifa valido, no la cadena completa -- "PDBT"
// es el codigo real, "NO" es el inicio del siguiente campo del recibo ("NO. MEDIDOR").
// Es la tarifa SEGUN EL RECIBO, no necesariamente la que termine usando la cotizacion
// real en esta app (que puede diferir si el recibo cambio de tarifa con el tiempo) --
// por eso datosLote40()/agruparLote40PorTarifa() siguen prefiriendo
// `proyecto.formulario.tarifa` (la realmente capturada/usada para calcular) cuando ya
// existe, y solo caen a este campo como mejor estimado cuando todavia no hay
// cotizacion o no se le ha leido un recibo.
export const LOTE_40_INMUEBLES = [
  { id: '01', tarifaDelRecibo: 'GDMTH', inmueble: 'ANTIGUO EDIFICIO DE LA SECRETARÍA DE FINANZAS', rpu: '220890101496', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '02', tarifaDelRecibo: 'GDMTH', inmueble: 'UNIVERSIDAD TECNOLÓGICA DE IZUCAR DE MATAMOROS', rpu: '241990301376', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '03', tarifaDelRecibo: 'GDMTH', inmueble: 'UNIVERSIDAD TECNOLÓGICA DE TEHUACÁN', rpu: '237110414099', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '04', tarifaDelRecibo: 'GDMTH', inmueble: 'UNIVERSIDAD POLITÉCNICA DE PUEBLA', rpu: '246060802318', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '05', tarifaDelRecibo: 'GDMTO', inmueble: 'SEDIF SAN JAVIER', rpu: '221251252048', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: false, estadoDocs: 'Documentación inicial incompleta', pendientes: 'Falta verificación en sitio' },
  { id: '06', tarifaDelRecibo: 'GDMTO', inmueble: 'INSTITUTO TECNOLÓGICO SUPERIOR DE ACATLÁN', rpu: '245000700315', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '07', tarifaDelRecibo: 'GDMTH', inmueble: 'UNIVERSIDAD TECNOLÓGICA DE XICOTEPEC DE JUÁREZ', rpu: '821050405145', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '08', tarifaDelRecibo: 'GDMTH', inmueble: 'INSTITUTO TECNOLÓGICO SUPERIOR DE ZACAPOAXTLA', rpu: '836050403034', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '09', tarifaDelRecibo: 'GDMTH', inmueble: 'ECO PARQUE METROPOLITANO DE PUEBLA', rpu: '257130401717', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '10', tarifaDelRecibo: 'GDMTO', inmueble: 'INSTITUTO TECNOLÓGICO SUPERIOR DE HUAHUCHINANGO', rpu: '267021200588', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '11', tarifaDelRecibo: 'GDMTO', inmueble: 'INSTITUTO TECNOLÓGICO SUPERIOR DE CIUDAD SERDÁN', rpu: '248070500649', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Requiere completar o actualizar recibo', pendientes: 'En la recopilación solo está la carátula; no se localizó reverso/histórico de este recibo.' },
  { id: '12', tarifaDelRecibo: 'GDMTO', inmueble: 'CENTRO CULTURAL DEPORTIVO MARGARITA MAZA DE JUÁREZ', rpu: '219230305601', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '13', tarifaDelRecibo: 'GDMTO', inmueble: 'INSTITUTO TECNOLÓGICO SUPERIOR DE LIBRES', rpu: '249020401620', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Requiere completar o actualizar recibo', pendientes: 'Recibo antiguo (26 nov a 26 dic 2024). Solicitar recibo actualizado e histórico de 12 meses.' },
  { id: '14', tarifaDelRecibo: 'GDMTO', inmueble: 'INSTITUTO TECNOLÓGICO SUPERIOR DE SAN MARTÍN TEXMELUCAN', rpu: '247040903963', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '15', tarifaDelRecibo: 'GDMTH', inmueble: 'EX-HACIENDA DE CHAUTLA', rpu: '247150102150', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '16', tarifaDelRecibo: 'GDMTO', inmueble: 'CARRETERAS DE CUOTA PUEBLA "TERMINAL MARGARITAS"', rpu: '218150700901', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '17', tarifaDelRecibo: 'GDMTO', inmueble: 'UNIVERSIDAD INTERSERRANA DEL ESTADO DE PUEBLA CHILCHOTLA', rpu: '251090200146', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '18', tarifaDelRecibo: 'GDMTH', inmueble: 'MUSEO DE LA EVOLUCIÓN', rpu: '219151103971', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: false, estadoDocs: 'Documentación inicial incompleta', pendientes: 'Falta verificación en sitio' },
  { id: '19', tarifaDelRecibo: 'PDBT', inmueble: 'COBAEB PLANTEL 26 SAN SALVADOR CHACHAPA', rpu: '217991104461', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '20', tarifaDelRecibo: 'GDMTO', inmueble: 'COBAEB PLANTEL 1 XILOTZINGO', rpu: '220890102441', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '21', tarifaDelRecibo: 'GDMTO', inmueble: 'CIS TEZIUTLÁN', rpu: '836160402513', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '22', tarifaDelRecibo: 'GDMTO', inmueble: 'CASA DEL ADOLESCENTE SEDIF CUAUTLANCINGO', rpu: '257240501652', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: false, estadoDocs: 'Documentación inicial incompleta', pendientes: 'Falta verificación en sitio' },
  { id: '23', tarifaDelRecibo: 'GDMTO', inmueble: 'INSTITUTO TECNOLÓGICO SUPERIOR DE TEPEACA', rpu: '255020900701', rpuAlt: '255020900791', reciboLocalizado: true, verificacionLocalizada: false, estadoDocs: 'Requiere cotejo de identidad o RPU', pendientes: 'Falta verificación en sitio. Diferencia de RPU: base 255020900701; carátula del recibo 255020900791 -- cotejar con el titular.' },
  { id: '24', tarifaDelRecibo: 'PDBT', inmueble: 'DIRECCIÓN GENERAL DE TENENCIA DE LA TIERRA Y POBLACIÓN', rpu: '221931008575', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Requiere cotejo de identidad o RPU', pendientes: 'Recibo localizado por RPU; cotejar domicilio del recibo con la verificación en Av. Reforma 703 antes de cerrar identidad del sitio.' },
  { id: '25', tarifaDelRecibo: 'GDMTH', inmueble: 'SECRETARÍA DE BIENESTAR', rpu: '219080701588', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: false, estadoDocs: 'Documentación inicial incompleta', pendientes: 'Falta verificación en sitio' },
  { id: '26', tarifaDelRecibo: 'GDMTH', inmueble: 'MUSEO SAN PEDRO DE ARTE', rpu: '221990403445', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '27', tarifaDelRecibo: 'GDMTO', inmueble: 'INSTITUTO TECNOLÓGICO SUPERIOR VENUSTIANO CARRANZA', rpu: '893100305351', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '28', tarifaDelRecibo: 'GDMTO', inmueble: 'INSTITUTO TECNOLÓGICO SUPERIOR DE LA SIERRA NEGRA DE AJALPAN', rpu: '238161206802', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '29', tarifaDelRecibo: 'GDMTO', inmueble: 'INSTITUTO TECNOLÓGICO SUPERIOR DE TLATLAUQUITEPEC', rpu: '840130201146', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '30', tarifaDelRecibo: 'GDMTO', inmueble: 'INSTITUTO DE ESTUDIOS SUPERIORES DEL ESTADO', rpu: '237061107380', rpuAlt: null, reciboLocalizado: false, verificacionLocalizada: true, estadoDocs: 'Documentación inicial incompleta', pendientes: 'Falta recibo del RPU esperado. El IEDEP (257080305452) de la recopilación es otra institución y no se asigna a este inmueble.' },
  { id: '31', tarifaDelRecibo: 'GDMTH', inmueble: 'CIS ACATLÁN DE OSORIO', rpu: '245150601030', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '32', tarifaDelRecibo: 'GDMTO', inmueble: 'CIS ATLIXCO', rpu: '240151205381', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '33', tarifaDelRecibo: 'GDMTO', inmueble: 'INSTITUTO TECNOLÓGICO SUPERIOR DE TEPEXI', rpu: '25499020090', rpuAlt: '254990200990', reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Requiere cotejo de identidad o RPU', pendientes: 'Diferencia de RPU: base 25499020090 (11 dígitos); recibo 254990200990. La carátula tiene anotación FOTOVOLTAICO -- confirmar si ya hay sistema existente.' },
  { id: '34', tarifaDelRecibo: 'PDBT', inmueble: 'EDIFICIO DE CARRETERAS DE CUOTA PUEBLA "PASEO BRAVO"', rpu: '221890519420', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '35', tarifaDelRecibo: 'GDMTO', inmueble: 'CIS TLATLAUQUITEPEC', rpu: '840160300963', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '36', tarifaDelRecibo: 'GDMTO', inmueble: 'CASA DEL ABUE SUR SEDIF', rpu: '258260200990', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'El archivo de origen venía nombrado como otro inmueble (24), pero su contenido dice SEDIF CASA DEL ABUE II y coincide con este RPU -- agrupado por contenido, no por nombre de archivo.' },
  { id: '37', tarifaDelRecibo: 'PDBT', inmueble: 'CIS CHOLULA', rpu: '216000301062', rpuAlt: '257170900678', reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Requiere cotejo de identidad o RPU', pendientes: 'Diferencia de RPU: base 216000301062; recibo 257170900678. Cotejar también dirección del recibo con la verificación -- asignación provisional.' },
  { id: '38', tarifaDelRecibo: 'GDMTO', inmueble: 'INSTITUTO JAIME TORRES BODET', rpu: '257090401018', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Requiere completar o actualizar recibo', pendientes: 'Solo una página del recibo; no incluye reverso/histórico anual. No confundir con el archivo de Casa del Abue (ver inmueble 36).' },
  { id: '39', tarifaDelRecibo: 'PDBT', inmueble: 'COLEGIO PUEBLA A.C.', rpu: '221890413427', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
  { id: '40', tarifaDelRecibo: 'GDMTH', inmueble: 'UNIVERSIDAD INTERSERRANA DEL ESTADO DE PUEBLA AHUACATLÁN', rpu: '234091001617', rpuAlt: null, reciboLocalizado: true, verificacionLocalizada: true, estadoDocs: 'Recibo y verificación localizados', pendientes: 'Validar histórico, fechas, consumos y contenido técnico; documentos localizados no equivalen a proyecto completo.' },
];

// Compara RPUs ignorando espacios/guiones/ceros a la izquierda -- el usuario puede
// haber capturado el RPU con formato distinto al de la lista maestra (ej. con
// espacios, o un cero inicial que CFE a veces omite/agrega entre recibos del mismo
// sitio).
export function normalizarRpu(s) {
  const limpio = String(s || '').replace(/\D+/g, '');
  return limpio.replace(/^0+/, '') || limpio;
}
