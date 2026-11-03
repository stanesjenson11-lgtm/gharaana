CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"builder" text NOT NULL,
	"rera" text NOT NULL,
	"possession" date,
	"locality" text NOT NULL,
	"description" text NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;