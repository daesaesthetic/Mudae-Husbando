import pg from "pg";
import { seedCharacters } from "./catalog.js";
import {
  normalizePagination,
  normalizeSearchQuery,
  resolveCharacterMatches,
  type CharacterMatch,
  type CharacterResolution,
} from "./rules.js";

const { Pool } = pg;

export class GameDatabase {
  private readonly pool: pg.Pool;
  private readonly rollExpirationMs = Number(
    process.env.ROLL_EXPIRATION_MS ?? 15 * 60 * 1000,
  );

  constructor(pool?: pg.Pool) {
    if (!pool && !process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for persistent game storage.");
    }
    this.pool = pool ?? new Pool({ connectionString: process.env.DATABASE_URL });
  }

  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS mudae_characters (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, aliases TEXT[] NOT NULL DEFAULT '{}',
        series TEXT NOT NULL, media_type TEXT NOT NULL, gender TEXT NOT NULL,
        source_url TEXT NOT NULL, image_url TEXT, description TEXT NOT NULL,
        rarity TEXT NOT NULL, value INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS mudae_characters_name_series_idx ON mudae_characters (LOWER(name), LOWER(series));
      CREATE TABLE IF NOT EXISTS mudae_users (
        discord_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, currency INTEGER NOT NULL DEFAULT 0,
        rolls_used INTEGER NOT NULL DEFAULT 0, claims_count INTEGER NOT NULL DEFAULT 0,
        last_roll_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
        id UUID PRIMARY KEY, discord_id TEXT NOT NULL REFERENCES mudae_users(discord_id) ON DELETE CASCADE,
        guild_id TEXT, character_id INTEGER NOT NULL REFERENCES mudae_characters(id), claimed_by TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), claimed_at TIMESTAMPTZ
      );
      ALTER TABLE mudae_rolls ADD COLUMN IF NOT EXISTS guild_id TEXT;
      ALTER TABLE mudae_rolls ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
      UPDATE mudae_rolls SET expires_at = created_at + INTERVAL '15 minutes' WHERE expires_at IS NULL;
      ALTER TABLE mudae_rolls ALTER COLUMN expires_at SET NOT NULL;
    `);
    for (const character of seedCharacters) {
      await this.pool.query(
        `INSERT INTO mudae_characters
          (name, aliases, series, media_type, gender, source_url, image_url, description, rarity, value, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'verified')
         ON CONFLICT (LOWER(name), LOWER(series)) DO NOTHING`,
        [
          character.name,
          character.aliases,
          character.series,
          character.mediaType,
          character.gender,
          character.sourceUrl,
          character.imageUrl,
          character.description,
          character.rarity,
          character.value,
        ],
      );
    }
  }

  async ensureUser(discordId: string, displayName: string) {
    await this.pool.query(
      `INSERT INTO mudae_users (discord_id, display_name) VALUES ($1,$2)
       ON CONFLICT (discord_id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW()`,
      [discordId, displayName],
    );
  }

  async getRandomVerified() {
    const result = await this.pool.query(
      `SELECT id, name, aliases, series, media_type AS "mediaType", gender, source_url AS "sourceUrl",
              image_url AS "imageUrl", description, rarity, value, status
       FROM mudae_characters c
       WHERE c.status = 'verified'
         AND NOT EXISTS (
           SELECT 1 FROM mudae_collections o WHERE o.character_id = c.id
         )
       ORDER BY RANDOM() LIMIT 1`,
    );
    return result.rows[0] as
      ((typeof seedCharacters)[number] & { id: number }) | undefined;
  }

  async createRoll(
    id: string,
    discordId: string,
    guildId: string | null,
    characterId: number,
  ) {
    const expiresAt = new Date(Date.now() + this.rollExpirationMs);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO mudae_rolls (id, discord_id, guild_id, character_id, expires_at) VALUES ($1,$2,$3,$4,$5)",
        [id, discordId, guildId, characterId, expiresAt],
      );
      await client.query(
        "UPDATE mudae_users SET rolls_used = rolls_used + 1, last_roll_at = NOW(), updated_at = NOW() WHERE discord_id = $1",
        [discordId],
      );
      await client.query("COMMIT");
      return expiresAt;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async claimRoll(rollId: string, discordId: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const roll = await client.query<{
        id: string;
        discord_id: string;
        character_id: number;
        claimed_by: string | null;
        expires_at: Date;
        status: string;
      }>(
        `SELECT r.id, r.discord_id, r.character_id, r.claimed_by, r.expires_at, c.status
         FROM mudae_rolls r JOIN mudae_characters c ON c.id = r.character_id
         WHERE r.id = COALESCE(NULLIF($1, '')::uuid, (
           SELECT id FROM mudae_rolls WHERE discord_id = $2 ORDER BY created_at DESC LIMIT 1
         )) FOR UPDATE`,
        [rollId, discordId],
      );
      if (!roll.rowCount) {
        await client.query("ROLLBACK");
        return "invalid" as const;
      }
      const selectedRoll = roll.rows[0];
      if (selectedRoll.claimed_by) {
        await client.query("ROLLBACK");
        return "claimed" as const;
      }
      // Serialize claims for the same character so two outstanding rolls
      // cannot both pass the global uniqueness check.
      await client.query("SELECT pg_advisory_xact_lock($1)", [
        selectedRoll.character_id,
      ]);
      const existingOwnership = await client.query(
        "SELECT 1 FROM mudae_collections WHERE character_id = $1 LIMIT 1",
        [selectedRoll.character_id],
      );
      if (existingOwnership.rowCount) {
        await client.query("ROLLBACK");
        return "unavailable" as const;
      }
      if (new Date(selectedRoll.expires_at).getTime() <= Date.now()) {
        await client.query("ROLLBACK");
        return "expired" as const;
      }
      if (selectedRoll.status !== "verified") {
        await client.query("ROLLBACK");
        return "unverified" as const;
      }
      const characterId = selectedRoll.character_id;
      await client.query(
        "UPDATE mudae_rolls SET claimed_by = $2, claimed_at = NOW() WHERE id = $1",
        [selectedRoll.id, discordId],
      );
      await client.query(
        `INSERT INTO mudae_collections (discord_id, character_id, quantity)
         VALUES ($1,$2,1) ON CONFLICT (discord_id, character_id) DO NOTHING`,
        [discordId, characterId],
      );
      await client.query(
        "UPDATE mudae_users SET claims_count = claims_count + 1, updated_at = NOW() WHERE discord_id = $1",
        [discordId],
      );
      await client.query("COMMIT");
      return { status: "success" as const, characterId };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getCharacter(id: number) {
    const result = await this.pool.query(
      `SELECT id, name, series, rarity, value, description FROM mudae_characters WHERE id = $1 AND status = 'verified'`,
      [id],
    );
    return result.rows[0] as
      | {
          id: number;
          name: string;
          series: string;
          rarity: string;
          value: number;
          description: string;
        }
      | undefined;
  }

  async getRoll(rollId: string, discordId?: string) {
    const result = await this.pool.query(
      `SELECT r.id, r.discord_id AS "discordId", r.character_id AS "characterId", r.expires_at AS "expiresAt",
              r.claimed_by AS "claimedBy", c.name, c.series, c.rarity, c.value, c.description
       FROM mudae_rolls r JOIN mudae_characters c ON c.id = r.character_id
       WHERE r.id = $1 AND ($2::text IS NULL OR r.discord_id = $2)`,
      [rollId, discordId ?? null],
    );
    return result.rows[0] as
      | {
          id: string;
          discordId: string;
          characterId: number;
          expiresAt: Date;
          claimedBy: string | null;
          name: string;
          series: string;
          rarity: string;
          value: number;
          description: string;
        }
      | undefined;
  }

  async search(query: string) {
    const normalizedQuery = normalizeSearchQuery(query);
    if (!normalizedQuery) return [];
    const result = await this.pool.query(
      `SELECT id, name, series, rarity, value FROM mudae_characters
       WHERE status = 'verified' AND (
          regexp_replace(name, '\\s+', ' ', 'g') ILIKE $1
          OR regexp_replace(series, '\\s+', ' ', 'g') ILIKE $1
         OR EXISTS (
           SELECT 1 FROM unnest(aliases) AS alias
            WHERE regexp_replace(alias, '\\s+', ' ', 'g') ILIKE $1
         )
       )
       ORDER BY name LIMIT 10`,
      [`%${normalizedQuery}%`],
    );
    return result.rows as {
      id: number;
      name: string;
      series: string;
      rarity: string;
      value: number;
    }[];
  }

  async resolveCharacter(query: string): Promise<CharacterResolution> {
    const normalizedQuery = normalizeSearchQuery(query);
    if (!normalizedQuery) return { status: "not_found", matches: [] };
    const result = await this.pool.query(
      `SELECT id, name, series, rarity, value FROM mudae_characters
       WHERE status = 'verified' AND (
         regexp_replace(name, '\\s+', ' ', 'g') ILIKE $1
         OR regexp_replace(series, '\\s+', ' ', 'g') ILIKE $1
         OR EXISTS (
           SELECT 1 FROM unnest(aliases) AS alias
           WHERE regexp_replace(alias, '\\s+', ' ', 'g') ILIKE $1
         )
       )
       ORDER BY name LIMIT 11`,
      [`%${normalizedQuery}%`],
    );
    return resolveCharacterMatches(normalizedQuery, result.rows as CharacterMatch[]);
  }

  async collection(discordId: string, page = 1, pageSize = 8) {
    const countResult = await this.pool.query(
      `SELECT COUNT(*)::int AS total
       FROM mudae_collections
       WHERE discord_id = $1`,
      [discordId],
    );
    const totalItems = Number(countResult.rows[0]?.total ?? 0);
    const pagination = normalizePagination(page, pageSize, totalItems);
    const result = await this.pool.query(
      `SELECT c.id AS "characterId", c.name, c.series, c.rarity, c.value, o.quantity, o.favorite
       FROM mudae_collections o JOIN mudae_characters c ON c.id = o.character_id
       WHERE o.discord_id = $1 ORDER BY c.name, c.id
       LIMIT $2 OFFSET $3`,
      [discordId, pagination.pageSize, pagination.offset],
    );
    return {
      items: result.rows as {
        characterId: number;
        name: string;
        series: string;
        rarity: string;
        value: number;
        quantity: number;
        favorite: boolean;
      }[],
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalItems,
      totalPages: pagination.totalPages,
    };
  }

  async profile(discordId: string) {
    const result = await this.pool.query(
      `SELECT u.currency, u.rolls_used, u.claims_count,
              COUNT(o.character_id)::int AS unique_characters,
              COALESCE(SUM(o.quantity), 0)::int AS total_copies,
              COUNT(o.character_id) FILTER (WHERE o.favorite)::int AS favorites,
              (SELECT COUNT(*)::int FROM mudae_wishlists w WHERE w.discord_id = u.discord_id) AS wishlist_count
       FROM mudae_users u LEFT JOIN mudae_collections o ON o.discord_id = u.discord_id
       WHERE u.discord_id = $1 GROUP BY u.discord_id`,
      [discordId],
    );
    return result.rows[0] as
      | {
          currency: number;
          rolls_used: number;
          claims_count: number;
          unique_characters: number;
          total_copies: number;
          favorites: number;
          wishlist_count: number;
        }
      | undefined;
  }

  async toggleWishlist(discordId: string, characterId: number) {
    const result = await this.pool.query(
      "DELETE FROM mudae_wishlists WHERE discord_id = $1 AND character_id = $2 RETURNING character_id",
      [discordId, characterId],
    );
    if (result.rowCount) return false;
    const character = await this.getCharacter(characterId);
    if (!character) return null;
    await this.pool.query(
      "INSERT INTO mudae_wishlists (discord_id, character_id) VALUES ($1,$2)",
      [discordId, characterId],
    );
    return true;
  }

  async toggleFavorite(discordId: string, characterId: number) {
    const character = await this.getCharacter(characterId);
    if (!character) return "invalid" as const;
    const result = await this.pool.query(
      `UPDATE mudae_collections SET favorite = NOT favorite
       WHERE discord_id = $1 AND character_id = $2
       RETURNING favorite`,
      [discordId, characterId],
    );
    if (!result.rowCount) return "unowned" as const;
    return result.rows[0].favorite as boolean;
  }
}
