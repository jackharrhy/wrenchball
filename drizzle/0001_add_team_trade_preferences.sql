ALTER TABLE "team" ADD COLUMN "looking_for" text;--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "willing_to_trade" text;--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "trade_preferences_updated_at" timestamp;--> statement-breakpoint
ALTER TYPE "event_type" ADD VALUE 'trade_preferences_update';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_trade_preferences_update" (
	"event_id" integer PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL,
	"looking_for" text,
	"willing_to_trade" text
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_trade_preferences_update" ADD CONSTRAINT "event_trade_preferences_update_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_trade_preferences_update" ADD CONSTRAINT "event_trade_preferences_update_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
