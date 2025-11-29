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
echo "Step 1: Dropping all database objects..."

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

# Bail if using prod DB (port 5432)
if echo "$DATABASE_URL" | grep -q ":5432" ; then
    echo "ERROR: Refusing to reset the PRODUCTION database (DATABASE_URL uses port 5432)"
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
