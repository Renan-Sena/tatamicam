import type { FastifyRequest, FastifyReply } from 'fastify';
import { activateLicense, verifyLicenseHeartbeat } from './license.service.js';

export async function activateHandler(req: FastifyRequest, reply: FastifyReply) {
    const { token, hwid, force } = req.body as any;
    const ip = req.ip;
    const userAgent = (req.headers['user-agent'] as string) ?? '';
    try {
        const result = await activateLicense({
            tokenCode: token,
            hwid,
            force,
            ip,
            userAgent,
        });
        return reply.send(result);
    } catch (err: any) {
        return reply.status(err.statusCode || 500).send({ error: err.message });
    }
}

export async function verifyHandler(req: FastifyRequest, reply: FastifyReply) {
    const { token, hwid } = req.body as any;
    const ip = req.ip;
    const userAgent = (req.headers['user-agent'] as string) ?? '';
    try {
        const result = await verifyLicenseHeartbeat(token, hwid, ip, userAgent);
        return reply.send(result);
    } catch (err: any) {
        return reply.status(err.statusCode || 500).send({ error: err.message });
    }
}