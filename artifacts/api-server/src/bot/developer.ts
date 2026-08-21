const enabledDevelopers = new Set<string>();

function configuredDeveloperIds(rawValue = process.env.DEVELOPER_USER_IDS) {
  return new Set(
    (rawValue ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export function isAuthorizedDeveloper(
  discordUserId: string,
  rawValue = process.env.DEVELOPER_USER_IDS,
) {
  return configuredDeveloperIds(rawValue).has(discordUserId);
}

export function isDeveloperModeEnabled(discordUserId: string) {
  return enabledDevelopers.has(discordUserId);
}

export function toggleDeveloperMode(
  discordUserId: string,
  rawValue = process.env.DEVELOPER_USER_IDS,
) {
  if (!isAuthorizedDeveloper(discordUserId, rawValue)) return null;
  if (enabledDevelopers.has(discordUserId)) {
    enabledDevelopers.delete(discordUserId);
    return false;
  }
  enabledDevelopers.add(discordUserId);
  return true;
}

export function resetDeveloperModes() {
  enabledDevelopers.clear();
}