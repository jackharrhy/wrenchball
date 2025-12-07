import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  type AnyPgColumn,
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
  captainId: integer("captain_id").references((): AnyPgColumn => players.id, {
    onDelete: "set null",
  }),
  lookingFor: text("looking_for"),
  willingToTrade: text("willing_to_trade"),
  tradePreferencesUpdatedAt: timestamp("trade_preferences_updated_at"),
  conferenceId: integer("conference_id").references(
    (): AnyPgColumn => conferences.id,
    { onDelete: "set null" },
  ),
});

export type Team = typeof teams.$inferSelect;

export const teamRelations = relations(teams, ({ many, one }) => ({
  user: one(users, {
    fields: [teams.userId],
    references: [users.id],
  }),
  players: many(players, {
    relationName: "players",
  }),
  captain: one(players, {
    fields: [teams.captainId],
    references: [players.id],
    relationName: "captain",
  }),
  conference: one(conferences, {
    fields: [teams.conferenceId],
    references: [conferences.id],
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

export const chemistryRelationship = pgEnum("chemistry_relationship", [
  "positive",
  "negative",
]);

export type ChemistryRelationship =
  (typeof chemistryRelationship.enumValues)[number];

export const chemistry = pgTable(
  "chemistry",
  {
    character1: text("character1")
      .notNull()
      .references(() => stats.character, { onDelete: "cascade" }),
    character2: text("character2")
      .notNull()
      .references(() => stats.character, { onDelete: "cascade" }),
    relationship: chemistryRelationship("relationship").notNull(),
  },
  (table) => [primaryKey({ columns: [table.character1, table.character2] })],
);

export type Chemistry = typeof chemistry.$inferSelect;

export const chemistryRelations = relations(chemistry, ({ one }) => ({
  character1Stats: one(stats, {
    fields: [chemistry.character1],
    references: [stats.character],
    relationName: "character1Stats",
  }),
  character2Stats: one(stats, {
    fields: [chemistry.character2],
    references: [stats.character],
    relationName: "character2Stats",
  }),
}));

export const statsRelations = relations(stats, ({ many }) => ({
  chemistryAsCharacter1: many(chemistry, {
    relationName: "character1Stats",
  }),
  chemistryAsCharacter2: many(chemistry, {
    relationName: "character2Stats",
  }),
}));

export const players = pgTable("players", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  teamId: integer("team_id").references(() => teams.id, {
    onDelete: "set null",
  }),
  imageUrl: text("image_url"),
  statsCharacter: text("stats_character").references(() => stats.character),
  sortPosition: integer("sort_position").notNull().unique(),
});

export type Player = typeof players.$inferSelect;

export const playerRelations = relations(players, ({ one, many }) => ({
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
  matchBattingOrders: many(matchBattingOrders),
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
  "match_state_change",
  "trade_preferences_update",
]);

export type EventType = (typeof eventType.enumValues)[number];

export const season = pgTable("season", {
  id: integer().primaryKey().default(1).notNull(),
  state: seasonState("state").notNull().default("pre-season"),
  currentDraftingUserId: integer("current_drafting_user_id").references(
    () => users.id,
    { onDelete: "set null" },
  ),
  draftTimerStartedAt: timestamp("draft_timer_started_at"),
  draftTimerPausedAt: timestamp("draft_timer_paused_at"),
  draftTimerDuration: integer("draft_timer_duration").notNull().default(120),
});

export type Season = typeof season.$inferSelect;

export const seasonRelations = relations(season, ({ one, many }) => ({
  currentDraftingUser: one(users, {
    fields: [season.currentDraftingUserId],
    references: [users.id],
  }),
  conferences: many(conferences),
}));

// Conferences - season-specific groupings of teams
export const conferences = pgTable("conferences", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  color: text("color"),
  seasonId: integer("season_id")
    .notNull()
    .references(() => season.id, { onDelete: "cascade" }),
});

export type Conference = typeof conferences.$inferSelect;

export const conferencesRelations = relations(conferences, ({ one, many }) => ({
  season: one(season, {
    fields: [conferences.seasonId],
    references: [season.id],
  }),
  teams: many(teams),
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
    },
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
  "cancelled",
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
  proposalText: text("proposal_text"),
  responseText: text("response_text"),
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
  matchStateChange: one(eventMatchStateChange, {
    fields: [events.id],
    references: [eventMatchStateChange.eventId],
  }),
  tradePreferencesUpdate: one(eventTradePreferencesUpdate, {
    fields: [events.id],
    references: [eventTradePreferencesUpdate.eventId],
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
  }),
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

export const eventTradePreferencesUpdate = pgTable(
  "event_trade_preferences_update",
  {
    eventId: integer("event_id")
      .primaryKey()
      .references(() => events.id, { onDelete: "cascade" }),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    lookingFor: text("looking_for"),
    willingToTrade: text("willing_to_trade"),
  },
);

export type EventTradePreferencesUpdate =
  typeof eventTradePreferencesUpdate.$inferSelect;

export const eventTradePreferencesUpdateRelations = relations(
  eventTradePreferencesUpdate,
  ({ one }) => ({
    event: one(events, {
      fields: [eventTradePreferencesUpdate.eventId],
      references: [events.id],
    }),
    team: one(teams, {
      fields: [eventTradePreferencesUpdate.teamId],
      references: [teams.id],
    }),
  }),
);

// Match-related schema
export const matchState = pgEnum("match_state", [
  "upcoming",
  "live",
  "finished",
]);

export type MatchState = (typeof matchState.enumValues)[number];

// Match Days - containers for matches on a specific date
export const matchDays = pgTable("match_days", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: text("name"),
  date: timestamp("date"),
  orderInSeason: integer("order_in_season"),
  seasonId: integer("season_id")
    .notNull()
    .references(() => season.id, { onDelete: "cascade" }),
});

export type MatchDay = typeof matchDays.$inferSelect;

export const matchDaysRelations = relations(matchDays, ({ one, many }) => ({
  season: one(season, {
    fields: [matchDays.seasonId],
    references: [season.id],
  }),
  matches: many(matches),
}));

export const eventMatchStateChange = pgTable("event_match_state_change", {
  eventId: integer("event_id")
    .primaryKey()
    .references(() => events.id, { onDelete: "cascade" }),
  matchId: integer("match_id")
    .notNull()
    .references(() => matches.id, { onDelete: "cascade" }),
  fromState: matchState("from_state"),
  toState: matchState("to_state").notNull(),
});

export type EventMatchStateChange = typeof eventMatchStateChange.$inferSelect;

export const eventMatchStateChangeRelations = relations(
  eventMatchStateChange,
  ({ one }) => ({
    event: one(events, {
      fields: [eventMatchStateChange.eventId],
      references: [events.id],
    }),
    match: one(matches, {
      fields: [eventMatchStateChange.matchId],
      references: [matches.id],
    }),
  }),
);

export const matches = pgTable("matches", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  matchDayId: integer("match_day_id").references(() => matchDays.id, {
    onDelete: "cascade",
  }),
  orderInDay: integer("order_in_day"),
  teamAId: integer("team_a_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  teamBId: integer("team_b_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  state: matchState("state").notNull().default("upcoming"),
  scheduledDate: timestamp("scheduled_date"),
  teamAScore: integer("team_a_score"),
  teamBScore: integer("team_b_score"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Match = typeof matches.$inferSelect;

export const matchBattingOrders = pgTable(
  "match_batting_orders",
  {
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    battingOrder: integer("batting_order").notNull(),
    fieldingPosition: fieldingPositions("fielding_position"),
    isStarred: boolean("is_starred").notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.matchId, table.teamId, table.playerId] }),
  ],
);

export type MatchBattingOrder = typeof matchBattingOrders.$inferSelect;

export const matchPlayerStats = pgTable(
  "match_player_stats",
  {
    matchId: integer("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    // Batting stats
    plateAppearances: integer("plate_appearances"),
    hits: integer("hits"),
    homeRuns: integer("home_runs"),
    outs: integer("outs"),
    rbi: integer("rbi"),
    // Pitching stats
    inningsPitchedWhole: integer("innings_pitched_whole"),
    inningsPitchedPartial: integer("innings_pitched_partial"), // 0-2 for thirds
    strikeouts: integer("strikeouts"),
    earnedRuns: integer("earned_runs"),
    // Fielding stats
    putouts: integer("putouts"),
    assists: integer("assists"),
    doublePlays: integer("double_plays"),
    triplePlays: integer("triple_plays"),
    // Silly stats
    errors: integer("errors"),
  },
  (table) => [primaryKey({ columns: [table.matchId, table.playerId] })],
);

export type MatchPlayerStats = typeof matchPlayerStats.$inferSelect;

// Match relations
export const matchesRelations = relations(matches, ({ one, many }) => ({
  matchDay: one(matchDays, {
    fields: [matches.matchDayId],
    references: [matchDays.id],
  }),
  teamA: one(teams, {
    fields: [matches.teamAId],
    references: [teams.id],
    relationName: "teamA",
  }),
  teamB: one(teams, {
    fields: [matches.teamBId],
    references: [teams.id],
    relationName: "teamB",
  }),
  battingOrders: many(matchBattingOrders),
  playerStats: many(matchPlayerStats),
}));

export const matchBattingOrdersRelations = relations(
  matchBattingOrders,
  ({ one }) => ({
    match: one(matches, {
      fields: [matchBattingOrders.matchId],
      references: [matches.id],
    }),
    team: one(teams, {
      fields: [matchBattingOrders.teamId],
      references: [teams.id],
    }),
    player: one(players, {
      fields: [matchBattingOrders.playerId],
      references: [players.id],
    }),
  }),
);

export const matchPlayerStatsRelations = relations(
  matchPlayerStats,
  ({ one }) => ({
    match: one(matches, {
      fields: [matchPlayerStats.matchId],
      references: [matches.id],
    }),
    player: one(players, {
      fields: [matchPlayerStats.playerId],
      references: [players.id],
    }),
    team: one(teams, {
      fields: [matchPlayerStats.teamId],
      references: [teams.id],
    }),
  }),
);
