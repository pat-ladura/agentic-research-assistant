import { boolean, integer, pgTable, serial, text, timestamp, vector } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Users table
 * Stores user accounts; passwords are hashed with bcryptjs before insert
 */
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Research Sessions table
 * Stores information about research conversations/sessions
 */
export const researchSessions = pgTable('research_sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  provider: text('provider').notNull().default('openai'), // 'openai' | 'gemini' | 'ollama'
  embeddingModel: text('embedding_model').notNull().default('text-embedding-3-small'),
  embeddingDimensions: integer('embedding_dimensions').notNull().default(1536),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Research Jobs table
 * Stores individual research jobs linked to sessions
 * pg_boss_job_id is the external job queue ID for tracking async processing
 */
export const researchJobs = pgTable('research_jobs', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').notNull(),
  pgBossJobId: text('pg_boss_job_id').notNull().unique(),
  query: text('query').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'processing' | 'completed' | 'failed'
  result: text('result'), // final synthesized research report
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Research Steps table
 * Tracks individual steps within a research job (decompose, search, summarize, synthesize)
 */
export const researchSteps = pgTable('research_steps', {
  id: serial('id').primaryKey(),
  jobId: integer('job_id').notNull(),
  stepName: text('step_name').notNull(), // 'decompose' | 'search' | 'summarize' | 'synthesize'
  status: text('status').notNull().default('pending'), // 'pending' | 'running' | 'completed' | 'failed'
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
});

/**
 * Step Results table
 * Stores outputs and raw responses from individual research steps
 */
export const stepResults = pgTable('step_results', {
  id: serial('id').primaryKey(),
  stepId: integer('step_id').notNull(),
  content: text('content').notNull(), // structured/processed result
  rawOutput: text('raw_output'), // raw response from the model
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Memory Entries table
 * Stores chat history (messages + embeddings) accumulated during research
 * Enables context retrieval and conversation replay
 */
export const memoryEntries = pgTable('memory_entries', {
  id: serial('id').primaryKey(),
  jobId: integer('job_id').notNull(),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  step: text('step'), // which step this message belongs to
  sequenceOrder: integer('sequence_order').notNull(),
  embeddingModel: text('embedding_model').notNull(), // track which model created this
  embeddingOpenAI: vector('embedding_openai', { dimensions: 1536 }),
  embeddingGemini: vector('embedding_gemini', { dimensions: 768 }),
  embeddingOllama: vector('embedding_ollama', { dimensions: 768 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Documents table
 * Stores documents and their embeddings for semantic search
 * Uses pgvector extension for vector similarity search
 */
export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  embeddingModel: text('embedding_model').notNull(), // track which model created this
  embeddingOpenAI: vector('embedding_openai', { dimensions: 1536 }),
  embeddingGemini: vector('embedding_gemini', { dimensions: 768 }),
  embeddingOllama: vector('embedding_ollama', { dimensions: 768 }),
  source: text('source'), // URL, file name, etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Relations
 */

// Users -> Research Sessions (one-to-many)
export const usersRelations = relations(users, ({ many }) => ({
  researchSessions: many(researchSessions),
}));

export const researchSessionsRelations = relations(researchSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [researchSessions.userId],
    references: [users.id],
  }),
  researchJobs: many(researchJobs),
  documents: many(documents),
}));

// Research Sessions -> Research Jobs (one-to-many)
export const researchJobsRelations = relations(researchJobs, ({ one, many }) => ({
  session: one(researchSessions, {
    fields: [researchJobs.sessionId],
    references: [researchSessions.id],
  }),
  researchSteps: many(researchSteps),
  memoryEntries: many(memoryEntries),
}));

// Research Jobs -> Research Steps (one-to-many)
export const researchStepsRelations = relations(researchSteps, ({ one, many }) => ({
  job: one(researchJobs, {
    fields: [researchSteps.jobId],
    references: [researchJobs.id],
  }),
  stepResults: many(stepResults),
}));

// Research Steps -> Step Results (one-to-many)
export const stepResultsRelations = relations(stepResults, ({ one }) => ({
  step: one(researchSteps, {
    fields: [stepResults.stepId],
    references: [researchSteps.id],
  }),
}));

// Research Jobs -> Memory Entries (one-to-many)
export const memoryEntriesRelations = relations(memoryEntries, ({ one }) => ({
  job: one(researchJobs, {
    fields: [memoryEntries.jobId],
    references: [researchJobs.id],
  }),
}));

// Research Sessions -> Documents (one-to-many)
export const documentsRelations = relations(documents, ({ one }) => ({
  session: one(researchSessions, {
    fields: [documents.sessionId],
    references: [researchSessions.id],
  }),
}));
