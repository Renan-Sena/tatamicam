import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ZodSchema } from 'zod';

export function validate(schema: ZodSchema) {
    return async (req: FastifyRequest, reply: FastifyReply) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            return reply.status(400).send({ error: result.error.flatten() });
        }
        req.body = result.data;
    };
}