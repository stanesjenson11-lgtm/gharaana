CREATE TABLE "consents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"policy_version" text DEFAULT '2026-10' NOT NULL,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consents_user_idx" ON "consents" USING btree ("user_id");