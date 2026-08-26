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
