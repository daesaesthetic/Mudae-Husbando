import { randomUUID } from "node:crypto";
import { Client, EmbedBuilder, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import { GameDatabase } from "./database";

const rarityColors: Record<string, number> = { common: 0x94a3b8, uncommon: 0x38bdf8, rare: 0xa78bfa };

const commands = [
  new SlashCommandBuilder().setName("roll").setDescription("Roll a verified character"),
  new SlashCommandBuilder().setName("claim").setDescription("Claim your latest roll"),
  new SlashCommandBuilder().setName("collection").setDescription("View your collection"),
  new SlashCommandBuilder().setName("profile").setDescription("View your player profile"),
  new SlashCommandBuilder().setName("search").setDescription("Search the verified catalog").addStringOption(o => o.setName("query").setDescription("Character or series name").setRequired(true)),
  new SlashCommandBuilder().setName("wishlist").setDescription("Add or remove a character").addIntegerOption(o => o.setName("character_id").setDescription("Verified character ID").setRequired(true)),
  new SlashCommandBuilder().setName("favorite").setDescription("Toggle a collection favorite").addStringOption(o => o.setName("character").setDescription("Exact character name").setRequired(true)),
].map(command => command.toJSON());

export async function startDiscordBot() {
  if (!process.env.DISCORD_TOKEN) throw new Error("DISCORD_TOKEN is required to start the Discord bot.");
  const database = new GameDatabase();
  await database.initialize();
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID ?? (await rest.get(Routes.oauth2CurrentApplication()) as { id: string }).id), { body: commands });

  client.once("clientReady", ready => {
    console.info(`Discord bot connected as ${ready.user.tag}`);
  });
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    try {
      await database.ensureUser(interaction.user.id, interaction.user.displayName);
      if (interaction.commandName === "roll") {
        const character = await database.getRandomVerified();
        if (!character) return interaction.reply("The verified catalog is empty. Ask an administrator to add verified characters.");
        const rollId = randomUUID();
        await database.createRoll(rollId, interaction.user.id, character.id);
        const embed = new EmbedBuilder().setColor(rarityColors[character.rarity] ?? 0x64748b)
          .setTitle(`${character.name} · #${character.id}`).setDescription(character.description)
          .addFields({ name: "Series", value: character.series, inline: true }, { name: "Rarity", value: character.rarity, inline: true }, { name: "Value", value: `${character.value}`, inline: true })
          .setFooter({ text: "Verified catalog • Claim with /claim" });
        return interaction.reply({ embeds: [embed] });
      }
      if (interaction.commandName === "claim") {
        const result = await database.claimRoll("", interaction.user.id);
        return interaction.reply(result ? "Character claimed and saved to your collection." : "You have no unclaimed roll available.");
      }
      if (interaction.commandName === "search") {
        const results = await database.search(interaction.options.getString("query", true));
        return interaction.reply(results.length ? results.map(c => `**#${c.id} ${c.name}** — ${c.series} · ${c.rarity} · ${c.value}`).join("\n") : "No verified characters matched that search.");
      }
      if (interaction.commandName === "collection") {
        const collection = await database.collection(interaction.user.id);
        return interaction.reply(collection.length ? collection.map(c => `${c.favorite ? "★ " : ""}**${c.name}** — ${c.series} · ×${c.quantity}`).join("\n") : "Your collection is empty. Use /roll to find a verified character.");
      }
      if (interaction.commandName === "profile") {
        const profile = await database.profile(interaction.user.id);
        return interaction.reply(`**${interaction.user.displayName}**\nCollection: ${profile?.collection_size ?? 0}\nClaims: ${profile?.claims_count ?? 0}\nRolls: ${profile?.rolls_used ?? 0}\nCurrency: ${profile?.currency ?? 0}`);
      }
      if (interaction.commandName === "wishlist") {
        const added = await database.toggleWishlist(interaction.user.id, interaction.options.getInteger("character_id", true));
        return interaction.reply(added === null ? "That is not a verified character ID." : added ? "Added to your wishlist." : "Removed from your wishlist.");
      }
      if (interaction.commandName === "favorite") {
        const favorite = await database.toggleFavorite(interaction.user.id, interaction.options.getString("character", true));
        return interaction.reply(favorite === undefined ? "That character is not in your collection." : favorite ? "Added to favorites." : "Removed from favorites.");
      }
      return;
    } catch (error) {
      console.error("Discord interaction failed", error);
      if (interaction.replied || interaction.deferred) await interaction.followUp("Something went wrong while processing that command.");
      else await interaction.reply("Something went wrong while processing that command.");
      return;
    }
  });
  await client.login(process.env.DISCORD_TOKEN);
}