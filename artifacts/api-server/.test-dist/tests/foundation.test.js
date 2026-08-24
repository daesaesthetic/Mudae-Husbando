import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CooldownService } from "../src/bot/cooldown.js";
import { EconomyService } from "../src/bot/economy.js";
import { assertActionName, assertDiscordUserId, assertPositiveInteger, } from "../src/bot/validation.js";
import { migrations, pendingMigrations } from "../src/bot/migrations.js";
import { randomInt, weightedChoice } from "../src/bot/rng.js";
class EconomyPool {
    users = new Map([
        ["100000000000000001", 100],
        ["100000000000000002", 10],
    ]);
    transactions = [];
    async query(sql, params = []) {
        if (sql.startsWith("SELECT currency")) {
            const balance = this.users.get(String(params[0]));
            return balance === undefined
                ? { rows: [], rowCount: 0 }
                : { rows: [{ currency: balance }], rowCount: 1 };
        }
        if (sql.startsWith("SELECT 1 FROM mudae_users")) {
            return this.users.has(String(params[0]))
                ? { rows: [{}], rowCount: 1 }
                : { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
    }
    async connect() {
        return {
            query: async (sql, params = []) => {
                if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
                    return { rows: [], rowCount: 0 };
                }
                if (sql.startsWith("UPDATE mudae_users")) {
                    const userId = String(params[1]);
                    const current = this.users.get(userId);
                    if (current === undefined ||
                        (sql.includes("currency -") && current < Number(params[0]))) {
                        return { rows: [], rowCount: 0 };
                    }
                    const next = sql.includes("currency -")
                        ? current - Number(params[0])
                        : current + Number(params[0]);
                    this.users.set(userId, next);
                    return { rows: [{ currency: next }], rowCount: 1 };
                }
                if (sql.startsWith("INSERT INTO mudae_currency_transactions")) {
                    this.transactions.push({ id: params[0], userId: params[1], amount: params[3] });
                    return { rows: [], rowCount: 1 };
                }
                return { rows: [], rowCount: 0 };
            },
            release() { },
        };
    }
}
class CooldownPool {
    rows = new Map();
    async query(sql, params = []) {
        const key = String(params[0]);
        if (sql.startsWith("SELECT expires_at")) {
            const row = this.rows.get(key);
            return row ? { rows: [row], rowCount: 1 } : { rows: [], rowCount: 0 };
        }
        if (sql.startsWith("DELETE FROM mudae_cooldowns")) {
            this.rows.delete(key);
            return { rows: [], rowCount: 1 };
        }
        if (sql.startsWith("INSERT INTO mudae_cooldowns")) {
            const existing = this.rows.get(key);
            const duration = Number(params[4]);
            if (sql.includes("WHERE mudae_cooldowns.expires_at <= NOW()") && existing && existing.expires_at.getTime() > Date.now()) {
                return { rows: [], rowCount: 0 };
            }
            const row = { expires_at: new Date(Date.now() + duration) };
            this.rows.set(key, row);
            return sql.includes("RETURNING") ? { rows: [{ scope_key: key }], rowCount: 1 } : { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
    }
}
describe("foundation validation", () => {
    it("accepts Discord snowflake IDs and rejects arbitrary input", () => {
        assert.doesNotThrow(() => assertDiscordUserId("123456789012345678"));
        assert.throws(() => assertDiscordUserId("user-a"));
    });
    it("accepts only safe positive amounts and safe action names", () => {
        assert.doesNotThrow(() => assertPositiveInteger(10, "Amount"));
        assert.throws(() => assertPositiveInteger(0, "Amount"));
        assert.throws(() => assertPositiveInteger(Number.POSITIVE_INFINITY, "Amount"));
        assert.doesNotThrow(() => assertActionName("daily:reward"));
        assert.throws(() => assertActionName("Daily Reward"));
    });
});
describe("migration planning", () => {
    it("keeps migrations ordered and excludes already-applied IDs", () => {
        assert.deepEqual(migrations.map((migration) => migration.id), ["001", "002", "003", "004"]);
        assert.deepEqual(pendingMigrations(new Set(["001"])).map((migration) => migration.id), ["002", "003", "004"]);
        assert.deepEqual(pendingMigrations(new Set(migrations.map((migration) => migration.id))), []);
    });
});
describe("randomness foundation", () => {
    it("returns an inclusive integer in the requested range", () => {
        assert.equal(randomInt(3, 7, () => 0), 3);
        assert.equal(randomInt(3, 7, () => 0.999999), 7);
        assert.throws(() => randomInt(8, 7, () => 0.5));
    });
    it("selects weighted outcomes with an injectable deterministic source", () => {
        const outcomes = [
            { item: "common", weight: 8 },
            { item: "rare", weight: 2 },
        ];
        assert.equal(weightedChoice(outcomes, () => 0.1), "common");
        assert.equal(weightedChoice(outcomes, () => 0.9), "rare");
        assert.throws(() => weightedChoice([], () => 0.5));
    });
});
describe("economy service", () => {
    it("adds and removes currency atomically while recording transactions", async () => {
        const pool = new EconomyPool();
        const economy = new EconomyService(pool);
        assert.deepEqual(await economy.addCurrency("100000000000000001", 25, { type: "reward" }), { ok: true, value: 125 });
        assert.deepEqual(await economy.removeCurrency("100000000000000001", 40, { type: "purchase" }), { ok: true, value: 85 });
        assert.equal(pool.transactions.length, 2);
    });
    it("rejects invalid amounts and insufficient balances", async () => {
        const pool = new EconomyPool();
        const economy = new EconomyService(pool);
        assert.deepEqual(await economy.addCurrency("100000000000000001", 0, { type: "reward" }), { ok: false, error: "invalid_amount" });
        assert.deepEqual(await economy.removeCurrency("100000000000000002", 11, { type: "purchase" }), { ok: false, error: "insufficient_balance" });
        assert.equal(pool.users.get("100000000000000002"), 10);
    });
    it("transfers funds without allowing a negative sender balance", async () => {
        const pool = new EconomyPool();
        const economy = new EconomyService(pool);
        const result = await economy.transferCurrency("100000000000000001", "100000000000000002", 30, { type: "gift" });
        assert.deepEqual(result, {
            ok: true,
            value: { fromBalance: 70, toBalance: 40 },
        });
        assert.deepEqual(await economy.transferCurrency("100000000000000002", "100000000000000001", 41, { type: "gift" }), { ok: false, error: "insufficient_balance" });
    });
});
describe("cooldown service", () => {
    it("persists cooldown state and reports remaining time until expiration", async () => {
        const pool = new CooldownPool();
        const scope = {
            userId: "100000000000000001",
            action: "daily:reward",
        };
        const first = new CooldownService(pool);
        await first.set(scope, 60_000);
        const second = new CooldownService(pool);
        const state = await second.check(scope);
        assert.equal(state.available, false);
        assert.ok(state.remainingMs > 0 && state.remainingMs <= 60_000);
        await second.clear(scope);
        assert.deepEqual(await first.check(scope), { available: true, remainingMs: 0 });
    });
    it("atomically allows only one concurrent acquisition", async () => {
        const pool = new CooldownPool();
        const service = new CooldownService(pool);
        const scope = { userId: "100000000000000001", action: "work" };
        const results = await Promise.all([
            service.tryAcquire(scope, 60_000),
            service.tryAcquire(scope, 60_000),
        ]);
        assert.deepEqual(results.sort(), [false, true]);
    });
});
