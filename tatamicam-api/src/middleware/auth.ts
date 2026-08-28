import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyLicense } from '../lib/jwt.js';

export async function licenseAuth(req: FastifyRequest, reply: FastifyReply) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return reply.status(401).send({ error: 'License token missing' });
    }
    const token = authHeader.replace('Bearer ', '');
    try {
        const decoded = verifyLicense(token);
        (req as any).license = decoded;
    } catch {
        return reply.status(401).send({ error: 'Invalid or expired license' });
    }
}