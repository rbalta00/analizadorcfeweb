# Diagnóstico de Problemas — Cotizador FV CFE Web

## Problemas Críticos Identificados (2026-11-12)

### 1. **Pérdida de Textos Editados al Aplicar Machotes** ⚠️ CRÍTICO
**Archivo**: `js/clientes.js` línea 493-521
**Función**: `aplicarMachoteAProyecto()`
**Problema**: Usa `PATRON_POSIBLE_NUMERO_CALCULADO` (línea 532) para eliminar textos que contienen números.

```javascript
const PATRON_POSIBLE_NUMERO_CALCULADO = /\$\s?[\d,]+(\.\d+)?|\d+(\.\d+)?\s?%|...
if (typeof texto === 'string' && PATRON_POSIBLE_NUMERO_CALCULADO.test(texto)) continue;
```

**Impacto**: Cualquier texto editado que mencione números (como "Se instalarán 50 paneles de 400 W") se descarta automáticamente. Esto destruye redacción válida del usuario.

**Solución**: Remover este filtro. La heurística `detectarTextosConNumerosSospechosos()` (línea 533) está diseñada como ADVERTENCIA posterior, no como filtro destructivo.

---

### 2. **Plantillas por Tarifa Guardan Incompleto** ⚠️ CRÍTICO  
**Archivo**: `js/textosGlobales.js` línea 72-76
**Función**: `guardarPlantillaTarifa()`
**Problema**: Solo guarda `textosEditados`, pero no guarda:
- `textosOcultos` (qué párrafos están apagados)
- `seccionesExcluidas` (qué secciones apagar)
- `graficosExcluidos` (qué gráficas apagar)
- `calculosActivos` (qué bloques "Cómo se calculó" apagar)
- `tablaColumnasOcultas` / `tablaFilasOcultas`
- `pasos` (pasos de entrega configurados)

**Impacto**: Al reutilizar un machote, los apagados y configuración no se reproducen. Solo se copia la redacción.

**Solución**: `guardarPlantillaTarifa()` debe guardar un snapshot COMPLETO igual a como está en `crearProyecto()` (línea 185-254):
```javascript
const CAMPOS_EDITORIAL_MACHOTE = [
  'textosEditados', 'textosOcultos', 'seccionesExcluidas', 'graficosExcluidos',
  'calculosActivos', 'tablaColumnasOcultas', 'tablaFilasOcultas', 'pasos', 'pasoActivo'
];
```

---

### 3. **onGuardarTextoGlobal Potencialmente Contamina Estudios** ⚠️ DISEÑO
**Archivo**: `textosGlobales.js` y `app.js`  
**Observación**: `guardarTextoGlobal()` es una acción consciente en app.js que el usuario activa explícitamente. NO es un problema automático.

**Contexto**: Existe una jerarquía de prioridades (como está documentado):
1. Override de proyecto (`proyecto.textosEditados`)
2. Plantilla por tarifa (`TARIFAS_PLANTILLA[tarifa]`)
3. Global para todas tarifas (`leerTextosGlobales()`)
4. Texto fijo en código

Esto es correcto. El problema es que algunos textos se guardaban como global cuando deberían guardar como proyecto.

---

### 4. **Cambio de Terminología Incompleto** ⚠️ MANTENIBILIDAD  
El usuario solicitó cambiar "cotización/cotizador" por "estudio/analizador" en:
- Títulos, botones, etiquetas
- Mensajes y avisos
- Nombres de pasos ("Análisis completo")
- Documentos PDF
- Archivos generados
- Identidades HTML/CSS

**Archivos a revisar**:
- `index.html` (UI principal)
- `js/app.js` (mensajes, etiquetas)
- `js/secciones.js` (títulos de secciones y pasos)
- `js/propuesta.js` (encabezados PDF)
- `js/clientes.js` (nombres de proyectos/pasos)
- `manifest.json` (descripción PWA)
- CSS clases si las hay

---

## Cambios Necesarios

### Corrección 1: Remover Filtro Destructivo en aplicarMachoteAProyecto()
```javascript
// ANTES (línea 497-505):
if (campo === 'textosEditados') {
  const limpio = {};
  for (const [id, texto] of Object.entries(origenProyecto.textosEditados || {})) {
    if (typeof texto === 'string' && PATRON_POSIBLE_NUMERO_CALCULADO.test(texto)) continue;
    limpio[id] = texto;
  }
  proyecto.textosEditados = limpio;
  continue;
}

// DESPUÉS:
if (campo === 'textosEditados') {
  proyecto.textosEditados = JSON.parse(JSON.stringify(origenProyecto.textosEditados || {}));
  continue;
}
```

### Corrección 2: Expandir Campos Guardados en Plantilla por Tarifa
```javascript
// ANTES (textosGlobales.js línea 72-76):
export function guardarPlantillaTarifa(tarifa, mapaTextos) {
  const todas = leerTodasLasPlantillas();
  todas[tarifa] = { ...mapaTextos };
  guardarTodasLasPlantillas(todas);
}

// DESPUÉS:
export function guardarPlantillaTarifa(tarifa, proyectoSnapshot) {
  const todas = leerTodasLasPlantillas();
  todas[tarifa] = {
    textosEditados: proyectoSnapshot.textosEditados || {},
    textosOcultos: proyectoSnapshot.textosOcultos || {},
    seccionesExcluidas: [...(proyectoSnapshot.seccionesExcluidas || [])],
    graficosExcluidos: [...(proyectoSnapshot.graficosExcluidos || [])],
    calculosActivos: [...(proyectoSnapshot.calculosActivos || [])],
    tablaColumnasOcultas: JSON.parse(JSON.stringify(proyectoSnapshot.tablaColumnasOcultas || {})),
    tablaFilasOcultas: JSON.parse(JSON.stringify(proyectoSnapshot.tablaFilasOcultas || {})),
    pasos: JSON.parse(JSON.stringify(proyectoSnapshot.pasos || {})),
    pasoActivo: proyectoSnapshot.pasoActivo || 'completo',
  };
  guardarTodasLasPlantillas(todas);
}
```

### Corrección 3: Aplicar Plantilla por Tarifa COMPLETA
```javascript
// En leerPlantillaTarifa() o donde se aplique, copiar TODOS los campos:
export function aplicarPlantillaTarifa(proyecto, tarifa) {
  const plantilla = leerPlantillaTarifa(tarifa);
  if (!plantilla || !Object.keys(plantilla).length) return;
  
  proyecto.textosEditados = { ...(plantilla.textosEditados || {}) };
  proyecto.textosOcultos = { ...(plantilla.textosOcultos || {}) };
  proyecto.seccionesExcluidas = [...(plantilla.seccionesExcluidas || [])];
  proyecto.graficosExcluidos = [...(plantilla.graficosExcluidos || [])];
  proyecto.calculosActivos = [...(plantilla.calculosActivos || [])];
  proyecto.tablaColumnasOcultas = JSON.parse(JSON.stringify(plantilla.tablaColumnasOcultas || {}));
  proyecto.tablaFilasOcultas = JSON.parse(JSON.stringify(plantilla.tablaFilasOcultas || {}));
  proyecto.pasos = JSON.parse(JSON.stringify(plantilla.pasos || {}));
  proyecto.pasoActivo = plantilla.pasoActivo || 'completo';
}
```

---

## Verificación de Impacto

### Estudios Existentes
- Los estudios guardados NO deben eliminarse
- Las ediciones guardadas deberán recuperarse/verificarse manualmente tras las correcciones
- La estructura de almacenamiento no cambia, solo la lógica de aplicación

### Nuevo Comportamiento
1. **Guardar Machote**: Captura el estado COMPLETO incluyendo apagados y configuración de pasos
2. **Aplicar Machote**: Restaura FIELMENTE todo el estado, incluyendo apagados
3. **Editar Redacción**: Los textos con números ya no se descartan
4. **Cambiar de Paso**: La configuración se mantiene entre pasos

---

## Plan de Trabajo

1. ✅ Diagnóstico (este documento)
2. ⏳ Corrección 1: Remover filtro destructivo en aplicarMachoteAProyecto()
3. ⏳ Corrección 2: Expandir guardarPlantillaTarifa() y aplicarla completamente
4. ⏳ Corrección 3: Cambiar terminología "cotización" → "estudio"
5. ⏳ Pruebas end-to-end
6. ⏳ Crear nuevo repo "analizadorCFE"
7. ⏳ Subir a Vercel como "analizadorcfe"

---

**Última actualización**: 2026-11-12  
**Estado**: Diagnóstico completo, listo para correcciones
