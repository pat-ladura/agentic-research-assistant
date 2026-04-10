# Agentic Research Assistant

A full-stack monorepo for an agentic AI research assistant. Submit research queries, monitor job execution in real-time, and get intelligent results powered by multiple LLM providers — all in one platform.

## Packages

| Package | Description |
|---|---|
| [`packages/api`](packages/api) | TypeScript Express REST API with pgvector-enabled PostgreSQL and multi-provider AI |
| [`packages/web`](packages/web) | React + Vite frontend with real-time SSE updates and shadcn/ui components |

## Tech Stack

### API
- **Runtime**: Node.js 20, TypeScript (strict)
- **Framework**: Express.js
- **Database**: PostgreSQL 16 + pgvector, Drizzle ORM
- **AI Providers**: OpenAI GPT-4o, Google Gemini 1.5 Pro, Ollama (local/cloud)
- **Auth**: JWT + API key middleware
- **Logging**: Pino structured JSON logging

### Web
- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS v4, shadcn/ui
- **State**: Zustand (auth), React Query (server state)
- **HTTP**: ky client
- **Routing**: React Router v7
- **Real-time**: Server-Sent Events (SSE)

## Monorepo Structure

```
/
├── packages/
│   ├── api/        # @ara/api — Express REST API
│   └── web/        # @ara/web — React frontend
├── docker-compose.yml
├── package.json
└── pnpm-workspace.yaml
```

## Prerequisites

- Node.js 20.x (`.nvmrc` provided)
- pnpm 10.x+
- Docker & Docker Compose

## Getting Started

### 1. Install dependencies

```bash
nvm use          # optional, sets Node 20 via nvm
pnpm install
```

### 2. Configure environment variables

**API** — copy and fill in `packages/api/.env`:
```bash
cp packages/api/.env.example packages/api/.env
```

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `DRIZZLE_DATABASE_URL` | ✅ | PostgreSQL connection string for Drizzle ORM |
| `API_KEY` | ✅ | API key for request authentication |
| `JWT_SECRET` | ✅ | Secret for signing JWT tokens |
| `OPENAI_API_KEY` | ❌ | OpenAI API key |
| `GEMINI_API_KEY` | ❌ | Google Gemini API key |
| `OLLAMA_API_KEY` | ❌ | Ollama Cloud API key |
| `OLLAMA_BASE_URL` | ❌ | Ollama server URL (default: `http://localhost:11434`) |
| `PORT` | ❌ | Server port (default: `3005`) |
| `NODE_ENV` | ❌ | `development` or `production` |

**Web** — copy and fill in `packages/web/.env.local`:
```bash
cp packages/web/.env.example packages/web/.env.local
```

| Variable | Description |
|---|---|
| `VITE_API_KEY` | Matches the `API_KEY` set in the API |
| `VITE_API_BASE_URL` | API base URL (default: `http://localhost:3005/api`) |

### 3. Start the database

```bash
# PostgreSQL only
docker compose up -d postgres

# PostgreSQL + Ollama (local LLM)
docker compose --profile ollama up -d
```

### 4. Run database migrations

```bash
pnpm --filter @ara/api run db:migrate
```

### 5. Start development servers

```bash
# Run both API and web in parallel
pnpm dev

# Or run individually
pnpm dev:api
pnpm dev:web
```

- API: http://localhost:3005
- Web: http://localhost:5173

## Available Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start all packages in parallel (watch mode) |
| `pnpm dev:api` | Start the API dev server only |
| `pnpm dev:web` | Start the web dev server only |
| `pnpm build` | Build all packages |
| `pnpm build:api` | Build the API only |
| `pnpm build:web` | Build the web only |
| `pnpm format` | Format all packages with Prettier |

### API-specific scripts

```bash
pnpm --filter @ara/api run db:generate   # Generate Drizzle migrations from schema
pnpm --filter @ara/api run db:migrate    # Apply pending migrations
pnpm --filter @ara/api run db:studio     # Open Drizzle Studio
```

## Docker Deployment

```bash
# Start all services (API + PostgreSQL)
docker compose up -d

# Follow API logs
docker compose logs -f app

# Stop all services
docker compose down
```

## Features

- **Multi-provider AI** — switch between OpenAI, Gemini, and Ollama per research job
- **Research sessions** — organize queries into persistent, titled sessions
- **Real-time tracking** — live job status updates via Server-Sent Events
- **Secure auth** — JWT-based authentication with protected routes
- **Vector search** — pgvector-enabled PostgreSQL for semantic search capabilities
- **Rate limiting** — built-in request rate limiting on the API
- **Structured logging** — Pino JSON logging (pretty in dev, raw JSON in prod)

## Design Document

For architecture decisions and implementation details, see the [Design Document](https://docs.google.com/document/d/11rSkNOKnMKpk8A2TJ1UzcBPQpkfQdzwgMEzCojZqJ94/edit?usp=drive_link).
