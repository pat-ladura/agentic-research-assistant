ALTER TABLE "documents" ADD COLUMN "embedding_large" vector(4096);--> statement-breakpoint
ALTER TABLE "memory_entries" ADD COLUMN "embedding_large" vector(4096);