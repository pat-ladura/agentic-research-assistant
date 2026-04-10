ALTER TABLE "documents" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "memory_entries" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "embedding_model" text NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "embedding_openai" vector(1536);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "embedding_gemini" vector(768);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "embedding_ollama" vector(768);--> statement-breakpoint
ALTER TABLE "memory_entries" ADD COLUMN "embedding_model" text NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_entries" ADD COLUMN "embedding_openai" vector(1536);--> statement-breakpoint
ALTER TABLE "memory_entries" ADD COLUMN "embedding_gemini" vector(768);--> statement-breakpoint
ALTER TABLE "memory_entries" ADD COLUMN "embedding_ollama" vector(768);