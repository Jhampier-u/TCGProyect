import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Extrae el usuario del token. Devuelve null y responde 401 si no es valido.
 *
 * El `user_id` sale SIEMPRE del token, nunca del cuerpo ni de la ruta: si
 * viniera de fuera, cualquiera podria pedir la coleccion o los mazos de otro.
 *
 * Vive aqui y no dentro de un modulo de rutas porque lo comparten las rutas de
 * cuenta y las de mazos, y duplicar una comprobacion de seguridad es la peor
 * clase de duplicacion: las dos copias divergen y solo una se arregla.
 */
export async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<{ id: number } | null> {
  try {
    await request.jwtVerify();
    const payload = request.user as { sub?: unknown };
    const id = Number(payload?.sub);
    if (!Number.isInteger(id) || id <= 0) throw new Error('sub invalido');
    return { id };
  } catch {
    await reply.code(401).send({ error: 'unauthorized', message: 'Token ausente o invalido' });
    return null;
  }
}
