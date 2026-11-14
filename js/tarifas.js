// Etiquetas/orden compartido de las 6 tarifas CFE que soporta el motor -- extraido de
// app.js (donde se agrego originalmente para el modulo "Cotizador por machote",
// 2026-11-14) a su propio archivo para que tambien lo use lote40Vista.js (visor del
// lote de 40 inmuebles, pagina aparte) sin duplicar la lista y arriesgar que las dos
// copias se desincronicen con el tiempo.
export const ETIQUETAS_TARIFA = {
  GDMTO: 'GDMTO (media tensión, con demanda)',
  GDMTH: 'GDMTH (media tensión, con demanda, por horario)',
  GDBT: 'GDBT (baja tensión, con demanda)',
  PDBT: 'PDBT (baja tensión, sin demanda)',
  '01': '01 (doméstica)',
  DAC: 'DAC (doméstica de alto consumo)',
};
export const ORDEN_TARIFAS = ['GDMTO', 'GDMTH', 'GDBT', 'PDBT', '01', 'DAC'];
