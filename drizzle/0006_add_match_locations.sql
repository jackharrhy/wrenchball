CREATE TABLE IF NOT EXISTS "match_locations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"name" text NOT NULL UNIQUE
);--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "location_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matches" ADD CONSTRAINT "matches_location_id_match_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."match_locations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

