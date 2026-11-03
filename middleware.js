// Protege el editor interno (index.html, "Datos y recibo" + las secciones de la
// cotizacion) con un login simple (HTTP Basic Auth) a nivel de servidor -- antes de
// esto, cualquiera con la URL del deploy llegaba directo al editor completo, viendo
// clientes/recibos/fotos reales, sin pedir nada. Mismo patron ya probado en
// administradorinvitamx/middleware.ts, adaptado a este proyecto (aqui no hace falta
// el soporte multi-usuario de ese repo -- un solo admin basta).
//
// cliente.html (el formulario publico que se le manda a terceros para que suban su
// propio recibo) y TODOS los archivos compartidos (js/, css/, lib/, assets/,
// manifest.json, service-worker.js, favicon) se dejan pasar SIEMPRE, sin login --
// cliente.html nunca debe quedar detras de una contraseña, es justo la pagina que
// reciben los clientes que no tienen ninguna credencial. Por eso el matcher protege
// SOLO "/" y "/index.html" en vez de intentar excluir todo lo demas con una regex
// negativa (ese enfoque ya causo un error real en otro proyecto -- ver
// administradorinvitamx, donde /manual.html quedo atrapado sin querer por el
// matcher viejo).
//
// Para activarlo: en Vercel > Settings > Environment Variables de ESTE proyecto
// (cotizador-fv-cfe-web), agrega ADMIN_PASSWORD con la contraseña que quieras (el
// usuario queda fijo como "admin", lo pide el navegador aparte). Mientras esa
// variable no exista, el middleware NO bloquea nada -- para no dejar el editor
// inaccesible por un olvido de configuracion -- asi que hasta que se configure,
// sigue exactamente igual que hoy (publico).
export const config = {
  matcher: ["/", "/index.html"],
};

export default function middleware(request) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return;

  const credencialValida = "Basic " + btoa(`admin:${adminPassword}`);
  const authHeader = request.headers.get("authorization");

  if (authHeader !== credencialValida) {
    return new Response("Acceso restringido", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Cotizador FV CFE - Acceso Admin"',
      },
    });
  }
}
