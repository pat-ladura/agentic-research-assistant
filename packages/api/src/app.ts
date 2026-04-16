import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { requestLogger } from './middleware/request-logger';
import { generalLimiter, aiLimiter } from './middleware/rate-limiter';
import { apiKeyMiddleware } from './middleware/auth';
import { jwtMiddleware } from './middleware/jwt';
import { errorHandler } from './middleware/error-handler';
import { router } from './routes';
import { swaggerSpec } from './config/swagger';
import { logger } from './lib/logger';

export async function createApp(): Promise<Application> {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors());

  // Body parser middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging middleware
  app.use(requestLogger);

  // Apply general rate limiter globally
  app.use(generalLimiter);

  // Swagger documentation (dynamic import for ESM compatibility)
  try {
    const swaggerUi = await import('swagger-ui-express');
    app.use('/api-docs', swaggerUi.default.serve, swaggerUi.default.setup(swaggerSpec));
  } catch (error) {
    logger.warn('Swagger UI not available, skipping /api-docs');
  }

  // Conditional JWT middleware - apply to all /api routes except /auth and /user/register
  const conditionalJwtMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const path = req.path;
    // Skip JWT for /auth and /user/register endpoints
    if (path.startsWith('/auth') || path === '/user/register' || path.startsWith('/health')) {
      return next();
    }
    // Apply JWT for all other routes
    return jwtMiddleware(req, res, next);
  };

  // Conditional API Key middleware - apply to all /api routes except /health and /user/register
  const conditionalApiKeyMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const path = req.path;
    // Skip API key check for /health and /user/register endpoints
    if (path.startsWith('/health')) {
      return next();
    }
    // Apply API key check for all other routes
    return apiKeyMiddleware(req, res, next);
  };

  app.use('/api/', conditionalApiKeyMiddleware, conditionalJwtMiddleware);
  app.use('/api/research', aiLimiter);

  // Application routes
  app.use('/api', router);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      error: {
        status: 404,
        message: 'Not Found',
      },
    });
  });

  // Global error handler
  app.use(errorHandler);

  return app;
}

export async function startServer(app: Application, port: number) {
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      logger.info(`⚡ Server listening on http://localhost:${port}`);
      resolve(server);
    });
  });
}
