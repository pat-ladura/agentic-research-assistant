ALTER TABLE "documents" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "embedding_small" vector(768);--> statement-breakpoint
ALTER TABLE "memory_entries" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "memory_entries" ADD COLUMN "embedding_small" vector(768);--> statement-breakpoint
ALTER TABLE "research_sessions" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "research_sessions" ADD COLUMN "result" text;--> statement-breakpoint
ALTER TABLE "research_sessions" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "embedding_openai";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "embedding_gemini";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "embedding_ollama";--> statement-breakpoint
ALTER TABLE "memory_entries" DROP COLUMN "embedding_openai";--> statement-breakpoint
ALTER TABLE "memory_entries" DROP COLUMN "embedding_gemini";--> statement-breakpoint
ALTER TABLE "memory_entries" DROP COLUMN "embedding_ollama";