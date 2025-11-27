import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "~/database/schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

function createDbTypeHelper(client: ReturnType<typeof postgres>) {
  return drizzle(client, { schema });
}
type DbInstance = ReturnType<typeof createDbTypeHelper>;

declare global {
  var __db_client__: ReturnType<typeof postgres> | undefined;
  var __db__: DbInstance | undefined;
}

const getDb = (): DbInstance => {
  if (global.__db__) {
    console.log("[DB] Reusing cached drizzle instance");
    return global.__db__;
  }

  console.log("[DB] Creating new postgres client and drizzle instance");
  const client = global.__db_client__ ?? postgres(DATABASE_URL);
  if (!global.__db_client__) {
    global.__db_client__ = client;
  }

  const db = drizzle(client, { schema });
  global.__db__ = db;
  return db;
};

export const db = getDb();

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Database = typeof db | Transaction;
