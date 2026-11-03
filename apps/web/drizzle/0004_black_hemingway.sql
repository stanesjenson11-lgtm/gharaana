CREATE TYPE "public"."crm_stage" AS ENUM('new', 'contacted', 'visited', 'negotiating', 'won', 'lost');--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "crm_stage" "crm_stage" DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "crm_note" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "crm_updated_at" timestamp with time zone;