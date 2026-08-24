import { randomUUID } from "node:crypto";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { GameDatabase } from "./database";
import {
  isDeveloperModeEnabled,
  toggleDeveloperMode,
} from "./developer.js";
import {
  actionResult,
  characterCard,
  collectionPage,
  developerModeCard,
  profileCard,
  searchResults,
} from "./presentation";

const commands = [
  new SlashCommandBuilder()
    .setName("developer")
    .setDescription("Toggle authorized developer testing tools"),
  new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Roll a verified character"),
  new SlashCommandBuilder()
    .setName("claim")
    .setDescription("Claim your latest roll"),
  new SlashCommandBuilder()
    .setName("collection")
    .setDescription("View your collection"),
  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your player profile"),
  new SlashCommandBuilder()
    .setName("search")
    .setDescription("Search the verified catalog")
    .addStringOption((o) =>
      o
        .setName("character")
        .setDescription("Character or series name")
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("wishlist")
    .setDescription("Add or remove a character")
    .addStringOption((o) =>
      o
        .setName("character")
        .setDescription("Character name or alias")
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("favorite")
    .setDescription("Toggle a collection favorite")
    .addStringOption((o) =>
      o
        .setName("character")
        .setDescription("Character name or alias")
        .setRequired(true),
    ),
].map((command) => command.toJSON());

export async function startDiscordBot() {
  if (!process.env.DISCORD_TOKEN)
    throw new Error("DISCORD_TOKEN is required to start the Discord bot.");
  const database = new GameDatabase();
  await database.initialize();
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationCommands(
      process.env.DISCORD_CLIENT_ID ??
        ((await rest.get(Routes.oauth2CurrentApplication())) as { id: string })
          .id,
    ),
    { body: commands },
  );

  client.once("clientReady", (ready) => {
    console.info(`Discord bot connected as ${ready.user.tag}`);
  });
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand() && !interaction.isButton()) return;
    try {
      await database.ensureUser(
        interaction.user.id,
        interaction.user.displayName,
      );
      if (interaction.isButton()) {
        if (interaction.customId.startsWith("collection:")) {
          const match = /^collection:([0-9]+):([0-9]+)$/.exec(interaction.customId);
          if (!match || match[1] !== interaction.user.id)
            return interaction.reply({ content: "That collection page is invalid.", ephemeral: true });
          await interaction.deferUpdate();
          const collection = await database.collection(
            interaction.user.id,
            Number(match[2]),
          );
          await interaction.editReply(
            collectionPage(interaction.user.displayName, collection, interaction.user.id),
          );
          return;
        }
        if (!interaction.customId.startsWith("claim:")) return;
        const rollId = interaction.customId.slice("claim:".length);
        if (!/^[0-9a-f-]{36}$/i.test(rollId))
          return interaction.reply({
            content: "That claim button is invalid.",
            ephemeral: true,
          });
        await interaction.deferReply({ ephemeral: true });
        const result = await database.claimRoll(rollId, interaction.user.id);
        const messages = {
          success: "Character claimed and saved to your collection.",
          claimed: "That roll has already been claimed.",
          unavailable: "That character has already been claimed by another player.",
          expired: "That roll has expired and can no longer be claimed.",
          unverified:
            "This character is no longer verified and cannot be claimed.",
          invalid: "That roll could not be found.",
        } as const;
        await interaction.editReply(
          messages[typeof result === "object" ? result.status : result],
        );
        return;
      }
      if (interaction.commandName === "developer") {
        const enabled = toggleDeveloperMode(interaction.user.id);
        if (enabled === null)
          return interaction.reply({
            content: "You do not have permission to use developer tools.",
            ephemeral: true,
          });
        return interaction.reply({
          ...developerModeCard(enabled),
          ephemeral: true,
        });
      }
      if (interaction.commandName === "roll") {
        const developerMode = isDeveloperModeEnabled(interaction.user.id);
        const rollId = randomUUID();
        const result = await database.roll(
          rollId,
          interaction.user.id,
          interaction.guildId,
          developerMode,
        );
        if (result.status === "exhausted") {
          const remainingMs = result.replenishmentAt
            ? Math.max(0, result.replenishmentAt.getTime() - Date.now())
            : 0;
          const minutes = Math.ceil(remainingMs / 60_000);
          return interaction.reply(
            `Your roll pool is exhausted. It replenishes in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
          );
        }
        if (result.status === "empty_catalog")
          return interaction.reply(
            "The verified catalog is empty. Ask an administrator to add verified characters.",
          );
        if (result.status !== "success")
          return interaction.reply("Your player profile could not be loaded. Please try again.");
        return interaction.reply(characterCard(result.roll));
      }
      if (interaction.commandName === "claim") {
        const result = await database.claimRoll("", interaction.user.id);
        if (typeof result === "object")
          return interaction.reply(
            "Character claimed and saved to your collection.",
          );
        return interaction.reply(
          {
            invalid: "You have no roll to claim.",
            claimed: "Your latest roll has already been claimed.",
            unavailable: "That character has already been claimed by another player.",
            expired:
              "Your latest roll has expired and can no longer be claimed.",
            unverified:
              "This character is no longer verified and cannot be claimed.",
          }[result],
        );
      }
      if (interaction.commandName === "search") {
        const results = await database.search(
          interaction.options.getString("character", true),
        );
        return interaction.reply(
          results.length
            ? searchResults(results)
            : "No verified characters matched that search.",
        );
      }
      if (interaction.commandName === "collection") {
        const collection = await database.collection(interaction.user.id);
        if (!collection.totalItems)
          return interaction.reply("Your collection is empty. Use /roll to find a verified character.");
        return interaction.reply(
          collectionPage(interaction.user.displayName, collection, interaction.user.id),
        );
      }
      if (interaction.commandName === "profile") {
        const profile = await database.profile(interaction.user.id);
        return interaction.reply(
          profileCard(interaction.user.displayName, profile ?? {
            unique_characters: 0,
            total_copies: 0,
            favorites: 0,
            wishlist_count: 0,
            claims_count: 0,
            rolls_used: 0,
            available_rolls: Number(process.env.ROLL_POOL_SIZE ?? 5),
            roll_replenishment_at: null,
            currency: 0,
          }),
        );
      }
      if (interaction.commandName === "wishlist") {
        const resolution = await database.resolveCharacter(
          interaction.options.getString("character", true),
        );
        if (resolution.status === "not_found")
          return interaction.reply("No verified character matched that name.");
        if (resolution.status === "ambiguous")
          return interaction.reply({
            ...actionResult(
              "Choose a More Specific Character",
              resolution.matches
                .map((character) => `**${character.name}** — ${character.series}`)
                .join("\n"),
              0xf59e0b,
            ),
            ephemeral: true,
          });
        const added = await database.toggleWishlist(interaction.user.id, resolution.character.id);
        return interaction.reply(
          actionResult(
            added ? "Added to Wishlist" : "Removed from Wishlist",
            `${added ? "♡ Added" : "♡ Removed"} **${resolution.character.name}** ${added ? "to your wishlist." : "from your wishlist."}`,
          ),
        );
      }
      if (interaction.commandName === "favorite") {
        const resolution = await database.resolveCharacter(
          interaction.options.getString("character", true),
        );
        if (resolution.status === "not_found")
          return interaction.reply("No verified character matched that name.");
        if (resolution.status === "ambiguous")
          return interaction.reply({
            ...actionResult(
              "Choose a More Specific Character",
              resolution.matches
                .map((character) => `**${character.name}** — ${character.series}`)
                .join("\n"),
              0xf59e0b,
            ),
            ephemeral: true,
          });
        const favorite = await database.toggleFavorite(
          interaction.user.id,
          resolution.character.id,
        );
        return interaction.reply(
          favorite === "unowned"
            ? actionResult("Favorite Not Updated", `You do not own **${resolution.character.name}**.`, 0xf59e0b)
            : actionResult(
                favorite ? "Added to Favorites" : "Removed from Favorites",
                `${favorite ? "★ Added" : "☆ Removed"} **${resolution.character.name}** ${favorite ? "to your favorites." : "from your favorites."}`,
              ),
        );
      }
      return;
    } catch (error) {
      console.error("Discord interaction failed", error);
      if (interaction.replied || interaction.deferred)
        await interaction.followUp(
          "Something went wrong while processing that command.",
        );
      else
        await interaction.reply(
          "Something went wrong while processing that command.",
        );
      return;
    }
  });
  await client.login(process.env.DISCORD_TOKEN);
}
