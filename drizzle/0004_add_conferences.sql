CREATE TABLE IF NOT EXISTS "conferences" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"name" text NOT NULL,
	"color" text,
	"season_id" integer NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conferences" ADD CONSTRAINT "conferences_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "conference_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team" ADD CONSTRAINT "team_conference_id_conferences_id_fk" FOREIGN KEY ("conference_id") REFERENCES "public"."conferences"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

