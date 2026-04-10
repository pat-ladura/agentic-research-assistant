# API Response Guide — Frontend Integration

This document describes the standard response contract used by every endpoint in the
Agentic Research Assistant API. Use it as the single source of truth when writing
frontend fetch wrappers, error boundaries, and UI feedback logic.

---

## Standard Response Envelope

Every JSON response (success **and** error) shares the same top-level shape:

```ts
// Success
{
  "success": true,
  "data": T,          // payload (object, array, or null)
  "message"?: string  // optional human-readable summary
}

// Error
{
  "success": false,
  "error": {
    "code": string,       // machine-readable error code (see table below)
    "message": string,    // human-readable description
    "details"?: ZodIssue[] // only present on VALIDATION_ERROR
  }
}
```

> **The `success` boolean is always present.** Check it first — never rely solely on
> HTTP status codes, but always use both together.

---

## HTTP Status Code Reference

| Status | Meaning | `success` |
|--------|---------|-----------|
| `200 OK` | Request fulfilled | `true` |
| `201 Created` | Resource created | `true` |
| `202 Accepted` | Job queued (async) | `true` |
| `400 Bad Request` | Validation or missing fields | `false` |
| `401 Unauthorized` | Missing / invalid token or credentials | `false` |
| `403 Forbidden` | Authenticated but not allowed | `false` |
| `404 Not Found` | Resource does not exist | `false` |
| `409 Conflict` | Duplicate resource (e.g. email taken) | `false` |
| `500 Internal Server Error` | Unexpected server failure | `false` |

---

## Error Code Reference

| `error.code` | HTTP Status | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Missing fields, type mismatches, Zod failures |
| `UNAUTHORIZED` | 401 | No JWT / revoked JWT / wrong password |
| `FORBIDDEN` | 403 | Authenticated but lacks permission |
| `NOT_FOUND` | 404 | Session, job, or user does not exist |
| `CONFLICT` | 409 | Email already registered |
| `INTERNAL_ERROR` | 500 | Unhandled server exceptions |
| `SERVICE_UNAVAILABLE` | 503 | Downstream dependency unavailable |

---

## Endpoint Response Shapes

### Authentication

#### `POST /api/auth/login`

**Request**
```json
{ "email": "user@example.com", "password": "secret" }
```

**200 OK**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGci...",
    "user": { "id": 1, "email": "user@example.com", "firstName": "Jane", "lastName": "Doe" }
  },
  "message": "Login successful"
}
```

**400 Validation error** (e.g. invalid email format)
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [{ "path": ["email"], "message": "Invalid email" }]
  }
}
```

**401 Wrong credentials**
```json
{
  "success": false,
  "error": { "code": "UNAUTHORIZED", "message": "Invalid email or password" }
}
```

---

#### `POST /api/auth/logout`

Requires `Authorization: Bearer <token>` header.

**200 OK**
```json
{ "success": true, "data": null, "message": "Logout successful" }
```

**401 Not authenticated**
```json
{
  "success": false,
  "error": { "code": "UNAUTHORIZED", "message": "User not authenticated" }
}
```

---

### User

#### `POST /api/user/register`

**Request**
```json
{ "firstName": "Jane", "lastName": "Doe", "email": "jane@example.com", "password": "min8chars" }
```

**201 Created**
```json
{
  "success": true,
  "data": {
    "user": { "id": 2, "email": "jane@example.com", "firstName": "Jane", "lastName": "Doe" }
  },
  "message": "User registered successfully"
}
```

**400 Validation error**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [{ "path": ["password"], "message": "Password must be at least 8 characters" }]
  }
}
```

**409 Email already registered**
```json
{
  "success": false,
  "error": { "code": "CONFLICT", "message": "Email already registered" }
}
```

---

### Research Sessions

#### `GET /api/research/sessions`

**200 OK**
```json
{ "success": true, "data": { "sessions": [ /* session objects */ ] } }
```

---

#### `POST /api/research/sessions`

**Request**
```json
{ "title": "Quantum Computing Overview" }
```

**201 Created**
```json
{
  "success": true,
  "data": { "id": 42, "title": "Quantum Computing Overview", "createdAt": "2026-04-07T..." },
  "message": "Research session created"
}
```

**400 Missing title**
```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Missing required field: title" }
}
```

---

#### `GET /api/research/sessions/:id`

**200 OK**
```json
{
  "success": true,
  "data": { "id": "42", "title": "Quantum Computing Overview", "createdAt": "2026-04-07T..." }
}
```

**404 Not found** (Phase 5, when DB queries are live)
```json
{
  "success": false,
  "error": { "code": "NOT_FOUND", "message": "Resource not found" }
}
```

---

### Research Query & Jobs

#### `POST /api/research/query`

Enqueues a background research job. Returns immediately with a `jobId`.

**Request**
```json
{ "sessionId": 42, "query": "Explain quantum entanglement", "provider": "openai" }
```

Valid `provider` values: `"openai"` | `"gemini"` | `"ollama"`

**202 Accepted**
```json
{
  "success": true,
  "data": { "jobId": "b3f1a2c4-...", "sessionId": 42, "status": "queued" },
  "message": "Query queued for processing"
}
```

**400 Missing fields**
```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Missing required fields: sessionId, query" }
}
```

---

#### `GET /api/research/jobs/:id`

Polling fallback for job status.

**200 OK**
```json
{
  "success": true,
  "data": { "jobId": "b3f1a2c4-...", "status": "processing" }
}
```

Possible `status` values: `"queued"` | `"processing"` | `"completed"` | `"failed"`

---

#### `GET /api/research/jobs/:id/stream` (SSE)

Server-Sent Events stream. **Does not return JSON.** Each event is a text/event-stream
line. Each event's `data` field is a JSON-encoded `JobProgressEvent`:

```ts
interface JobProgressEvent {
  jobId: string;
  step: 'decompose' | 'search' | 'summarize' | 'synthesize' | 'agent';
  status: 'started' | 'progress' | 'completed' | 'failed';
  message: string;
  data?: unknown; // step-specific payload
}
```

Example stream:
```
data: {"jobId":"b3f1","step":"decompose","status":"started","message":"Breaking down the research query"}

data: {"jobId":"b3f1","step":"decompose","status":"completed","message":"Sub-questions identified","data":{"subQuestions":"1. ...\n2. ..."}}

data: {"jobId":"b3f1","step":"synthesize","status":"completed","message":"Research complete","data":{"report":"..."}}
```

---

### Health

#### `GET /api/health/status`

**200 OK**
```json
{
  "success": true,
  "data": { "status": "ok", "database": "connected", "timestamp": "2026-04-07T..." }
}
```

**500** (DB unavailable)
```json
{
  "success": false,
  "error": { "code": "INTERNAL_ERROR", "message": "Internal Server Error" }
}
```

---

## Frontend Integration Patterns

### 1. Base Fetch Wrapper

```ts
// lib/api.ts

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown[]
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('token');

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const json = await res.json();

  if (!json.success) {
    throw new ApiError(
      json.error.code,
      json.error.message,
      res.status,
      json.error.details
    );
  }

  return json.data as T;
}

export const api = {
  get:    <T>(path: string)                      => request<T>(path),
  post:   <T>(path: string, body: unknown)       => request<T>(path, { method: 'POST',  body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown)       => request<T>(path, { method: 'PUT',   body: JSON.stringify(body) }),
  delete: <T>(path: string)                      => request<T>(path, { method: 'DELETE' }),
};
```

---

### 2. Authentication Flow

```ts
// services/auth.ts
import { api, ApiError } from '../lib/api';

interface LoginResponse {
  token: string;
  user: { id: number; email: string; firstName: string; lastName: string };
}

export async function login(email: string, password: string) {
  try {
    const data = await api.post<LoginResponse>('/api/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    return data.user;
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === 'UNAUTHORIZED') {
        // Show "Invalid email or password" to the user
        throw err;
      }
      if (err.code === 'VALIDATION_ERROR') {
        // Map err.details (ZodIssue[]) to form field errors
        throw err;
      }
    }
    throw err;
  }
}

export async function register(payload: {
  firstName: string; lastName: string; email: string; password: string;
}) {
  // ApiError with code === 'CONFLICT' means email taken (409)
  // ApiError with code === 'VALIDATION_ERROR' means field-level issues (400)
  return api.post('/api/user/register', payload);
}

export async function logout() {
  await api.post('/api/auth/logout', {});
  localStorage.removeItem('token');
}
```

---

### 3. Research Query + SSE Progress

```ts
// services/research.ts
import { api } from '../lib/api';

interface JobQueued {
  jobId: string;
  sessionId: number;
  status: 'queued';
}

export async function submitQuery(sessionId: number, query: string, provider = 'openai') {
  return api.post<JobQueued>('/api/research/query', { sessionId, query, provider });
}

export function streamJobProgress(
  jobId: string,
  onEvent: (event: JobProgressEvent) => void,
  onError?: (err: Event) => void
): () => void {
  const token = localStorage.getItem('token');
  const url = `/api/research/jobs/${jobId}/stream${token ? `?token=${token}` : ''}`;
  const es = new EventSource(url);

  es.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data) as JobProgressEvent);
    } catch {
      /* ignore unparseable frames */
    }
  };

  if (onError) es.onerror = onError;

  // Return cleanup function
  return () => es.close();
}

interface JobProgressEvent {
  jobId: string;
  step: 'decompose' | 'search' | 'summarize' | 'synthesize' | 'agent';
  status: 'started' | 'progress' | 'completed' | 'failed';
  message: string;
  data?: unknown;
}
```

**Usage in a React component:**
```tsx
async function handleSubmit() {
  try {
    const { jobId } = await submitQuery(sessionId, query, provider);
    const cleanup = streamJobProgress(jobId, (event) => {
      setSteps(prev => [...prev, event]);
      if (event.step === 'synthesize' && event.status === 'completed') {
        setReport((event.data as any).report);
        cleanup(); // close SSE when done
      }
      if (event.status === 'failed') {
        setError(event.message);
        cleanup();
      }
    });
  } catch (err) {
    if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
      setFormError(err.message);
    }
  }
}
```

---

### 4. Global Error Handling

```ts
// Centralised error classifier
import { ApiError } from '../lib/api';

export function classifyApiError(err: unknown): {
  userMessage: string;
  shouldLogout: boolean;
  fieldErrors?: Record<string, string>;
} {
  if (!(err instanceof ApiError)) {
    return { userMessage: 'An unexpected error occurred. Please try again.', shouldLogout: false };
  }

  switch (err.code) {
    case 'VALIDATION_ERROR': {
      const fieldErrors: Record<string, string> = {};
      (err.details as { path: string[]; message: string }[] ?? []).forEach(d => {
        if (d.path.length > 0) fieldErrors[d.path[0]] = d.message;
      });
      return { userMessage: err.message, shouldLogout: false, fieldErrors };
    }
    case 'UNAUTHORIZED':
      return { userMessage: 'Your session has expired. Please log in again.', shouldLogout: true };
    case 'FORBIDDEN':
      return { userMessage: 'You do not have permission to perform this action.', shouldLogout: false };
    case 'NOT_FOUND':
      return { userMessage: 'The requested resource was not found.', shouldLogout: false };
    case 'CONFLICT':
      return { userMessage: err.message, shouldLogout: false };
    case 'INTERNAL_ERROR':
    default:
      return { userMessage: 'A server error occurred. Please try again later.', shouldLogout: false };
  }
}
```

---

### 5. Handling Validation `details`

When `error.code === "VALIDATION_ERROR"`, `error.details` is an array of Zod issues:

```ts
interface ZodIssue {
  path: (string | number)[];  // field path, e.g. ["email"] or ["password"]
  message: string;            // human-readable message
  code: string;               // zod error code, e.g. "too_small"
}
```

Map them to form state to highlight individual fields:
```ts
const fieldErrors = issues.reduce<Record<string, string>>((acc, issue) => {
  const key = issue.path.join('.');
  if (key) acc[key] = issue.message;
  return acc;
}, {});
```

---

### 6. Polling Fallback (if SSE is unavailable)

```ts
export async function pollJobStatus(
  jobId: string,
  onStatus: (status: string) => void,
  intervalMs = 2000
): Promise<void> {
  return new Promise((resolve) => {
    const id = setInterval(async () => {
      try {
        const data = await api.get<{ jobId: string; status: string }>(
          `/api/research/jobs/${jobId}`
        );
        onStatus(data.status);
        if (data.status === 'completed' || data.status === 'failed') {
          clearInterval(id);
          resolve();
        }
      } catch {
        clearInterval(id);
        resolve();
      }
    }, intervalMs);
  });
}
```

---

## Quick Reference Decision Tree

```
fetch() completes
  └─ json.success === true
       └─ Use json.data, optionally show json.message  ✅
  └─ json.success === false
       ├─ error.code === VALIDATION_ERROR  → map error.details to form fields  🔴
       ├─ error.code === UNAUTHORIZED      → redirect to /login, clear token  🔒
       ├─ error.code === CONFLICT          → show error.message inline        ⚠️
       ├─ error.code === NOT_FOUND         → show 404 UI / redirect            🔍
       └─ error.code === INTERNAL_ERROR    → show generic retry toast          💥

HTTP 202 Accepted (POST /query)
  └─ Store jobId from data.jobId
  └─ Open EventSource /api/research/jobs/:id/stream
       ├─ event.status === 'started'   → update step progress bar
       ├─ event.status === 'completed' → mark step done; if step=synthesize → show report
       └─ event.status === 'failed'    → show error, close EventSource
```
