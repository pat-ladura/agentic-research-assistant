# System Design Document: Agentic Research Assistant

## 1. Executive Summary

The Agentic Research Assistant automates complex research tasks using a **Hybrid-Provider LLM strategy** (mixing local and cloud models) and an asynchronous agentic workflow. It decomposes user queries into sub-questions, fetches real web content via Tavily, performs multi-stage RAG with reranking, and synthesizes final reports delivered in real-time via SSE.

---

## 2. System Architecture

Decoupled, event-driven architecture handles long-running LLM processes without blocking the UI.

### 2.1 Component Overview

| Component | Description |
|---|---|
| **Frontend (React SPA)** | Submits queries via REST; receives real-time progress via SSE. |
| **API Gateway (Express 5)** | Validates JWT/API-key auth, enqueues jobs, serves SSE streams. |
| **Job Queue (PG-BOSS)** | PostgreSQL-backed task queue — persists jobs; survives worker crashes. |
| **Research Worker** | Consumes jobs from PG-BOSS and manages a `ResearcherAgent` instance per job. |
| **Hybrid Provider (Router)** | Wraps every primary provider. Routes prompts by reasoning level: low-reasoning tasks offload to local Ollama to reduce cost and latency; high-reasoning tasks go to the selected primary. |
| **Tavily Search** | External web search API called during the Search step to fetch real-time source content. |
| **RAG / Vector Store** | Stores fetched web chunks as document embeddings in PostgreSQL (pgvector); retrieval uses cosine distance against the query embedding. |

### 2.2 Provider Types

Three selectable provider types, each backed by a `HybridProvider`:

| Type | Primary Model | Low-Reason Offload | Embedding Model |
|---|---|---|---|
| `openai` | OpenAI `gpt-4o-mini` | → Local Ollama `llama3` | `text-embedding-3-small` (1536d) |
| `ollama` | Ollama Cloud `gemma4:31b` | → Local Ollama `llama3` | `qwen3-embedding` (1024d) |
| `ollama-local` | Local Ollama `llama3` | none (already local) | `qwen3-embedding` (1024d) |

The `HybridProvider` calls `provider.chat(..., { lowReason: true })` for steps that don't require deep reasoning (e.g. summarize sub-questions). If local Ollama is unavailable it falls back to the primary silently.

---

## 3. Data Model

PostgreSQL + pgvector. All vector columns exist in multiple dimensions to support any embedding model without schema migrations.

### Tables

| Table | Purpose |
|---|---|
| `users` | Core identity; passwords hashed with bcryptjs. |
| `research_sessions` | Top-level container for a research project. Stores chosen `provider`, `embeddingModel`, and `embeddingDimensions`. |
| `research_jobs` | One job per query execution. Holds `status` (`pending → processing → completed/failed`), final `result`, and `pgBossJobId` linking to the queue. |
| `research_steps` | Granular step tracking: `decompose`, `search`, `summarize`, `synthesize`. Each has `status`, `startedAt`, `completedAt`. |
| `step_results` | Stores the AI output for each completed step (`content`, optional `rawOutput`). |
| `memory_entries` | Agent's in-context chat history scoped to a job. Includes multi-dimension vector columns for semantic replay. |
| `documents` | Web-scraped / external knowledge chunks stored with embeddings for RAG. Session-scoped to prevent cross-session leakage. |

### Vector Column Strategy

Both `documents` and `memory_entries` carry four vector columns:

| Column | Dimensions | Model |
|---|---|---|
| `embedding` | 1536d | OpenAI `text-embedding-3-small` |
| `embedding_small` | 768d | Legacy |
| `embedding_medium` | 1024d | Ollama `qwen3-embedding` |
| `embedding_large` | 4096d | Ollama `qwen3-embedding` (8b) |

The retriever selects the correct column based on the query embedding's dimensionality.

---

## 4. Agentic Workflow

Four-step linear pipeline in `ResearcherAgent.run()`:

```
Decompose → Search (+ Tavily fetch) → Summarize (+ RAG prime) → Synthesize (+ RAG rerank)
```

### Step 1 — Decompose
- Breaks the user query into 3–5 focused sub-questions.
- Uses the primary provider (high-reasoning).

### Step 2 — Search
- Generates two search queries per sub-question (broad + specific).
- Calls **Tavily API** in parallel for each query (up to 6 results each).
- Deduplicates by URL and stores all chunks as `documents` rows with embeddings.
- Skipped gracefully if `TAVILY_API_KEY` is not set.

### Step 3 — Summarize
- Before calling the LLM, injects top-10 RAG chunks retrieved against the original query to ground summaries in real web content.
- Writes a detailed paragraph summary for each sub-question.
- Uses the primary provider (high-reasoning for quality).

### Step 4 — Synthesize
- Retrieves RAG chunks for the original query **plus all sub-questions** (up to 20 per query).
- Merges, deduplicates by source URL, then **reranks** down to top-5 using the reranker (OpenAI or local Ollama).
- Prunes agent memory to the 12 most relevant messages before the final call.
- LLM produces a structured JSON report with inline `[Source #]` citations and a References section.
- Result saved to `research_jobs.result`; SSE stream closed on completion.

---

## 5. Sequence & Information Flow

1. **Submit**: User submits a query from the React frontend.
2. **Ack & Stream**: Express API returns `202 Accepted` with `jobId`; client opens SSE connection to `/api/research/jobs/:jobId/stream`.
3. **SSE Guardrails**: Heartbeat every 15 s to detect dead connections; hard-close after 25 min. Reconnecting clients receive the terminal event immediately from an in-memory cache.
4. **Job Pickup**: PG-BOSS delivers the job to the Research Worker.
5. **Agent Loop**:
   - Agent emits step events (`started → progress → completed`) via `EventEmitter` → SSE.
   - Each step persists to `research_steps` + `step_results`.
   - Hybrid Provider routes low-reasoning calls to local Ollama.
   - Tavily fetches web sources; chunks stored in `documents`.
   - RAG retrieval + reranking grounds the final synthesis.
6. **Completion**: Final report saved to `research_jobs.result`; SSE sends terminal `synthesize/completed` event and closes.

---

## 6. Infrastructure & Tech Stack

### Frontend
- React 19, TypeScript, Vite
- Tailwind CSS v4, shadcn/ui
- Zustand (auth state), React Query (server state)
- React Router v7
- ky HTTP client, native EventSource for SSE

### Backend
- Node.js 20, TypeScript (strict), Express 5
- Pino structured JSON logging (pretty in dev)
- Rate limiting, JWT + API key auth middleware

### Database
- PostgreSQL 16 + pgvector extension
- Drizzle ORM (schema-first, typed queries)

### Task Queue
- pg-boss (PostgreSQL-backed; jobs survive restarts)

### AI Integration

| Role | Provider | Model |
|---|---|---|
| Chat (high-reason) | OpenAI | `gpt-4o-mini` |
| Chat (high-reason) | Ollama Cloud | `gemma4:31b` |
| Chat (low-reason / offload) | Ollama Local | `llama3` |
| Embeddings (OpenAI path) | OpenAI | `text-embedding-3-small` (1536d) |
| Embeddings (Ollama path) | Ollama Local | `qwen3-embedding` (1024d) |
| Web Search | Tavily API | — |
| Reranking | OpenAI or Ollama Local | provider-dependent |

---

## 7. Key Features & Design Decisions

### Cost Efficiency via Reasoning-Level Routing
The `HybridProvider` avoids burning expensive cloud tokens on tasks a local model can handle. Simple summarization and sub-question decomposition are offloaded to local `llama3` when `lowReason = true`.

### Grounded Outputs via Tavily + RAG
Rather than relying on the LLM's internal knowledge, the Search step fetches real web content through Tavily and stores it as session-scoped document chunks. The Synthesize step retrieves and reranks these chunks to produce citations-backed, verifiable reports.

### Observability via Step Persistence
Every agent step (`decompose`, `search`, `summarize`, `synthesize`) is written to `research_steps` + `step_results`. The UI can render the agent's full reasoning chain, not just the final answer.

### Resilience via Database-Backed Queue
pg-boss persists jobs in PostgreSQL. If the worker crashes mid-job, the job is not lost and can be retried or re-inspected.

### SSE Reconnect Support
Completed job events are cached in-memory so a client that reconnects after a job finishes receives the terminal result immediately without re-running the research.

### Multi-Dimension Vector Schema
Storing four vector columns per row allows switching embedding models without schema migrations. The retriever auto-selects the column by output dimensionality.
