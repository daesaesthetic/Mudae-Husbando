import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
const palette = {
    midnight: 0x111936,
    electricBlue: 0x28b8ff,
    lavender: 0xb7a5ff,
    pink: 0xf28bb5,
    gold: 0xf4c95d,
    muted: 0x65709a,
};
const rarityColors = {
    common: palette.muted,
    uncommon: palette.electricBlue,
    rare: palette.lavender,
};
function characterCategory(gender) {
    if (gender === "male")
        return "Husbando";
    if (gender === "female")
        return "Waifu";
    return "Character";
}
export function characterCard(roll) {
    const embed = new EmbedBuilder()
        .setColor(rarityColors[roll.rarity] ?? palette.midnight)
        .setTitle(`${roll.name} · #${roll.characterId}`)
        .setDescription(roll.description || "No description available.")
        .addFields({ name: "Series", value: roll.series || "Unknown", inline: true }, { name: "Category", value: characterCategory(roll.gender), inline: true }, { name: "Rarity", value: roll.rarity || "Common", inline: true }, { name: "Kakera Value", value: `${roll.value}`, inline: true }, ...(roll.popularityRank
        ? [{ name: "Popularity Rank", value: `#${roll.popularityRank}`, inline: true }]
        : []), ...(roll.rollWeight
        ? [{ name: "Roll Weight", value: `${roll.rollWeight}×`, inline: true }]
        : []), ...(roll.rollerName
        ? [{ name: "Rolled By", value: roll.rollerName, inline: true }]
        : []), ...(roll.expiresAt
        ? [{
                name: "Claim Expires",
                value: `<t:${Math.floor(new Date(roll.expiresAt).getTime() / 1000)}:R>`,
                inline: true,
            }]
        : []))
        .setFooter({ text: "✦ Verified catalog • Claim before this roll expires" });
    if (roll.imageUrl)
        embed.setImage(roll.imageUrl);
    else
        embed.addFields({ name: "Artwork", value: "Artwork coming soon", inline: true });
    const button = new ButtonBuilder()
        .setCustomId(`claim:${roll.id}`)
        .setLabel("Claim Character")
        .setStyle(ButtonStyle.Primary);
    return {
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(button)],
    };
}
export function claimedCharacterCard(character) {
    const embed = new EmbedBuilder()
        .setColor(rarityColors[character.rarity] ?? palette.midnight)
        .setTitle(`${character.name} · #${character.id}`)
        .setDescription(character.description || "No description available.")
        .addFields({ name: "Series", value: character.series || "Unknown", inline: true }, { name: "Category", value: characterCategory(character.gender), inline: true }, { name: "Rarity", value: character.rarity || "Common", inline: true }, { name: "Kakera Value", value: `${character.value}`, inline: true }, ...(character.popularityRank
        ? [{ name: "Popularity Rank", value: `#${character.popularityRank}`, inline: true }]
        : []), { name: "Claimed By", value: character.claimant, inline: true })
        .setFooter({ text: "✦ Verified catalog • Added to collection" });
    if (character.imageUrl)
        embed.setImage(character.imageUrl);
    else
        embed.addFields({ name: "Artwork", value: "Artwork coming soon", inline: true });
    return { embeds: [embed] };
}
export function collectionPage(displayName, collection, ownerId) {
    const description = collection.items
        .map((character) => `${character.favorite ? "★ " : ""}**${character.name}** — ${character.series} · ${character.rarity} · ${character.value} kakera · #${character.popularityRank} · ×${character.quantity}`)
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
                .setColor(palette.pink)
                .setTitle(`Collection — ${displayName}`)
                .setDescription(description || "Your collection is empty. Use /roll to find a verified character.")
                .setFooter({
                text: `✦ Page ${collection.page} / ${collection.totalPages} · ${collection.totalItems} unique character${collection.totalItems === 1 ? "" : "s"}`,
            }),
        ],
        components: [
            new ActionRowBuilder().addComponents(previous, next),
        ],
    };
}
export function profileCard(displayName, profile) {
    return {
        embeds: [
            new EmbedBuilder()
                .setColor(palette.electricBlue)
                .setTitle(`${displayName}'s Profile`)
                .addFields({ name: "Unique Characters", value: `${profile.unique_characters}`, inline: true }, { name: "Total Copies", value: `${profile.total_copies}`, inline: true }, { name: "Favorites", value: `${profile.favorites}`, inline: true }, { name: "Wishlist", value: `${profile.wishlist_count}`, inline: true }, { name: "Claims", value: `${profile.claims_count}`, inline: true }, { name: "Rolls", value: `${profile.rolls_used}`, inline: true }, { name: "Total Kakera", value: `${profile.total_kakera}`, inline: true }, ...(profile.best_rank
                ? [{ name: "Best Rank", value: `#${profile.best_rank}`, inline: true }]
                : []), {
                name: "Rolls Available",
                value: `${profile.available_rolls} / ${Number(process.env.ROLL_POOL_SIZE ?? 10)}`,
                inline: true,
            }, ...(profile.available_rolls === 0 && profile.roll_replenishment_at
                ? [{
                        name: "Replenishes In",
                        value: `${Math.ceil(Math.max(0, new Date(profile.roll_replenishment_at).getTime() - Date.now()) / 60_000)} minutes`,
                        inline: true,
                    }]
                : []), {
                name: "Claims Available",
                value: `${profile.available_claims} / ${Number(process.env.CLAIM_POOL_SIZE ?? 1)}`,
                inline: true,
            }, ...(profile.available_claims === 0 && profile.claim_replenishment_at
                ? [{
                        name: "Claim Replenishes In",
                        value: `${Math.ceil(Math.max(0, new Date(profile.claim_replenishment_at).getTime() - Date.now()) / 60_000)} minutes`,
                        inline: true,
                    }]
                : []), { name: "Currency", value: `${profile.currency}`, inline: true })
                .setFooter({ text: "✦ Your verified character collection" }),
        ],
    };
}
export function searchResults(results) {
    return {
        embeds: results.map((character) => {
            const embed = new EmbedBuilder()
                .setColor(palette.lavender)
                .setTitle(character.name)
                .setDescription(`**${character.series}**\n${characterCategory(character.gender)} · ${character.rarity} · ${character.value} kakera · Rank #${character.popularityRank}`)
                .setFooter({
                text: `✦ Verified character • ${results.length} result${results.length === 1 ? "" : "s"}`,
            });
            if (character.imageUrl)
                embed.setImage(character.imageUrl);
            else
                embed.addFields({ name: "Artwork", value: "Artwork coming soon" });
            return embed;
        }),
    };
}
export function remainingCharactersCard(count) {
    return actionResult("Characters Remaining", `**${count}** verified character${count === 1 ? "" : "s"} remain available to claim.`, palette.electricBlue);
}
export function leaderboardCard(entries) {
    return actionResult("Collection Leaderboard", entries.length
        ? entries
            .map((entry, index) => `**${index + 1}. ${entry.displayName}** — ${entry.totalKakera} kakera · ${entry.uniqueCharacters} unique · ${entry.totalCopies} total`)
            .join("\n")
        : "No collections have been created yet.", palette.gold);
}
export function actionResult(title, description, color = palette.electricBlue) {
    return {
        embeds: [
            new EmbedBuilder()
                .setColor(color)
                .setTitle(title)
                .setDescription(description)
                .setFooter({ text: "✦ Mudae Husbando" }),
        ],
    };
}
export function developerModeCard(enabled) {
    return actionResult("Developer Mode", `Status: **${enabled ? "ON" : "OFF"}**\nNormal roll restrictions: **${enabled ? "BYPASSED" : "ACTIVE"}**`, enabled ? palette.gold : palette.midnight);
}
