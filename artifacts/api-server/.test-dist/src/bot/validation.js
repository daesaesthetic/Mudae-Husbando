export function assertDiscordUserId(discordId) {
    if (!/^\d{16,22}$/.test(discordId)) {
        throw new Error("Invalid Discord user ID.");
    }
}
export function assertOptionalDiscordId(discordId) {
    if (discordId != null)
        assertDiscordUserId(discordId);
}
export function assertPositiveInteger(value, fieldName) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${fieldName} must be a positive safe integer.`);
    }
}
export function assertNonNegativeInteger(value, fieldName) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${fieldName} must be a non-negative safe integer.`);
    }
}
export function assertActionName(action) {
    if (!/^[a-z][a-z0-9:_-]{0,63}$/.test(action)) {
        throw new Error("Action must contain only lowercase letters, numbers, :, _, or -.");
    }
}
