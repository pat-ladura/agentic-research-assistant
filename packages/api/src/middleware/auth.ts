import { Request, Response, NextFunction } from 'express';
import { getEnv } from '../config/env';

const API_KEY = getEnv().API_KEY;

export function apiKeyMiddleware(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing API key',
    });
  }

  next();
}
