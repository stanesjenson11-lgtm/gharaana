CREATE TYPE "public"."upload_kind" AS ENUM('photo', 'proof');--> statement-breakpoint
CREATE TABLE "uploads" (
	"key" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"kind" "upload_kind" NOT NULL,
	"dhash" bigint,
	"ext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing_photos" ADD COLUMN "dhash" bigint;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "proof_key" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "risk_flags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "reject_reason" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;