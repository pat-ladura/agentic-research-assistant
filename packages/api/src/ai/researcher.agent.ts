import { ChatMessage } from './provider';
import { getAIProvider, ProviderType } from './index';
import { HybridProvider, ChatOptions } from './hybrid.provider';
import { emitJobProgress } from '../queue/job-events';

export class ResearcherAgent {
  private memory: ChatMessage[] = [];
  private providerType: ProviderType;
  private jobId: string;

  constructor(jobId: string, providerType: ProviderType) {
    this.jobId = jobId;
    this.providerType = providerType;
  }

  private emit(
    step: string,
    status: 'started' | 'progress' | 'completed' | 'failed',
    message: string,
    data?: unknown
  ) {
    emitJobProgress({ jobId: this.jobId, step, status, message, data });
  }

  private async think(userMessage: string, systemPrompt?: string, lowReason = false): Promise<string> {
    this.memory.push({ role: 'user', content: userMessage });
    const provider = getAIProvider(this.providerType) as HybridProvider;
    const opts: ChatOptions = { lowReason };
    const response = await provider.chat(this.memory, systemPrompt, opts);
    this.memory.push({ role: 'assistant', content: response });
    return response;
  }

  async run(query: string): Promise<string> {
    const systemPrompt = `You are an expert research assistant. Be precise, cite reasoning, and structure your output clearly.`;

    // Step 1: Decompose
    this.emit('decompose', 'started', 'Breaking down the research query');
    const subQuestions = await this.think(
      `Break this research query into 3-5 focused sub-questions that together would fully answer it:\n\n"${query}"\n\nReturn only a numbered list.`,
      systemPrompt
    );
    this.emit('decompose', 'progress', 'Sub-questions identified', { subQuestions });

    // Step 2: Search queries
    this.emit('search', 'started', 'Generating search queries');
    const searchQueries = await this.think(
      `For each sub-question above, generate one precise web search query. Return only a numbered list of search queries.`,
      systemPrompt
    );
    this.emit('search', 'progress', 'Search queries generated', { searchQueries });

    // Step 3: Summarize — low-reason, offloads to local Ollama
    this.emit('summarize', 'started', 'Summarizing available context');
    const summaries = await this.think(
      `Based on your knowledge of the sub-questions and search queries above, provide a brief factual summary for each sub-question. Mark clearly where external verification is needed.`,
      systemPrompt,
      true // lowReason — offloads to local Ollama
    );
    this.emit('summarize', 'progress', 'Summaries complete', { summaries });

    // Step 4: Synthesize — final step emits 'completed' to close the SSE stream
    this.emit('synthesize', 'started', 'Synthesizing final report');
    const report = await this.think(
      `Using all the sub-questions and summaries above, write a comprehensive research report answering the original query:\n\n"${query}"\n\nStructure with: Executive Summary, Key Findings, Details per Sub-question, Conclusion.`,
      systemPrompt
    );
    this.emit('synthesize', 'completed', 'Research complete', { report });

    return report;
  }

  getMemory(): ChatMessage[] {
    return this.memory;
  }
}
