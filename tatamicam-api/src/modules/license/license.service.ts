import { SignJWT, importPKCS8 } from 'jose';
import { readFileSync } from 'fs';
import { join } from 'path';
import { prisma } from '../../lib/prisma.js';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { ActivationAction } from '@prisma/client';

let privateKey: CryptoKey | null = null;

async function getPrivateKey(): Promise<CryptoKey> {
    if (!privateKey) {
        const pem = readFileSync(join(process.cwd(), 'license_private.pem'), 'utf8');
        privateKey = await importPKCS8(pem, 'EdDSA');
    }
    return privateKey;
}

export async function issueLicenseJwt(hwid: string, tokenCode: string): Promise<string> {
    const key = await getPrivateKey();
    return await new SignJWT({ hwid, token: tokenCode })
        .setProtectedHeader({ alg: 'EdDSA' })
        .setIssuedAt()
        .setExpirationTime('8d')
        .sign(key);
}

export async function activateLicense(params: {
    tokenCode: string;
    hwid: string;
    force?: boolean;
    ip?: string;
    userAgent?: string;
}) {
    const { tokenCode, hwid, force, ip, userAgent } = params;
    const token = await prisma.licenseToken.findUnique({
        where: { code: tokenCode },
        include: { currentMachine: true },
    });
    if (!token || token.status !== 'ACTIVE') throw new NotFoundError('Token inválido ou inativo');

    if (token.currentMachine?.hwid === hwid) {
        await prisma.licenseToken.update({
            where: { id: token.id },
            data: { lastHeartbeatAt: new Date() },
        });
        await logActivation(token.id, hwid, ActivationAction.HEARTBEAT, ip, userAgent, true);
        const jwt = await issueLicenseJwt(hwid, tokenCode);
        return { jwt, plan: token.plan, expiresInDays: 8 };
    }

    if (token.currentMachine && !force) {
        throw new ConflictError('Token já está em uso em outra máquina');
    }

    if (token.currentMachine && force) {
        await prisma.licenseToken.update({
            where: { id: token.id },
            data: { currentMachine: { disconnect: true } },
        });
        await logActivation(token.id, token.currentMachine.hwid, ActivationAction.TRANSFER, ip, userAgent, true, 'Transferido para nova máquina');
    }

    let machine = await prisma.machine.findUnique({ where: { hwid } });
    if (!machine) machine = await prisma.machine.create({ data: { hwid } });

    await prisma.licenseToken.update({
        where: { id: token.id },
        data: {
            currentMachine: { connect: { id: machine.id } },
            activatedAt: token.activatedAt || new Date(),
            lastHeartbeatAt: new Date(),
        },
    });
    await logActivation(token.id, hwid, ActivationAction.ACTIVATE, ip, userAgent, true);
    const jwt = await issueLicenseJwt(hwid, tokenCode);
    return { jwt, plan: token.plan, expiresInDays: 8 };
}

export async function verifyLicenseHeartbeat(tokenCode: string, hwid: string, ip?: string, userAgent?: string) {
    const token = await prisma.licenseToken.findUnique({
        where: { code: tokenCode },
        include: { currentMachine: true },
    });
    if (!token || token.status !== 'ACTIVE') throw new NotFoundError('Token inválido ou inativo');
    if (token.currentMachine?.hwid !== hwid) throw new ConflictError('Máquina não autorizada para este token');

    await prisma.licenseToken.update({
        where: { id: token.id },
        data: { lastHeartbeatAt: new Date() },
    });
    await prisma.machine.update({
        where: { hwid },
        data: { lastSeenAt: new Date() },
    });
    await logActivation(token.id, hwid, ActivationAction.HEARTBEAT, ip, userAgent, true);
    const jwt = await issueLicenseJwt(hwid, tokenCode);
    return { jwt, plan: token.plan, expiresInDays: 8 };
}

async function logActivation(
    tokenId: string,
    hwid: string,
    action: ActivationAction,
    ip?: string,
    userAgent?: string,
    success = true,
    details?: string
) {
    await prisma.activationLog.create({
        data: {
            tokenId,
            hwid,
            action,
            ip: ip ?? null,
            userAgent: userAgent ?? null,
            success,
            details: details ?? null,
        },
    });
}