import { Router, type Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import bcryptjs from 'bcryptjs';
import { getDb } from '../config/database';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { signJwt, revokedJtis, JwtPayload } from '../middleware/jwt';
import { logger } from '../lib/logger';
import jwt from 'jsonwebtoken';
import { sendSuccess, sendUnauthorized, sendValidationError } from '../lib/api-response';

const router: Router = Router();

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticate user with email and password, returns JWT token
 *     tags:
 *       - Authentication
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: password123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: JWT access token
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                     email:
 *                       type: string
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *       401:
 *         description: Invalid email or password
 *       400:
 *         description: Missing required fields
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const LoginSchema = z.object({
      email: z.email('Invalid email'),
      password: z.string().min(1, 'Password is required'),
    });

    const { email, password } = LoginSchema.parse(req.body);
    const db = getDb();

    // Find user by email
    const user = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user || user.length === 0) {
      logger.info({ email }, 'Login failed: user not found');
      return sendUnauthorized(res, 'Invalid email or password');
    }

    const dbUser = user[0];

    // Compare password
    const isPasswordValid = await bcryptjs.compare(password, dbUser.password);
    if (!isPasswordValid) {
      logger.info({ email }, 'Login failed: invalid password');
      return sendUnauthorized(res, 'Invalid email or password');
    }

    // Generate JWT token
    const token = signJwt({
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
    });

    logger.info({ email }, 'Login successful');
    return sendSuccess(
      res,
      {
        token,
        user: {
          id: dbUser.id,
          email: dbUser.email,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
        },
      },
      { message: 'Login successful' }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return sendValidationError(res, error.issues);
    }
    next(error);
  }
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: User logout
 *     description: Revoke the current JWT token
 *     tags:
 *       - Authentication
 *     security:
 *       - ApiKeyAuth: []
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized - missing or invalid token
 */
router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return sendUnauthorized(res, 'User not authenticated');
    }

    // Get the token from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendUnauthorized(res, 'Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);

    try {
      // Decode the token to get the JTI
      const decoded = jwt.decode(token) as unknown as JwtPayload;
      if (decoded && decoded.jti) {
        revokedJtis.add(decoded.jti);
        logger.info({ userId: req.user.id }, 'User logged out');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to decode token for logout');
      // Continue even if we can't decode
    }

    return sendSuccess(res, null, { message: 'Logout successful' });
  } catch (error) {
    next(error);
  }
});

export default router;
