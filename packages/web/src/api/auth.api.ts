import { apiClient } from './client';
import type { AuthResponse, ApiResponse } from '@/types';

export interface LoginResult {
  success: boolean;
  data?: AuthResponse;
  error?: {
    code: string;
    message: string;
    details?: any[];
  };
}

export const authApi = {
  login: async (email: string, password: string): Promise<LoginResult> => {
    try {
      const response = await apiClient
        .post('auth/login', { json: { email, password } })
        .json<ApiResponse<AuthResponse>>();

      if (response.success && response.data) {
        return {
          success: true,
          data: response.data,
        };
      } else if (!response.success && response.error) {
        return {
          success: false,
          error: response.error,
        };
      }

      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unexpected response format',
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error?.message || 'An unexpected error occurred',
        },
      };
    }
  },

  logout: async () => {
    try {
      const response = await apiClient.post('auth/logout').json<ApiResponse<null>>();

      if (response.success) {
        return { success: true };
      } else if (!response.success && response.error) {
        return {
          success: false,
          error: response.error,
        };
      }

      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Unexpected response format',
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error?.message || 'An unexpected error occurred',
        },
      };
    }
  },
};
