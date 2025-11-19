ALTER TABLE "users_seasons" ADD COLUMN "pre_draft_player_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users_seasons" ADD CONSTRAINT "users_seasons_pre_draft_player_id_players_id_fk" FOREIGN KEY ("pre_draft_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
