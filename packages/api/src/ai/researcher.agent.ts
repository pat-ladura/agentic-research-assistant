import { eq } from 'drizzle-orm';
import { ChatMessage } from './provider';
import { getAIProvider, ProviderType } from './index';
import { HybridProvider, ChatOptions } from './hybrid.provider';
import { emitJobProgress } from '../queue/job-events';
import { getDb } from '../config/database';
import { researchSteps, stepResults } from '../db/schema';
import { retrieveRelevantChunks } from './retriever';

export class ResearcherAgent {
  private memory: ChatMessage[] = [];
  private providerType: ProviderType;
  private jobId: string; // pg-boss UUID (used for SSE events)
  private dbJobId: number | null; // DB research_jobs.id (used for step persistence)
  private sessionId: number | null; // DB research_sessions.id (used for RAG retrieval)

  constructor(
    jobId: string,
    providerType: ProviderType,
    dbJobId: number | null = null,
    sessionId: number | null = null
  ) {
    this.jobId = jobId;
    this.providerType = providerType;
    this.dbJobId = dbJobId;
    this.sessionId = sessionId;
  }

  private emit(
    step: string,
    status: 'started' | 'progress' | 'completed' | 'failed',
    message: string,
    data?: unknown
  ) {
    emitJobProgress({ jobId: this.jobId, step, status, message, data });
  }

  private async think(
    userMessage: string,
    systemPrompt?: string,
    lowReason = false
  ): Promise<string> {
    this.memory.push({ role: 'user', content: userMessage });
    const provider = getAIProvider(this.providerType) as HybridProvider;
    const opts: ChatOptions = { lowReason };
    const response = await provider.chat(this.memory, systemPrompt, opts);
    this.memory.push({ role: 'assistant', content: response });
    return response;
  }

  /**
   * Wraps a step: creates DB record, runs the AI call, marks completed/failed, inserts result.
   * Falls back gracefully if dbJobId is null (no DB tracking).
   */
  private async runStep(
    stepName: string,
    prompt: string,
    systemPrompt: string,
    lowReason = false
  ): Promise<string> {
    const db = this.dbJobId !== null ? getDb() : null;
    let stepDbId: number | null = null;

    if (db && this.dbJobId !== null) {
      const [row] = await db
        .insert(researchSteps)
        .values({ jobId: this.dbJobId, stepName, status: 'running', startedAt: new Date() })
        .returning({ id: researchSteps.id });
      stepDbId = row?.id ?? null;
    }

    try {
      const output = await this.think(prompt, systemPrompt, lowReason);

      if (db && stepDbId !== null) {
        await db
          .update(researchSteps)
          .set({ status: 'completed', completedAt: new Date() })
          .where(eq(researchSteps.id, stepDbId));
        await db.insert(stepResults).values({ stepId: stepDbId, content: output });
      }

      return output;
    } catch (err) {
      if (db && stepDbId !== null) {
        await db
          .update(researchSteps)
          .set({ status: 'failed', completedAt: new Date() })
          .where(eq(researchSteps.id, stepDbId))
          .catch(() => {});
      }
      throw err;
    }
  }

  async run(query: string): Promise<string> {
    const systemPrompt = `You are an expert research assistant. Be precise, cite reasoning, and structure your output clearly.`;

    // Step 1: Decompose
    this.emit('decompose', 'started', 'Breaking down the research query');
    const subQuestions = await this.runStep(
      'decompose',
      `Break this research query into 3-5 focused sub-questions that together would fully answer it:\n\n"${query}"\n\nReturn only a numbered list.`,
      systemPrompt
    );
    this.emit('decompose', 'progress', 'Sub-questions identified', { subQuestions });
    this.emit('decompose', 'completed', 'Decomposition complete', { subQuestions });

    // Step 2: Search queries
    this.emit('search', 'started', 'Generating search queries');
    const searchQueries = await this.runStep(
      'search',
      `For each sub-question above, generate one precise web search query. Return only a numbered list of search queries.`,
      systemPrompt
    );
    this.emit('search', 'progress', 'Search queries generated', { searchQueries });
    this.emit('search', 'completed', 'Search queries ready', { searchQueries });

    // Step 3: Summarize — low-reason, offloads to local Ollama
    this.emit('summarize', 'started', 'Summarizing available context');
    const summaries = await this.runStep(
      'summarize',
      `Based on your knowledge of the sub-questions and search queries above, provide a brief factual summary for each sub-question. Mark clearly where external verification is needed.`,
      systemPrompt,
      true // lowReason — offloads to local Ollama
    );
    this.emit('summarize', 'progress', 'Summaries complete', { summaries });
    this.emit('summarize', 'completed', 'Summaries ready', { summaries });

    // RAG: inject relevant document chunks before synthesis if session has stored documents
    if (this.sessionId !== null) {
      const provider = getAIProvider(this.providerType);
      const relevantChunks = await retrieveRelevantChunks(query, this.sessionId, provider);
      if (relevantChunks.length > 0) {
        this.memory.push({
          role: 'user',
          content: `Here are relevant excerpts retrieved from research sources:\n\n${relevantChunks.join('\n\n---\n\n')}\n\nUse these in your final synthesis.`,
        });
        this.memory.push({
          role: 'assistant',
          content: 'Understood. I will incorporate these excerpts into the synthesis.',
        });
        this.emit('synthesize', 'progress', 'Retrieved relevant document chunks', {
          chunkCount: relevantChunks.length,
        });
      }
    }

    // Step 4: Synthesize — final step emits 'completed' to close the SSE stream
    this.emit('synthesize', 'started', 'Synthesizing final report');
    const report = await this.runStep(
      'synthesize',
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
