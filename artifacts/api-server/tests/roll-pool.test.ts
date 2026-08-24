import assert from "node:assert/strict";
import { describe, it } from "node:test";
import pg from "pg";
import { GameDatabase } from "../src/bot/database.js";

type QueryResult = { rows: Record<string, unknown>[]; rowCount: number };

class RollPool {
  user = {
    available_rolls: 10,
    roll_replenishment_at: null as Date | null,
    rolls_used: 0,
    available_claims: 1,
    claim_replenishment_at: null as Date | null,
  };
  rolls = new Map<string, {
    id: string;
    discord_id: string;
    character_id: number;
    claimed_by: string | null;
    expires_at: Date;
    status: string;
  }>();
  private userLock: Promise<void> = Promise.resolve();
  public lastCharacterFilter: unknown = undefined;

  async connect() {
    let releaseUserLock = () => {};
    let holdsUserLock = false;
    return {
      query: async (sql: string, params: unknown[] = []): Promise<QueryResult> => {
        if (sql === "BEGIN") return { rows: [], rowCount: 0 };
        if (sql.includes("FROM mudae_users WHERE discord_id = $1 FOR UPDATE")) {
          const previous = this.userLock;
          this.userLock = new Promise<void>((resolve) => {
            releaseUserLock = resolve;
          });
          await previous;
          holdsUserLock = true;
          return { rows: [{ ...this.user }], rowCount: 1 };
        }
        if (sql.includes("FROM mudae_characters c")) {
          this.lastCharacterFilter = params[0];
          return {
            rows: [{
              id: 1,
              name: "Verified",
              series: "Test Series",
              mediaType: "anime",
              gender: params[0] ?? "unknown",
              imageUrl: null,
              rarity: "rare",
              value: 50,
              description: "A verified character.",
            }],
            rowCount: 1,
          };
        }
        if (sql.startsWith("UPDATE mudae_users") && sql.includes("available_rolls = $2")) {
          this.user.available_rolls = Number(params[1]);
          this.user.roll_replenishment_at = (params[2] as Date | null) ?? null;
          this.user.rolls_used += 1;
          return { rows: [], rowCount: 1 };
        }
        if (sql.startsWith("UPDATE mudae_users") && sql.includes("available_claims = $2")) {
          this.user.available_claims = Number(params[1]);
          this.user.claim_replenishment_at = (params[2] as Date | null) ?? null;
          return { rows: [], rowCount: 1 };
        }
        if (sql.startsWith("UPDATE mudae_users") && sql.includes("rolls_used = rolls_used + 1")) {
          this.user.rolls_used += 1;
          return { rows: [], rowCount: 1 };
        }
        if (sql.startsWith("INSERT INTO mudae_rolls")) {
          this.rolls.set(String(params[0]), {
            id: String(params[0]),
            discord_id: String(params[1]),
            character_id: Number(params[3]),
            claimed_by: null,
            expires_at: params[4] as Date,
            status: "verified",
          });
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes("FROM mudae_rolls r JOIN mudae_characters")) {
          const roll = this.rolls.get(String(params[0]));
          return roll ? { rows: [{ ...roll }], rowCount: 1 } : { rows: [], rowCount: 0 };
        }
        if (sql.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [], rowCount: 0 };
        if (sql.startsWith("SELECT 1 FROM mudae_collections")) return { rows: [], rowCount: 0 };
        if (sql.startsWith("UPDATE mudae_rolls SET claimed_by")) {
          const roll = this.rolls.get(String(params[0]));
          if (roll) roll.claimed_by = String(params[1]);
          return { rows: [], rowCount: 1 };
        }
        if (sql === "COMMIT" || sql === "ROLLBACK") {
          if (holdsUserLock) releaseUserLock();
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 1 };
      },
      release() {},
    };
  }
}

function databaseWithPool(pool = new RollPool()) {
  return { database: new GameDatabase(pool as unknown as pg.Pool), pool };
}

describe("persistent roll pool", () => {
  it("initializes at ten rolls and consumes consecutive rolls before replenishment starts", async () => {
    const { database, pool } = databaseWithPool();
    for (let index = 0; index < 10; index += 1) {
      const result = await database.roll(`roll-${index}`, "player", null);
      assert.equal(result.status, "success");
      if (result.status === "success") assert.equal(result.availableRolls, 9 - index);
      if (index < 9) assert.equal(pool.user.roll_replenishment_at, null);
    }
    assert.equal(pool.user.available_rolls, 0);
    assert.ok(pool.user.roll_replenishment_at instanceof Date);
    assert.equal(pool.user.rolls_used, 10);
  });

  it("rejects an exhausted pool until its persistent replenishment timestamp has passed", async () => {
    const { database, pool } = databaseWithPool();
    pool.user.available_rolls = 0;
    pool.user.roll_replenishment_at = new Date(Date.now() + 60_000);
    const exhausted = await database.roll("blocked", "player", null);
    assert.equal(exhausted.status, "exhausted");
    assert.equal(pool.rolls.size, 0);

    pool.user.roll_replenishment_at = new Date(Date.now() - 1);
    const replenished = await database.roll("restored", "player", null);
    assert.equal(replenished.status, "success");
    assert.equal(pool.user.available_rolls, 9);
    assert.equal(pool.user.roll_replenishment_at, null);
  });

  it("preserves an existing partially consumed pool when the configured maximum changes", async () => {
    const { database, pool } = databaseWithPool();
    pool.user.available_rolls = 7;
    const result = await database.roll("partial", "player", null);
    assert.equal(result.status, "success");
    assert.equal(pool.user.available_rolls, 6);
  });

  it("allows only one concurrent consumption when one roll remains", async () => {
    const { database, pool } = databaseWithPool();
    pool.user.available_rolls = 1;
    const results = await Promise.all([
      database.roll("first", "player", null),
      database.roll("second", "player", null),
    ]);
    assert.equal(results.filter((result) => result.status === "success").length, 1);
    assert.equal(results.filter((result) => result.status === "exhausted").length, 1);
    assert.equal(pool.user.available_rolls, 0);
  });

  it("does not change the pool when claiming a rolled character", async () => {
    const { database, pool } = databaseWithPool();
    const rolled = await database.roll("claimable", "player", null);
    assert.equal(rolled.status, "success");
    assert.equal(pool.user.available_rolls, 9);
    assert.deepEqual(await database.claimRoll("claimable", "claimer"), {
      status: "success",
      characterId: 1,
    });
    const repeated = await database.claimRoll("claimable", "claimer");
    assert.equal(typeof repeated, "object");
    if (typeof repeated === "object") assert.equal(repeated.status, "claim_unavailable");
    assert.equal(pool.user.available_rolls, 9);
    assert.equal(pool.user.available_claims, 0);
    const secondRoll = await database.roll("after-claim", "player", null);
    assert.equal(secondRoll.status, "success");
    assert.equal(pool.user.available_rolls, 8);
    assert.equal(pool.user.available_claims, 0);
  });

  it("rejects a second claim while the claim pool is replenishing", async () => {
    const { database, pool } = databaseWithPool();
    await database.roll("first-claim", "player", null);
    assert.deepEqual(await database.claimRoll("first-claim", "claimer"), {
      status: "success",
      characterId: 1,
    });
    const second = await database.roll("second-roll", "player", null);
    assert.equal(second.status, "success");
    const rejected = await database.claimRoll("second-roll", "claimer");
    assert.equal(typeof rejected, "object");
    if (typeof rejected === "object") assert.equal(rejected.status, "claim_unavailable");
    assert.equal(pool.user.available_claims, 0);
  });

  it("restores an expired claim pool and allows the next claim", async () => {
    const { database, pool } = databaseWithPool();
    pool.user.available_claims = 0;
    pool.user.claim_replenishment_at = new Date(Date.now() - 1);
    await database.roll("restored-claim", "player", null);
    const result = await database.claimRoll("restored-claim", "claimer");
    assert.deepEqual(result, { status: "success", characterId: 1 });
    assert.equal(pool.user.available_claims, 0);
    assert.ok(pool.user.claim_replenishment_at instanceof Date);
  });

  it("does not consume claim availability when claim validation fails", async () => {
    const { database, pool } = databaseWithPool();
    assert.equal(await database.claimRoll("missing-roll", "claimer"), "invalid");
    assert.equal(pool.user.available_claims, 1);
    assert.equal(pool.user.claim_replenishment_at, null);
  });

  it("allows only one concurrent claim when one claim remains", async () => {
    const { database, pool } = databaseWithPool();
    await database.roll("concurrent-claim", "player", null);
    const results = await Promise.all([
      database.claimRoll("concurrent-claim", "claimer"),
      database.claimRoll("concurrent-claim", "claimer"),
    ]);
    assert.equal(
      results.filter((result) => typeof result === "object" && result.status === "success").length,
      1,
    );
    assert.equal(
      results.filter(
        (result) => typeof result === "object" && result.status === "claim_unavailable",
      ).length,
      1,
    );
    assert.equal(pool.user.available_claims, 0);
  });

  it("lets developer mode bypass availability without consuming normal rolls", async () => {
    const { database, pool } = databaseWithPool();
    pool.user.available_rolls = 0;
    pool.user.roll_replenishment_at = new Date(Date.now() + 60_000);
    const result = await database.roll("developer", "player", null, true);
    assert.equal(result.status, "success");
    assert.equal(pool.user.available_rolls, 0);
    assert.equal(pool.user.rolls_used, 1);
  });

  it("uses the normal persistent roll transaction for deterministic category filters", async () => {
    const { database, pool } = databaseWithPool();
    const husbando = await database.roll("husbando", "player", null, false, "male");
    assert.equal(husbando.status, "success");
    assert.equal(pool.lastCharacterFilter, "male");
    assert.equal(pool.user.available_rolls, 9);

    const waifu = await database.roll("waifu", "player", null, false, "female");
    assert.equal(waifu.status, "success");
    assert.equal(pool.lastCharacterFilter, "female");
    assert.equal(pool.user.available_rolls, 8);
  });
});