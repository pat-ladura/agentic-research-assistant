export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// Standard API Response Envelope
export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}

export interface ZodIssue {
  path: (string | number)[];
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: 'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR' | 'SERVICE_UNAVAILABLE';
    message: string;
    details?: ZodIssue[];
  };
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface ResearchSession {
  id: number;
  userId: number;
  title: string;
  description?: string;
  provider: 'openai' | 'gemini' | 'ollama';
  embeddingModel: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchJob {
  id: number;
  sessionId: number;
  pgBossJobId: string;
  query: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: string;
  createdAt: string;
}

export interface JobProgressEvent {
  jobId: string;
  step: 'decompose' | 'search' | 'summarize' | 'synthesize' | 'agent' | 'stream';
  status: 'started' | 'progress' | 'completed' | 'failed';
  message: string;
  data?: {
    subQuestions?: string;
    searchQueries?: string;
    summaries?: string;
    report?: string;
    chunkCount?: number;
  };
}
