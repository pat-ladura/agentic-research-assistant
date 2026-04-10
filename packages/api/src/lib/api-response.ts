import type { Response } from 'express';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Response shape types
// ---------------------------------------------------------------------------

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: z.core.$ZodIssue[] | string[];
  };
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// ---------------------------------------------------------------------------
// Standard error codes
// ---------------------------------------------------------------------------

export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

// ---------------------------------------------------------------------------
// Success helpers
// ---------------------------------------------------------------------------

export function sendSuccess<T>(
  res: Response,
  data: T,
  options: { status?: number; message?: string } = {}
): Response {
  const { status = 200, message } = options;
  const body: ApiSuccessResponse<T> = { success: true, data };
  if (message) body.message = message;
  return res.status(status).json(body);
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

export function sendError(
  res: Response,
  status: number,
  code: ErrorCodeType,
  message: string,
  details?: z.core.$ZodIssue[] | string[]
): Response {
  const body: ApiErrorResponse = { success: false, error: { code, message } };
  if (details && details.length > 0) body.error.details = details;
  return res.status(status).json(body);
}

export function sendValidationError(
  res: Response,
  details: z.core.$ZodIssue[],
  message = 'Validation failed'
): Response {
  return sendError(res, 400, ErrorCode.VALIDATION_ERROR, message, details);
}

export function sendUnauthorized(res: Response, message = 'Unauthorized'): Response {
  return sendError(res, 401, ErrorCode.UNAUTHORIZED, message);
}

export function sendNotFound(res: Response, message = 'Resource not found'): Response {
  return sendError(res, 404, ErrorCode.NOT_FOUND, message);
}

export function sendConflict(res: Response, message: string): Response {
  return sendError(res, 409, ErrorCode.CONFLICT, message);
}

export function sendInternalError(res: Response, message = 'Internal server error'): Response {
  return sendError(res, 500, ErrorCode.INTERNAL_ERROR, message);
}
