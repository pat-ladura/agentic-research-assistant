import { Router, type Request, type Response } from 'express';
import healthRoutes from './health.routes';
import researchRoutes from './research.routes';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';

export const router: Router = Router();

// Mount health routes (no auth required, handled in app.ts)
router.use('/health', healthRoutes);

// Mount authentication routes (API key auth only, no JWT)
router.use('/auth', authRoutes);

// Mount user routes (API key auth only, no JWT)
router.use('/user', userRoutes);

// Mount research routes (with auth and rate limiting)
router.use('/research', researchRoutes);

// API info endpoint
router.get('/', (_req, res) => {
  res.json({
    name: 'Agentic Research Assistant API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/auth',
      user: '/user',
      research: '/research',
    },
  });
});
