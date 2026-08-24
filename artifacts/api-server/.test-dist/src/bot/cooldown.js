import { assertActionName, assertDiscordUserId, assertPositiveInteger } from "./validation.js";
function scopeKey(scope) {
    assertDiscordUserId(scope.userId);
    if (scope.guildId)
        assertDiscordUserId(scope.guildId);
    assertActionName(scope.action);
    return `${scope.userId}:${scope.guildId ?? "*"}:${scope.action}`;
}
export class CooldownService {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async check(scope) {
        const key = scopeKey(scope);
        const result = await this.pool.query("SELECT expires_at FROM mudae_cooldowns WHERE scope_key = $1", [key]);
        if (!result.rowCount)
            return { available: true, remainingMs: 0 };
        const remainingMs = Math.max(0, new Date(result.rows[0].expires_at).getTime() - Date.now());
        if (!remainingMs) {
            await this.clear(scope);
            return { available: true, remainingMs: 0 };
        }
        return { available: false, remainingMs };
    }
    async set(scope, durationMs) {
        assertPositiveInteger(durationMs, "Cooldown duration");
        const key = scopeKey(scope);
        await this.pool.query(`INSERT INTO mudae_cooldowns
       (scope_key, discord_id, guild_id, action, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + ($5 * INTERVAL '1 millisecond'))
       ON CONFLICT (scope_key) DO UPDATE SET expires_at = EXCLUDED.expires_at`, [key, scope.userId, scope.guildId ?? null, scope.action, durationMs]);
    }
    async tryAcquire(scope, durationMs) {
        assertPositiveInteger(durationMs, "Cooldown duration");
        const key = scopeKey(scope);
        const result = await this.pool.query(`INSERT INTO mudae_cooldowns
       (scope_key, discord_id, guild_id, action, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + ($5 * INTERVAL '1 millisecond'))
       ON CONFLICT (scope_key) DO UPDATE
       SET expires_at = EXCLUDED.expires_at
       WHERE mudae_cooldowns.expires_at <= NOW()
       RETURNING scope_key`, [key, scope.userId, scope.guildId ?? null, scope.action, durationMs]);
        return Boolean(result.rowCount);
    }
    async clear(scope) {
        const key = scopeKey(scope);
        await this.pool.query("DELETE FROM mudae_cooldowns WHERE scope_key = $1", [key]);
    }
}
