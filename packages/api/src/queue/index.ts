import { PgBossQueueProvider } from './pgboss.provider';
import type { QueueProvider } from './queue.provider';
import { getEnv } from '../config/env';

let cachedQueue: QueueProvider | null = null;

export function getQueueProvider(): QueueProvider {
  if (cachedQueue) return cachedQueue;
  const env = getEnv();
  cachedQueue = new PgBossQueueProvider(env.DATABASE_URL);
  return cachedQueue;
}

export type { QueueProvider, ResearchJobData } from './queue.provider';
