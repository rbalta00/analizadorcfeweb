# Próximo Paso: Crear Repositorio en GitHub y Vercel

El código está 100% listo. Solo falta:

1. ✅ Correcciones completadas (en rama local `master`)
2. ✅ Cambio de terminología completado  
3. ⏳ Crear repositorio GitHub `analizador-cfe-web` (USER ACTION NEEDED)
4. ⏳ Subir a Vercel como `analizadorcfe` (USER ACTION NEEDED)

---

## Paso 1: Crear Repositorio en GitHub

**URL a seguir**: https://github.com/new

**Configuración**:
- Repository name: **`analizador-cfe-web`**
- Description: "Analizador de sistemas fotovoltaicos con tarifas CFE — herramienta para diseño y presupuestos"
- Public/Private: **Public** (o Private, según tu preferencia)
- Initialize: **NO** (no marques nada - el repo estará vacío)

**Crear repositorio**

---

## Paso 2: Push del Código Local

Una vez creado el repositorio en GitHub, en tu terminal:

```bash
cd C:\cotizador-fv-cfe-web
git push -u origin master
```

Esto subirá todos los commits:
- `12a5345` - Correcciones críticas
- `1ee0102` - Cambio de terminología
- `4ba06bc` - Documentación

---

## Paso 3: Configurar Vercel

### Opción A: Desde Dashboard de Vercel (Recomendado)

1. Ir a https://vercel.com/dashboard
2. Clic en **"Add New..." → "Project"**
3. **Import Git Repository**
4. Buscar `rbalta00/analizador-cfe-web`
5. Importar

**Configuración del Proyecto**:
- Framework: **Other**
- Build Command: (dejar vacío)
- Output Directory: (dejar vacío)
- Environment Variables: (opcional por ahora)
- Deploy Button: Clic en **"Deploy"**

### Opción B: Desde CLI (si ya tienes Vercel CLI instalado)

```bash
cd C:\cotizador-fv-cfe-web
vercel --prod
```

Seguir las preguntas interactivas.

---

## Paso 4: Cambiar Dominio en Vercel

Vercel generará un dominio automático (ej. `analizador-cfe-web-seven.vercel.app`).

Para usar **`analizadorcfe.vercel.app`** (o un dominio personalizado):

1. Ir a https://vercel.com/dashboard
2. Seleccionar proyecto `analizador-cfe-web`
3. Settings → Domains
4. Agregar dominio deseado

---

## Verificación Post-Deployment

Una vez en Vercel, verificar:

1. ✅ Página carga correctamente
2. ✅ LocalStorage funciona (crear cliente, guardar estudio)
3. ✅ PWA se puede instalar (botón "Install")
4. ✅ Terminología actualizada (ver títulos, botones)
5. ✅ PDF se genera sin errores
6. ✅ Machotes funcionan (guardar → reutilizar)

---

## URLs Importantes

- **GitHub Repository**: https://github.com/rbalta00/analizador-cfe-web
- **Vercel Project URL**: (será `https://analizadorcfe.vercel.app` si lo configuras así)
- **Original (Cotizador)**: https://github.com/rbalta00/cotizador-fv-cfe-web (mantener para referencia)

---

## Cambios en git local

El repositorio local ya está configurado con:
```
remote origin: https://github.com/rbalta00/analizador-cfe-web.git
branch: master
commits: 3 (12a5345, 1ee0102, 4ba06bc)
```

Solo necesitas:
1. Crear el repo en GitHub (vacío)
2. Ejecutar `git push -u origin master`

---

## Notas Adicionales

### Si Quieres Mantener Ambos Repositorios

Puedes:
- Mantener `cotizador-fv-cfe-web` como reference/backup
- Usar `analizador-cfe-web` como la versión en producción
- No hay conflicto entre ambos

### Verificación de Correcciones en Producción

Después de desplegar a Vercel, puedes verificar:
- Abrir https://analizadorcfe.vercel.app
- Crear cliente/estudio
- Guardar plantilla → Verificar que se guardan TODOS los campos (apagados, pasos, etc)
- Reutilizar plantilla → Verificar redacción con números se copia correctamente

---

**Estado**: ⏳ Esperando que crees el repositorio en GitHub  
**Próximo paso usuario**: Crear repo `analizador-cfe-web` en https://github.com/new
