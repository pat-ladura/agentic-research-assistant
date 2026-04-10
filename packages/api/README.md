# Agentic Research Assistant API

A TypeScript Express REST API for agentic research assistant with seamless integration of local (Ollama) and cloud (OpenAI) AI providers. Designed with pgvector-enabled PostgreSQL for semantic search capabilities.

## 🚀 Tech Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Node.js 20
- **Framework**: Express.js
- **Database**: PostgreSQL with pgvector extension
- **ORM**: Drizzle ORM with migrations
- **AI Providers**: Ollama (local and cloud), OpenAI (cloud), Gemini (cloud)
- **Logging**: Pino (structured JSON logging)
- **Rate Limiting**: express-rate-limit
- **Code Formatting**: Prettier
- **Package Manager**: pnpm
- **Containerization**: Docker & Docker Compose

## 📋 Prerequisites

- Node.js 20.x (managed via nvm)
- pnpm 10.x or higher
- Docker & Docker Compose (optional, for local development databases)
- PostgreSQL 16+ (or use the provided Docker Compose)
- OpenAI API key (for cloud AI provider)
- Gemini API key (for cloud AI provider)
- Ollama (for local and cloud AI provider)

## 🔧 Setup

### 1. Initial Setup

```bash
# Use Node 20 via nvm (if you have nvm installed)
nvm use

# Clone and navigate to the project
cd agentic-research-assistant-api

# Install dependencies
pnpm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env` and configure your values:

```bash
cp .env.example .env
```

**Environment Variables**:

| Variable               | Required | Description                                         |
| ---------------------- | -------- | --------------------------------------------------- |
| `PORT`                 | ❌       | Server port (default: 3005)                         |
| `DRIZZLE_DATABASE_URL` | ✅       | PostgreSQL connection string for Drizzle ORM        |
| `DATABASE_URL`         | ✅       | PostgreSQL connection string                        |
| `API_KEY`              | ✅       | API key for request authentication                  |
| `JWT_SECRET`           | ✅       | Secret for signing JWT tokens                       |
| `OPENAI_API_KEY`       | ❌       | OpenAI API key for cloud AI operations              |
| `OLLAMA_API_KEY`       | ❌       | Ollama Cloud API key                                |
| `GEMINI_API_KEY`       | ❌       | Google Gemini API key                               |
| `OLLAMA_BASE_URL`      | ❌       | Ollama server URL (default: http://localhost:11434) |
| `NODE_ENV`             | ❌       | Environment: `development` or `production`          |

**Example `.env`**:

```env
PORT=3005

DRIZZLE_DATABASE_URL=
DATABASE_URL=

API_KEY=
JWT_SECRET=

OPENAI_API_KEY=
OLLAMA_API_KEY=
GEMINI_API_KEY=
OLLAMA_BASE_URL=

NODE_ENV=
```

### 3. Database Setup (Docker Compose)

Start PostgreSQL and Ollama with:

```bash
docker compose up -d postgres
```

For Ollama as well (requires separate profile):

```bash
docker compose --profile ollama up -d
```

Then generate and run migrations:

```bash
pnpm db:generate
pnpm db:migrate
```

**Manual PostgreSQL Setup** (without Docker):

```bash
# Create database and enable pgvector extension
createdb agentic_research_db
psql agentic_research_db -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Run migrations
pnpm db:generate
pnpm db:migrate
```

## 📦 Available Scripts

```bash
# Development server with hot reload
pnpm dev

# Build TypeScript to JavaScript
pnpm build

# Start production server
pnpm start

# Database management
pnpm db:generate    # Generate migrations from schema
pnpm db:migrate     # Apply pending migrations
pnpm db:studio      # Open Drizzle Studio GUI for database exploration

# Code quality
pnpm format         # Format code with Prettier
pnpm format:check   # Check formatting without modifying
```

## 🏗️ Project Structure

```
src/
├── index.ts                    # Application entry point
├── app.ts                      # Express app setup & middleware
├── config/
│   ├── env.ts                  # Environment variable validation (Zod)
│   └── database.ts             # Drizzle ORM initialization
├── middleware/
│   ├── auth.ts                 # API key authentication
│   ├── error-handler.ts        # Global error handling
│   ├── rate-limiter.ts         # Express rate limiting
│   └── request-logger.ts       # Pino HTTP request logging
├── lib/
│   └── logger.ts               # Shared Pino logger instance
├── routes/
│   ├── index.ts                # Route aggregator
│   ├── health.routes.ts        # Health check endpoints
│   └── research.routes.ts      # Research/AI endpoints
├── ai/
│   ├── provider.ts             # AI provider interface contract
│   ├── ollama.provider.ts      # Ollama local AI implementation
│   ├── openai.provider.ts      # OpenAI cloud AI implementation
│   └── index.ts                # AI provider factory
├── db/
│   └── schema/
│       └── index.ts            # Drizzle schema definitions
└── types/
    └── index.ts                # Shared TypeScript types

drizzle/                         # Auto-generated migrations (after pnpm db:generate)
dist/                            # Compiled JavaScript (after pnpm build)
```

## 🔌 API Endpoints

### Health Check (No Auth Required)

```bash
GET /health
GET /api/health/status
```

**Response**:

```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-04-02T10:30:00Z"
}
```

## 🐳 Docker Deployment

### Development with Docker Compose

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f app

# Stop services
docker compose down
```

## 📝 Logging

The application uses Pino for structured JSON logging. Logs are pretty-printed in development and output as JSON in production.

## 📄 Design Document

For architecture decisions, phase-by-phase implementation plan, and system design details, see the [Design Document](https://docs.google.com/document/d/11rSkNOKnMKpk8A2TJ1UzcBPQpkfQdzwgMEzCojZqJ94/edit?usp=drive_link).

