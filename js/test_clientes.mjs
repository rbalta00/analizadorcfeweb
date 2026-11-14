// Pruebas de regresion para js/clientes.js -- no tocan el motor de calculo, solo el
// guardado/eliminado/traslado de proyectos (ver auditoria "fallas de uso diario" y
// revision sobre el commit f1b08d0, 2026-11-14). Corre con:
//   node js/test_clientes.mjs
//
// clientes.js usa `localStorage`/`window.crypto` directamente (es codigo de
// navegador) -- se simulan ambos aqui con un shim minimo, SOLO para esta prueba, en
// vez de mockear con una libreria aparte.
import { webcrypto } from 'node:crypto';

function crearLocalStorageFalso() {
  const datos = new Map();
  return {
    getItem(k) { return datos.has(k) ? datos.get(k) : null; },
    setItem(k, v) { datos.set(k, String(v)); },
    removeItem(k) { datos.delete(k); },
    clear() { datos.clear(); },
  };
}
globalThis.window = globalThis.window || {};
globalThis.window.crypto = webcrypto;
globalThis.localStorage = crearLocalStorageFalso();

const mod = await import('./clientes.js');
const {
  crearCliente, crearProyecto, guardarProyecto, eliminarProyecto, obtenerCliente,
  moverProyecto, bloquearProyecto, desbloquearProyecto,
} = mod;

let fallos = 0;
function ok(nombre, cond, detalle = '') {
  if (cond) {
    console.log(`ok    ${nombre}`);
  } else {
    fallos++;
    console.log(`FALLO ${nombre} ${detalle}`);
  }
}

// ---------------------------------------------------------------------------
// Caso 1 (reportado): "Abre dos pestañas con el mismo cliente y dos cotizaciones X e
// Y. Edita y guarda X en la primera pestaña. Desde la segunda, sin recargar, elimina
// Y. X debe conservar su última edición."
// ---------------------------------------------------------------------------
{
  localStorage.clear();
  const clienteReal = crearCliente({ nombre: 'TEST-CLI-1', tipo: 'Particular' });
  const x = crearProyecto(clienteReal, { nombre: 'X' });
  const y = crearProyecto(clienteReal, { nombre: 'Y' });

  // Dos "pestañas": cada una es su propia copia en memoria, cargada ANTES de que la
  // otra guarde nada -- exactamente como dos pestañas reales de un navegador.
  const pestana1 = obtenerCliente(clienteReal.id);
  const pestana2 = obtenerCliente(clienteReal.id);

  // Pestaña 1 edita y guarda X.
  const xEnPestana1 = pestana1.proyectos.find((p) => p.nombre === 'X');
  xEnPestana1.formulario = { titular: 'EDITADO EN PESTAÑA 1' };
  guardarProyecto(pestana1, xEnPestana1);

  // Pestaña 2, SIN recargar (sigue con su copia vieja, de antes del guardado de
  // arriba), elimina Y.
  const yEnPestana2 = pestana2.proyectos.find((p) => p.nombre === 'Y');
  eliminarProyecto(pestana2, yEnPestana2.id);

  const final = obtenerCliente(clienteReal.id);
  const xFinal = final.proyectos.find((p) => p.nombre === 'X');
  const yFinal = final.proyectos.find((p) => p.nombre === 'Y');
  ok('eliminarProyecto no revierte la edición de un proyecto hermano', xFinal?.formulario?.titular === 'EDITADO EN PESTAÑA 1',
    `titular final=${xFinal?.formulario?.titular}`);
  ok('eliminarProyecto sí elimina el proyecto solicitado', yFinal === undefined);
}

// Mismo patron, pero las acciones hermanas son crear/bloquear/desbloquear en vez de
// eliminar -- "Revisa crear, clonar, bloquear y desbloquear, porque usan el mismo
// mecanismo de guardado."
{
  localStorage.clear();
  const clienteReal = crearCliente({ nombre: 'TEST-CLI-2', tipo: 'Particular' });
  const x = crearProyecto(clienteReal, { nombre: 'X' });
  crearProyecto(clienteReal, { nombre: 'Y' }); // Y existe solo para que haya "otro hermano" en memoria

  const pestana1 = obtenerCliente(clienteReal.id);
  const pestana2 = obtenerCliente(clienteReal.id);

  const xEnPestana1 = pestana1.proyectos.find((p) => p.nombre === 'X');
  xEnPestana1.formulario = { titular: 'EDITADO ANTES DE CREAR Z' };
  guardarProyecto(pestana1, xEnPestana1);

  // Pestaña 2 (vieja) crea un proyecto Z nuevo -- no debería revertir la edición de X.
  crearProyecto(pestana2, { nombre: 'Z' });

  let final = obtenerCliente(clienteReal.id);
  ok('crearProyecto no revierte la edición de un proyecto hermano',
    final.proyectos.find((p) => p.nombre === 'X')?.formulario?.titular === 'EDITADO ANTES DE CREAR Z');
  ok('crearProyecto sí crea el proyecto nuevo', !!final.proyectos.find((p) => p.nombre === 'Z'));

  // Repite el mismo patron con bloquear/desbloquear.
  const pestana3 = obtenerCliente(clienteReal.id);
  const pestana4 = obtenerCliente(clienteReal.id);
  const xEnPestana3 = pestana3.proyectos.find((p) => p.nombre === 'X');
  xEnPestana3.formulario = { titular: 'EDITADO ANTES DE BLOQUEAR Y' };
  guardarProyecto(pestana3, xEnPestana3);
  const yEnPestana4 = pestana4.proyectos.find((p) => p.nombre === 'Y');
  bloquearProyecto(pestana4, yEnPestana4.id);

  final = obtenerCliente(clienteReal.id);
  ok('bloquearProyecto no revierte la edición de un proyecto hermano',
    final.proyectos.find((p) => p.nombre === 'X')?.formulario?.titular === 'EDITADO ANTES DE BLOQUEAR Y');
  ok('bloquearProyecto sí bloquea el proyecto solicitado', final.proyectos.find((p) => p.nombre === 'Y')?.bloqueada === true);

  const yParaDesbloquear = final.proyectos.find((p) => p.nombre === 'Y');
  desbloquearProyecto(final, yParaDesbloquear.id);
  final = obtenerCliente(clienteReal.id);
  ok('desbloquearProyecto sí desbloquea el proyecto solicitado', final.proyectos.find((p) => p.nombre === 'Y')?.bloqueada === false);
}

// Conflicto real (no solo hermanos): dos pestañas editan el MISMO proyecto -- debe
// seguir ganando el último guardado (comportamiento documentado, no una sobreescritura
// de un proyecto HERMANO distinto, que es el bug real que se corrigio).
{
  localStorage.clear();
  const clienteReal = crearCliente({ nombre: 'TEST-CLI-3', tipo: 'Particular' });
  const x = crearProyecto(clienteReal, { nombre: 'X' });
  const pestana1 = obtenerCliente(clienteReal.id);
  const pestana2 = obtenerCliente(clienteReal.id);
  const xEnPestana1 = pestana1.proyectos.find((p) => p.nombre === 'X');
  xEnPestana1.formulario = { titular: 'VERSION PESTAÑA 1' };
  guardarProyecto(pestana1, xEnPestana1);
  const xEnPestana2 = pestana2.proyectos.find((p) => p.nombre === 'X');
  xEnPestana2.formulario = { titular: 'VERSION PESTAÑA 2 (ultima en guardar)' };
  guardarProyecto(pestana2, xEnPestana2);
  const final = obtenerCliente(clienteReal.id);
  ok('mismo proyecto editado en 2 pestañas: gana el último guardado (sin aviso, limite conocido)',
    final.proyectos.find((p) => p.nombre === 'X')?.formulario?.titular === 'VERSION PESTAÑA 2 (ultima en guardar)');
}

// ---------------------------------------------------------------------------
// Caso 2 (reportado): "moverProyecto guarda primero el cliente de origen sin la
// cotización y después intenta guardar el destino. Si falla el segundo guardado, la
// cotización puede perderse."
// ---------------------------------------------------------------------------
{
  localStorage.clear();
  const origen = crearCliente({ nombre: 'TEST-ORIGEN', tipo: 'Particular' });
  const destino = crearCliente({ nombre: 'TEST-DESTINO', tipo: 'Particular' });
  const proyecto = crearProyecto(origen, { nombre: 'MOVER-ESTE' });
  guardarProyecto(origen, { ...proyecto, formulario: { titular: 'DATO REAL A MOVER' } });
  const proyectoReal = obtenerCliente(origen.id).proyectos.find((p) => p.nombre === 'MOVER-ESTE');

  // Simula que el guardado del DESTINO falla (ej. cuota de localStorage llena) --
  // se intercepta setItem una sola vez para que truene justo en ese guardado.
  const setItemReal = localStorage.setItem.bind(localStorage);
  let siguienteSetItemFalla = false;
  localStorage.setItem = (k, v) => {
    if (siguienteSetItemFalla) { siguienteSetItemFalla = false; throw new Error('QuotaExceededError simulado'); }
    return setItemReal(k, v);
  };

  siguienteSetItemFalla = true;
  const resultadoFallido = moverProyecto(origen.id, destino.id, proyectoReal);
  ok('moverProyecto regresa null si falla el guardado del destino', resultadoFallido === null);
  const origenTrasFallo = obtenerCliente(origen.id);
  const destinoTrasFallo = obtenerCliente(destino.id);
  ok('si el destino falla, la cotización sigue intacta en el origen',
    !!origenTrasFallo.proyectos.find((p) => p.nombre === 'MOVER-ESTE' && p.formulario?.titular === 'DATO REAL A MOVER'));
  ok('si el destino falla, la cotización NO aparece en el destino',
    !destinoTrasFallo.proyectos.find((p) => p.nombre === 'MOVER-ESTE'));

  localStorage.setItem = setItemReal; // restaura el comportamiento normal

  // Ahora el traslado real, sin fallas -- debe moverse una sola vez, completo.
  const resultadoOk = moverProyecto(origen.id, destino.id, proyectoReal);
  ok('moverProyecto exitoso regresa el cliente destino', resultadoOk?.id === destino.id);
  const origenFinal = obtenerCliente(origen.id);
  const destinoFinal = obtenerCliente(destino.id);
  ok('traslado exitoso: ya NO está en origen', !origenFinal.proyectos.find((p) => p.nombre === 'MOVER-ESTE'));
  ok('traslado exitoso: aparece UNA sola vez en destino con sus datos',
    destinoFinal.proyectos.filter((p) => p.nombre === 'MOVER-ESTE').length === 1 &&
    destinoFinal.proyectos.find((p) => p.nombre === 'MOVER-ESTE')?.formulario?.titular === 'DATO REAL A MOVER');
}

// Caso 2b: el guardado del DESTINO sí funciona, pero falla el guardado de limpieza
// del ORIGEN -- debe quedar duplicada (peor caso aceptado, nunca perdida), no
// desaparecer de los dos lados.
{
  localStorage.clear();
  const origen = crearCliente({ nombre: 'TEST-ORIGEN-2', tipo: 'Particular' });
  const destino = crearCliente({ nombre: 'TEST-DESTINO-2', tipo: 'Particular' });
  const proyecto = crearProyecto(origen, { nombre: 'MOVER-ESTE-2' });

  let llamadasASetItem = 0;
  const setItemReal = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (k, v) => {
    llamadasASetItem++;
    // La 1a llamada dentro de este bloque es el guardado del DESTINO (debe pasar);
    // la 2a es la limpieza del ORIGEN (se simula que falla).
    if (llamadasASetItem === 2) throw new Error('QuotaExceededError simulado (limpieza de origen)');
    return setItemReal(k, v);
  };
  const resultado = moverProyecto(origen.id, destino.id, proyecto);
  localStorage.setItem = setItemReal;

  ok('si solo falla la limpieza del origen, moverProyecto igual regresa el destino', resultado?.id === destino.id);
  const origenFinal = obtenerCliente(origen.id);
  const destinoFinal = obtenerCliente(destino.id);
  ok('la cotización SÍ llegó al destino', !!destinoFinal.proyectos.find((p) => p.nombre === 'MOVER-ESTE-2'));
  ok('si falla la limpieza, queda duplicada (no perdida) -- peor caso aceptado',
    !!origenFinal.proyectos.find((p) => p.nombre === 'MOVER-ESTE-2'));
}

console.log('\n' + (fallos === 0 ? 'TODO OK' : `${fallos} FALLOS`));
process.exit(fallos === 0 ? 0 : 1);
