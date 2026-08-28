import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { login, registerUser } from './auth.service.js';

export async function authRoutes(app: FastifyInstance) {
    const loginSchema = z.object({
        email: z.string().email(),
        password: z.string().min(6),
    });

    const registerSchema = z.object({
        email: z.string().email(),
        password: z.string().min(6),
        name: z.string().min(2),
    });

    app.post('/auth/login', { preHandler: validate(loginSchema) }, async (req, reply) => {
        const { email, password } = req.body as any;
        const result = await login(email, password);
        return reply.send(result);
    });

    app.post('/auth/register', { preHandler: validate(registerSchema) }, async (req, reply) => {
        const { email, password, name } = req.body as any;
        const user = await registerUser(email, password, name);
        return reply.status(201).send({ id: user.id, email: user.email });
    });
}