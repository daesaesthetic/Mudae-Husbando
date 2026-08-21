import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";

const rarityColors: Record<string, number> = { common: 0x94a3b8, uncommon: 0x38bdf8, rare: 0xa78bfa };

export type RollCardData = {
  id: string;
  characterId: number;
  name: string;
  series: string;
  rarity: string;
  value: number;
  description: string;
};

export function characterCard(roll: RollCardData) {
  const embed = new EmbedBuilder()
    .setColor(rarityColors[roll.rarity] ?? 0x64748b)
    .setTitle(`${roll.name} · #${roll.characterId}`)
    .setDescription(roll.description || "No description available.")
    .addFields(
      { name: "Series", value: roll.series || "Unknown", inline: true },
      { name: "Rarity", value: roll.rarity || "Common", inline: true },
      { name: "Value", value: `${roll.value}`, inline: true },
    )
    .setFooter({ text: "Verified catalog • Claim before this roll expires" });
  const button = new ButtonBuilder()
    .setCustomId(`claim:${roll.id}`)
    .setLabel("Claim Character")
    .setStyle(ButtonStyle.Primary);
  return {
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
  };
}

type CollectionPageData = {
  page: number;
  totalPages: number;
  totalItems: number;
  items: {
    name: string;
    series: string;
    quantity: number;
    favorite: boolean;
  }[];
};

export function collectionPage(
  displayName: string,
  collection: CollectionPageData,
  ownerId: string,
) {
  const description = collection.items
    .map(
      (character) =>
        `${character.favorite ? "★ " : ""}**${character.name}** — ${character.series} · ×${character.quantity}`,
    )
    .join("\n");
  const previous = new ButtonBuilder()
    .setCustomId(`collection:${ownerId}:${collection.page - 1}`)
    .setLabel("Previous")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(collection.page <= 1);
  const next = new ButtonBuilder()
    .setCustomId(`collection:${ownerId}:${collection.page + 1}`)
    .setLabel("Next")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(collection.page >= collection.totalPages);
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle(`Collection — ${displayName}`)
        .setDescription(description || "Your collection is empty. Use /roll to find a verified character.")
        .setFooter({
          text: `Page ${collection.page} / ${collection.totalPages} · ${collection.totalItems} unique character${collection.totalItems === 1 ? "" : "s"}`,
        }),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(previous, next),
    ],
  };
}

export function profileCard(displayName: string, profile: {
  unique_characters: number;
  total_copies: number;
  favorites: number;
  wishlist_count: number;
  claims_count: number;
  rolls_used: number;
  currency: number;
}) {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x38bdf8)
        .setTitle(`${displayName}'s Profile`)
        .addFields(
          { name: "Unique Characters", value: `${profile.unique_characters}`, inline: true },
          { name: "Total Copies", value: `${profile.total_copies}`, inline: true },
          { name: "Favorites", value: `${profile.favorites}`, inline: true },
          { name: "Wishlist", value: `${profile.wishlist_count}`, inline: true },
          { name: "Claims", value: `${profile.claims_count}`, inline: true },
          { name: "Rolls", value: `${profile.rolls_used}`, inline: true },
          { name: "Currency", value: `${profile.currency}`, inline: true },
        )
        .setFooter({ text: "Your verified character collection" }),
    ],
  };
}

export function searchResults(results: {
  name: string;
  series: string;
  rarity: string;
  value: number;
}[]) {
  const embed = new EmbedBuilder()
    .setColor(0xa78bfa)
    .setTitle("Verified Character Search")
    .setDescription(
      results
        .map(
          (character) =>
            `**${character.name}**\n${character.series} · ${character.rarity} · Value ${character.value}`,
        )
        .join("\n\n"),
    )
    .setFooter({ text: `${results.length} verified result${results.length === 1 ? "" : "s"}` });
  return { embeds: [embed] };
}

export function actionResult(
  title: string,
  description: string,
  color = 0x38bdf8,
) {
  return {
    embeds: [
      new EmbedBuilder().setColor(color).setTitle(title).setDescription(description),
    ],
  };
}

export function developerModeCard(enabled: boolean) {
  return actionResult(
    "Developer Mode",
    `Status: **${enabled ? "ON" : "OFF"}**\nRoll limit bypass: **${enabled ? "ENABLED" : "DISABLED"}**`,
    enabled ? 0xf59e0b : 0x64748b,
  );
}