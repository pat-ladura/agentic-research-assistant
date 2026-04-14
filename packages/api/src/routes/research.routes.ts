import { Router, type Request, type Response, type NextFunction } from 'express';
import { logger } from '../lib/logger';
import { sendSuccess, sendError, sendNotFound, ErrorCode } from '../lib/api-response';
import { getQueueProvider } from '../queue';
import { jobEmitter, type JobProgressEvent } from '../queue/job-events';

// --- SSE guardrail constants ---
const SSE_HEARTBEAT_MS = 15_000; // ping every 15 s to detect dead connections
const SSE_MAX_TTL_MS = 10 * 60_000; // hard-close after 10 min to prevent zombie connections

// 1 SSE connection per job — prevents duplicate listener accumulation
const activeJobStreams = new Map<string, boolean>();

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
router.post('/query', async (req: Request, res: Response, next: NextFunction) => {
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

    const queue = getQueueProvider();
    const jobId = await queue.enqueue('research-job', { sessionId, query, provider });
    logger.info({ jobId, sessionId, query, provider }, 'Research query queued');
    return sendSuccess(
      res,
      { jobId, sessionId, status: 'queued' },
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
 * SSE endpoint — streams real-time job progress events.
 *
 * Guardrails:
 *  - 1 active SSE connection per jobId (409 if duplicate)
 *  - heartbeat comment every 15 s to detect dead TCP connections
 *  - hard TTL of 10 min — auto-closes zombie connections
 *  - auto-closes on terminal job events (completed / failed)
 *  - idempotent cleanup via `closed` flag (prevents double-remove of listener)
 */
router.get('/jobs/:id/stream', (req: Request, res: Response) => {
  const id = req.params['id'] as string;

  // Guardrail: reject duplicate SSE connections for the same job
  if (activeJobStreams.get(id)) {
    res.status(409).json({ error: 'A stream for this job is already active' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Disable Nagle's algorithm so small writes (heartbeats, events) are sent immediately
  // without waiting to buffer into larger TCP segments
  req.socket?.setNoDelay(true);

  activeJobStreams.set(id, true);
  logger.debug({ jobId: id }, 'SSE stream opened');

  let closed = false;

  const cleanup = () => {
    if (closed) return; // idempotent — only run once regardless of trigger
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(ttlTimeout);
    jobEmitter.off(id, onProgress);
    activeJobStreams.delete(id);
    logger.debug({ jobId: id }, 'SSE stream closed');
  };

  const onProgress = (event: JobProgressEvent) => {
    if (closed) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);

    // Auto-close on terminal status — job is done, no more events
    if (event.status === 'completed' || event.status === 'failed') {
      cleanup();
      res.end();
    }
  };

  jobEmitter.on(id, onProgress);

  // Heartbeat: SSE comment line keeps the connection alive through proxies/load balancers
  // and surfaces dead TCP connections faster than OS TCP keepalive
  const heartbeat = setInterval(() => {
    if (!closed) res.write(': heartbeat\n\n');
  }, SSE_HEARTBEAT_MS);

  // Hard TTL: forcibly evict connections that outlive any reasonable job duration
  const ttlTimeout = setTimeout(() => {
    if (!closed) {
      const timeoutEvent: JobProgressEvent = {
        jobId: id,
        step: 'stream',
        status: 'failed',
        message: 'Stream TTL exceeded — reconnect and check job status via GET /jobs/:id',
      };
      res.write(`data: ${JSON.stringify(timeoutEvent)}\n\n`);
      cleanup();
      res.end();
    }
  }, SSE_MAX_TTL_MS);

  // Client disconnect: clean up immediately so the listener and map entry are released
  req.on('close', cleanup);
});

export default router;
