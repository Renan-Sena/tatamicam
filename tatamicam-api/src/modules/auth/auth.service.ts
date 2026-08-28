import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { UnauthorizedError } from '../../lib/errors.js';

export async function login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
        throw new UnauthorizedError('Credenciais inválidas');
    }
    const token = jwt.sign({ sub: user.id, role: user.role }, env.JWT_PRIVATE_KEY, {
        algorithm: 'RS256',
        expiresIn: '1d',
    });
    return { token, user: { id: user.id, email: user.email, role: user.role } };
}

export async function registerUser(email: string, password: string, name: string) {
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
        data: { email, password: hash, name },
    });
    return user;
}