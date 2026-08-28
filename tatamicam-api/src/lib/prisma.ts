import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error('❌ DATABASE_URL não foi carregada.');
}

const adapter = new PrismaNeon({ connectionString });
export const prisma = new PrismaClient({ adapter });