CREATE TYPE "public"."furnishing" AS ENUM('full', 'semi', 'none');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('pending_review', 'active', 'rented', 'expired', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."listing_type" AS ENUM('rent', 'buy');--> statement-breakpoint
CREATE TYPE "public"."parking" AS ENUM('none', 'bike', 'car');--> statement-breakpoint
CREATE TYPE "public"."property_kind" AS ENUM('apartment', 'independent-house', 'villa');--> statement-breakpoint
CREATE TYPE "public"."room" AS ENUM('living', 'bedroom', 'kitchen', 'bathroom', 'exterior', 'balcony');--> statement-breakpoint
CREATE TABLE "listing_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"listing_id" text NOT NULL,
	"position" smallint NOT NULL,
	"src" text NOT NULL,
	"room" "room" NOT NULL,
	"credit" text
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"status" "listing_status" DEFAULT 'pending_review' NOT NULL,
	"sample" boolean DEFAULT false NOT NULL,
	"type" "listing_type" NOT NULL,
	"kind" "property_kind" NOT NULL,
	"bhk" smallint NOT NULL,
	"title" text NOT NULL,
	"city" text DEFAULT 'Bengaluru' NOT NULL,
	"locality" text NOT NULL,
	"area" text NOT NULL,
	"address_private" text NOT NULL,
	"location" "point" NOT NULL,
	"price" bigint NOT NULL,
	"maintenance" integer DEFAULT 0 NOT NULL,
	"deposit" bigint DEFAULT 0 NOT NULL,
	"carpet_sqft" integer NOT NULL,
	"floor" smallint NOT NULL,
	"total_floors" smallint NOT NULL,
	"furnishing" "furnishing" NOT NULL,
	"facing" text NOT NULL,
	"age_years" smallint NOT NULL,
	"available_from" date,
	"tenants" text[] DEFAULT '{}'::text[] NOT NULL,
	"pets" boolean NOT NULL,
	"non_veg" boolean NOT NULL,
	"parking" "parking" NOT NULL,
	"bathrooms" smallint NOT NULL,
	"balconies" smallint NOT NULL,
	"amenities" text[] DEFAULT '{}'::text[] NOT NULL,
	"description" text NOT NULL,
	"owner_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '30 days' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"phone_number" text,
	"phone_number_verified" boolean,
	"role" text DEFAULT 'member',
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing_photos" ADD CONSTRAINT "listing_photos_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listing_photos_listing_idx" ON "listing_photos" USING btree ("listing_id","position");--> statement-breakpoint
CREATE INDEX "listings_location_gist" ON "listings" USING gist ("location");--> statement-breakpoint
CREATE INDEX "listings_search_idx" ON "listings" USING btree ("status","type","city","bhk");--> statement-breakpoint
CREATE INDEX "listings_owner_idx" ON "listings" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");