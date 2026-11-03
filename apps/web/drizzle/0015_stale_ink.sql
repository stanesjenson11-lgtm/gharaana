CREATE TYPE "public"."docket_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."docket_repeat" AS ENUM('none', 'daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."docket_status" AS ENUM('open', 'doing', 'waiting', 'done', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."docket_subject" AS ENUM('client', 'listing', 'lead', 'ticket');--> statement-breakpoint
CREATE TABLE "docket_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"status" "docket_status" DEFAULT 'open' NOT NULL,
	"priority" "docket_priority" DEFAULT 'normal' NOT NULL,
	"created_by" text,
	"assignee_id" text,
	"assignee_role" text,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone,
	"reminded_at" timestamp with time zone,
	"repeat" "docket_repeat" DEFAULT 'none' NOT NULL,
	"subject_kind" "docket_subject",
	"subject_id" text,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "docket_one_owner" CHECK (not ("docket_items"."assignee_id" is not null and "docket_items"."assignee_role" is not null))
);
--> statement-breakpoint
CREATE TABLE "docket_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"author_id" text,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "docket_items" ADD CONSTRAINT "docket_items_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "docket_items" ADD CONSTRAINT "docket_items_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "docket_notes" ADD CONSTRAINT "docket_notes_item_id_docket_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."docket_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "docket_notes" ADD CONSTRAINT "docket_notes_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "docket_assignee_idx" ON "docket_items" USING btree ("assignee_id","status","due_at");--> statement-breakpoint
CREATE INDEX "docket_pool_idx" ON "docket_items" USING btree ("assignee_role","status");--> statement-breakpoint
CREATE INDEX "docket_subject_idx" ON "docket_items" USING btree ("subject_kind","subject_id");--> statement-breakpoint
CREATE INDEX "docket_notes_item_idx" ON "docket_notes" USING btree ("item_id","created_at");