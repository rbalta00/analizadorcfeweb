// Port 1:1 de app/datos/comercial.json -- condiciones comerciales REALES del emisor
// (GESTORIA Y PROYECTOS SOELRB), compartidas entre secciones.js (pantalla) y
// propuesta.js (PDF) para que ambos muestren exactamente lo mismo. No inventar
// condiciones aqui: si ese JSON cambia del lado Python, este objeto debe actualizarse igual.
export const COMERCIAL = {
  pagos: [
    { porcentaje: 0.60, hito: 'Anticipo al formalizar contrato y validar precio/equipos' },
    { porcentaje: 0.30, hito: 'Entrega de equipos en sitio, contra inventario' },
    { porcentaje: 0.10, hito: 'Terminación de instalación y pruebas documentadas' },
  ],
  naturalezaCondiciones: 'Condiciones comerciales sugeridas para negociación; no confirmadas por el emisor.',
  cronograma: [
    ['Levantamiento y validación', '3 a 5 días hábiles desde acceso a sitio y recepción de información'],
    ['Ingeniería y compra', '5 a 10 días hábiles después de validación técnica, contrato y anticipo'],
    ['Suministro de equipos', 'Sujeto a existencias y confirmación escrita del proveedor'],
    ['Instalación y pruebas', '5 a 10 días hábiles desde recepción de equipos y liberación del sitio'],
    ['Gestión de interconexión', 'Se prepara expediente; fechas de respuesta, medidor y autorización dependen de CFE'],
  ],
  garantiaInstalacion: 'La garantía de instalación se documentará con plazo, cobertura y exclusiones en el ' +
    'contrato. El emisor no ha confirmado aún su plazo; esta propuesta no ofrece un número de años.',
  garantiaEquipos: 'Aplicará la póliza del fabricante del modelo efectivamente suministrado, con sus ' +
    'requisitos de registro y exclusiones. Se entregarán fichas, números de serie y pólizas. No se asignan ' +
    'plazos de garantía sin modelo y documentación confirmados.',
};
