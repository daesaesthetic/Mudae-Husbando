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
  "ha",
  "wa",
  "claim",
  "profile",
  "collection",
  "search",
  "favorite",
  "wishlist",
]);