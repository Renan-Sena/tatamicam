import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { licenseRoutes } from './modules/license/license.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';

const app = Fastify({ logger: true });

async function start() {
    await app.register(adminRoutes);
    await app.register(cors);
    await app.register(helmet);
    await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

    await app.register(licenseRoutes);
    await app.register(authRoutes);

    app.get('/health', async () => ({ status: 'ok' }));

    try {
        await app.listen({ port: env.PORT, host: '0.0.0.0' });
        console.log(`Server running on port ${env.PORT}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

start();