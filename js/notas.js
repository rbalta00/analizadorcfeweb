// Port 1:1 de app/diagnostico.py (generar_notas): notas aclaratorias de que tan
// confiable es lo leido del recibo y que falta pedir al cliente antes de que esta
// cotizacion se pueda volver una propuesta definitiva. No bloquea el calculo -- es un
// recordatorio de pendientes, para no entregarla como si fuera una oferta firme.
const ETIQUETAS_CAMPOS = {
  tarifa: 'tarifa', no_servicio: 'número de servicio', periodo_dias: 'fechas del período',
  periodo_kwh: 'kWh del período', suministro: 'Suministro', distribucion: 'Distribución',
  transmision: 'Transmisión', cenace: 'CENACE', energia: 'Energía', capacidad: 'Capacidad',
  scnmem: 'SCnMEM', dap: 'DAP/alumbrado público', demanda_contratada_kw: 'demanda contratada',
  no_medidor: 'número de medidor', multiplicador: 'multiplicador',
};

export function generarNotas(leido, r, esDomestica) {
  const notas = [];
  // Hallazgo 7, auditoria 2026-11-06: el motor no asumia ningun cargo fijo de CFE para
  // tarifas domesticas por default (ver motor.js construirInvoiceDomestica) -- fuentes
  // periodisticas (no confirmadas con el acuerdo oficial) reportan que 01/DAC si suelen
  // traer uno. Si no se capturo nada (campo "Cargo fijo de CFE" en 0), se avisa para que
  // se revise el recibo real en vez de asumir que no aplica.
  if (esDomestica && !(r && r.cargoFijoDomestica)) {
    notas.push('Revisar si el recibo trae impreso un "Cargo Fijo" de CFE (distinto del DAP municipal) -- si lo ' +
      'trae, capturarlo en el campo "Cargo fijo de CFE del período" del formulario; no se asume ningún monto por ' +
      'default porque no hay una fuente oficial confirmada del monto vigente para esta auditoría.');
  }
  if (!leido) {
    notas.push('No se subió ningún recibo: todos los datos se capturaron a mano. Pedir al cliente una ' +
      'foto o PDF del recibo real antes de la propuesta definitiva, para verificar que lo capturado ' +
      'coincide con lo que CFE factura.');
    return notas;
  }

  if (leido.reconciliacion_advertencia) {
    notas.push('⚠ REVISAR ANTES DE CONTINUAR: ' + leido.reconciliacion_advertencia);
  }

  if (leido.historial_advertencia_huecos) {
    notas.push('⚠ ' + leido.historial_advertencia_huecos);
  }

  if (leido.uso_ocr) {
    notas.push('El archivo no traía texto aprovechable (era foto/escaneo, o el PDF tiene la fuente ' +
      'codificada): se leyó por OCR. El OCR puede confundir números o desalinear columnas -- revisar a ' +
      'mano cada cifra contra el recibo antes de confiar en el resultado. Si se puede, pedir al cliente ' +
      'el PDF original de CFE (no una foto) para una lectura más limpia.');
  }

  const faltantes = leido.campos_no_encontrados || [];
  if (faltantes.length) {
    const legibles = faltantes.map(f => ETIQUETAS_CAMPOS[f] || f);
    notas.push('No se detectaron solos y se completaron a mano (confirmar contra el recibo real): ' +
      legibles.join(', ') + '.');
  }

  if (!esDomestica && leido.rate_kw_detectado == null) {
    notas.push('No se pudo detectar automáticamente la columna "$/kW" de Distribución/Capacidad (la ' +
      'que decide si esos cargos bajan con los paneles; formato de recibo no reconocido). Se usó lo que ' +
      'la persona indicó a mano en el formulario. Si hay cualquier duda de la tarifa real, pedir al ' +
      'cliente una foto clara de esa columna del recibo.');
  } else if (leido.rate_kw_advertencia) {
    notas.push('Posible contradicción en la detección automática de demanda contratada: ' + leido.rate_kw_advertencia);
  } else if (leido.rate_kw_via_ocr) {
    notas.push('La columna "$/kW" de Distribución/Capacidad se detectó vía OCR (no del texto nativo del ' +
      'PDF). Es el dato más importante del cálculo -- conviene confirmarlo viendo el recibo antes de ' +
      'presentar una oferta firme, aunque no se detectó ninguna contradicción con otros datos del mismo recibo.');
  }

  if (leido.tarifa == null) {
    notas.push('No se identificó la tarifa automáticamente en el recibo. Confirmar con el cliente o ' +
      'visualmente (busca la palabra "TARIFA:" impresa en el recibo) antes de continuar.');
  }

  const periodoDias = leido.periodo_dias;
  if (periodoDias != null && (periodoDias < 20 || periodoDias > 65)) {
    notas.push(`El período detectado es de ${periodoDias} días, fuera del rango típico (28-32 días ` +
      'mensual, 58-62 bimestral). Revisar las fechas del período en el recibo.');
  }

  if (!leido.no_servicio) {
    notas.push('No se identificó el número de servicio. Pedirlo al cliente (aparece en la parte ' +
      'superior del recibo) para poder dar seguimiento y verificar identidad del inmueble.');
  }

  // Corregido (auditoria 2026-11-06, hallazgo 8): antes esto leia `leido.historial`/
  // `leido.historial_meses_cubiertos` -- el historial que trajo el OCR -- sin importar
  // si el admin lo habia corregido o capturado a mano (historialManual). resultado.js
  // ya calcula `r.basisConsumo`/`r.consumosMensualesUsados` reflejando la fuente
  // REALMENTE usada para dimensionar el sistema -- usar esos en vez de releer `leido`
  // directamente, para que la nota nunca describa una fuente distinta a la que de
  // verdad se usó en el cálculo.
  const periodosUsados = (r.consumosMensualesUsados || []).length;
  if (periodosUsados >= 6) {
    notas.push(`El consumo anual se calculó con ${r.basisConsumo}, no con una extrapolación de un solo mes.`);
  } else if (periodosUsados > 1) {
    notas.push(`El consumo anual se calculó con ${r.basisConsumo} (menos de 6 períodos). Pedir al cliente su ` +
      'historial de consumo de los últimos 12 meses (app/portal de CFE) para una base más confiable, sobre ' +
      'todo si el consumo varía mucho entre meses.');
  } else {
    notas.push(`Esta estudio se basa en una ${r.basisConsumo}: pedir al cliente su historial de los ` +
      'últimos 12 meses (lo puede descargar de la app/portal de CFE) para una base más confiable, sobre todo ' +
      'si el consumo varía mucho entre meses (clima, temporada, uso del inmueble).');
  }

  notas.push('Pendiente de levantamiento en sitio antes de una oferta firme: área útil real del ' +
    'techo/azotea (sombras, orientación, estructura), tensión y número de fases del servicio, estado ' +
    'del tablero y del interruptor principal, y distancia real para el cableado AC/DC. Nada de esto se ' +
    'puede confirmar solo con el recibo.');

  if (!esDomestica) {
    const demandaKw = leido.demanda_contratada_kw;
    if (demandaKw && r.kwp && demandaKw < r.kwp * 1.2) {
      notas.push(`La demanda contratada (${demandaKw.toFixed(0)} kW) es cercana a la potencia del ` +
        `sistema propuesto (${r.kwp.toFixed(2)} kWp). Verificar con CFE si el contrato de ` +
        'interconexión necesita ajustarse para este tamaño de sistema.');
    }
  }

  notas.push('Precios de equipos (módulo, inversor, estructura) son de lista y pueden estar vencidos; ' +
    'confirmar vigencia y disponibilidad con el proveedor antes de presentar un precio firme al cliente.');

  return notas;
}

// Checklist FIJO, independiente de que el recibo se haya leído completo o no -- pedido
// explícito del usuario: esta estudio se arma unicamente con la informacion del
// recibo de CFE, asi que esto SIEMPRE hace falta confirmar antes de que se pueda
// convertir en un presupuesto real de ese servicio (a diferencia de generarNotas(),
// que solo avisa de problemas puntuales de ESTE recibo en particular).
export const REQUISITOS_PRESUPUESTO_REAL = [
  'Levantamiento físico en el sitio: área real disponible de techo/azotea, orientación, sombras, obstáculos y estado de la estructura -- nada de esto se puede confirmar solo con el recibo.',
  'Tensión y número de fases reales del servicio (el recibo no siempre lo trae impreso, y no se debe adivinar por el número de hilos).',
  'Estado del tablero eléctrico, el interruptor principal y el punto de conexión disponible para el sistema.',
  'Distancia real de cableado entre el inversor/paneles y el punto de conexión -- afecta el costo de cable AC/DC presupuestado, que aquí es una provisión genérica.',
  'Confirmación de precios vigentes con el proveedor para módulo, inversor y estructura -- los precios usados aquí son de lista y pueden estar vencidos.',
  'Historial real de consumo de los últimos 12 meses, si este cálculo se basó en un solo período extrapolado.',
  'Confirmar con CFE la tarifa, la demanda contratada y la clasificación de cargos si hay cualquier duda sobre lo leído del recibo.',
  'Trámite y tiempos reales de interconexión (medición neta) con CFE para este servicio específico.',
  'Verificar que el titular y el domicilio del recibo correspondan exactamente al inmueble que se va a intervenir.',
  'Cualquier obra adicional no incluida en este presupuesto (refuerzo estructural, cambio de transformador, impermeabilización, rehabilitación eléctrica ajena al sistema).',
];
