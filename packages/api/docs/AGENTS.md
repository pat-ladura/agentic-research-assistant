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

// setMaxListeners(0) = unlimited — the SSE route enforces the real limit via activeJobStreams Map
export const jobEmitter = new EventEmitter();
jobEmitter.setMaxListeners(0);

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

`GET /api/research/jobs/:id/stream` — SSE endpoint with guardrails

Guardrails implemented (memory-leak prevention):

- **1 connection per job** — `activeJobStreams` Map returns 409 on duplicate
- **Heartbeat** — SSE comment line every 15 s; surfaces dead TCP connections through proxies
- **Hard TTL** — 10 min `setTimeout` force-closes zombie connections with a `failed` event
- **Auto-close on terminal status** — `onProgress` closes when `status === 'completed' | 'failed'`
- **Idempotent cleanup** — `closed` boolean ensures `cleanup()` never double-removes the listener
- **`socket.setNoDelay(true)`** — disables Nagle's algorithm so heartbeat bytes flush immediately

```ts
import { jobEmitter, type JobProgressEvent } from '../queue/job-events';

const SSE_HEARTBEAT_MS = 15_000;
const SSE_MAX_TTL_MS = 10 * 60_000;
const activeJobStreams = new Map<string, boolean>();

router.get('/jobs/:id/stream', (req, res) => {
  const id = req.params['id'] as string;

  if (activeJobStreams.get(id)) {
    res.status(409).json({ error: 'A stream for this job is already active' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  req.socket?.setNoDelay(true); // flush small writes immediately

  activeJobStreams.set(id, true);
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(ttlTimeout);
    jobEmitter.off(id, onProgress);
    activeJobStreams.delete(id);
  };

  const onProgress = (event: JobProgressEvent) => {
    if (closed) return;
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (event.status === 'completed' || event.status === 'failed') {
      cleanup();
      res.end();
    }
  };

  jobEmitter.on(id, onProgress);

  const heartbeat = setInterval(() => {
    if (!closed) res.write(': heartbeat\n\n');
  }, SSE_HEARTBEAT_MS);

  const ttlTimeout = setTimeout(() => {
    if (!closed) {
      res.write(
        `data: ${JSON.stringify({ jobId: id, step: 'stream', status: 'failed', message: 'Stream TTL exceeded' })}\n\n`
      );
      cleanup();
      res.end();
    }
  }, SSE_MAX_TTL_MS);

  req.on('close', cleanup);
});
```

`GET /api/research/jobs/:id` — polling fallback (query DB for job status in later phases, placeholder for now)

```ts
router.get('/jobs/:id', (req, res) => {
  res.json({ jobId: req.params.id, status: 'processing' });
});
```

### Web client — `src/hooks/useSSE.ts`

Native `EventSource` cannot send custom headers — use `@microsoft/fetch-event-source` instead.

```ts
import { fetchEventSource } from '@microsoft/fetch-event-source';
// AbortController for cleanup on unmount
// Pass x-api-key + Authorization headers
// onerror throws to stop automatic retry (server sends terminal event on job end)
// onmessage skips heartbeat comment frames (empty msg.data)
```

Install: `pnpm add @microsoft/fetch-event-source` (web package).

### Validation ✅ (verified)

- `GET /api/research/jobs/:id/stream` opens and holds connection (HTTP 200)
- Second request to same job ID while first is active → HTTP 409 `{"error":"A stream for this job is already active"}`
- Heartbeat `: heartbeat` line received after 15 s
- After client disconnect, reconnect to same job ID succeeds (HTTP 200) — cleanup ran correctly

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

**`tsconfig.json`** — add `customConditions` so TypeScript resolves `@google/genai` node exports under `moduleResolution: bundler`:

```json
"customConditions": ["node"]
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
  private model: string; // assigned per-instance: cloud='qwen3.5:397b', local='llama3'
  private embeddingModel: string = 'nomic-embed-text';

  constructor(config: OllamaConfig = {}) {
    const env = getEnv();
    if (config.cloud) {
      if (!env.OLLAMA_CLOUD_BASE_URL) throw new Error('OLLAMA_CLOUD_BASE_URL is not set');
      this.model = 'qwen3.5:397b'; // Ollama Cloud model (tag required — no default)
      this.client = new Ollama({
        host: env.OLLAMA_CLOUD_BASE_URL,
        headers: env.OLLAMA_API_KEY ? { Authorization: `Bearer ${env.OLLAMA_API_KEY}` } : {},
      });
    } else {
      // local — low-reason offload, do NOT mutate process.env
      this.model = 'llama3';
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
  private model: string = 'gemini-2.5-flash';
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
      contents: geminiMessages,
      config: { systemInstruction: systemPrompt },
    });

    const text = response.text;
    if (!text) throw new Error('No content in Gemini response');
    logger.debug({ model: this.model }, 'Gemini chat completed'); // gemini-2.5-flash
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

// Cache keyed by provider type — each type gets its own singleton
// (Single global cache caused gemini/ollama jobs to silently use the first-initialized provider)
const providerCache = new Map<ProviderType, AIProvider>();

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

### Validation ✅ (verified)

- All three `provider` values return HTTP 202 + `jobId`
- Logs show `Initialized OpenAI/Gemini/Ollama Cloud provider with local Ollama offload` per provider type
- `WARN: Local Ollama unavailable, falling back to primary` appears when local Ollama is down
- Gemini provider: uses `gemini-2.5-flash` (v1beta API; `gemini-1.5-flash` not available on this key)
- Ollama Cloud: model tag must be explicit — `qwen3.5:397b` (no default tag for `qwen3.5`)
- Ollama Cloud URL: `https://ollama.com` (not `api.ollama.ai`) per official docs
- Provider cache bug fixed: use `Map<ProviderType, AIProvider>` — single global cached the first provider, causing gemini/ollama jobs to silently use OpenAI

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

Note: embedding dimensions differ per provider:

- OpenAI `text-embedding-3-small` → **1536d**
- Ollama `nomic-embed-text` → **768d**
- Gemini `text-embedding-004` → **768d**

Zero-padding is NOT recommended.

**Pragmatic approach for hackathon**: two nullable vector columns — `embedding` (1536d, OpenAI) and `embeddingSmall` (768d, Ollama + Gemini). Scope similarity search by `embeddingModel` stored on the session so the correct column is queried.

Embedding model defaults per provider:

- `openai` → `text-embedding-3-small` (1536d) → use `embedding` column
- `gemini` → `text-embedding-004` (768d) → use `embeddingSmall` column
- `ollama` → `nomic-embed-text` (768d) → use `embeddingSmall` column

### Files to modify

**`src/ai/ollama.provider.ts`** — already done in Phase 4: `embeddingModel = 'nomic-embed-text'` is separate from chat model, and `embed()` uses it. No further changes needed.

### Additional file to update

**`src/routes/research.routes.ts`** — `GET /jobs/:id` already returns `completedJobCache` result from Phase 4 reconnect fix. When adding DB persistence, **extend** rather than replace:

```ts
router.get('/jobs/:id', async (req, res) => {
  const id = req.params['id'] as string;
  // 1. Check in-memory cache first (fast path for jobs completed in this process)
  const cached = completedJobCache.get(id);
  if (cached) {
    return sendSuccess(res, { jobId: id, status: cached.status, result: cached.data });
  }
  // 2. Fall back to DB (survives server restarts)
  const session = await db.query.researchSessions.findFirst({
    where: eq(researchSessions.jobId, id),
  });
  if (session) {
    return sendSuccess(res, { jobId: id, status: session.status, result: session.result });
  }
  return sendSuccess(res, { jobId: id, status: 'processing' });
});
```

### Run migration

```bash
pnpm db:generate
pnpm db:migrate
```

### Validation

- Schema migration runs without errors
- `researchSessions` table has `embedding_model`, `embedding_dimensions`, `status`, `result` columns
- `documents` table has both vector columns (`embedding` 1536d, `embedding_small` 768d)
- `embed()` call on OllamaProvider uses `nomic-embed-text` (confirm in Ollama logs)
- `embed()` call on GeminiProvider uses `text-embedding-004`
- `GET /jobs/:id` returns result from DB after server restart (not just in-memory cache)

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
  // Use embedding_small column for 768d providers (Gemini, Ollama); embedding for OpenAI (1536d)
  const is768d = queryEmbedding.length === 768;
  const vectorCol = is768d ? 'embedding_small' : 'embedding';
  const results = await db
    .select({ content: documents.content })
    .from(documents)
    .where(eq(documents.sessionId, sessionId))
    .orderBy(sql`${sql.identifier(vectorCol)} <=> ${embeddingLiteral}::vector`)
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
3. **Provider cache in `getAIProvider()` is keyed by `ProviderType`** — `resetAIProvider(type?)` clears one or all. Each job instantiates its provider by type; no per-request reset needed unless keys change at runtime
4. **SSE connections must clean up event listeners on `req.close`** — already noted in Phase 2
5. **pg-boss schema tables are managed by pg-boss itself** — do not create them manually via Drizzle
6. **Local Ollama is always the low-reason offload target** — if unavailable, `HybridProvider` falls back to the primary provider silently. Never crash on Ollama unavailability
7. **`GEMINI_API_KEY` and `OLLAMA_CLOUD_BASE_URL` are optional in env** — their respective providers throw at construction time if keys are missing; the factory only instantiates them when that provider is requested
8. **Never mutate `process.env.OLLAMA_HOST` globally** — pass host directly to the `Ollama` constructor so local and cloud instances can coexist in the same process
