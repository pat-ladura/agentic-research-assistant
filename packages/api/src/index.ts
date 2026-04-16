import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { getEnv } from './config/env';
import { createApp, startServer } from './app';
import { logger } from './lib/logger';
import { closeDb, getDb } from './config/database';
import { getQueueProvider } from './queue';
import { emitJobProgress } from './queue/job-events';
import { ResearcherAgent } from './ai/researcher.agent';
import { researchJobs, memoryEntries, researchSessions } from './db/schema';

async function main() {
  try {
    const env = getEnv();
    const app = await createApp();

    await startServer(app, env.PORT);

    const queue = getQueueProvider();
    await queue.start();
    queue.onJob('research-job', async (data, jobId) => {
      const db = getDb();

      // Fetch DB job record upfront so we can pass its integer ID to the agent for step tracking
      const [dbJobRow] = await db
        .select({ id: researchJobs.id })
        .from(researchJobs)
        .where(eq(researchJobs.pgBossJobId, jobId))
        .limit(1)
        .catch(() => []);

      const agent = new ResearcherAgent(jobId, data.provider, dbJobRow?.id ?? null, data.sessionId);

      // Mark session as running
      await db
        .update(researchSessions)
        .set({ status: 'running', updatedAt: new Date() })
        .where(eq(researchSessions.id, data.sessionId))
        .catch((err) => logger.warn({ jobId, err }, 'Could not update session to running'));

      // Mark job as processing
      await db
        .update(researchJobs)
        .set({ status: 'processing', updatedAt: new Date() })
        .where(eq(researchJobs.pgBossJobId, jobId))
        .catch((err) => logger.warn({ jobId, err }, 'Could not update job to processing'));

      try {
        const report = await agent.run(data.query);

        // Persist result and update status
        const [updated] = await db
          .update(researchJobs)
          .set({ status: 'completed', result: report, updatedAt: new Date() })
          .where(eq(researchJobs.pgBossJobId, jobId))
          .returning({ id: researchJobs.id });

        // Persist conversation memory (no embeddings yet — Phase 6 adds RAG)
        if (updated) {
          const embeddingModelMap: Record<string, string> = {
            openai: 'text-embedding-3-small',
            gemini: 'text-embedding-004',
            ollama: 'nomic-embed-text',
          };
          const embModel = embeddingModelMap[data.provider] ?? 'text-embedding-3-small';
          const memory = agent.getMemory();
          if (memory.length > 0) {
            await db.insert(memoryEntries).values(
              memory.map((msg, idx) => ({
                jobId: updated.id,
                role: msg.role,
                content: msg.content,
                sequenceOrder: idx,
                embeddingModel: embModel,
              }))
            );
          }
        }

        // Update session status and store final result
        await db
          .update(researchSessions)
          .set({ status: 'completed', result: report, updatedAt: new Date() })
          .where(eq(researchSessions.id, data.sessionId));

        logger.info({ jobId, sessionId: data.sessionId }, 'Research job completed and persisted');
      } catch (error) {
        emitJobProgress({ jobId, step: 'agent', status: 'failed', message: String(error) });
        logger.error({ jobId, error }, 'Research job failed');
        await db
          .update(researchJobs)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(researchJobs.pgBossJobId, jobId))
          .catch((dbErr) =>
            logger.error({ jobId, dbErr }, 'Failed to update job status to failed')
          );
        await db
          .update(researchSessions)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(eq(researchSessions.id, data.sessionId))
          .catch((dbErr) =>
            logger.error({ jobId, dbErr }, 'Failed to update session status to failed')
          );
      }
    });

    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      await queue.stop();
      await closeDb();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      await queue.stop();
      await closeDb();
      process.exit(0);
    });
  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
}

main();
