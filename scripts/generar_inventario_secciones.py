#!/usr/bin/env python3
# Genera INVENTARIO_SECCIONES.md leyendo js/secciones.js con expresiones regulares
# (no abre ningun navegador) -- correr cada vez que se agregue/cambie una seccion,
# tabla o grafica, para que el inventario no se quede desactualizado a mano.
#
# Uso: python scripts/generar_inventario_secciones.py   (desde la raiz de web/)

import re
import json
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SECCIONES_JS = os.path.join(RAIZ, 'js', 'secciones.js')
SALIDA_MD = os.path.join(RAIZ, 'INVENTARIO_SECCIONES.md')


def extraer_secciones(texto):
    lineas = texto.split('\n')
    starts = []
    for i, l in enumerate(lineas):
        m = re.match(r'^function (s\d\d)\(', l)
        if m:
            starts.append((i, m.group(1)))
    starts.append((len(lineas), None))

    secciones = []
    for idx in range(len(starts) - 1):
        start_line, name = starts[idx]
        end_line = starts[idx + 1][0]
        bloque = '\n'.join(lineas[start_line:end_line])
        m = re.search(r"crearSeccion\((\d+),\s*[`'\"](.*?)[`'\"],\s*[`'\"](.*?)[`'\"],", bloque)
        if not m:
            continue
        numero = int(m.group(1))
        titulo = m.group(2)
        pregunta = m.group(3)
        graficos = re.findall(r"graficoToggle\(\s*[`'\"]([a-zA-Z0-9_-]+)[`'\"],\s*[`'\"](.*?)[`'\"],", bloque)
        graficos_unicos = list(dict.fromkeys(graficos))
        tablas = sorted(set(re.findall(r"id:\s*[`'\"]([a-zA-Z0-9_-]+)[`'\"]", bloque)))
        n_editables = len(re.findall(
            r'\b(subtitulo|subtituloChico|textoEditable|campoEditableConId|avisoCream|avisoRojo|textoChico)\(',
            bloque))
        tiene_calculo = 'bloqueCalculo(' in bloque
        tiene_tarjetas = 'tarjetas(' in bloque
        secciones.append({
            'numero': numero, 'func': name, 'titulo': titulo, 'pregunta': pregunta,
            'editables_aprox': n_editables, 'tiene_bloque_calculo': tiene_calculo,
            'tiene_tarjetas': tiene_tarjetas, 'graficos_tablas_toggle': graficos_unicos,
            'tablas_con_id': tablas,
        })
    secciones.sort(key=lambda s: s['numero'])
    return secciones


def construir_markdown(secciones):
    L = []
    L.append('# Inventario de secciones, textos, tablas y graficas -- cotizador-fv-cfe-web')
    L.append('')
    L.append('Generado automaticamente leyendo `js/secciones.js` (no a mano) -- 2026-11-09.')
    L.append('Sirve para saber, de un vistazo, que contenido tiene cada una de las 25 secciones')
    L.append('de la cotizacion, y que tan cubierto esta por el generador de PDF desde pantalla')
    L.append('(`generarPdfCompletaDesdeVista` en `propuesta.js`, que usa `dibujarSeccionGenerica`/')
    L.append('`recorrer()` en `propuestaDom.js`).')
    L.append('')
    L.append('**Como se mantiene actualizado**: correr `python scripts/generar_inventario_secciones.py`')
    L.append('(lee `js/secciones.js` con expresiones regulares, no requiere abrir el navegador) cada')
    L.append('vez que se agregue/cambie una seccion, tabla o grafica -- vuelve a escribir este archivo')
    L.append('entero. Si una seccion nueva no aparece aqui despues de correrlo, revisar que siga el')
    L.append('mismo patron `crearSeccion(numero, \'titulo\', \'pregunta\', r, onToggle)` dentro de una')
    L.append('funcion `function sNN(r, _leido, onToggle) { ... }`.')
    L.append('')
    L.append('| # | Titulo | Parrafos editables (aprox.) | "Como se calculo" | Tarjetas | Graficas/tablas con toggle propio |')
    L.append('|---|---|---|---|---|---|')
    for s in secciones:
        graficos = '<br>'.join('`%s`' % gid for gid, _ in s['graficos_tablas_toggle']) or '—'
        L.append('| %d | %s | %d | %s | %s | %s |' % (
            s['numero'], s['titulo'], s['editables_aprox'],
            'si' if s['tiene_bloque_calculo'] else 'no',
            'si' if s['tiene_tarjetas'] else 'no', graficos))
    L.append('')
    L.append('## Detalle por seccion')
    L.append('')
    for s in secciones:
        L.append('### Seccion %d: %s' % (s['numero'], s['titulo']))
        L.append('')
        L.append('**Pregunta que responde:** %s' % s['pregunta'])
        L.append('')
        L.append('- Parrafos/avisos editables (contentEditable, clase `texto-editable`): ~%d' % s['editables_aprox'])
        L.append('- Bloque "Como se calculo" (detalle tecnico, toggle independiente): %s' % ('si' if s['tiene_bloque_calculo'] else 'no'))
        L.append('- Tarjetas de metricas (`tarjetas()`, valor protegido / etiqueta editable): %s' % ('si' if s['tiene_tarjetas'] else 'no'))
        if s['graficos_tablas_toggle']:
            L.append('- Graficas/tablas con su propio toggle "Mostrar: ..." (id compartido pantalla<->PDF):')
            for gid, etiqueta in s['graficos_tablas_toggle']:
                L.append('  - `%s` -- %s' % (gid, etiqueta))
        else:
            L.append('- Graficas/tablas con toggle propio: ninguna')
        if s['tablas_con_id']:
            L.append('- Tablas con celdas editables (id pasado a `tabla()`, columnas/filas ocultables):')
            for tid in s['tablas_con_id']:
                L.append('  - `%s`' % tid)
        L.append('')
    return '\n'.join(L)


def main():
    with open(SECCIONES_JS, encoding='utf-8') as f:
        texto = f.read()
    secciones = extraer_secciones(texto)
    md = construir_markdown(secciones)
    with open(SALIDA_MD, 'w', encoding='utf-8') as f:
        f.write(md)
    print('Secciones encontradas: %d' % len(secciones))
    print('Escrito: %s' % SALIDA_MD)


if __name__ == '__main__':
    main()
