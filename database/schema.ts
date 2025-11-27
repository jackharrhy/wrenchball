import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

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
    .references(() => users.id, { onDelete: "cascade" }),
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
  teamId: integer("team_id").references(() => teams.id, {
    onDelete: "set null",
  }),
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

export const seasonState = pgEnum("season_state", [
  "pre-season",
  "drafting",
  "playing",
  "finished",
]);

export type SeasonState = (typeof seasonState.enumValues)[number];

export const eventType = pgEnum("event_type", [
  "draft",
  "season_state_change",
  "trade",
]);

export type EventType = (typeof eventType.enumValues)[number];

export const season = pgTable("season", {
  id: integer().primaryKey().default(1).notNull(),
  state: seasonState("state").notNull().default("pre-season"),
  currentDraftingUserId: integer("current_drafting_user_id").references(
    () => users.id,
    { onDelete: "set null" }
  ),
});

export type Season = typeof season.$inferSelect;

export const seasonRelations = relations(season, ({ one }) => ({
  currentDraftingUser: one(users, {
    fields: [season.currentDraftingUserId],
    references: [users.id],
  }),
}));

export const usersSeasons = pgTable("users_seasons", {
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  seasonId: integer("season_id")
    .notNull()
    .references(() => season.id),
  draftingTurn: integer("drafting_turn").notNull(),
  preDraftPlayerId: integer("pre_draft_player_id").references(
    () => players.id,
    {
      onDelete: "set null",
    }
  ),
});

export type UsersSeason = typeof usersSeasons.$inferSelect;

export const teamLineups = pgTable("team_lineup", {
  playerId: integer("player_id")
    .primaryKey()
    .references(() => players.id, { onDelete: "cascade" }),
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

export const usersSeasonsRelations = relations(usersSeasons, ({ one }) => ({
  user: one(users, {
    fields: [usersSeasons.userId],
    references: [users.id],
  }),
  season: one(season, {
    fields: [usersSeasons.seasonId],
    references: [season.id],
  }),
}));

export const tradeStatus = pgEnum("trade_status", [
  "pending",
  "accepted",
  "denied",
]);

export type TradeStatus = (typeof tradeStatus.enumValues)[number];

export const trades = pgTable("trades", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  fromUserId: integer("from_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  toUserId: integer("to_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: tradeStatus("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Trade = typeof trades.$inferSelect;

export const tradePlayers = pgTable("trade_players", {
  tradeId: integer("trade_id")
    .notNull()
    .references(() => trades.id, { onDelete: "cascade" }),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  fromTeamId: integer("from_team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  toTeamId: integer("to_team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
});

export type TradePlayer = typeof tradePlayers.$inferSelect;

export const tradesRelations = relations(trades, ({ one, many }) => ({
  fromUser: one(users, {
    fields: [trades.fromUserId],
    references: [users.id],
    relationName: "fromUser",
  }),
  toUser: one(users, {
    fields: [trades.toUserId],
    references: [users.id],
    relationName: "toUser",
  }),
  fromTeam: one(teams, {
    fields: [trades.fromUserId],
    references: [teams.userId],
    relationName: "fromTeam",
  }),
  toTeam: one(teams, {
    fields: [trades.toUserId],
    references: [teams.userId],
    relationName: "toTeam",
  }),
  tradePlayers: many(tradePlayers),
}));

export const tradePlayersRelations = relations(tradePlayers, ({ one }) => ({
  trade: one(trades, {
    fields: [tradePlayers.tradeId],
    references: [trades.id],
  }),
  player: one(players, {
    fields: [tradePlayers.playerId],
    references: [players.id],
  }),
  fromTeam: one(teams, {
    fields: [tradePlayers.fromTeamId],
    references: [teams.id],
    relationName: "fromTeam",
  }),
  toTeam: one(teams, {
    fields: [tradePlayers.toTeamId],
    references: [teams.id],
    relationName: "toTeam",
  }),
}));

export const events = pgTable("events", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  eventType: eventType("event_type").notNull(),
  userId: integer("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  seasonId: integer("season_id")
    .notNull()
    .references(() => season.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Event = typeof events.$inferSelect;

export const eventDraft = pgTable("event_draft", {
  eventId: integer("event_id")
    .primaryKey()
    .references(() => events.id, { onDelete: "cascade" }),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  teamId: integer("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  pickNumber: integer("pick_number").notNull(),
});

export type EventDraft = typeof eventDraft.$inferSelect;

export const eventSeasonStateChange = pgTable("event_season_state_change", {
  eventId: integer("event_id")
    .primaryKey()
    .references(() => events.id, { onDelete: "cascade" }),
  fromState: seasonState("from_state"),
  toState: seasonState("to_state").notNull(),
});

export type EventSeasonStateChange = typeof eventSeasonStateChange.$inferSelect;

export const tradeAction = pgEnum("trade_action", [
  "proposed",
  "accepted",
  "rejected",
  "cancelled",
]);

export type TradeAction = (typeof tradeAction.enumValues)[number];

export const eventTrade = pgTable("event_trade", {
  eventId: integer("event_id")
    .primaryKey()
    .references(() => events.id, { onDelete: "cascade" }),
  tradeId: integer("trade_id")
    .notNull()
    .references(() => trades.id, { onDelete: "cascade" }),
  action: tradeAction("action").notNull(),
});

export type EventTrade = typeof eventTrade.$inferSelect;

export const eventsRelations = relations(events, ({ one, many }) => ({
  user: one(users, {
    fields: [events.userId],
    references: [users.id],
  }),
  season: one(season, {
    fields: [events.seasonId],
    references: [season.id],
  }),
  draft: one(eventDraft, {
    fields: [events.id],
    references: [eventDraft.eventId],
  }),
  seasonStateChange: one(eventSeasonStateChange, {
    fields: [events.id],
    references: [eventSeasonStateChange.eventId],
  }),
  trade: one(eventTrade, {
    fields: [events.id],
    references: [eventTrade.eventId],
  }),
}));

export const eventDraftRelations = relations(eventDraft, ({ one }) => ({
  event: one(events, {
    fields: [eventDraft.eventId],
    references: [events.id],
  }),
  player: one(players, {
    fields: [eventDraft.playerId],
    references: [players.id],
  }),
  team: one(teams, {
    fields: [eventDraft.teamId],
    references: [teams.id],
  }),
}));

export const eventSeasonStateChangeRelations = relations(
  eventSeasonStateChange,
  ({ one }) => ({
    event: one(events, {
      fields: [eventSeasonStateChange.eventId],
      references: [events.id],
    }),
  })
);

export const eventTradeRelations = relations(eventTrade, ({ one }) => ({
  event: one(events, {
    fields: [eventTrade.eventId],
    references: [events.id],
  }),
  trade: one(trades, {
    fields: [eventTrade.tradeId],
    references: [trades.id],
  }),
}));
