CREATE TYPE "public"."ability" AS ENUM('Enlarge', 'Super Jump', 'Clamber', 'Quick Throw', 'Super Dive', 'Tongue Catch', 'Spin Attack', 'Laser Beam', 'Teleport', 'Suction Catch', 'Burrow', 'Ball Dash', 'Hammer Throw', 'Magical Catch', 'Piranha Catch', 'Scatter Dive', 'Angry Attack', 'Ink Dive', 'Keeper Catch');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('Left', 'Right');--> statement-breakpoint
CREATE TYPE "public"."fielding_positions" AS ENUM('C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'P');--> statement-breakpoint
CREATE TYPE "public"."hitting_trajectory" AS ENUM('Low', 'Medium', 'High');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "players" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "players_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"team_id" integer,
	"image_url" text,
	"stats_character" text,
	CONSTRAINT "players_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stat" (
	"character" text PRIMARY KEY NOT NULL,
	"character_class" text NOT NULL,
	"captain" boolean NOT NULL,
	"throwing_arm" "direction" NOT NULL,
	"batting_stance" "direction" NOT NULL,
	"ability" "ability" NOT NULL,
	"weight" integer NOT NULL,
	"hitting_trajectory" "hitting_trajectory" NOT NULL,
	"slap_hit_contact_size" integer NOT NULL,
	"charge_hit_contact_size" integer NOT NULL,
	"slap_hit_power" integer NOT NULL,
	"charge_hit_power" integer NOT NULL,
	"bunting" integer NOT NULL,
	"speed" integer NOT NULL,
	"throwing_speed" integer NOT NULL,
	"fielding" integer NOT NULL,
	"curveball_speed" integer NOT NULL,
	"fastball_speed" integer NOT NULL,
	"curve" integer NOT NULL,
	"stamina" integer NOT NULL,
	"pitching_css" integer NOT NULL,
	"batting_css" integer NOT NULL,
	"fielding_css" integer NOT NULL,
	"speed_css" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_lineup" (
	"player_id" integer PRIMARY KEY NOT NULL,
	"fielding_position" "fielding_positions",
	"batting_order" integer,
	"is_starred" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "team_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"color" text NOT NULL,
	"user_id" integer NOT NULL,
	"abbreviation" text NOT NULL,
	CONSTRAINT "team_name_unique" UNIQUE("name"),
	CONSTRAINT "team_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "user_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"discord_snowflake" text NOT NULL,
	CONSTRAINT "user_discord_snowflake_unique" UNIQUE("discord_snowflake")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "players" ADD CONSTRAINT "players_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "players" ADD CONSTRAINT "players_stats_character_stat_character_fk" FOREIGN KEY ("stats_character") REFERENCES "public"."stat"("character") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_lineup" ADD CONSTRAINT "team_lineup_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team" ADD CONSTRAINT "team_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
