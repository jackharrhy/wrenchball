import readline from "node:readline";
import { execSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function confirmDbUrl(dbUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    rl.question(
      `You are about to operate on this database:\n\n  ${dbUrl}\n\nIs this correct? (y/N): `,
      (answer) => {
        if (answer.trim().toLowerCase() === "y") {
          rl.close();
          resolve();
        } else {
          rl.close();
          console.log("Aborted by user.");
          process.exit(1);
        }
      },
    );
  });
}

const backupProd = async () => {
  try {
    const match = DATABASE_URL.match(/:\/\/(?:[^@]+)@[^:\/]+:(\d+)\//);
    const port = match ? match[1] : undefined;

    if (port && port !== "5432") {
      console.error(
        `ERROR: The database port (${port}) is not 5432. This doesn't look like prod. Aborting.`,
      );
      process.exit(1);
    }
  } catch (e) {
    console.error(
      "Could not parse port from DATABASE_URL. Aborting as safety.",
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

await confirmDbUrl(DATABASE_URL);

const args = process.argv.slice(2);
const action = args[0];

switch (action) {
  case "backup-prod":
    await backupProd();
    break;
  default:
    console.log("Invalid action");
    process.exit(1);
}
