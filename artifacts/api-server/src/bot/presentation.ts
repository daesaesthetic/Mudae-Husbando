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