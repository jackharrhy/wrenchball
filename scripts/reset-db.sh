#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# Cleanup function for temporary files
cleanup() {
    if [ -n "$TEMP_SQL" ] && [ -f "$TEMP_SQL" ]; then
        rm -f "$TEMP_SQL"
    fi
}
trap cleanup EXIT

echo "Database Reset Script"
echo "===================="
echo ""
echo "WARNING: This will delete all tables and enums in your database!"
echo ""

# Confirm before proceeding
read -p "Are you sure you want to continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "Step 1: Cleaning up Drizzle migration files..."

# Delete migration files matching 0000_*.sql pattern
if ls drizzle/0000_*.sql 1> /dev/null 2>&1; then
    rm drizzle/0000_*.sql
    echo "[OK] Deleted migration files"
else
    echo "[OK] No migration files to delete"
fi

# Delete snapshot file
if [ -f "drizzle/meta/0000_snapshot.json" ]; then
    rm drizzle/meta/0000_snapshot.json
    echo "[OK] Deleted snapshot file"
else
    echo "[OK] No snapshot file to delete"
fi

# Reset journal file
if [ -f "drizzle/meta/_journal.json" ]; then
    cat > drizzle/meta/_journal.json << 'EOF'
{
  "version": "7",
  "dialect": "postgresql",
  "entries": []
}
EOF
    echo "[OK] Reset journal file"
else
    echo "[WARN] Journal file not found, creating it..."
    mkdir -p drizzle/meta
    cat > drizzle/meta/_journal.json << 'EOF'
{
  "version": "7",
  "dialect": "postgresql",
  "entries": []
}
EOF
    echo "[OK] Created journal file"
fi

echo ""
echo "Step 2: Dropping all database objects..."

# Create temporary SQL file
TEMP_SQL=$(mktemp)
cat > "$TEMP_SQL" << 'EOSQL'
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
EOSQL

# Load environment variables from .env file
load_dotenv

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL environment variable is not set"
    echo "       Make sure you have a .env file with DATABASE_URL configured"
    exit 1
fi

# Execute SQL
psql-17 "$DATABASE_URL" -f "$TEMP_SQL"

SQL_EXIT_CODE=$?

if [ $SQL_EXIT_CODE -eq 0 ]; then
    echo "[OK] Dropped all tables and enums"
else
    echo "ERROR: Failed to drop database objects"
    exit 1
fi

echo ""
echo "Step 3: Regenerating migrations..."

# Load environment variables again for npm scripts (they use dotenv-cli)
# But we'll also ensure DATABASE_URL is available
load_dotenv

# Run drizzle generate and migrate
npm run db:generate && npm run db:migrate

if [ $? -eq 0 ]; then
    echo ""
    echo "SUCCESS: Database reset complete!"
    echo "   - Migration files cleaned"
    echo "   - Journal reset"
    echo "   - Database objects dropped"
    echo "   - Fresh migrations generated and applied"
else
    echo ""
    echo "ERROR: Failed to regenerate migrations"
    exit 1
fi
