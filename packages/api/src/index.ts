import 'dotenv/config';
import { getEnv } from './config/env';
import { createApp, startServer } from './app';
import { logger } from './lib/logger';
import { closeDb } from './config/database';
import { getQueueProvider } from './queue';
import { emitJobProgress } from './queue/job-events';
import { ResearcherAgent } from './ai/researcher.agent';

async function main() {
  try {
    const env = getEnv();
    const app = await createApp();

    await startServer(app, env.PORT);

    const queue = getQueueProvider();
    await queue.start();
    queue.onJob('research-job', async (data, jobId) => {
      const agent = new ResearcherAgent(jobId, data.provider);
      try {
        const report = await agent.run(data.query);
        logger.info({ jobId, sessionId: data.sessionId }, 'Research job completed');
        // Phase 5 will persist report and memory to DB
        void report;
      } catch (error) {
        emitJobProgress({ jobId, step: 'agent', status: 'failed', message: String(error) });
        logger.error({ jobId, error }, 'Research job failed');
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
