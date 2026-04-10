/**
 * Shared TypeScript types and interfaces used across the application
 */

/**
 * Standard API response envelope
 */
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: ApiError;
  timestamp?: string;
}

/**
 * Standard error response structure
 */
export interface ApiError {
  status: number;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Request context (can be extended with user, auth info, etc.)
 */
export interface RequestContext {
  requestId: string;
  timestamp: Date;
  userAgent?: string;
}

/**
 * Authenticated user object
 */
export interface AuthUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
}

/**
 * Extend Express Request with user property
 */
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
