import { randomUUID } from "node:crypto";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { GameDatabase } from "./database";
import { characterCard, collectionPage } from "./presentation";

const commands = [
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
        .setName("query")
        .setDescription("Character or series name")
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("wishlist")
    .setDescription("Add or remove a character")
    .addIntegerOption((o) =>
      o
        .setName("character_id")
        .setDescription("Verified character ID")
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("favorite")
    .setDescription("Toggle a collection favorite")
    .addIntegerOption((o) =>
      o
        .setName("character_id")
        .setDescription("Canonical character ID")
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
      if (interaction.commandName === "roll") {
        const character = await database.getRandomVerified();
        if (!character)
          return interaction.reply(
            "The verified catalog is empty. Ask an administrator to add verified characters.",
          );
        const rollId = randomUUID();
        await database.createRoll(
          rollId,
          interaction.user.id,
          interaction.guildId,
          character.id,
        );
        const roll = await database.getRoll(rollId);
        if (!roll)
          return interaction.reply(
            "The roll could not be saved. Please try again.",
          );
        return interaction.reply(characterCard(roll));
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
            expired:
              "Your latest roll has expired and can no longer be claimed.",
            unverified:
              "This character is no longer verified and cannot be claimed.",
          }[result],
        );
      }
      if (interaction.commandName === "search") {
        const results = await database.search(
          interaction.options.getString("query", true),
        );
        return interaction.reply(
          results.length
            ? results
                .map(
                  (c) =>
                    `**#${c.id} ${c.name}** — ${c.series} · ${c.rarity} · ${c.value}`,
                )
                .join("\n")
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
          `**${interaction.user.displayName}**\nUnique Characters: ${profile?.unique_characters ?? 0}\nTotal Copies: ${profile?.total_copies ?? 0}\nFavorites: ${profile?.favorites ?? 0}\nWishlist: ${profile?.wishlist_count ?? 0}\nClaims: ${profile?.claims_count ?? 0}\nRolls: ${profile?.rolls_used ?? 0}\nCurrency: ${profile?.currency ?? 0}`,
        );
      }
      if (interaction.commandName === "wishlist") {
        const added = await database.toggleWishlist(
          interaction.user.id,
          interaction.options.getInteger("character_id", true),
        );
        return interaction.reply(
          added === null
            ? "That is not a verified character ID."
            : added
              ? "Added to your wishlist."
              : "Removed from your wishlist.",
        );
      }
      if (interaction.commandName === "favorite") {
        const favorite = await database.toggleFavorite(
          interaction.user.id,
          interaction.options.getInteger("character_id", true),
        );
        return interaction.reply(
          favorite === "invalid"
            ? "That is not a verified character ID."
            : favorite === "unowned"
              ? "That character is not in your collection."
            : favorite
              ? "Added to favorites."
              : "Removed from favorites.",
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
