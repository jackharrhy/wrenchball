import { relations } from "drizzle-orm";
import { boolean, integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

export const userRoles = pgEnum("user_role", ["admin", "user"]);

export const users = pgTable("user", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  role: userRoles("role").notNull(),
  discordSnowflake: text("discord_snowflake").notNull().unique(),
});

export type User = typeof users.$inferSelect;

export const teams = pgTable("team", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  color: text("color"),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  abbreviation: text("abbreviation").notNull(),
});

export type Team = typeof teams.$inferSelect;

export const teamRealtions = relations(teams, ({ many }) => ({
  players: many(players, {
    relationName: "players",
  }),
}));

export const directions = pgEnum("direction", ["Left", "Right"]);

export const abilities = pgEnum("ability", [
  "Enlarge",
  "Super Jump",
  "Clamber",
  "Quick Throw",
  "Super Dive",
  "Tongue Catch",
  "Spin Attack",
  "Laser Beam",
  "Teleport",
  "Suction Catch",
  "Burrow",
  "Ball Dash",
  "Hammer Throw",
  "Magical Catch",
  "Piranha Catch",
  "Scatter Dive",
  "Angry Attack",
  "Ink Dive",
  "Keeper Catch",
]);

export const hittingTrajectories = pgEnum("hitting_trajectory", [
  "Low",
  "Medium",
  "High",
]);

export const stats = pgTable("stat", {
  character: text("character").notNull().primaryKey(),
  characterClass: text("character_class").notNull(),
  captain: boolean("captain").notNull(),
  throwingArm: directions("throwing_arm").notNull(),
  battingStance: directions("batting_stance").notNull(),
  ability: abilities("ability").notNull(),
  weight: integer("weight").notNull(),
  hittingTrajectory: hittingTrajectories("hitting_trajectory").notNull(),
  slapHitContactSize: integer("slap_hit_contact_size").notNull(),
  chargeHitContactSize: integer("charge_hit_contact_size").notNull(),
  slapHitPower: integer("slap_hit_power").notNull(),
  chargeHitPower: integer("charge_hit_power").notNull(),
  bunting: integer("bunting").notNull(),
  speed: integer("speed").notNull(),
  throwingSpeed: integer("throwing_speed").notNull(),
  fielding: integer("fielding").notNull(),
  curveballSpeed: integer("curveball_speed").notNull(),
  fastballSpeed: integer("fastball_speed").notNull(),
  curve: integer("curve").notNull(),
  stamina: integer("stamina").notNull(),
  pitchingCss: integer("pitching_css").notNull(),
  battingCss: integer("batting_css").notNull(),
  fieldingCss: integer("fielding_css").notNull(),
  speedCss: integer("speed_css").notNull(),
});

export type Stats = typeof stats.$inferSelect;

export const players = pgTable("players", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  teamId: integer("team_id").references(() => teams.id),
  imageUrl: text("image_url"),
  statsCharacter: text("stats_character").references(() => stats.character),
});

export type Player = typeof players.$inferSelect;

export const playerRelations = relations(players, ({ one }) => ({
  team: one(teams, {
    fields: [players.teamId],
    references: [teams.id],
    relationName: "players",
  }),
  lineup: one(teamLineups, {
    fields: [players.id],
    references: [teamLineups.playerId],
    relationName: "lineup",
  }),
  stats: one(stats, {
    fields: [players.statsCharacter],
    references: [stats.character],
    relationName: "playerStats",
  }),
}));

export const fieldingPositions = pgEnum("fielding_positions", [
  "C", // Catcher
  "1B", // 1st Base
  "2B", // 2nd Base
  "3B", // 3rd Base
  "SS", // Shortstop
  "LF", // Left Field
  "CF", // Center Field
  "RF", // Right Field
  "P", // Pitcher
]);

export type FieldingPosition = (typeof fieldingPositions.enumValues)[number];

export const seasonStates = pgEnum("season_state_value", [
  "pre-season",
  "drafting",
  "playing",
  "finished",
]);

export type SeasonStateValue = (typeof seasonStates.enumValues)[number];

export const seasonState = pgTable("season_state", {
  id: integer().primaryKey().default(1).notNull(),
  state: seasonStates("state").notNull().default("pre-season"),
});

export type SeasonState = typeof seasonState.$inferSelect;

export const teamLineups = pgTable("team_lineup", {
  playerId: integer("player_id")
    .primaryKey()
    .references(() => players.id),
  fieldingPosition: fieldingPositions("fielding_position"),
  battingOrder: integer("batting_order"),
  isStarred: boolean("is_starred").notNull().default(false),
});

export type TeamLineup = typeof teamLineups.$inferSelect;

export const teamLineupRelations = relations(teamLineups, ({ one }) => ({
  player: one(players, {
    fields: [teamLineups.playerId],
    references: [players.id],
    relationName: "lineup",
  }),
}));
