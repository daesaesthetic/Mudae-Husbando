import pg from "pg";
import { seedCharacters } from "./catalog.js";
import { CooldownService } from "./cooldown.js";
import { EconomyService } from "./economy.js";
import { runMigrations } from "./migrations.js";
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
  public readonly economy: EconomyService;
  public readonly cooldowns: CooldownService;
  private readonly rollExpirationMs = Number(
    process.env.ROLL_EXPIRATION_MS ?? 15 * 60 * 1000,
  );
  private readonly rollPoolSize = Number(process.env.ROLL_POOL_SIZE ?? 10);
  private readonly rollReplenishmentMs = Number(
    process.env.ROLL_REPLENISHMENT_MS ?? 60 * 60 * 1000,
  );
  private readonly claimPoolSize = Number(process.env.CLAIM_POOL_SIZE ?? 1);
  private readonly claimReplenishmentMs = Number(
    process.env.CLAIM_REPLENISHMENT_MS ?? 60 * 60 * 1000,
  );

  constructor(pool?: pg.Pool) {
    if (!pool && !process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for persistent game storage.");
    }
    this.pool = pool ?? new Pool({ connectionString: process.env.DATABASE_URL });
    this.economy = new EconomyService(this.pool);
    this.cooldowns = new CooldownService(this.pool);
  }

  async initialize() {
    await runMigrations(this.pool);
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

  async roll(
    id: string,
    discordId: string,
    guildId: string | null,
    developerMode = false,
  ) {
    const expiresAt = new Date(Date.now() + this.rollExpirationMs);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const userResult = await client.query<{
        available_rolls: number;
        roll_replenishment_at: Date | null;
      }>(
        `SELECT available_rolls, roll_replenishment_at
         FROM mudae_users WHERE discord_id = $1 FOR UPDATE`,
        [discordId],
      );
      if (!userResult.rowCount) {
        await client.query("ROLLBACK");
        return { status: "missing_user" as const };
      }

      let availableRolls = Number(userResult.rows[0].available_rolls);
      const replenishmentAt = userResult.rows[0].roll_replenishment_at;
      if (
        !developerMode &&
        availableRolls === 0 &&
        replenishmentAt &&
        new Date(replenishmentAt).getTime() <= Date.now()
      ) {
        availableRolls = this.rollPoolSize;
        await client.query(
          `UPDATE mudae_users
           SET available_rolls = $2, roll_replenishment_at = NULL, updated_at = NOW()
           WHERE discord_id = $1`,
          [discordId, availableRolls],
        );
      }
      if (!developerMode && availableRolls <= 0) {
        await client.query("ROLLBACK");
        return {
          status: "exhausted" as const,
          replenishmentAt: replenishmentAt ? new Date(replenishmentAt) : null,
        };
      }

      const characterResult = await client.query<{
        id: number;
        name: string;
        series: string;
        rarity: string;
        value: number;
        description: string;
      }>(
        `SELECT c.id, c.name, c.series, c.rarity, c.value, c.description
         FROM mudae_characters c
         WHERE c.status = 'verified'
           AND NOT EXISTS (
             SELECT 1 FROM mudae_collections o WHERE o.character_id = c.id
           )
         ORDER BY RANDOM() LIMIT 1`,
      );
      if (!characterResult.rowCount) {
        await client.query("ROLLBACK");
        return { status: "empty_catalog" as const };
      }

      let nextReplenishmentAt: Date | null = null;
      if (!developerMode) {
        const nextAvailable = availableRolls - 1;
        if (nextAvailable === 0) {
          nextReplenishmentAt = new Date(Date.now() + this.rollReplenishmentMs);
        }
        await client.query(
          `UPDATE mudae_users
           SET available_rolls = $2, roll_replenishment_at = $3,
               rolls_used = rolls_used + 1, last_roll_at = NOW(), updated_at = NOW()
           WHERE discord_id = $1`,
          [discordId, nextAvailable, nextReplenishmentAt],
        );
      } else {
        await client.query(
          `UPDATE mudae_users
           SET rolls_used = rolls_used + 1, last_roll_at = NOW(), updated_at = NOW()
           WHERE discord_id = $1`,
          [discordId],
        );
      }
      const { id: characterId, ...character } = characterResult.rows[0];
      await client.query(
        "INSERT INTO mudae_rolls (id, discord_id, guild_id, character_id, expires_at) VALUES ($1,$2,$3,$4,$5)",
        [id, discordId, guildId, characterId, expiresAt],
      );
      await client.query("COMMIT");
      return {
        status: "success" as const,
        roll: {
          id,
          discordId,
          characterId,
          expiresAt,
          claimedBy: null,
          ...character,
        },
        availableRolls: developerMode ? availableRolls : availableRolls - 1,
      };
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
      const user = await client.query<{
        available_claims: number;
        claim_replenishment_at: Date | null;
      }>(
        `SELECT available_claims, claim_replenishment_at
         FROM mudae_users WHERE discord_id = $1 FOR UPDATE`,
        [discordId],
      );
      if (!user.rowCount) {
        await client.query("ROLLBACK");
        return "invalid" as const;
      }
      let availableClaims = Number(user.rows[0].available_claims);
      const claimReplenishmentAt = user.rows[0].claim_replenishment_at;
      if (
        availableClaims === 0 &&
        claimReplenishmentAt &&
        new Date(claimReplenishmentAt).getTime() <= Date.now()
      ) {
        availableClaims = this.claimPoolSize;
      }
      if (availableClaims <= 0) {
        await client.query("ROLLBACK");
        return {
          status: "claim_unavailable" as const,
          replenishmentAt: claimReplenishmentAt
            ? new Date(claimReplenishmentAt)
            : null,
        };
      }
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
        `UPDATE mudae_users
         SET claims_count = claims_count + 1,
             available_claims = $2,
             claim_replenishment_at = $3,
             updated_at = NOW()
         WHERE discord_id = $1`,
        [
          discordId,
          availableClaims - 1,
          availableClaims - 1 === 0
            ? new Date(Date.now() + this.claimReplenishmentMs)
            : null,
        ],
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
      `SELECT u.currency, u.rolls_used, u.claims_count, u.available_rolls,
              u.roll_replenishment_at, u.available_claims,
              u.claim_replenishment_at,
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
          available_rolls: number;
          roll_replenishment_at: Date | null;
          available_claims: number;
          claim_replenishment_at: Date | null;
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
