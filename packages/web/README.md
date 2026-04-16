# Agentic Research Assistant Web

A modern web application for conducting AI-powered research using multiple LLM providers. Built with React, TypeScript, and Vite, this application enables users to create research sessions, submit queries, and track research jobs in real-time.

## Overview

The Agentic Research Assistant Web is the frontend component of a comprehensive research platform that leverages multiple AI providers to deliver intelligent, agentic research capabilities. Users can:

- **Authenticate securely** with token-based authentication
- **Create research sessions** with customizable titles and descriptions
- **Select from multiple AI providers** (OpenAI GPT-4o, Google Gemini 1.5 Pro, Ollama Cloud)
- **Submit research queries** and monitor job execution in real-time
- **View research history** and session details
- **Track research progress** with job status updates

## Tech Stack

### Frontend Framework & Build Tools

- **React 19.2** - UI framework with hooks
- **TypeScript 6.0** - Type-safe development
- **Vite 8.0** - Fast build tool with HMR
- **Tailwind CSS 4.2** - Utility-first styling
- **Tailwind CSS Vite Plugin** - Optimized Tailwind integration

### State Management & Data Fetching

- **Zustand 5.0** - Lightweight state management for authentication
- **React Query 5.96** - Server state management and caching
- **ky 2.0** - Minimal HTTP client with advanced features

### Routing & Navigation

- **React Router 7.14** - Client-side routing and navigation

### UI Components

- **shadcn/ui** - High-quality, composable UI components
- **Base UI (Headless Components)** - Unstyled, customizable components
- **Lucide React** - Icon library
- **Class Variance Authority** - CSS variant management
- **tw-animate-css** - Tailwind CSS animation utilities

### Development Tools

- **ESLint 9.39** - Code linting
- **TypeScript ESLint** - TypeScript-specific linting rules

## Project Structure

```
src/
├── api/
│   ├── auth.api.ts          # Authentication endpoints
│   ├── client.ts            # HTTP client configuration
│   └── research.api.ts      # Research session & job endpoints
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx      # Main application layout
│   │   └── ProtectedRoute.tsx # Route protection wrapper
│   └── ui/                  # Reusable UI components (button, card, input, etc.)
├── hooks/
│   └── useSSE.ts            # Server-Sent Events hook for real-time updates
├── lib/
│   └── utils.ts             # Utility functions
├── pages/
│   ├── auth/
│   │   └── LoginPage.tsx     # Authentication page
│   ├── dashboard/
│   │   └── DashboardPage.tsx # Main dashboard
│   ├── research/
│   │   ├── JobDetailPage.tsx # Individual research job details
│   │   └── NewResearchPage.tsx # Create new research session
│   └── sessions/
│       ├── SessionDetailPage.tsx # Individual session details
│       └── SessionsPage.tsx   # List of research sessions
├── store/
│   └── auth.store.ts        # Zustand authentication store
├── types/
│   └── index.ts             # TypeScript type definitions
├── App.tsx                  # Main app component
├── main.tsx                 # React entry point
├── index.css                # Global styles
└── App.css                  # App-level styles
```

## Key Features

### 1. Authentication & Session Management

- JWT token-based authentication
- Secure login via email/password
- Protected routes with automatic OAuth flow handling
- Session persistence via localStorage

### 2. Research Session Management

- Create new research sessions with title and optional description
- Persistent session history
- Session details and metadata tracking
- Multiple sessions per user

### 3. Multi-Provider AI Support

- **OpenAI GPT-4o** - Advanced reasoning and code generation
- **Google Gemini 1.5 Pro** - Multimodal capabilities
- **Ollama Cloud** - Open-source llama3 model

### 4. Real-Time Updates

- Server-Sent Events (SSE) for live job status updates
- Real-time progress tracking
- Automatic UI updates without polling

### 5. Research Job Tracking

- Submit and monitor research queries
- View job details with execution status
- Track job results and metadata

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd agentic-research-assistant-web
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   # or
   npm install
   ```

3. **Configure environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Update `.env.local` with:

   ```env
   VITE_API_KEY=your_api_key_here
   VITE_API_BASE_URL=http://localhost:3000/api
   ```

### Development

Start the development server with hot module reloading:

```bash
pnpm dev
# or
npm run dev
```

The application will be available at `http://localhost:5173`

### Building for Production

```bash
pnpm build
# or
npm run build
```

Outputs optimized production build to `dist/`

### Preview Production Build

```bash
pnpm preview
# or
npm run preview
```

## API Integration

### Standard Response Format

All API responses follow a consistent envelope structure:

**Success Response:**

```json
{
  "success": true,
  "data": {
    /* response payload */
  },
  "message": "Optional human-readable message"
}
```

**Error Response:**

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description",
    "details": []
  }
}
```

## Code Quality

### Linting

Run ESLint to check code quality:

```bash
pnpm lint
# or
npm run lint
```

### Type Checking

TypeScript is configured for strict type checking:

```bash
pnpm build
# Includes type checking via `tsc -b`
```

## 📄 Design Document

For architecture decisions, phase-by-phase implementation plan, and system design details, see the [Design Document](https://docs.google.com/document/d/11rSkNOKnMKpk8A2TJ1UzcBPQpkfQdzwgMEzCojZqJ94/edit?usp=drive_link).
