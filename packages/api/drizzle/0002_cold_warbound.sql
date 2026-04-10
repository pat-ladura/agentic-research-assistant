CREATE TABLE "memory_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"step" text,
	"sequence_order" integer NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"pg_boss_job_id" text NOT NULL,
	"query" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "research_jobs_pg_boss_job_id_unique" UNIQUE("pg_boss_job_id")
);
--> statement-breakpoint
CREATE TABLE "research_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"step_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "step_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"step_id" integer NOT NULL,
	"content" text NOT NULL,
	"raw_output" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "session_id" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "research_sessions" ADD COLUMN "user_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "research_sessions" ADD COLUMN "provider" text DEFAULT 'openai' NOT NULL;--> statement-breakpoint
ALTER TABLE "research_sessions" ADD COLUMN "embedding_model" text DEFAULT 'text-embedding-3-small' NOT NULL;--> statement-breakpoint
ALTER TABLE "research_sessions" ADD COLUMN "embedding_dimensions" integer DEFAULT 1536 NOT NULL;--> statement-breakpoint
ALTER TABLE "research_sessions" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "is_updated";