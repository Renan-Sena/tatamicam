import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { activateHandler, verifyHandler } from './license.controller.js';

export async function licenseRoutes(app: FastifyInstance) {
    const activateSchema = z.object({
        token: z.string().min(1),
        hwid: z.string().min(1),
        force: z.boolean().optional(),
    });

    const verifySchema = z.object({
        token: z.string().min(1),
        hwid: z.string().min(1),
    });

    app.post('/activate', { preHandler: validate(activateSchema) }, activateHandler);
    app.post('/verify', { preHandler: validate(verifySchema) }, verifyHandler);
}