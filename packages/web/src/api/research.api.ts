import { apiClient } from './client';
import type { ResearchSession, ResearchJob, ApiResponse, PaginationMeta } from '@/types';

export interface SessionLatestJob {
  jobId: string;
  sessionId: number;
  status: string;
  query: string;
  createdAt: string;
}

export interface SessionsParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface SessionsResult {
  sessions: ResearchSession[];
  pagination: PaginationMeta;
}

export const researchApi = {
  getSessions: async (params: SessionsParams = {}): Promise<SessionsResult> => {
    try {
      const searchParams: Record<string, string> = {
        page: String(params.page ?? 1),
        pageSize: String(params.pageSize ?? 20),
      };
      if (params.search) searchParams.search = params.search;

      const response = await apiClient
        .get('research/sessions', { searchParams })
        .json<ApiResponse<SessionsResult>>();

      if (response.success && response.data) {
        return response.data;
      }
      return { sessions: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
    } catch {
      return { sessions: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
    }
  },

  createSession: async (data: { title: string; description?: string; provider: string }) => {
    const response = await apiClient
      .post('research/sessions', { json: data })
      .json<ApiResponse<ResearchSession>>();

    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(
      !response.success && response.error ? response.error.message : 'Failed to create session'
    );
  },

  getSession: async (id: number) => {
    const response = await apiClient
      .get(`research/sessions/${id}`)
      .json<ApiResponse<ResearchSession>>();

    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(
      !response.success && response.error ? response.error.message : 'Failed to fetch session'
    );
  },

  submitQuery: async (sessionId: number, query: string, provider: string) => {
    const response = await apiClient
      .post('research/query', { json: { sessionId, query, provider } })
      .json<ApiResponse<{ jobId: string; sessionId: number; status: string }>>();

    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(
      !response.success && response.error ? response.error.message : 'Failed to submit query'
    );
  },

  getJob: async (jobId: string) => {
    const response = await apiClient.get(`research/jobs/${jobId}`).json<ApiResponse<ResearchJob>>();

    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(
      !response.success && response.error ? response.error.message : 'Failed to fetch job'
    );
  },

  getSessionLatestJob: async (sessionId: number): Promise<SessionLatestJob> => {
    const response = await apiClient
      .get(`research/sessions/${sessionId}/jobs`)
      .json<ApiResponse<SessionLatestJob>>();

    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(
      !response.success && response.error ? response.error.message : 'Failed to fetch session job'
    );
  },

  retrySession: async (
    sessionId: number
  ): Promise<{ jobId: string; sessionId: number; status: string }> => {
    const response = await apiClient
      .post(`research/sessions/${sessionId}/retry`)
      .json<ApiResponse<{ jobId: string; sessionId: number; status: string }>>();

    if (response.success && response.data) {
      return response.data;
    }
    throw new Error(
      !response.success && response.error ? response.error.message : 'Failed to retry session'
    );
  },
};
