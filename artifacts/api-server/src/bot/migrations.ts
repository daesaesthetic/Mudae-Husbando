import type pg from "pg";

export type Migration = {
  id: string;
  name: string;
  sql: string;
};

export const migrations: readonly Migration[] = [
  {
    id: "001",
    name: "character-collection-foundation",
    sql: `
      CREATE TABLE IF NOT EXISTS mudae_characters (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, aliases TEXT[] NOT NULL DEFAULT '{}',
        series TEXT NOT NULL, media_type TEXT NOT NULL, gender TEXT NOT NULL,
        source_url TEXT NOT NULL, image_url TEXT, description TEXT NOT NULL,
        rarity TEXT NOT NULL, value INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS mudae_characters_name_series_idx
        ON mudae_characters (LOWER(name), LOWER(series));
      CREATE TABLE IF NOT EXISTS mudae_users (
        discord_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, currency INTEGER NOT NULL DEFAULT 0,
        rolls_used INTEGER NOT NULL DEFAULT 0, claims_count INTEGER NOT NULL DEFAULT 0,
        last_roll_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS mudae_collections (
        discord_id TEXT NOT NULL REFERENCES mudae_users(discord_id) ON DELETE CASCADE,
        character_id INTEGER NOT NULL REFERENCES mudae_characters(id) ON DELETE RESTRICT,
        quantity INTEGER NOT NULL DEFAULT 1, favorite BOOLEAN NOT NULL DEFAULT FALSE,
        acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (discord_id, character_id)
      );
      CREATE TABLE IF NOT EXISTS mudae_wishlists (
        discord_id TEXT NOT NULL REFERENCES mudae_users(discord_id) ON DELETE CASCADE,
        character_id INTEGER NOT NULL REFERENCES mudae_characters(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (discord_id, character_id)
      );
      CREATE TABLE IF NOT EXISTS mudae_rolls (
        id UUID PRIMARY KEY,
        discord_id TEXT NOT NULL REFERENCES mudae_users(discord_id) ON DELETE CASCADE,
        guild_id TEXT,
        character_id INTEGER NOT NULL REFERENCES mudae_characters(id),
        claimed_by TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        claimed_at TIMESTAMPTZ
      );
    `,
  },
  {
    id: "002",
    name: "roll-expiration-compatibility",
    sql: `
      ALTER TABLE mudae_rolls ADD COLUMN IF NOT EXISTS guild_id TEXT;
      ALTER TABLE mudae_rolls ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
      UPDATE mudae_rolls
        SET expires_at = created_at + INTERVAL '15 minutes'
        WHERE expires_at IS NULL;
      ALTER TABLE mudae_rolls ALTER COLUMN expires_at SET NOT NULL;
    `,
  },
  {
    id: "003",
    name: "economy-and-cooldown-foundation",
    sql: `
      CREATE TABLE IF NOT EXISTS mudae_currency_transactions (
        id UUID PRIMARY KEY,
        discord_id TEXT NOT NULL REFERENCES mudae_users(discord_id) ON DELETE CASCADE,
        related_discord_id TEXT REFERENCES mudae_users(discord_id) ON DELETE SET NULL,
        amount INTEGER NOT NULL CHECK (amount > 0),
        transaction_type TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS mudae_currency_transactions_user_idx
        ON mudae_currency_transactions (discord_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS mudae_cooldowns (
        scope_key TEXT PRIMARY KEY,
        discord_id TEXT NOT NULL,
        guild_id TEXT,
        action TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (discord_id, guild_id, action)
      );
      CREATE INDEX IF NOT EXISTS mudae_cooldowns_expiration_idx
        ON mudae_cooldowns (expires_at);
    `,
  },
  {
    id: "004",
    name: "persistent-roll-pool",
    sql: `
      ALTER TABLE mudae_users
        ADD COLUMN IF NOT EXISTS available_rolls INTEGER NOT NULL DEFAULT 5,
        ADD COLUMN IF NOT EXISTS roll_replenishment_at TIMESTAMPTZ;
      ALTER TABLE mudae_users
        ADD CONSTRAINT mudae_users_available_rolls_nonnegative
        CHECK (available_rolls >= 0);
    `,
  },
  {
    id: "005",
    name: "increase-roll-pool-default",
    sql: `
      ALTER TABLE mudae_users
        ALTER COLUMN available_rolls SET DEFAULT 10;
    `,
  },
  {
    id: "006",
    name: "persistent-claim-pool",
    sql: `
      ALTER TABLE mudae_users
        ADD COLUMN IF NOT EXISTS available_claims INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS claim_replenishment_at TIMESTAMPTZ;
      ALTER TABLE mudae_users
        ADD CONSTRAINT mudae_users_available_claims_nonnegative
        CHECK (available_claims >= 0);
    `,
  },
];

export function pendingMigrations(
  appliedIds: ReadonlySet<string>,
  available = migrations,
) {
  return available.filter((migration) => !appliedIds.has(migration.id));
}

export async function runMigrations(pool: pg.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mudae_schema_migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('mudae:schema-migrations', 0))",
    );
    const applied = await client.query<{ id: string }>(
      "SELECT id FROM mudae_schema_migrations ORDER BY id",
    );

    for (const migration of pendingMigrations(
      new Set(applied.rows.map((row) => row.id)),
    )) {
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO mudae_schema_migrations (id, name) VALUES ($1, $2)",
        [migration.id, migration.name],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}