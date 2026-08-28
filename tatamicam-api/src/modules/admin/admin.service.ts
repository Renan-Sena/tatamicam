import { prisma } from '../../lib/prisma.js';

export async function getMetrics() {
    const [activeTokens, expiringSoon, offlineMachines] = await Promise.all([
        prisma.licenseToken.count({ where: { status: 'ACTIVE' } }),
        prisma.licenseToken.count({
            where: {
                status: 'ACTIVE',
                lastHeartbeatAt: {
                    lt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000), // 6 dias atrás
                },
            },
        }),
        prisma.machine.count({
            where: {
                lastSeenAt: {
                    lt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 dia atrás
                },
            },
        }),
    ]);

    return { activeTokens, expiringSoon, offlineMachines };
}

export async function getAllTokens() {
    return prisma.licenseToken.findMany({
        include: { currentMachine: true, user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
    });
}

export async function revokeToken(tokenId: string) {
    return prisma.licenseToken.update({
        where: { id: tokenId },
        data: { status: 'REVOKED' },
    });
}

export async function getAllUsers() {
    return prisma.user.findMany({
        include: { tokens: { include: { currentMachine: true } } },
        orderBy: { createdAt: 'desc' },
    });
}

export async function getLogs() {
    return prisma.activationLog.findMany({
        include: { token: { select: { code: true } } },
        orderBy: { createdAt: 'desc' },
        take: 500,
    });
}

export async function getUserProfile(userId: string) {
    return prisma.user.findUnique({
        where: { id: userId },
        include: { tokens: { include: { currentMachine: true } } },
    });
}