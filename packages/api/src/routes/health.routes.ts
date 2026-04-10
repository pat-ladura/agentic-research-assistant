import { Router, type Request, type Response, type NextFunction } from 'express';
import { getDb } from '../config/database';
import { logger } from '../lib/logger';
import { sendSuccess } from '../lib/api-response';

const router: Router = Router();

router.get('/status', async (_req, res, next) => {
  try {
    const db = getDb();
    // Test database connection by running a simple query
    await db.execute('SELECT 1');

    return sendSuccess(res, {
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(error, 'Health check failed');
    next(error);
  }
});

export default router;
