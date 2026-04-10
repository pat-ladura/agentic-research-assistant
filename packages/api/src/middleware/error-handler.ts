import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';
import { ErrorCode, type ApiErrorResponse } from '../lib/api-response';

export interface ApiError extends Error {
  status?: number;
  body?: Record<string, unknown>;
}

export function errorHandler(err: ApiError, _req: Request, res: Response, _next: NextFunction) {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  logger.error({ error: err, status, message }, 'Request error');

  const code =
    status === 404
      ? ErrorCode.NOT_FOUND
      : status === 401
        ? ErrorCode.UNAUTHORIZED
        : status === 403
          ? ErrorCode.FORBIDDEN
          : ErrorCode.INTERNAL_ERROR;

  const body: ApiErrorResponse = {
    success: false,
    error: { code, message },
  };

  res.status(status).json(body);
}
