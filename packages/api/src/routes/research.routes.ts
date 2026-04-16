import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq, desc, asc } from 'drizzle-orm';
import { logger } from '../lib/logger';
import { sendSuccess, sendError, ErrorCode } from '../lib/api-response';
import { getQueueProvider } from '../queue';
import { jobEmitter, type JobProgressEvent } from '../queue/job-events';
import { getDb } from '../config/database';
import { researchSessions, researchJobs, researchSteps } from '../db/schema';

// --- SSE guardrail constants ---
const SSE_HEARTBEAT_MS = 15_000; // ping every 15 s to detect dead connections
const SSE_MAX_TTL_MS = 10 * 60_000; // hard-close after 10 min to prevent zombie connections

// Stores cleanup fn per jobId — evict stale connections on reconnect instead of rejecting
const activeJobStreams = new Map<string, () => void>();

// Cache terminal events so reconnecting clients see the final result immediately
const completedJobCache = new Map<string, JobProgressEvent>();

const router: Router = Router();

/**
 * GET /api/research/sessions
 * Retrieve all research sessions for the authenticated user
 */
router.get('/sessions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const sessions = await db
      .select()
      .from(researchSessions)
      .where(eq(researchSessions.userId, req.user!.id))
      .orderBy(desc(researchSessions.createdAt));
    return sendSuccess(res, { sessions });
  } catch (error) {
    next(error);
  }
});

const EMBEDDING_DEFAULTS: Record<string, { model: string; dimensions: number }> = {
  openai: { model: 'text-embedding-3-small', dimensions: 1536 },
  gemini: { model: 'text-embedding-004', dimensions: 768 },
  ollama: { model: 'nomic-embed-text', dimensions: 768 },
};

/**
 * POST /api/research/sessions
 * Create a new research session
 */
router.post('/sessions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description, provider = 'openai' } = req.body;

    if (!title) {
      return sendError(res, 400, ErrorCode.VALIDATION_ERROR, 'Missing required field: title');
    }

    const { model: embeddingModel, dimensions: embeddingDimensions } =
      EMBEDDING_DEFAULTS[provider] ?? EMBEDDING_DEFAULTS['openai']!;

    const db = getDb();
    const [session] = await db
      .insert(researchSessions)
      .values({
        userId: req.user!.id,
        title,
        description: description ?? null,
        provider,
        embeddingModel,
        embeddingDimensions,
      })
      .returning();

    logger.info({ sessionId: session!.id, title, provider }, 'Research session created');
    return sendSuccess(res, session, { status: 201, message: 'Research session created' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/research/sessions/:id
 * Retrieve a specific research session (scoped to authenticated user)
 */
router.get('/sessions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = parseInt(req.params['id'] as string, 10);
    if (isNaN(sessionId)) {
      return sendError(res, 400, ErrorCode.VALIDATION_ERROR, 'Invalid session id');
    }
    const db = getDb();
    const [session] = await db
      .select()
      .from(researchSessions)
      .where(eq(researchSessions.id, sessionId))
      .limit(1);
    if (!session || session.userId !== req.user!.id) {
      return sendError(res, 404, ErrorCode.NOT_FOUND, 'Session not found');
    }
    return sendSuccess(res, session);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/research/sessions/:id/jobs
 * Returns the most recent job for a session — provides the jobId needed to reconnect to SSE.
 */
router.get('/sessions/:id/jobs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionId = parseInt(req.params['id'] as string, 10);
    if (isNaN(sessionId)) {
      return sendError(res, 400, ErrorCode.VALIDATION_ERROR, 'Invalid session id');
    }
    const db = getDb();
    // Verify session ownership
    const [session] = await db
      .select()
      .from(researchSessions)
      .where(eq(researchSessions.id, sessionId))
      .limit(1);
    if (!session || session.userId !== req.user!.id) {
      return sendError(res, 404, ErrorCode.NOT_FOUND, 'Session not found');
    }
    const [job] = await db
      .select()
      .from(researchJobs)
      .where(eq(researchJobs.sessionId, sessionId))
      .orderBy(desc(researchJobs.createdAt))
      .limit(1);
    if (!job) {
      return sendError(res, 404, ErrorCode.NOT_FOUND, 'No jobs found for this session');
    }
    return sendSuccess(res, {
      jobId: job.pgBossJobId,
      sessionId: job.sessionId,
      status: job.status,
      query: job.query,
      createdAt: job.createdAt,
    });
  } catch (error) {
    next(error);
  }
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

    const sessionIdNum = Number(sessionId);
    if (isNaN(sessionIdNum) || sessionIdNum <= 0) {
      return sendError(
        res,
        400,
        ErrorCode.VALIDATION_ERROR,
        'sessionId must be a positive integer'
      );
    }

    const queue = getQueueProvider();
    const jobId = await queue.enqueue('research-job', { sessionId: sessionIdNum, query, provider });

    const db = getDb();
    await db.insert(researchJobs).values({
      sessionId: sessionIdNum,
      pgBossJobId: jobId,
      query,
      status: 'pending',
    });

    logger.info({ jobId, sessionId: sessionIdNum, query, provider }, 'Research query queued');
    return sendSuccess(
      res,
      { jobId, sessionId: sessionIdNum, status: 'queued' },
      { status: 202, message: 'Query queued for processing' }
    );
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/research/jobs/:id
 * Polling fallback — checks in-memory cache first, then DB (survives server restarts)
 */
router.get('/jobs/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params['id'] as string;

    // Fast path: in-process cache for jobs completed in this server instance
    const cached = completedJobCache.get(id);
    if (cached) {
      // Normalize: extract the report string from the synthesize/completed event data
      const cachedData = cached.data as { report?: string } | undefined;
      const result = cachedData?.report ?? null;
      return sendSuccess(res, { jobId: id, status: cached.status, result });
    }

    // DB fallback: survives server restarts
    const db = getDb();
    const [job] = await db
      .select()
      .from(researchJobs)
      .where(eq(researchJobs.pgBossJobId, id))
      .limit(1);

    if (job) {
      return sendSuccess(res, { jobId: id, status: job.status, result: job.result });
    }

    return sendSuccess(res, { jobId: id, status: 'processing' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/research/jobs/:id/stream
 * SSE endpoint — streams real-time job progress events.
 *
 * Reconnect-safe:
 *  - Replays completed steps from DB on every connect (handles reload, navigation, restarts)
 *  - If job already fully completed/failed in DB, replays all steps + terminal event then closes
 *  - If a stale connection exists (e.g. browser navigated away), evicts it and accepts new one
 *  - Heartbeat every 15 s to detect dead TCP connections through proxies
 *  - Hard TTL of 10 min — auto-closes zombie connections
 *  - Auto-closes on terminal job events (completed / failed)
 *  - Idempotent cleanup via closed flag
 *  - SSE retry directive set to 1000 ms for fast reconnect
 */
router.get('/jobs/:id/stream', async (req: Request, res: Response) => {
  const id = req.params['id'] as string;

  // Evict stale connection (e.g. user navigated away and came back during active job)
  const existingCleanup = activeJobStreams.get(id);
  if (existingCleanup) {
    logger.debug({ jobId: id }, 'SSE stream: evicting stale connection for reconnect');
    existingCleanup();
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Tell the browser to reconnect quickly if the stream drops
  res.write('retry: 1000\n\n');

  // Disable Nagle's algorithm so small writes (heartbeats, events) are sent immediately
  req.socket?.setNoDelay(true);

  // --- DB replay phase ---
  // Replay persisted step state so reloads / navigation-away / server restarts all work correctly.
  try {
    const db = getDb();
    const [job] = await db
      .select()
      .from(researchJobs)
      .where(eq(researchJobs.pgBossJobId, id))
      .limit(1);

    if (job) {
      const steps = await db
        .select()
        .from(researchSteps)
        .where(eq(researchSteps.jobId, job.id))
        .orderBy(asc(researchSteps.startedAt));

      for (const step of steps) {
        // Skip synthesize here when job is fully done — the terminal event below covers it
        // to avoid double-emitting synthesize/completed.
        if (step.stepName === 'synthesize' && job.status === 'completed') continue;

        if (step.status === 'completed') {
          const replayEvent: JobProgressEvent = {
            jobId: id,
            step: step.stepName,
            status: 'completed',
            message: `${step.stepName} complete`,
          };
          res.write(`data: ${JSON.stringify(replayEvent)}\n\n`);
        } else if (step.status === 'running') {
          const replayEvent: JobProgressEvent = {
            jobId: id,
            step: step.stepName,
            status: 'started',
            message: `${step.stepName} in progress`,
          };
          res.write(`data: ${JSON.stringify(replayEvent)}\n\n`);
        }
      }

      if (job.status === 'completed') {
        const terminalEvent: JobProgressEvent = {
          jobId: id,
          step: 'synthesize',
          status: 'completed',
          message: 'Research complete',
          data: { report: job.result },
        };
        completedJobCache.set(id, terminalEvent);
        res.write(`data: ${JSON.stringify(terminalEvent)}\n\n`);
        res.end();
        logger.debug({ jobId: id }, 'SSE stream: replayed completed job from DB');
        return;
      }

      if (job.status === 'failed') {
        const terminalEvent: JobProgressEvent = {
          jobId: id,
          step: 'agent',
          status: 'failed',
          message: 'Research failed',
        };
        completedJobCache.set(id, terminalEvent);
        res.write(`data: ${JSON.stringify(terminalEvent)}\n\n`);
        res.end();
        logger.debug({ jobId: id }, 'SSE stream: replayed failed job from DB');
        return;
      }
    }
  } catch (err) {
    logger.warn({ jobId: id, err }, 'SSE stream: DB replay failed, continuing with live stream');
  }

  // Swallow socket errors (ECONNRESET) from writes to disconnected clients
  req.socket?.on('error', () => {
    cleanup();
  });

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

  activeJobStreams.set(id, cleanup);

  const onProgress = (event: JobProgressEvent) => {
    if (closed) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);

    // Cache terminal event and close — reconnecting clients will get it immediately.
    // Only treat synthesize/completed as the job-terminal event; individual step
    // completions must not close the stream prematurely.
    if (
      (event.step === 'synthesize' && event.status === 'completed') ||
      event.status === 'failed'
    ) {
      completedJobCache.set(id, event);
      cleanup();
      res.end();
    }
  };

  jobEmitter.on(id, onProgress);

  // Heartbeat: keeps connection alive through proxies/load balancers
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
      completedJobCache.set(id, timeoutEvent);
      cleanup();
      res.end();
    }
  }, SSE_MAX_TTL_MS);

  // Client disconnect: clean up so listener and map entry are released
  req.on('close', cleanup);
});

export default router;
