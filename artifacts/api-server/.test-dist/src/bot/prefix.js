export function parsePrefixCommand(content, prefix = process.env.BOT_PREFIX ?? "$") {
    if (!prefix || !content.startsWith(prefix))
        return null;
    const body = content.slice(prefix.length).trim();
    if (!body)
        return null;
    const tokens = body.split(/\s+/);
    const command = tokens.shift()?.toLowerCase() ?? "";
    return command ? { command, args: tokens } : null;
}
export const prefixCommands = new Set([
    "roll",
    "m",
    "marry",
    "ha",
    "wa",
    "claim",
    "profile",
    "pr",
    "collection",
    "harem",
    "search",
    "favorite",
    "fav",
    "wishlist",
    "wish",
    "left",
    "top",
]);
export const prefixCommandAliases = {
    m: "roll",
    marry: "roll",
    pr: "profile",
    harem: "collection",
    fav: "favorite",
    wish: "wishlist",
};
export function canonicalPrefixCommand(command) {
    return prefixCommandAliases[command] ?? command;
}
