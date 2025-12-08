-- Add missing composite primary keys to tables that should have had them from the start
-- Using pg_temp schema for temporary backup tables

-- ============================================================================
-- chemistry table: composite PK on (character1, character2)
-- ============================================================================
CREATE TABLE pg_temp.chemistry_backup AS SELECT * FROM "chemistry";--> statement-breakpoint
TRUNCATE TABLE "chemistry";--> statement-breakpoint
ALTER TABLE "chemistry" ADD PRIMARY KEY ("character1", "character2");--> statement-breakpoint
INSERT INTO "chemistry" ("character1", "character2", "relationship")
SELECT DISTINCT ON ("character1", "character2") "character1", "character2", "relationship"
FROM pg_temp.chemistry_backup;--> statement-breakpoint

-- ============================================================================
-- match_batting_orders table: composite PK on (match_id, team_id, player_id)
-- ============================================================================
CREATE TABLE pg_temp.match_batting_orders_backup AS SELECT * FROM "match_batting_orders";--> statement-breakpoint
TRUNCATE TABLE "match_batting_orders";--> statement-breakpoint
ALTER TABLE "match_batting_orders" ADD PRIMARY KEY ("match_id", "team_id", "player_id");--> statement-breakpoint
INSERT INTO "match_batting_orders" ("match_id", "team_id", "player_id", "batting_order", "fielding_position", "is_starred")
SELECT DISTINCT ON ("match_id", "team_id", "player_id") "match_id", "team_id", "player_id", "batting_order", "fielding_position", "is_starred"
FROM pg_temp.match_batting_orders_backup;--> statement-breakpoint

-- ============================================================================
-- match_player_stats table: composite PK on (match_id, player_id)
-- ============================================================================
CREATE TABLE pg_temp.match_player_stats_backup AS SELECT * FROM "match_player_stats";--> statement-breakpoint
TRUNCATE TABLE "match_player_stats";--> statement-breakpoint
ALTER TABLE "match_player_stats" ADD PRIMARY KEY ("match_id", "player_id");--> statement-breakpoint
INSERT INTO "match_player_stats" (
  "match_id", "player_id", "team_id",
  "plate_appearances", "hits", "home_runs", "outs", "rbi",
  "innings_pitched_whole", "innings_pitched_partial", "strikeouts", "earned_runs",
  "putouts", "assists", "double_plays", "triple_plays", "errors"
)
SELECT DISTINCT ON ("match_id", "player_id")
  "match_id", "player_id", "team_id",
  "plate_appearances", "hits", "home_runs", "outs", "rbi",
  "innings_pitched_whole", "innings_pitched_partial", "strikeouts", "earned_runs",
  "putouts", "assists", "double_plays", "triple_plays", "errors"
FROM pg_temp.match_player_stats_backup;--> statement-breakpoint

-- ============================================================================
-- trade_players table: composite PK on (trade_id, player_id)
-- ============================================================================
CREATE TABLE pg_temp.trade_players_backup AS SELECT * FROM "trade_players";--> statement-breakpoint
TRUNCATE TABLE "trade_players";--> statement-breakpoint
ALTER TABLE "trade_players" ADD PRIMARY KEY ("trade_id", "player_id");--> statement-breakpoint
INSERT INTO "trade_players" ("trade_id", "player_id", "from_team_id", "to_team_id")
SELECT DISTINCT ON ("trade_id", "player_id") "trade_id", "player_id", "from_team_id", "to_team_id"
FROM pg_temp.trade_players_backup;--> statement-breakpoint

-- ============================================================================
-- users_seasons table: composite PK on (user_id, season_id)
-- ============================================================================
CREATE TABLE pg_temp.users_seasons_backup AS SELECT * FROM "users_seasons";--> statement-breakpoint
TRUNCATE TABLE "users_seasons";--> statement-breakpoint
ALTER TABLE "users_seasons" ADD PRIMARY KEY ("user_id", "season_id");--> statement-breakpoint
INSERT INTO "users_seasons" ("user_id", "season_id", "drafting_turn", "pre_draft_player_id")
SELECT DISTINCT ON ("user_id", "season_id") "user_id", "season_id", "drafting_turn", "pre_draft_player_id"
FROM pg_temp.users_seasons_backup;
