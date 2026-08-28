import type { FastifyRequest, FastifyReply } from 'fastify';
import * as adminService from './admin.service.js';

export async function getMetricsHandler(req: FastifyRequest, reply: FastifyReply) {
    const metrics = await adminService.getMetrics();
    return reply.send(metrics);
}

export async function getTokensHandler(req: FastifyRequest, reply: FastifyReply) {
    const tokens = await adminService.getAllTokens();
    return reply.send(tokens);
}

export async function revokeTokenHandler(req: FastifyRequest, reply: FastifyReply) {
    const { id } = req.params as any;
    await adminService.revokeToken(id);
    return reply.send({ success: true });
}

export async function getUsersHandler(req: FastifyRequest, reply: FastifyReply) {
    const users = await adminService.getAllUsers();
    return reply.send(users);
}

export async function getLogsHandler(req: FastifyRequest, reply: FastifyReply) {
    const logs = await adminService.getLogs();
    return reply.send(logs);
}

export async function getUserProfileHandler(req: FastifyRequest, reply: FastifyReply) {
    const { user } = req as any;
    const profile = await adminService.getUserProfile(user.sub);
    if (!profile) return reply.status(404).send({ error: 'Usuário não encontrado.' });
    return reply.send(profile);
}