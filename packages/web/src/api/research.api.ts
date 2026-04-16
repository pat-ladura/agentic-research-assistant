import { apiClient } from './client';
import type { ResearchSession, ResearchJob, ApiResponse } from '@/types';

export interface SessionLatestJob {
  jobId: string;
  sessionId: number;
  status: string;
  query: string;
  createdAt: string;
}

export const researchApi = {
  getSessions: async (): Promise<ResearchSession[]> => {
    try {
      const response = await apiClient
        .get('research/sessions')
        .json<ApiResponse<{ sessions: ResearchSession[] }>>();

      if (response.success && response.data?.sessions) {
        return response.data.sessions;
      }
      return [];
    } catch {
      return [];
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
};
