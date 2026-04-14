import 'dotenv/config';
import { getEnv } from './config/env';
import { createApp, startServer } from './app';
import { logger } from './lib/logger';
import { closeDb } from './config/database';
import { getQueueProvider } from './queue';

async function main() {
  try {
    const env = getEnv();
    const app = await createApp();

    await startServer(app, env.PORT);

    const queue = getQueueProvider();
    await queue.start();
    queue.onJob('research-job', async (data, jobId) => {
      logger.info({ jobId, sessionId: data.sessionId }, 'Processing research job (placeholder)');
      // Phase 3 will replace this
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
