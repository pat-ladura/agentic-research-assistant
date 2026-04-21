import { eq } from 'drizzle-orm';
import { ChatMessage } from './provider';
import { getAIProvider, ProviderType } from './index';
import { HybridProvider, ChatOptions } from './hybrid.provider';
import { emitJobProgress } from '../queue/job-events';
import { getDb } from '../config/database';
import { researchSteps, stepResults } from '../db/schema';
import { retrieveRelevantChunks, storeDocumentChunk } from './retriever';
import { getEnv } from '../config/env';
import { logger } from '../lib/logger';

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

  /**
   * Parse a numbered list produced by the AI ("1. ...", "2) ...") into individual strings.
   */
  private parseNumberedList(text: string): string[] {
    return text
      .split('\n')
      .map((line) => line.replace(/^\d+[.)\s]+/, '').trim())
      .filter((q) => q.length > 10); // skip header lines / empty entries
  }

  /**
   * For each generated search query, call Tavily and persist the top results as
   * document chunks in the `documents` table (scoped to this session).
   * Skips entirely if TAVILY_API_KEY is not configured.
   */
  private async fetchAndStoreWebResults(searchQueriesText: string): Promise<void> {
    const { TAVILY_API_KEY } = getEnv();
    if (!TAVILY_API_KEY || this.sessionId === null) return;

    const queries = this.parseNumberedList(searchQueriesText);
    if (queries.length === 0) return;

    const provider = getAIProvider(this.providerType);
    let stored = 0;

    for (const query of queries) {
      try {
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: TAVILY_API_KEY,
            query,
            max_results: 3,
            include_answer: false,
          }),
        });

        if (!res.ok) {
          logger.warn({ query, status: res.status }, 'Tavily search returned non-OK status');
          continue;
        }

        const data = (await res.json()) as {
          results: Array<{ title: string; url: string; content: string }>;
        };

        for (const result of data.results ?? []) {
          if (!result.content) continue;
          await storeDocumentChunk(
            this.sessionId!,
            result.title ?? query,
            result.content,
            result.url ?? query,
            provider,
            this.providerType
          );
          stored++;
        }
      } catch (err) {
        logger.warn({ query, err }, 'Web search fetch failed, skipping query');
      }
    }

    if (stored > 0) {
      this.emit('search', 'progress', `Stored ${stored} web source chunks for RAG`, { stored });
      logger.debug({ sessionId: this.sessionId, stored }, 'Web source chunks persisted');
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

    // Fetch real web content for each generated query and store as document chunks.
    // The RAG step before synthesis will retrieve these to ground the final report.
    await this.fetchAndStoreWebResults(searchQueries);

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
