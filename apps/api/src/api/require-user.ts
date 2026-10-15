import type { FastifyReply, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Lo deja `exigirUsuario`. Ausente en las rutas publicas. */
    usuario?: { id: number };
  }
}

/**
 * Hook de `preValidation` que exige un token valido.
 *
 * VA EN `preValidation` Y NO DENTRO DEL MANEJADOR, y eso es el arreglo de T-051.
 * El ciclo de vida de Fastify es
 * `onRequest -> preParsing -> preValidation -> validacion -> preHandler -> manejador`,
 * asi que comprobandolo dentro del manejador el esquema del cuerpo se validaba
 * ANTES que el token: un anonimo con el cuerpo mal recibia 400 y averiguaba de
 * paso la forma del cuerpo. El orden correcto es el otro: primero quien eres,
 * despues que mandas.
 *
 * El `user_id` sale SIEMPRE del token, nunca del cuerpo ni de la ruta: si
 * viniera de fuera, cualquiera podria pedir la coleccion o los mazos de otro.
 */
export async function exigirUsuario(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
    const payload = request.user as { sub?: unknown };
    const id = Number(payload?.sub);
    if (!Number.isInteger(id) || id <= 0) throw new Error('sub invalido');
    request.usuario = { id };
  } catch {
    await reply.code(401).send({ error: 'unauthorized', message: 'Token ausente o invalido' });
  }
}

/**
 * Hook de `preValidation` para rutas PUBLICAS que se enriquecen con sesion (T-093).
 *
 * El catalogo es de todos, pero "las que me faltan" es de alguien. Si llega un
 * token valido se identifica al usuario; si no llega, o no vale, la peticion
 * sigue como anonima y NO se corta. Es lo contrario de `exigirUsuario` a
 * proposito: un token caduca en una hora (ADR-008), y que el catalogo publico
 * devolviera 401 a quien solo lo tenia guardado seria romper lo que funciona
 * para proteger lo que no lo necesita.
 *
 * Quien NECESITE usuario -- el filtro `owned` -- lo comprueba despues y
 * contesta 401 si falta. Asi la regla dura vive en un solo sitio y el hook no
 * tiene que saber que rutas la tienen.
 *
 * En el servidor de solo catalogo (`buildServer`, sin cuentas) no hay plugin
 * JWT y `jwtVerify` no existe: todo es anonimo, que es la verdad.
 */
export async function identificarSiHay(request: FastifyRequest): Promise<void> {
  if (!request.headers.authorization) return;
  if (typeof request.jwtVerify !== 'function') return;
  try {
    await request.jwtVerify();
    const id = Number((request.user as { sub?: unknown })?.sub);
    if (Number.isInteger(id) && id > 0) request.usuario = { id };
  } catch {
    // Caducado o manipulado: se sigue como anonimo. Ver arriba por que no 401.
  }
}

/**
 * El usuario de una peticion ya autenticada.
 *
 * Lanza si falta, en vez de devolver `undefined`: no puede faltar despues del
 * hook, asi que si falta es que la ruta se registro fuera de su ambito. Es un
 * error de cableado y conviene que suene, no que se cuele como `undefined`.
 */
export function usuarioDe(request: FastifyRequest): { id: number } {
  const usuario = request.usuario;
  if (!usuario) {
    throw new Error('Ruta autenticada registrada sin el hook exigirUsuario');
  }
  return usuario;
}
