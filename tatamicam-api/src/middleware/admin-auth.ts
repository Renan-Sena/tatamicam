import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export async function adminAuth(req: FastifyRequest, reply: FastifyReply) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return reply.status(401).send({ error: 'Token de autenticação ausente.' });
    }
    const token = authHeader.replace('Bearer ', '');
    try {
        const decoded = jwt.verify(token, env.JWT_PRIVATE_KEY, { algorithms: ['RS256'] }) as any;
        (req as any).user = decoded;
    } catch {
        return reply.status(401).send({ error: 'Token inválido ou expirado.' });
    }
}