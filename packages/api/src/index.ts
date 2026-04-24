import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { getEnv } from './config/env';
import { createApp, startServer } from './app';
import { logger } from './lib/logger';
import { closeDb, getDb } from './config/database';
import { getQueueProvider } from './queue';
import { emitJobProgress } from './queue/job-events';
import { ResearcherAgent } from './ai/researcher.agent';
import { getAIProvider } from './ai/index';
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

        // Persist conversation memory with embeddings
        if (updated) {
          const embeddingModelMap: Record<string, string> = {
            openai: 'text-embedding-3-small',
            gemini: 'bge-m3',
            ollama: 'qwen3-embedding',
          };
          const embModel = embeddingModelMap[data.provider] ?? 'text-embedding-3-small';
          const memory = agent.getMemory();
          if (memory.length > 0) {
            const provider = getAIProvider(data.provider as 'openai' | 'gemini' | 'ollama');
            const rows = await Promise.all(
              memory.map(async (msg, idx) => {
                let embedding: number[] | null = null;
                try {
                  embedding = await provider.embed(msg.content);
                } catch (err) {
                  logger.warn(
                    { jobId, idx, err },
                    'Failed to embed memory entry, storing without embedding'
                  );
                }
                const is4096d = embedding && embedding.length === 4096;
                const is1024d = embedding && embedding.length === 1024;
                const is768d = embedding && embedding.length === 768;
                return {
                  jobId: updated.id,
                  role: msg.role,
                  content: msg.content,
                  sequenceOrder: idx,
                  embeddingModel: embModel,
                  embedding: !is768d && !is1024d && !is4096d && embedding ? embedding : null,
                  embeddingSmall: is768d && embedding ? embedding : null,
                  embeddingMedium: is1024d && embedding ? embedding : null,
                  embeddingLarge: is4096d && embedding ? embedding : null,
                };
              })
            );
            await db.insert(memoryEntries).values(rows);
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
