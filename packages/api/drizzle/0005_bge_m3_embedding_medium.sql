ALTER TABLE "documents" ADD COLUMN "embedding_medium" vector(1024);--> statement-breakpoint
ALTER TABLE "memory_entries" ADD COLUMN "embedding_medium" vector(1024);