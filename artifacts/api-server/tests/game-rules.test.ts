import assert from "node:assert/strict";
import { describe, it } from "node:test";
import pg from "pg";
import { GameDatabase } from "../src/bot/database.js";
import { normalizePagination, normalizeSearchQuery } from "../src/bot/rules.js";

type QueryResult = { rows: Record<string, unknown>[]; rowCount: number };

class FakePool {
  private claimLock: Promise<void> = Promise.resolve();
  private roll = {
    id: "00000000-0000-0000-0000-000000000001",
    discord_id: "roller",
    character_id: 1,
    claimed_by: null as string | null,
    expires_at: new Date(Date.now() + 60_000),
    status: "verified",
  };
  public claims: string[] = [];

  async connect() {
    let ownsLock = false;
    let releaseLock = () => {};
    const client = {
      query: async (sql: string, params?: unknown[]): Promise<QueryResult> => {
        if (sql === "BEGIN") return { rows: [], rowCount: 0 };
        if (sql.includes("FOR UPDATE")) {
          const previousLock = this.claimLock;
          this.claimLock = new Promise<void>((resolve) => {
            releaseLock = resolve;
          });
          await previousLock;
          ownsLock = true;
          if (params?.[0]) {
            return {
              rows: this.roll.claimed_by
                ? [{ ...this.roll }]
                : [{ ...this.roll }],
              rowCount: 1,
            };
          }
        }
        if (sql.startsWith("UPDATE mudae_rolls SET claimed_by")) {
          this.roll.claimed_by = String(params?.[1]);
          this.claims.push(this.roll.claimed_by);
          return { rows: [], rowCount: 1 };
        }
        if (sql === "COMMIT" || sql === "ROLLBACK") {
          if (ownsLock) releaseLock();
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 1 };
      },
      release: () => {},
    };
    return client;
  }

  async query(sql: string): Promise<QueryResult> {
    if (sql.includes("SELECT id, name, aliases")) {
      return {
        rows: [{ id: 1, name: "Verified", status: "verified" }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  }
}

describe("collection and search rules", () => {
  it("normalizes whitespace and rejects blank search input", () => {
    assert.equal(normalizeSearchQuery("  Satoru   Gojo  "), "Satoru Gojo");
    assert.equal(normalizeSearchQuery(" \t "), "");
  });

  it("clamps pagination and keeps the offset deterministic", () => {
    assert.deepEqual(normalizePagination(99, 8, 17), {
      page: 3,
      pageSize: 8,
      totalPages: 3,
      offset: 16,
    });
    assert.deepEqual(normalizePagination(0, 100, 0), {
      page: 1,
      pageSize: 25,
      totalPages: 1,
      offset: 0,
    });
  });
});

describe("claim transaction foundation", () => {
  it("allows another user to claim a roll and records one ownership award", async () => {
    const pool = new FakePool();
    const database = new GameDatabase(pool as unknown as pg.Pool);
    const result = await database.claimRoll(
      "00000000-0000-0000-0000-000000000001",
      "claimer",
    );
    assert.deepEqual(result, { status: "success", characterId: 1 });
    assert.deepEqual(pool.claims, ["claimer"]);
  });

  it("allows exactly one winner for concurrent claims", async () => {
    const pool = new FakePool();
    const database = new GameDatabase(pool as unknown as pg.Pool);
    const results = await Promise.all([
      database.claimRoll("00000000-0000-0000-0000-000000000001", "user-a"),
      database.claimRoll("00000000-0000-0000-0000-000000000001", "user-b"),
    ]);
    assert.equal(results.filter((result) => typeof result === "object").length, 1);
    assert.equal(results.filter((result) => result === "claimed").length, 1);
    assert.equal(pool.claims.length, 1);
  });
});