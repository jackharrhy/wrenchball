import readline from "node:readline";
import { execSync } from "node:child_process";
import {
  mkdirSync,
  existsSync,
  readdirSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

function getPortFromUrl(url: string): string | undefined {
  const match = url.match(/:\/\/(?:[^@]+)@[^:\/]+:(\d+)\//);
  return match ? match[1] : undefined;
}

const backupProd = async () => {
  const port = getPortFromUrl(DATABASE_URL);

  if (port && port !== "5432") {
    console.error(
      `ERROR: The database port (${port}) is not 5432. This doesn't look like prod. Aborting.`,
    );
    process.exit(1);
  }

  const backupsDir = path.join(import.meta.dirname, "..", "backups");

  if (!existsSync(backupsDir)) {
    mkdirSync(backupsDir, { recursive: true });
    console.log(`Created backups directory: ${backupsDir}`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup-${timestamp}.sql`;
  const filepath = path.join(backupsDir, filename);

  console.log(`Creating backup: ${filepath}`);
  execSync(`pg_dump-17 "${DATABASE_URL}" > "${filepath}"`, {
    stdio: "inherit",
  });
  console.log(`Backup complete: ${filename}`);
};

const restoreLocal = async () => {
  const port = getPortFromUrl(DATABASE_URL);

  if (port === "5432") {
    console.error(
      "ERROR: Refusing to restore to the PRODUCTION database (port 5432).",
    );
    console.error("       This script is only for local databases.");
    process.exit(1);
  }

  console.log("");
  console.log("⚠️  DATABASE RESTORE SCRIPT  ⚠️");
  console.log("");
  console.log(
    "This will COMPLETELY WIPE your local database and restore from a backup.",
  );
  console.log("");
  console.log(`Database URL: ${DATABASE_URL}`);
  console.log("");

  // First confirmation
  const confirm1 = await question(
    "Are you SURE you want to wipe your local database? (yes/no): ",
  );
  if (confirm1 !== "yes") {
    console.log("Aborted.");
    process.exit(1);
  }

  // Second confirmation
  console.log("");
  console.log("⚠️  THIS IS YOUR LAST CHANCE TO ABORT ⚠️");
  console.log("");
  const confirm2 = await question(
    "Type 'DESTROY' to confirm you want to wipe the database: ",
  );
  if (confirm2 !== "DESTROY") {
    console.log("Aborted.");
    process.exit(1);
  }

  // List available backups
  const backupsDir = path.join(import.meta.dirname, "..", "backups");

  if (!existsSync(backupsDir)) {
    console.error(`ERROR: Backups directory not found at ${backupsDir}`);
    process.exit(1);
  }

  const backupFiles = readdirSync(backupsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .reverse();

  if (backupFiles.length === 0) {
    console.error("ERROR: No backup files found in backups directory.");
    process.exit(1);
  }

  console.log("");
  console.log("Available backups:");
  console.log("==================");
  for (const file of backupFiles) {
    console.log(`  ${file}`);
  }
  console.log("");

  const backupName = await question("Paste the backup filename to restore: ");

  const backupPath = path.join(backupsDir, backupName);
  if (!existsSync(backupPath)) {
    console.error(`ERROR: Backup file not found: ${backupPath}`);
    process.exit(1);
  }

  console.log("");
  console.log(`Restoring from: ${backupName}`);
  console.log("");

  // Drop all tables and enums
  const dropSql = `
-- Drop all tables in drizzle schema
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'drizzle')
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS drizzle.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END $$;

-- Drop all tables in public schema
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') 
    LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
END $$;

-- Drop all enums in public schema
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT typname FROM pg_type WHERE typtype = 'e' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'))
    LOOP
        EXECUTE 'DROP TYPE IF EXISTS public.' || quote_ident(r.typname) || ' CASCADE';
    END LOOP;
END $$;
`;

  console.log("Step 1/2: Dropping all database objects...");
  const tempFile = path.join(tmpdir(), `drop-db-${Date.now()}.sql`);
  try {
    writeFileSync(tempFile, dropSql);
    execSync(`psql-17 "${DATABASE_URL}" -f "${tempFile}"`, {
      stdio: "inherit",
    });
    console.log("[OK] Dropped all tables and enums");
  } catch (e) {
    console.error("ERROR: Failed to drop database objects");
    process.exit(1);
  } finally {
    try {
      unlinkSync(tempFile);
    } catch {}
  }

  console.log("");
  console.log("Step 2/2: Restoring backup...");
  try {
    execSync(`psql-17 "${DATABASE_URL}" -f "${backupPath}"`, {
      stdio: "inherit",
    });
    console.log("");
    console.log(`✅ Database restored successfully from: ${backupName}`);
  } catch (e) {
    console.error("ERROR: Failed to restore backup");
    process.exit(1);
  }
};

const args = process.argv.slice(2);
const action = args[0];

async function confirmDbUrl(): Promise<void> {
  const answer = await question(
    `You are about to operate on this database:\n\n  ${DATABASE_URL}\n\nIs this correct? (y/N): `,
  );
  if (answer.toLowerCase() !== "y") {
    console.log("Aborted by user.");
    rl.close();
    process.exit(1);
  }
}

try {
  switch (action) {
    case "backup-prod":
      await confirmDbUrl();
      await backupProd();
      break;
    case "restore-local":
      await restoreLocal();
      break;
    default:
      console.log("Usage: npx tsx scripts/db.ts <action>");
      console.log("");
      console.log("Actions:");
      console.log(
        "  backup-prod    - Backup the production database (port 5432)",
      );
      console.log(
        "  restore-local  - Restore a backup to the local database (NOT port 5432)",
      );
      process.exit(1);
  }
} finally {
  rl.close();
}
