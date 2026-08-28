import dotenv from 'dotenv';
dotenv.config();

export const env = {
    DATABASE_URL: process.env.DATABASE_URL!,
    JWT_PRIVATE_KEY: process.env.JWT_PRIVATE_KEY!,
    JWT_PUBLIC_KEY: process.env.JWT_PUBLIC_KEY!,
    JWT_LICENSE_EXPIRATION_DAYS: Number(process.env.JWT_LICENSE_EXPIRATION_DAYS || 8),
    PORT: Number(process.env.PORT || 3000),
    NODE_ENV: process.env.NODE_ENV || 'development',
};