# Agentic Research Assistant — Implementation Plan

This document is structured for an AI agent to follow phase by phase.
Each phase is self-contained with clear objectives, exact file changes, and validation criteria.
Do NOT proceed to the next phase until the current phase is validated.

---

## Project Context

- **Stack**: TypeScript, Express 5, Drizzle ORM, PostgreSQL (pgvector), Ollama, OpenAI SDK, `@google/genai`
- **Package manager**: pnpm
- **AI abstraction**: `AIProvider` interface in `src/ai/provider.ts` — all providers must implement `chat()`, `embed()`, `complete()`
- **Factory**: `src/ai/index.ts` — `getAIProvider(providerType)` returns a provider instance
- **Providers**: `openai`, `gemini`, `ollama` — all three are first-class selectable options
- **Hybrid routing**: regardless of provider selection, high-reasoning tasks go to the selected provider; low-reasoning tasks always offload to local Ollama
- **DB schema**: `src/db/schema/index.ts` — users, researchSessions, documents (with vector column)
- **Env config**: `src/config/env.ts` — validated via Zod

---

## Phase 1 — Queue Infrastructure (Non-blocking Research Jobs)

### Objective

Make research jobs non-blocking. Client submits a query and immediately gets a `jobId` back.
The actual work runs in a background worker.

### Install

```bash
pnpm add pg-boss
pnpm add -D @types/pg-boss
```

### Files to create

**`src/queue/queue.provider.ts`** — interface only, no pg-boss import

```ts
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
```

**`src/queue/pgboss.provider.ts`** — pg-boss implementation

```ts
import PgBoss from 'pg-boss';
import type { QueueProvider, ResearchJobData } from './queue.provider';

export class PgBossQueueProvider implements QueueProvider {
  private boss: PgBoss;

  constructor(connectionString: string) {
    this.boss = new PgBoss(connectionString);
  }

  async enqueue(jobName: string, data: ResearchJobData): Promise<string> {
    const id = await this.boss.send(jobName, data);
    return id!;
  }

  onJob(jobName: string, handler: (data: ResearchJobData, jobId: string) => Promise<void>): void {
    this.boss.work(jobName, async (job) => {
      await handler(job.data as ResearchJobData, job.id);
    });
  }

  async start(): Promise<void> {
    await this.boss.start();
  }

  async stop(): Promise<void> {
    await this.boss.stop();
  }
}
```

**`src/queue/index.ts`** — factory (swap provider here when migrating)

```ts
import { PgBossQueueProvider } from './pgboss.provider';
import type { QueueProvider } from './queue.provider';
import { getEnv } from '../config/env';

let cachedQueue: QueueProvider | null = null;

export function getQueueProvider(): QueueProvider {
  if (cachedQueue) return cachedQueue;
  const env = getEnv();
  cachedQueue = new PgBossQueueProvider(env.DATABASE_URL);
  return cachedQueue;
}

export { QueueProvider, ResearchJobData } from './queue.provider';
```

### Files to modify

**`src/index.ts`** — start the queue when the app boots and register a placeholder worker

```ts
// After app.listen():
const queue = getQueueProvider();
await queue.start();
queue.onJob('research-job', async (data, jobId) => {
  logger.info({ jobId, sessionId: data.sessionId }, 'Processing research job (placeholder)');
  // Phase 3 will replace this
});
```

**`src/routes/research.routes.ts`** — update `POST /query` to enqueue and return jobId

```ts
import { getQueueProvider } from '../queue';

router.post('/query', async (req, res, next) => {
  try {
    const { sessionId, query, provider = 'openai' } = req.body;
    if (!sessionId || !query) {
      return res.status(400).json({ error: 'Missing required fields: sessionId, query' });
    }
    const queue = getQueueProvider();
    const jobId = await queue.enqueue('research-job', { sessionId, query, provider });
    res.status(202).json({ jobId, sessionId, status: 'queued' });
  } catch (error) {
    next(error);
  }
});
```

### Validation

- `POST /api/research/query` with `{ sessionId: 1, query: "test", provider: "openai" }` returns HTTP 202 with a `jobId`
- Repeat with `provider: "gemini"` and `provider: "ollama"` — all return 202
- Server logs show `Processing research job (placeholder)` shortly after
- App does not hang waiting for the job to finish

---

## Phase 2 — SSE Progress Streaming

### Objective

Allow clients to subscribe to real-time job progress updates without polling.

### Files to create

**`src/queue/job-events.ts`** — in-process event bus for job progress

```ts
import { EventEmitter } from 'events';

export const jobEmitter = new EventEmitter();
jobEmitter.setMaxListeners(100);

export interface JobProgressEvent {
  jobId: string;
  step: string;
  status: 'started' | 'progress' | 'completed' | 'failed';
  message: string;
  data?: unknown;
}

export function emitJobProgress(event: JobProgressEvent): void {
  jobEmitter.emit(event.jobId, event);
}
```

### Files to modify

**`src/routes/research.routes.ts`** — add two new endpoints

`GET /api/research/jobs/:id/stream` — SSE endpoint

```ts
import { jobEmitter } from '../queue/job-events';

router.get('/jobs/:id/stream', (req, res) => {
  const { id } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const onProgress = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  jobEmitter.on(id, onProgress);

  req.on('close', () => {
    jobEmitter.off(id, onProgress);
  });
});
```

`GET /api/research/jobs/:id` — polling fallback (query DB for job status in later phases, placeholder for now)

```ts
router.get('/jobs/:id', (req, res) => {
  res.json({ jobId: req.params.id, status: 'processing' });
});
```

### Validation

- Open `GET /api/research/jobs/test-id/stream` in a browser or curl with `--no-buffer`
- Manually call `emitJobProgress({ jobId: 'test-id', step: 'test', status: 'progress', message: 'hello' })` from a test script
- Confirm the event appears in the SSE stream without closing the connection

---

## Phase 3 — Research Agent with Step Memory

### Objective

Implement the actual research logic. The agent runs as a series of steps, each step builds on the previous via accumulated `ChatMessage[]` memory.

### Research steps (in order)

1. **Decompose** — break the query into 3-5 sub-questions (high reasoning)
2. **Search** — generate search queries for each sub-question (high reasoning)
3. **Summarize** — summarize each retrieved source (low reasoning — Phase 4 offloads this to Ollama)
4. **Synthesize** — produce a final research report from all summaries (high reasoning)

### Files to create

**`src/ai/researcher.agent.ts`**

```ts
import { ChatMessage } from './provider';
import { getAIProvider, ProviderType } from './index';
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

  private async think(userMessage: string, systemPrompt?: string): Promise<string> {
    this.memory.push({ role: 'user', content: userMessage });
    const provider = getAIProvider(this.providerType);
    const response = await provider.chat(this.memory, systemPrompt);
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
    this.emit('decompose', 'completed', 'Sub-questions identified', { subQuestions });

    // Step 2: Search queries
    this.emit('search', 'started', 'Generating search queries');
    const searchQueries = await this.think(
      `For each sub-question above, generate one precise web search query. Return only a numbered list of search queries.`,
      systemPrompt
    );
    this.emit('search', 'completed', 'Search queries generated', { searchQueries });

    // Step 3: Summarize (placeholder — Phase 4 replaces this with lowReason = true routing)
    this.emit('summarize', 'started', 'Summarizing available context');
    const summaries = await this.think(
      `Based on your knowledge of the sub-questions and search queries above, provide a brief factual summary for each sub-question. Mark clearly where external verification is needed.`,
      systemPrompt
    );
    this.emit('summarize', 'completed', 'Summaries complete', { summaries });

    // Step 4: Synthesize
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
```

### Files to modify

**`src/index.ts`** — replace placeholder worker with ResearcherAgent

```ts
queue.onJob('research-job', async (data, jobId) => {
  const agent = new ResearcherAgent(jobId, data.provider);
  try {
    const report = await agent.run(data.query);
    logger.info({ jobId, sessionId: data.sessionId }, 'Research job completed');
    // Phase 5 will persist report and memory to DB
  } catch (error) {
    emitJobProgress({ jobId, step: 'agent', status: 'failed', message: String(error) });
    logger.error({ jobId, error }, 'Research job failed');
  }
});
```

### Validation

- Submit a real query via `POST /api/research/query`
- Open the SSE stream for the returned `jobId`
- Confirm 4 step events arrive in sequence: decompose → search → summarize → synthesize
- Final event contains a `report` in `data`
- Review the accumulated memory steps in logs to confirm context is being passed

---

## Phase 4 — Three Providers + Universal Hybrid Routing

### Objective

Add Gemini as a first-class provider alongside OpenAI and Ollama. Implement a `HybridProvider` that accepts any primary provider and always offloads low-reasoning tasks to local Ollama — regardless of which provider the user selected. If local Ollama is unavailable, all tasks fall back to the selected primary.

**Routing rules:**

- User selects `openai` → high-reason: OpenAI Cloud, low-reason: local Ollama (fallback: OpenAI)
- User selects `gemini` → high-reason: Gemini Cloud, low-reason: local Ollama (fallback: Gemini)
- User selects `ollama` → high-reason: Ollama Cloud (`OLLAMA_CLOUD_BASE_URL` + `OLLAMA_API_KEY`), low-reason: local Ollama (fallback: Ollama Cloud)

**Low-reasoning tasks** (offloaded to local Ollama): summarization, keyword extraction, relevance checks
**High-reasoning tasks** (handled by selected provider): decompose, search query generation, synthesis

### Install

```bash
pnpm add @google/genai
```

### Files to modify

**`src/config/env.ts`** — add Gemini key and Ollama Cloud env vars

```ts
GEMINI_API_KEY: z.string().optional(),
OLLAMA_API_KEY: z.string().optional(),                                         // already in .env
OLLAMA_CLOUD_BASE_URL: z.url().optional(),                                     // add to .env
```

**`src/ai/ollama.provider.ts`** — support both local and cloud modes, fix global env mutation and model name

The current constructor sets `process.env.OLLAMA_HOST` globally — this breaks when running local and cloud instances simultaneously. Replace with per-instance host config:

```ts
export interface OllamaConfig {
  cloud?: boolean; // true = Ollama Cloud, false/undefined = local
}

export class OllamaProvider implements AIProvider {
  private client: Ollama;
  private model: string = 'llama3';
  private embeddingModel: string = 'nomic-embed-text';

  constructor(config: OllamaConfig = {}) {
    const env = getEnv();
    if (config.cloud) {
      if (!env.OLLAMA_CLOUD_BASE_URL) throw new Error('OLLAMA_CLOUD_BASE_URL is not set');
      this.client = new Ollama({
        host: env.OLLAMA_CLOUD_BASE_URL,
        headers: env.OLLAMA_API_KEY ? { Authorization: `Bearer ${env.OLLAMA_API_KEY}` } : {},
      });
    } else {
      // local — do NOT mutate process.env, pass host directly
      this.client = new Ollama({ host: env.OLLAMA_BASE_URL });
    }
  }
  // ... rest of methods unchanged
}
```

### Files to create

**`src/ai/gemini.provider.ts`** — Gemini implementation

```ts
import { GoogleGenAI } from '@google/genai';
import { AIProvider, ChatMessage } from './provider';
import { logger } from '../lib/logger';
import { getEnv } from '../config/env';

export class GeminiProvider implements AIProvider {
  private client: GoogleGenAI;
  private model: string = 'gemini-1.5-pro';
  private embeddingModel: string = 'text-embedding-004'; // 768d

  constructor() {
    const env = getEnv();
    if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
    this.client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }

  async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
    // Gemini uses 'model' role instead of 'assistant'
    const geminiMessages = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const response = await this.client.models.generateContent({
      model: this.model,
      systemInstruction: systemPrompt,
      contents: geminiMessages,
    });

    const text = response.text;
    if (!text) throw new Error('No content in Gemini response');
    logger.debug({ model: this.model }, 'Gemini chat completed');
    return text;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.models.embedContent({
      model: this.embeddingModel,
      contents: [{ parts: [{ text }] }],
    });
    return response.embeddings?.[0]?.values ?? [];
  }

  async complete(prompt: string, _maxTokens: number = 256): Promise<string> {
    return this.chat([{ role: 'user', content: prompt }]);
  }
}
```

**`src/ai/hybrid.provider.ts`** — wraps any primary provider, always offloads low-reason to local Ollama

```ts
import { AIProvider, ChatMessage } from './provider';
import { OllamaProvider } from './ollama.provider';
import { logger } from '../lib/logger';

export interface ChatOptions {
  lowReason?: boolean; // true = route to local Ollama
}

export class HybridProvider implements AIProvider {
  private primary: AIProvider;
  private local: OllamaProvider;
  private localAvailable: boolean = true;

  constructor(primary: AIProvider) {
    this.primary = primary;
    this.local = new OllamaProvider({ cloud: false }); // always local for low-reason offload
  }

  async chat(messages: ChatMessage[], systemPrompt?: string, opts?: ChatOptions): Promise<string> {
    if (opts?.lowReason && this.localAvailable) {
      try {
        return await this.local.chat(messages, systemPrompt);
      } catch {
        logger.warn('Local Ollama unavailable, falling back to primary for low-reason task');
        this.localAvailable = false;
      }
    }
    return this.primary.chat(messages, systemPrompt);
  }

  async embed(text: string): Promise<number[]> {
    return this.primary.embed(text); // embeddings always from selected provider
  }

  async complete(prompt: string, maxTokens?: number): Promise<string> {
    return this.primary.complete(prompt, maxTokens);
  }
}
```

### Files to modify

**`src/ai/index.ts`** — update ProviderType, wire all three through HybridProvider

```ts
import { HybridProvider } from './hybrid.provider';
import { GeminiProvider } from './gemini.provider';

export type ProviderType = 'openai' | 'gemini' | 'ollama';

// In switch — every case wraps its provider in HybridProvider:
case 'openai':
  provider = new HybridProvider(new OpenAIProvider());
  logger.info('Initialized OpenAI provider with local Ollama offload');
  break;
case 'gemini':
  provider = new HybridProvider(new GeminiProvider());
  logger.info('Initialized Gemini provider with local Ollama offload');
  break;
case 'ollama':
  provider = new HybridProvider(new OllamaProvider({ cloud: true }));
  // primary = Ollama Cloud (high-reason), local offload = local Ollama (low-reason)
  logger.info('Initialized Ollama Cloud provider with local Ollama offload');
  break;
```

**`src/ai/researcher.agent.ts`** — add `lowReason` param to `think()`, mark summarize step

```ts
// Update think() signature:
private async think(userMessage: string, systemPrompt?: string, lowReason = false): Promise<string> {
  this.memory.push({ role: 'user', content: userMessage });
  const provider = getAIProvider(this.providerType) as HybridProvider;
  const response = await provider.chat(this.memory, systemPrompt, { lowReason });
  this.memory.push({ role: 'assistant', content: response });
  return response;
}

// In run(), mark the summarize step as low-reason:
const summaries = await this.think(
  `Based on your knowledge of the sub-questions and search queries above, provide a brief factual summary for each sub-question. Mark clearly where external verification is needed.`,
  systemPrompt,
  true // lowReason — offloads to local Ollama
);
```

### Validation

- Set `GEMINI_API_KEY`, `OLLAMA_API_KEY`, `OLLAMA_CLOUD_BASE_URL` in `.env`
- Submit queries with each of the three `provider` values: `"openai"`, `"gemini"`, `"ollama"`
- For all three providers: confirm logs show local Ollama handling the summarize step and the selected provider handling decompose/synthesize
- Stop local Ollama, resubmit with any provider — confirm all steps fall back to the selected primary without crashing
- Confirm `provider: "ollama"` routes high-reason steps to Ollama Cloud and low-reason to local Ollama

---

## Phase 5 — Embedding with Dedicated Models

### Objective

Store embeddings per document for RAG retrieval. Fix embedding model to be separate from chat model. Track embedding model per session so similarity search never mixes dimensions.

### Schema changes needed

**`src/db/schema/index.ts`** — add `embeddingModel` and `embeddingDimensions` to `researchSessions`, and a `stepResults` table for persisting agent memory

```ts
import { integer } from 'drizzle-orm/pg-core'; // add integer import

export const researchSessions = pgTable('research_sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(), // link to authenticated user
  title: text('title').notNull(),
  description: text('description'),
  provider: text('provider').notNull().default('openai'), // 'openai' | 'gemini' | 'ollama'
  embeddingModel: text('embedding_model').notNull().default('text-embedding-3-small'),
  embeddingDimensions: integer('embedding_dimensions').notNull().default(1536),
  status: text('status').notNull().default('pending'), // 'pending' | 'running' | 'completed' | 'failed'
  result: text('result'), // final synthesized report
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

Note: `vector('embedding', { dimensions: 1536 })` on the documents table is hardcoded by Drizzle.
Use `dimensions: 1536` (max of OpenAI/Ollama) and store actual dimensions in the session.
Ollama nomic-embed-text produces 768d — zero-pad or leave remaining dimensions as 0 is NOT recommended.
**Better approach**: use two separate nullable vector columns or restrict similarity search by session's `embeddingModel`.

**Simplest pragmatic approach for hackathon**: keep `dimensions: 1536` for OpenAI sessions, and for Ollama sessions (`nomic-embed-text`, 768d) store a separate `embeddingSmall: vector('embedding_small', { dimensions: 768 })` column.

### Files to modify

**`src/ai/ollama.provider.ts`** — use dedicated embedding model

```ts
private model: string = 'llama3';
private embeddingModel: string = 'nomic-embed-text'; // separate model for embeddings

async embed(text: string): Promise<number[]> {
  const response = await this.client.embeddings({
    model: this.embeddingModel, // use nomic-embed-text, not llama3
    prompt: text,
  });
  return response.embedding;
}
```

### Run migration

```bash
pnpm db:generate
pnpm db:migrate
```

### Validation

- Schema migration runs without errors
- `researchSessions` table has `embedding_model`, `embedding_dimensions`, `status`, `result` columns
- `documents` table has both vector columns
- `embed()` call on OllamaProvider uses `nomic-embed-text` (confirm in Ollama logs)

---

## Phase 6 — RAG Retrieval in Agent Steps

### Objective

During the synthesize step, retrieve the most semantically relevant document chunks stored in Phase 5, rather than relying purely on chat memory. This prevents token limit issues and improves accuracy.

### Files to create

**`src/ai/retriever.ts`**

```ts
import { getDb } from '../config/database';
import { documents } from '../db/schema';
import { sql, eq } from 'drizzle-orm';
import { AIProvider } from './provider';

export async function retrieveRelevantChunks(
  query: string,
  sessionId: number,
  provider: AIProvider,
  topK: number = 5
): Promise<string[]> {
  const db = getDb();
  const queryEmbedding = await provider.embed(query);
  const embeddingLiteral = `[${queryEmbedding.join(',')}]`;

  // pgvector cosine distance — lower = more similar
  const results = await db
    .select({ content: documents.content })
    .from(documents)
    .where(eq(documents.sessionId, sessionId))
    .orderBy(sql`embedding <=> ${embeddingLiteral}::vector`)
    .limit(topK);

  return results.map((r) => r.content);
}
```

### Files to modify

**`src/ai/researcher.agent.ts`** — inject retrieved chunks before synthesize step

```ts
// In run(), before the synthesize step:
const relevantChunks = await retrieveRelevantChunks(
  query,
  this.sessionId,
  getAIProvider(this.providerType)
);
if (relevantChunks.length > 0) {
  this.memory.push({
    role: 'user',
    content: `Here are relevant excerpts retrieved from research sources:\n\n${relevantChunks.join('\n\n---\n\n')}\n\nUse these in your final synthesis.`,
  });
  this.memory.push({
    role: 'assistant',
    content: 'Understood. I will incorporate these excerpts into the synthesis.',
  });
}
```

### Validation

- Insert test documents with embeddings for a `sessionId`
- Run a research query for that session
- Confirm logs show retrieval step returning chunks before synthesis
- Final report references content from the stored documents

---

## Cross-cutting Rules (apply to all phases)

1. **Never import a concrete provider class outside `src/ai/`** — routes and workers always use `getAIProvider()`
2. **Never query embeddings across sessions** — always scope similarity search by `sessionId`
3. **Provider cache in `getAIProvider()` must be reset via `resetAIProvider()` when switching providers per request** — the current cache is global; consider making it per-request if users can switch mid-session
4. **SSE connections must clean up event listeners on `req.close`** — already noted in Phase 2
5. **pg-boss schema tables are managed by pg-boss itself** — do not create them manually via Drizzle
6. **Local Ollama is always the low-reason offload target** — if unavailable, `HybridProvider` falls back to the primary provider silently. Never crash on Ollama unavailability
7. **`GEMINI_API_KEY` and `OLLAMA_CLOUD_BASE_URL` are optional in env** — their respective providers throw at construction time if keys are missing; the factory only instantiates them when that provider is requested
8. **Never mutate `process.env.OLLAMA_HOST` globally** — pass host directly to the `Ollama` constructor so local and cloud instances can coexist in the same process
