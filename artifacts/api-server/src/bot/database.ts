import pg from "pg";
import { seedCharacters } from "./catalog";

const { Pool } = pg;

export class GameDatabase {
  private readonly pool: pg.Pool;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for persistent game storage.");
    }
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
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
        character_id INTEGER NOT NULL REFERENCES mudae_characters(id), claimed_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), claimed_at TIMESTAMPTZ
      );
    `);
    for (const character of seedCharacters) {
      await this.pool.query(
        `INSERT INTO mudae_characters
          (name, aliases, series, media_type, gender, source_url, image_url, description, rarity, value, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'verified')
         ON CONFLICT (LOWER(name), LOWER(series)) DO NOTHING`,
        [character.name, character.aliases, character.series, character.mediaType, character.gender,
          character.sourceUrl, character.imageUrl, character.description, character.rarity, character.value],
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
       FROM mudae_characters WHERE status = 'verified' ORDER BY RANDOM() LIMIT 1`,
    );
    return result.rows[0] as (typeof seedCharacters[number] & { id: number }) | undefined;
  }

  async createRoll(id: string, discordId: string, characterId: number) {
    await this.pool.query("INSERT INTO mudae_rolls (id, discord_id, character_id) VALUES ($1,$2,$3)", [id, discordId, characterId]);
    await this.pool.query("UPDATE mudae_users SET rolls_used = rolls_used + 1, last_roll_at = NOW(), updated_at = NOW() WHERE discord_id = $1", [discordId]);
  }

  async claimRoll(rollId: string, discordId: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const roll = await client.query(
        `UPDATE mudae_rolls SET claimed_by = $2, claimed_at = NOW()
         WHERE id = COALESCE(NULLIF($1, '')::uuid, (
           SELECT id FROM mudae_rolls WHERE discord_id = $2 AND claimed_by IS NULL
           ORDER BY created_at DESC LIMIT 1
         )) AND claimed_by IS NULL AND discord_id = $2 RETURNING character_id`,
        [rollId, discordId],
      );
      if (!roll.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }
      const characterId = roll.rows[0].character_id as number;
      await client.query(
        `INSERT INTO mudae_collections (discord_id, character_id) VALUES ($1,$2)
         ON CONFLICT (discord_id, character_id) DO UPDATE SET quantity = mudae_collections.quantity + 1`,
        [discordId, characterId],
      );
      await client.query("UPDATE mudae_users SET claims_count = claims_count + 1, updated_at = NOW() WHERE discord_id = $1", [discordId]);
      await client.query("COMMIT");
      return characterId;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getCharacter(id: number) {
    const result = await this.pool.query(
      `SELECT id, name, series, rarity, value, description FROM mudae_characters WHERE id = $1 AND status = 'verified'`, [id],
    );
    return result.rows[0] as { id: number; name: string; series: string; rarity: string; value: number; description: string } | undefined;
  }

  async search(query: string) {
    const result = await this.pool.query(
      `SELECT id, name, series, rarity, value FROM mudae_characters
       WHERE status = 'verified' AND (name ILIKE $1 OR series ILIKE $1 OR $1 = ANY(aliases))
       ORDER BY name LIMIT 10`, [`%${query}%`],
    );
    return result.rows as { id: number; name: string; series: string; rarity: string; value: number }[];
  }

  async collection(discordId: string) {
    const result = await this.pool.query(
      `SELECT c.name, c.series, c.rarity, c.value, o.quantity, o.favorite
       FROM mudae_collections o JOIN mudae_characters c ON c.id = o.character_id
       WHERE o.discord_id = $1 ORDER BY c.name`, [discordId],
    );
    return result.rows as { name: string; series: string; rarity: string; value: number; quantity: number; favorite: boolean }[];
  }

  async profile(discordId: string) {
    const result = await this.pool.query(
      `SELECT u.currency, u.rolls_used, u.claims_count, COUNT(o.character_id)::int AS collection_size
       FROM mudae_users u LEFT JOIN mudae_collections o ON o.discord_id = u.discord_id
       WHERE u.discord_id = $1 GROUP BY u.discord_id`, [discordId],
    );
    return result.rows[0] as { currency: number; rolls_used: number; claims_count: number; collection_size: number } | undefined;
  }

  async toggleWishlist(discordId: string, characterId: number) {
    const result = await this.pool.query("DELETE FROM mudae_wishlists WHERE discord_id = $1 AND character_id = $2 RETURNING character_id", [discordId, characterId]);
    if (result.rowCount) return false;
    const character = await this.getCharacter(characterId);
    if (!character) return null;
    await this.pool.query("INSERT INTO mudae_wishlists (discord_id, character_id) VALUES ($1,$2)", [discordId, characterId]);
    return true;
  }

  async toggleFavorite(discordId: string, name: string) {
    const result = await this.pool.query(
      `UPDATE mudae_collections SET favorite = NOT favorite
       WHERE discord_id = $1 AND character_id = (SELECT id FROM mudae_characters WHERE LOWER(name) = LOWER($2))
       RETURNING favorite`, [discordId, name],
    );
    return result.rows[0]?.favorite as boolean | undefined;
  }
}