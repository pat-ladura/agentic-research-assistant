import pinoHttp from 'pino-http';
import { logger } from '../lib/logger';

export const requestLogger = pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => {
      // Skip health checks and SSE streams — SSE connections close mid-stream
      // by design (page navigation, reconnect), not an error condition
      if (req.url === '/health') return true;
      if (req.url?.includes('/stream')) return true;
      return false;
    },
  },
  customErrorMessage: (_req, res, err) => {
    // Downgrade socket-level abort errors on SSE streams from error to debug
    if (err && 'code' in err && (err.code === 'ECONNRESET' || err.code === 'ECONNABORTED')) {
      return '';
    }
    return `request errored with status code: ${res.statusCode}`;
  },
});
