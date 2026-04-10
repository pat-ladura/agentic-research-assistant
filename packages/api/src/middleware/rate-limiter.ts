import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * General rate limiter: 100 requests per 15 minutes per IP
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => req.path === '/health', // Skip health check endpoint
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
});

/**
 * Strict rate limiter for AI endpoints: 20 requests per 15 minutes per IP
 * Applied to resource-intensive AI operations
 */
export const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per windowMs
  message: 'Too many AI requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
});
