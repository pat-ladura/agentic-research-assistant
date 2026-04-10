import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env';
import { AuthUser } from '../types';

const JWT_SECRET = getEnv().JWT_SECRET;
const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 hours
const TOKEN_EXPIRY = '24h';

/**
 * In-memory set of revoked JWT JTIs (logout tokens)
 * In production, should use Redis or a database
 */
export const revokedJtis = new Set<string>();

/**
 * Interface for JWT payload
 */
export interface JwtPayload {
  sub: number; // user ID
  email: string;
  firstName: string;
  lastName: string;
  jti: string; // JWT ID for revocation
  iat?: number; // issued at
  exp?: number; // expiration
}

/**
 * Sign a new JWT token
 */
export function signJwt(user: AuthUser): string {
  const jti = crypto.randomUUID();
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      jti,
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

/**
 * JWT authentication middleware
 * - Validates JWT from Authorization: Bearer <token> header
 * - Sets req.user if token is valid
 * - Auto-refreshes expired tokens if within grace period (issued < 48h ago)
 * - Returns X-New-Token header if token was refreshed
 * - Returns 401 if token is invalid or expired > grace period
 */
export function jwtMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header',
    });
  }

  const token = authHeader.slice(7); // Remove 'Bearer '

  try {
    // Try to verify the token
    const decoded = jwt.verify(token, JWT_SECRET) as unknown as JwtPayload;

    // Check if JTI has been revoked (logout)
    if (revokedJtis.has(decoded.jti)) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token has been revoked',
      });
    }

    // Token is valid, set user on request
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      firstName: decoded.firstName,
      lastName: decoded.lastName,
    };

    next();
  } catch (error) {
    // Check if token is expired
    if (error instanceof Error && error.name === 'TokenExpiredError') {
      // Token expired - check if we can issue a new one (grace period)
      try {
        // Decode without verification to get the iat claim
        const decoded = jwt.decode(token) as unknown as JwtPayload;

        if (!decoded || !decoded.iat) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Token expired and cannot be refreshed',
          });
        }

        // Check if token was issued within the grace period (24h before expiry + 24h grace = 48h from issue)
        const issuedAtMs = decoded.iat * 1000;
        const ageMs = Date.now() - issuedAtMs;
        const maxAgeMs = GRACE_PERIOD_MS * 2; // 48 hours = 24h validity + 24h grace

        if (ageMs > maxAgeMs) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Token expired and grace period has passed',
          });
        }

        // Issue a new token
        const user: AuthUser = {
          id: decoded.sub,
          email: decoded.email,
          firstName: decoded.firstName,
          lastName: decoded.lastName,
        };

        const newToken = signJwt(user);
        req.user = user;

        // Attach new token in response header
        res.setHeader('X-New-Token', newToken);

        next();
      } catch (innerError) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Failed to refresh token',
        });
      }
    } else if (error instanceof Error && error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token',
      });
    } else {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication failed',
      });
    }
  }
}
