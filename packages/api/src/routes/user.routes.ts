import { Router, type Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import bcryptjs from 'bcryptjs';
import { getDb } from '../config/database';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../lib/logger';
import {
  sendSuccess,
  sendValidationError,
  sendConflict,
  sendInternalError,
} from '../lib/api-response';

const router: Router = Router();

/**
 * @swagger
 * /api/user/register:
 *   post:
 *     summary: User registration
 *     description: Create a new user account
 *     tags:
 *       - User
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - password
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: John
 *               lastName:
 *                 type: string
 *                 example: Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: securePassword123
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
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
 *       400:
 *         description: Validation error or email already exists
 *       500:
 *         description: Server error
 */
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const RegisterSchema = z.object({
      firstName: z.string().min(1, 'First name is required'),
      lastName: z.string().min(1, 'Last name is required'),
      email: z.email('Invalid email address'),
      password: z.string().min(8, 'Password must be at least 8 characters'),
    });

    const { firstName, lastName, email, password } = RegisterSchema.parse(req.body);
    const db = getDb();

    // Check if email already exists
    const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (existingUser && existingUser.length > 0) {
      logger.info({ email }, 'Registration failed: email already exists');
      return sendConflict(res, 'Email already registered');
    }

    // Hash password
    const hashedPassword = await bcryptjs.hash(password, 12);

    // Insert user into database
    const result = await db
      .insert(users)
      .values({
        firstName,
        lastName,
        email,
        password: hashedPassword,
      })
      .returning();

    if (!result || result.length === 0) {
      logger.error({ email }, 'Failed to insert user');
      return sendInternalError(res, 'Failed to create user');
    }

    const newUser = result[0];
    logger.info({ email, userId: newUser.id }, 'User registered successfully');

    return sendSuccess(
      res,
      {
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
        },
      },
      { status: 201, message: 'User registered successfully' }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return sendValidationError(res, error.issues);
    }
    next(error);
  }
});

export default router;
