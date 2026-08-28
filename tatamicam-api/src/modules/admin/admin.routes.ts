import type { FastifyInstance } from 'fastify';
import { adminAuth } from '../../middleware/admin-auth.js';
import * as adminController from './admin.controller.js';

export async function adminRoutes(app: FastifyInstance) {
    app.get('/admin/metrics', { preHandler: adminAuth }, adminController.getMetricsHandler);
    app.get('/admin/tokens', { preHandler: adminAuth }, adminController.getTokensHandler);
    app.post('/admin/tokens/:id/revoke', { preHandler: adminAuth }, adminController.revokeTokenHandler);
    app.get('/admin/users', { preHandler: adminAuth }, adminController.getUsersHandler);
    app.get('/admin/logs', { preHandler: adminAuth }, adminController.getLogsHandler);
    app.get('/user/me', { preHandler: adminAuth }, adminController.getUserProfileHandler);
}