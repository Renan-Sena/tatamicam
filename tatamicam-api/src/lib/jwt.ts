import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface LicensePayload {
    sub: string;
    plan: string;
    hwid: string;
    iat: number;
    exp: number;
}

export function signLicense(payload: Omit<LicensePayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, env.JWT_PRIVATE_KEY, {
        algorithm: 'RS256',
        expiresIn: `${env.JWT_LICENSE_EXPIRATION_DAYS}d`,
    });
}

export function verifyLicense(token: string): LicensePayload {
    return jwt.verify(token, env.JWT_PUBLIC_KEY, {
        algorithms: ['RS256'],
    }) as LicensePayload;
}