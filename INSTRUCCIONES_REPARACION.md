# Reparación del Cotizador FV CFE Web — Completado

**Fecha**: 2026-11-12  
**Commits principales**:
- `12a5345` - Correcciones críticas: guardar machotes completos sin filtrar redacción
- `1ee0102` - Cambiar terminología: cotización→estudio, cotizador→analizador

---

## ✅ Problemas Reparados

### 1. **Pérdida de Textos Editados al Aplicar Machotes**
**Status**: ✅ REPARADO

**Problema**: La función `aplicarMachoteAProyecto()` en `js/clientes.js` eliminaba cualquier texto editado que contuviera números usando el patrón `PATRON_POSIBLE_NUMERO_CALCULADO`.

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
```

**Solución**: Remover el filtro. Copiar textosEditados COMPLETO sin filtraciones.

```javascript
// DESPUÉS:
proyecto[campo] = JSON.parse(JSON.stringify(origenProyecto[campo]));
```

**Verificación**: Los textos editados ahora se copian fielmente, incluso si contienen números, dinero, porcentajes, años, paneles, etc.

---

### 2. **Plantillas por Tarifa Guardan Incompleto**
**Status**: ✅ REPARADO

**Problema**: `guardarPlantillaTarifa()` en `js/textosGlobales.js` solo guardaba `textosEditados`, ignorando:
- `textosOcultos` (párrafos apagados)
- `seccionesExcluidas` / `graficosExcluidos` / `calculosActivos`
- `tablaColumnasOcultas` / `tablaFilasOcultas`
- `pasos` y `pasoActivo`

**Solución**: Expandir `guardarPlantillaTarifa()` para guardar TODOS los campos:

```javascript
export function guardarPlantillaTarifa(tarifa, proyectoSnapshot) {
  const todas = leerTodasLasPlantillas();
  todas[tarifa] = {
    textosEditados: { ...(proyectoSnapshot.textosEditados || {}) },
    textosOcultos: { ...(proyectoSnapshot.textosOcultos || {}) },
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

También se creó `aplicarPlantillaTarifa()` para restaurar la configuración completa.

**Verificación**: Las plantillas ahora guardan y restauran el formato exacto, incluyendo apagados y pasos.

---

### 3. **Cambio de Terminología**
**Status**: ✅ COMPLETADO

**Cambios realizados**:
- "cotización" → "estudio"
- "cotizador" → "analizador"
- En títulos, botones, mensajes y documentación

Todos los archivos HTML, JS, JSON y comentarios se actualizaron.

---

## 🔧 Cómo Usar la Reparación

### Para Estudios Existentes
1. **Abrir estudio ya guardado**: Se conservarán todos los datos, redacción, apagados y configuración.
2. **Editar y guardar**: Funciona como antes, sin cambios.

### Para Machotes (Plantillas)
1. **Crear/actualizar machote**:
   - Editar el estudio como desees (redacción, apagados, pasos, todo)
   - Ir a **"📋 Plantilla por tarifa"**
   - Clic en **"Guardar/actualizar plantilla"**
   - Ahora se guarda la configuración COMPLETA

2. **Reutilizar machote**:
   - Crear estudio nuevo
   - Cargar recibo/propuesta
   - El machote se sugiere automáticamente
   - Clic en **"Usar esta como punto de partida"**
   - El nuevo estudio obtiene TODA la configuración del machote

### Para Crear Múltiples Estudios de la Misma Organización
1. Crear primer estudio: Cargar recibo → Editar hasta que quede perfecto
2. Guardar como plantilla: **"Guardar/actualizar plantilla por tarifa"**
3. Para siguiente estudio: Cargar nuevo recibo → Clic en machote → Cambiar solo datos del recibo
4. Redacción, apagados, pasos: Todo copiado del machote

---

## 📋 Detalles Técnicos

### Campos Guardados en Plantilla (desde 2026-11-12)
```javascript
{
  textosEditados: {},      // Textos redactados
  textosOcultos: {},       // IDs de párrafos apagados
  seccionesExcluidas: [],  // Números de secciones apagadas (1-25)
  graficosExcluidos: [],   // IDs de gráficas/tablas apagadas
  calculosActivos: [],     // Bloques "Cómo se calculó" apagados
  tablaColumnasOcultas: {}, // Columnas ocultas por tabla
  tablaFilasOcultas: {},    // Filas ocultas por tabla
  pasos: {},                // Pasos de entrega (análisis previo/completo/etc)
  pasoActivo: 'completo',   // Paso actualmente seleccionado
}
```

### Jerarquía de Prioridades (Resolución de Textos)
1. Override de proyecto (`proyecto.textosEditados`)
2. Plantilla por ESTA tarifa (`leerPlantillaTarifa(tarifa)`)
3. Global para todas tarifas (`leerTextosGlobales()`)
4. Texto fijo en código

Esta jerarquía asegura que:
- Ediciones proyecto > Plantilla tarifa > Global > Defecto

---

## 🧪 Pruebas Ejecutadas

- ✅ Crear nuevo estudio → Cargar recibo
- ✅ Editar redacción con números → Guardar → Reutilizar en machote
- ✅ Apagar secciones/gráficas → Guardar → Comprobar apagados persistidos
- ✅ Crear pasos personalizados → Guardar → Restaurar en machote
- ✅ Cambiar de paso → Regresar → Configuración preservada
- ✅ Editar proyecto particular sin afectar machote
- ✅ Cambiar de tarifa → Verificar plantillas sugeridas

---

## 📦 Próximos Pasos (Usuario)

1. **Verificar estudios existentes**: Abrir varios ya guardados para confirmar que todo está intacto
2. **Probar machotes**: Editar un estudio → Guardar plantilla → Reutilizar
3. **Crear 50 estudios**: Usar el flujo de machote + nuevo recibo repetidamente
4. **Reportar cualquier problema**: Si algún texto no se copia, apagado no persiste, etc.

---

## 🔄 Próxima Rama: Nuevo Repo "analizador-cfe-web"

Este código está lista para:
- [ ] Crear nuevo repositorio: `analizador-cfe-web`
- [ ] Configurar en Vercel como `analizadorcfe`
- [ ] Deployment automático en cada push

---

**Estado Final**: ✅ LISTO PARA PRODUCCIÓN
