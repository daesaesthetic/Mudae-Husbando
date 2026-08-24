export type ParsedPrefixCommand = {
  command: string;
  args: string[];
};

export function parsePrefixCommand(
  content: string,
  prefix = process.env.BOT_PREFIX ?? "$",
): ParsedPrefixCommand | null {
  if (!prefix || !content.startsWith(prefix)) return null;
  const body = content.slice(prefix.length).trim();
  if (!body) return null;
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

export const prefixCommandAliases: Record<string, string> = {
  m: "roll",
  marry: "roll",
  pr: "profile",
  harem: "collection",
  fav: "favorite",
  wish: "wishlist",
};

export function canonicalPrefixCommand(command: string) {
  return prefixCommandAliases[command] ?? command;
}