import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GameDatabase } from "../src/bot/database.js";
import { canPerformRoll, isAuthorizedDeveloper, isDeveloperModeEnabled, resetDeveloperModes, toggleDeveloperMode, } from "../src/bot/developer.js";
import { normalizePagination, normalizeSearchQuery, resolveCharacterMatches, } from "../src/bot/rules.js";
class FakePool {
    claimLock = Promise.resolve();
    roll = {
        id: "00000000-0000-0000-0000-000000000001",
        discord_id: "roller",
        character_id: 1,
        claimed_by: null,
        expires_at: new Date(Date.now() + 60_000),
        status: "verified",
    };
    claims = [];
    existingOwnership = false;
    async connect() {
        let ownsLock = false;
        let releaseLock = () => { };
        const client = {
            query: async (sql, params) => {
                if (sql === "BEGIN")
                    return { rows: [], rowCount: 0 };
                if (sql.startsWith("SELECT pg_advisory_xact_lock"))
                    return { rows: [], rowCount: 0 };
                if (sql.startsWith("SELECT 1 FROM mudae_collections"))
                    return this.existingOwnership
                        ? { rows: [{ character_id: 1 }], rowCount: 1 }
                        : { rows: [], rowCount: 0 };
                if (sql.includes("FOR UPDATE")) {
                    const previousLock = this.claimLock;
                    this.claimLock = new Promise((resolve) => {
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
                    if (ownsLock)
                        releaseLock();
                    return { rows: [], rowCount: 0 };
                }
                return { rows: [], rowCount: 1 };
            },
            release: () => { },
        };
        return client;
    }
    async query(sql) {
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
    it("resolves exact, partial, and ambiguous character matches", () => {
        const matches = [
            { id: 1, name: "Satoru Gojo", series: "Jujutsu Kaisen", rarity: "rare", value: 95 },
            { id: 2, name: "Gojo Wakana", series: "My Dress-Up Darling", rarity: "common", value: 40 },
        ];
        const exact = resolveCharacterMatches(" satoru   gojo ", matches);
        assert.equal(exact.status, "resolved");
        if (exact.status === "resolved")
            assert.equal(exact.character.id, 1);
        assert.equal(resolveCharacterMatches("Wakana", [matches[1]]).status, "resolved");
        assert.equal(resolveCharacterMatches("Gojo", matches).status, "ambiguous");
        assert.equal(resolveCharacterMatches("Unknown", []).status, "not_found");
    });
});
describe("claim transaction foundation", () => {
    it("allows another user to claim a roll and records one ownership award", async () => {
        const pool = new FakePool();
        const database = new GameDatabase(pool);
        const result = await database.claimRoll("00000000-0000-0000-0000-000000000001", "claimer");
        assert.deepEqual(result, { status: "success", characterId: 1 });
        assert.deepEqual(pool.claims, ["claimer"]);
    });
    it("allows exactly one winner for concurrent claims", async () => {
        const pool = new FakePool();
        const database = new GameDatabase(pool);
        const results = await Promise.all([
            database.claimRoll("00000000-0000-0000-0000-000000000001", "user-a"),
            database.claimRoll("00000000-0000-0000-0000-000000000001", "user-b"),
        ]);
        assert.equal(results.filter((result) => typeof result === "object").length, 1);
        assert.equal(results.filter((result) => result === "claimed").length, 1);
        assert.equal(pool.claims.length, 1);
    });
    it("rejects a claim when the character is already owned globally", async () => {
        const pool = new FakePool();
        pool.existingOwnership = true;
        const database = new GameDatabase(pool);
        const result = await database.claimRoll("00000000-0000-0000-0000-000000000001", "claimer");
        assert.equal(result, "unavailable");
        assert.deepEqual(pool.claims, []);
    });
});
describe("developer authorization and mode", () => {
    it("recognizes authorized IDs and rejects unauthorized or missing configuration", () => {
        assert.equal(isAuthorizedDeveloper("dev-a", "dev-a, dev-b"), true);
        assert.equal(isAuthorizedDeveloper("dev-b", "dev-a, dev-b"), true);
        assert.equal(isAuthorizedDeveloper("user", "dev-a, dev-b"), false);
        assert.equal(isAuthorizedDeveloper("dev-a", undefined), false);
    });
    it("toggles mode per authorized developer without affecting another user", () => {
        resetDeveloperModes();
        assert.equal(toggleDeveloperMode("dev-a", "dev-a"), true);
        assert.equal(isDeveloperModeEnabled("dev-a"), true);
        assert.equal(isDeveloperModeEnabled("dev-b"), false);
        assert.equal(toggleDeveloperMode("dev-a", "dev-a"), false);
        assert.equal(isDeveloperModeEnabled("dev-a"), false);
        assert.equal(toggleDeveloperMode("user", "dev-a"), null);
        resetDeveloperModes();
    });
    it("starts disabled after reset, including after a simulated restart", () => {
        resetDeveloperModes();
        assert.equal(isDeveloperModeEnabled("dev-a"), false);
        assert.equal(toggleDeveloperMode("dev-a", "dev-a"), true);
        resetDeveloperModes();
        assert.equal(isDeveloperModeEnabled("dev-a"), false);
        assert.equal(isDeveloperModeEnabled("dev-b"), false);
    });
    it("bypasses normal roll availability only while enabled", async () => {
        let normalRestrictionChecks = 0;
        const restricted = () => canPerformRoll(false, async () => {
            normalRestrictionChecks += 1;
            return false;
        });
        assert.equal(await restricted(), false);
        assert.equal(normalRestrictionChecks, 1);
        assert.equal(await canPerformRoll(true, async () => {
            normalRestrictionChecks += 1;
            return false;
        }), true);
        assert.equal(normalRestrictionChecks, 1);
    });
    it("restores normal roll availability immediately after disabling mode", async () => {
        let available = false;
        const acquire = async () => available;
        resetDeveloperModes();
        assert.equal(await canPerformRoll(false, acquire), false);
        assert.equal(await canPerformRoll(true, acquire), true);
        assert.equal(toggleDeveloperMode("dev-a", "dev-a"), true);
        assert.equal(isDeveloperModeEnabled("dev-a"), true);
        assert.equal(await canPerformRoll(isDeveloperModeEnabled("dev-a"), acquire), true);
        assert.equal(toggleDeveloperMode("dev-a", "dev-a"), false);
        assert.equal(isDeveloperModeEnabled("dev-a"), false);
        assert.equal(await canPerformRoll(isDeveloperModeEnabled("dev-a"), acquire), false);
        available = true;
        resetDeveloperModes();
    });
});
