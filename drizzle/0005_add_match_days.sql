CREATE TABLE IF NOT EXISTS "match_days" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"name" text,
	"date" timestamp NOT NULL,
	"season_id" integer NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_days" ADD CONSTRAINT "match_days_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "match_day_id" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "order_in_day" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matches" ADD CONSTRAINT "matches_match_day_id_match_days_id_fk" FOREIGN KEY ("match_day_id") REFERENCES "public"."match_days"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

