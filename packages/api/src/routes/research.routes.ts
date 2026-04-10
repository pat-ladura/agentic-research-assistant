import { Router, type Request, type Response, type NextFunction } from 'express';
import { logger } from '../lib/logger';
import { sendSuccess, sendError, sendNotFound, ErrorCode } from '../lib/api-response';

const router: Router = Router();

/**
 * GET /api/research/sessions
 * Retrieve all research sessions
 */
router.get('/sessions', (_req, res) => {
  logger.info('Fetching research sessions');
  return sendSuccess(res, { sessions: [] });
});

/**
 * POST /api/research/sessions
 * Create a new research session
 */
router.post('/sessions', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title } = req.body;

    if (!title) {
      return sendError(res, 400, ErrorCode.VALIDATION_ERROR, 'Missing required field: title');
    }

    logger.info({ title }, 'Creating new research session');
    return sendSuccess(
      res,
      {
        id: 'session-1', // Phase 5 will replace with real DB id
        title,
        createdAt: new Date().toISOString(),
      },
      { status: 201, message: 'Research session created' }
    );
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/research/sessions/:id
 * Retrieve a specific research session
 */
router.get('/sessions/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  logger.info({ id }, 'Fetching research session');
  return sendSuccess(res, {
    id,
    title: 'Sample Research Session',
    createdAt: new Date().toISOString(),
  });
});

/**
 * POST /api/research/query
 * Submit a research query — returns jobId immediately (Phase 1: queue)
 */
router.post('/query', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sessionId, query, provider = 'openai' } = req.body;

    if (!sessionId || !query) {
      return sendError(
        res,
        400,
        ErrorCode.VALIDATION_ERROR,
        'Missing required fields: sessionId, query'
      );
    }

    logger.info({ sessionId, query, provider }, 'Research query queued');
    return sendSuccess(
      res,
      {
        jobId: 'job-placeholder', // Phase 1 will replace with real pg-boss jobId
        sessionId,
        status: 'queued',
      },
      { status: 202, message: 'Query queued for processing' }
    );
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/research/jobs/:id
 * Polling fallback — returns current job status
 */
router.get('/jobs/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  // Phase 5 will query the DB for real status/result
  return sendSuccess(res, { jobId: id, status: 'processing' });
});

/**
 * GET /api/research/jobs/:id/stream
 * SSE endpoint — streams real-time job progress events (Phase 2)
 * This route is intentionally left as a placeholder header-only response.
 * The full SSE implementation is added in Phase 2.
 */
router.get('/jobs/:id/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  // Phase 2 will wire jobEmitter here
});

export default router;
