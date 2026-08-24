import { randomUUID } from "node:crypto";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Message,
} from "discord.js";
import { GameDatabase } from "./database.js";
import { isDeveloperModeEnabled, toggleDeveloperMode } from "./developer.js";
import {
  actionResult,
  characterCard,
  claimedCharacterCard,
  collectionPage,
  developerModeCard,
  leaderboardCard,
  profileCard,
  remainingCharactersCard,
  searchResults,
} from "./presentation.js";
import {
  canonicalPrefixCommand,
  parsePrefixCommand,
  prefixCommands,
} from "./prefix.js";

const commands = [
  new SlashCommandBuilder().setName("developer").setDescription("Toggle authorized developer testing tools"),
  new SlashCommandBuilder().setName("roll").setDescription("Roll a verified character"),
  new SlashCommandBuilder().setName("ha").setDescription("Roll a verified husbando"),
  new SlashCommandBuilder().setName("wa").setDescription("Roll a verified waifu"),
  new SlashCommandBuilder().setName("claim").setDescription("Claim your latest roll"),
  new SlashCommandBuilder().setName("collection").setDescription("View your collection"),
  new SlashCommandBuilder().setName("profile").setDescription("View your player profile"),
  new SlashCommandBuilder().setName("search").setDescription("Search the verified catalog").addStringOption((o) =>
    o.setName("character").setDescription("Character or series name").setRequired(true),
  ),
  new SlashCommandBuilder().setName("wishlist").setDescription("Add or remove a character").addStringOption((o) =>
    o.setName("character").setDescription("Character name or alias").setRequired(true),
  ),
  new SlashCommandBuilder().setName("favorite").setDescription("Toggle a collection favorite").addStringOption((o) =>
    o.setName("character").setDescription("Character name or alias").setRequired(true),
  ),
].map((command) => command.toJSON());

type CommandContext = {
  userId: string;
  displayName: string;
  guildId: string | null;
  command: string;
  args: string[];
};

type CommandResponse = string | ReturnType<typeof characterCard> | ReturnType<typeof profileCard> |
  ReturnType<typeof collectionPage> | ReturnType<typeof searchResults> | ReturnType<typeof actionResult> |
  ReturnType<typeof claimedCharacterCard>;

async function executeCommand(database: GameDatabase, context: CommandContext): Promise<CommandResponse | null> {
  const { command, args, userId, displayName, guildId } = context;
  if (command === "roll" || command === "ha" || command === "wa") {
    const result = await database.roll(
      randomUUID(),
      userId,
      guildId,
      isDeveloperModeEnabled(userId),
      command === "ha" ? "male" : command === "wa" ? "female" : undefined,
    );
    if (result.status === "exhausted") {
      const minutes = result.replenishmentAt
        ? Math.ceil(Math.max(0, result.replenishmentAt.getTime() - Date.now()) / 60_000)
        : 0;
      return `Your roll pool is exhausted. It replenishes in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
    }
    if (result.status === "empty_catalog")
      return command === "ha"
        ? "No verified husbando characters are currently available."
        : command === "wa"
          ? "No verified waifu characters are currently available."
          : "The verified catalog is empty. Ask an administrator to add verified characters.";
    if (result.status !== "success")
      return "Your player profile could not be loaded. Please try again.";
    return characterCard({ ...result.roll, rollerName: displayName });
  }

  if (command === "claim") {
    const result = await database.claimRoll("", userId);
    if (typeof result === "object") {
      if (result.status === "success") {
        const character = await database.getCharacter(result.characterId);
        return character
          ? claimedCharacterCard({ ...character, claimant: displayName })
          : "Character claimed and saved to your collection.";
      }
      const minutes = result.replenishmentAt
        ? Math.ceil(Math.max(0, result.replenishmentAt.getTime() - Date.now()) / 60_000)
        : 0;
      return `Your claim is unavailable. It replenishes in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
    }
    return {
      invalid: "You have no roll to claim.",
      claimed: "Your latest roll has already been claimed.",
      unavailable: "That character has already been claimed by another player.",
      expired: "Your latest roll has expired and can no longer be claimed.",
      unverified: "This character is no longer verified and cannot be claimed.",
    }[result];
  }

  if (command === "search") {
    const results = await database.search(args.join(" "));
    return results.length ? searchResults(results) : "No verified characters matched that search.";
  }
  if (command === "left") {
    return remainingCharactersCard(await database.remainingCharacters());
  }
  if (command === "top") {
    return leaderboardCard(await database.leaderboard());
  }
  if (command === "collection") {
    const collection = await database.collection(userId);
    return collection.totalItems
      ? collectionPage(displayName, collection, userId)
      : "Your collection is empty. Use /roll to find a verified character.";
  }
  if (command === "profile") {
    const profile = await database.profile(userId);
    return profileCard(displayName, profile ?? {
      unique_characters: 0, total_copies: 0, favorites: 0, wishlist_count: 0,
      claims_count: 0, rolls_used: 0, available_rolls: Number(process.env.ROLL_POOL_SIZE ?? 10),
      roll_replenishment_at: null, available_claims: Number(process.env.CLAIM_POOL_SIZE ?? 1),
      claim_replenishment_at: null, currency: 0, total_kakera: 0, best_rank: null,
    });
  }
  if (command === "wishlist" || command === "favorite") {
    const resolution = await database.resolveCharacter(args.join(" "));
    if (resolution.status === "not_found") return "No verified character matched that name.";
    if (resolution.status === "ambiguous") {
      return actionResult(
        "Choose a More Specific Character",
        resolution.matches.map((character) => `**${character.name}** — ${character.series}`).join("\n"),
        0xf59e0b,
      );
    }
    if (command === "wishlist") {
      const added = await database.toggleWishlist(userId, resolution.character.id);
      return actionResult(
        added ? "Added to Wishlist" : "Removed from Wishlist",
        `${added ? "♡ Added" : "♡ Removed"} **${resolution.character.name}** ${added ? "to your wishlist." : "from your wishlist."}`,
      );
    }
    const favorite = await database.toggleFavorite(userId, resolution.character.id);
    return favorite === "unowned"
      ? actionResult("Favorite Not Updated", `You do not own **${resolution.character.name}**.`, 0xf59e0b)
      : actionResult(
          favorite ? "Added to Favorites" : "Removed from Favorites",
          `${favorite ? "★ Added" : "☆ Removed"} **${resolution.character.name}** ${favorite ? "to your favorites." : "from your favorites."}`,
        );
  }
  return null;
}

async function handleCommand(
  database: GameDatabase,
  context: CommandContext,
  reply: (response: CommandResponse) => Promise<unknown>,
) {
  const response = await executeCommand(database, context);
  if (response) await reply(response);
}

export async function startDiscordBot() {
  if (!process.env.DISCORD_TOKEN) throw new Error("DISCORD_TOKEN is required to start the Discord bot.");
  const database = new GameDatabase();
  await database.initialize();
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  });
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationCommands(
      process.env.DISCORD_CLIENT_ID ?? ((await rest.get(Routes.oauth2CurrentApplication())) as { id: string }).id,
    ),
    { body: commands },
  );

  client.once("clientReady", (ready) => console.info(`Discord bot connected as ${ready.user.tag}`));
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand() && !interaction.isButton()) return;
    try {
      await database.ensureUser(interaction.user.id, interaction.user.displayName);
      if (interaction.isButton()) {
        if (interaction.customId.startsWith("collection:")) {
          const match = /^collection:([0-9]+):([0-9]+)$/.exec(interaction.customId);
          if (!match || match[1] !== interaction.user.id)
            return interaction.reply({ content: "That collection page is invalid.", ephemeral: true });
          await interaction.deferUpdate();
          const collection = await database.collection(interaction.user.id, Number(match[2]));
          return interaction.editReply(collectionPage(interaction.user.displayName, collection, interaction.user.id));
        }
        if (!interaction.customId.startsWith("claim:")) return;
        const rollId = interaction.customId.slice("claim:".length);
        if (!/^[0-9a-f-]{36}$/i.test(rollId))
          return interaction.reply({ content: "That claim button is invalid.", ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const result = await database.claimRoll(rollId, interaction.user.id);
        if (typeof result === "object" && result.status === "success") {
          const character = await database.getCharacter(result.characterId);
          return interaction.editReply(
            character
              ? claimedCharacterCard({ ...character, claimant: interaction.user.displayName })
              : "Character claimed and saved to your collection.",
          );
        }
        if (typeof result === "object" && result.status === "claim_unavailable")
          return interaction.editReply("Your claim is unavailable right now. Another claim becomes available after the replenishment period.");
        return interaction.editReply({
          claimed: "That roll has already been claimed.",
          unavailable: "That character has already been claimed by another player.",
          expired: "That roll has expired and can no longer be claimed.",
          unverified: "This character is no longer verified and cannot be claimed.",
          invalid: "That roll could not be found.",
        }[result as Exclude<typeof result, { status: "success" | "claim_unavailable" }>]);
      }
      if (interaction.commandName === "developer") {
        const enabled = toggleDeveloperMode(interaction.user.id);
        return enabled === null
          ? interaction.reply({ content: "You do not have permission to use developer tools.", ephemeral: true })
          : interaction.reply({ ...developerModeCard(enabled), ephemeral: true });
      }
      const args = interaction.commandName === "search" || interaction.commandName === "favorite" || interaction.commandName === "wishlist"
        ? [interaction.options.getString("character", true)]
        : [];
      await handleCommand(
        database,
        { userId: interaction.user.id, displayName: interaction.user.displayName, guildId: interaction.guildId, command: interaction.commandName, args },
        (response) => interaction.reply(response),
      );
      return;
    } catch (error) {
      console.error("Discord interaction failed", error);
      if (interaction.replied || interaction.deferred)
        return interaction.followUp("Something went wrong while processing that command.");
      return interaction.reply("Something went wrong while processing that command.");
    }
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    const parsed = parsePrefixCommand(message.content);
    if (!parsed || !prefixCommands.has(parsed.command)) return;
    try {
      await database.ensureUser(message.author.id, message.member?.displayName ?? message.author.displayName);
      await handleCommand(
        database,
        { userId: message.author.id, displayName: message.member?.displayName ?? message.author.displayName, guildId: message.guildId, command: canonicalPrefixCommand(parsed.command), args: parsed.args },
        (response) => message.reply(response),
      );
    } catch (error) {
      console.error("Discord prefix command failed", error);
      await message.reply("Something went wrong while processing that command.");
    }
  });
  await client.login(process.env.DISCORD_TOKEN);
}