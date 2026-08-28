import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

export function signToken(payload: { userId: string; role: string }) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
}

export function verifyToken(token: string) {
    return jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
}