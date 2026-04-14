export interface ResearchJobData {
  sessionId: number;
  query: string;
  provider: 'openai' | 'gemini' | 'ollama';
}

export interface QueueProvider {
  enqueue(jobName: string, data: ResearchJobData): Promise<string>;
  onJob(jobName: string, handler: (data: ResearchJobData, jobId: string) => Promise<void>): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}
