import 'dotenv/config';
import { getEnv } from './config/env';
import { createApp, startServer } from './app';
import { logger } from './lib/logger';
import { closeDb } from './config/database';

async function main() {
  try {
    const env = getEnv();
    const app = await createApp();

    await startServer(app, env.PORT);

    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      await closeDb();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      await closeDb();
      process.exit(0);
    });
  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
}

main();
