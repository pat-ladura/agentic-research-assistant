import pino from 'pino';
import { getEnv } from '../config/env';

function createLogger() {
  const env = getEnv();
  const isDev = env.NODE_ENV === 'development';

  if (isDev) {
    return pino({
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: false,
          levelFirst: true,
          translateTime: 'SYS:standard',
        },
      },
    });
  }

  return pino({
    level: 'info',
  });
}

export const logger = createLogger();
