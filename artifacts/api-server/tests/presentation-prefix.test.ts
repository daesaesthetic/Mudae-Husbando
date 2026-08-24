import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { seedCharacters } from "../src/bot/catalog.js";
import {
  characterCard,
  claimedCharacterCard,
  leaderboardCard,
  profileCard,
  remainingCharactersCard,
  searchResults,
} from "../src/bot/presentation.js";
import {
  canonicalPrefixCommand,
  parsePrefixCommand,
  prefixCommands,
} from "../src/bot/prefix.js";

describe("character presentation", () => {
  const roll = {
    id: "00000000-0000-0000-0000-000000000001",
    characterId: 7,
    name: "Satoru Gojo",
    series: "Jujutsu Kaisen",
    rarity: "rare",
    value: 275,
    gender: "male",
    popularityRank: 1,
    rollWeight: 1,
    description: "The strongest modern jujutsu sorcerer.",
    expiresAt: new Date("2026-08-24T08:00:00.000Z"),
    rollerName: "Player One",
  };

  it("renders character identity and a claim action", () => {
    const card = characterCard(roll);
    const embed = card.embeds[0].data;
    assert.equal(embed.color, 0xb7a5ff);
    assert.equal(embed.title, "Satoru Gojo · #7");
    assert.equal(embed.description, roll.description);
    assert.ok(embed.fields?.some((field) => field.name === "Series" && field.value === roll.series));
    assert.ok(embed.fields?.some((field) => field.name === "Category" && field.value === "Husbando"));
    assert.ok(embed.fields?.some((field) => field.name === "Kakera Value" && field.value === "275"));
    assert.ok(embed.fields?.some((field) => field.name === "Popularity Rank" && field.value === "#1"));
    assert.ok(embed.fields?.some((field) => field.name === "Rolled By" && field.value === roll.rollerName));
    assert.ok(embed.fields?.some((field) => field.name === "Claim Expires"));
    assert.match(
      JSON.stringify(card.components[0].toJSON()),
      new RegExp(`claim:${roll.id}`),
    );
  });

  it("keeps the curated Mudae artwork, aliases, and stat distribution attached to the catalog", () => {
    assert.equal(seedCharacters.length, 12);
    assert.equal(seedCharacters.filter((character) => character.imageUrl).length, 12);
    assert.equal(new Set(seedCharacters.map((character) => character.popularityRank)).size, 12);
    assert.ok(seedCharacters.every((character) => character.value > 0 && character.rollWeight > 0));
    assert.ok(
      Math.min(...seedCharacters.filter((character) => character.rarity === "rare").map((character) => character.value)) >
      Math.max(...seedCharacters.filter((character) => character.rarity === "common").map((character) => character.value)),
    );
    assert.deepEqual(
      seedCharacters.find((character) => character.name === "Levi Ackerman")?.aliases,
      ["Levi"],
    );
    assert.deepEqual(
      seedCharacters.find((character) => character.name === "Eren Yeager")?.aliases,
      ["Eren Jaeger"],
    );
    assert.match(
      seedCharacters.find((character) => character.name === "Kirby")?.imageUrl ?? "",
      /^https:\/\/mudae\.net\/uploads\/7502166\//,
    );
  });

  it("passes every populated seed artwork URL through the existing character card", () => {
    for (const character of seedCharacters.filter((entry) => entry.imageUrl)) {
      const card = characterCard({
        id: "00000000-0000-0000-0000-000000000001",
        characterId: 1,
        name: character.name,
        series: character.series,
        rarity: character.rarity,
        value: character.value,
        description: character.description,
        imageUrl: character.imageUrl,
      });
      assert.equal(card.embeds[0].data.image?.url, character.imageUrl);
    }
  });

  it("renders search results as image-backed character cards", () => {
    const results = searchResults([
      {
        name: "Frieren",
        series: "Frieren: Beyond Journey's End",
        imageUrl: "https://mudae.net/uploads/9949210/sxCkz8W~aHZ9NcQ.png",
        rarity: "rare",
        value: 235,
        gender: "female",
        popularityRank: 11,
        rollWeight: 2,
      },
      {
        name: "Unknown Character",
        series: "Unknown Series",
        imageUrl: null,
        rarity: "common",
        value: 1,
        gender: "unknown",
        popularityRank: 9999,
        rollWeight: 1,
      },
    ]);
    assert.equal(results.embeds.length, 2);
    assert.equal(results.embeds[0].data.title, "Frieren");
    assert.equal(results.embeds[0].data.color, 0xb7a5ff);
    assert.match(results.embeds[0].data.description ?? "", /Waifu · rare · 235 kakera · Rank #11/);
    assert.equal(
      results.embeds[0].data.image?.url,
      "https://mudae.net/uploads/9949210/sxCkz8W~aHZ9NcQ.png",
    );
    assert.ok(results.embeds[1].data.fields?.some((field) => field.name === "Artwork"));
  });

  it("uses a configured image URL or an explicit safe fallback", () => {
    const withImage = characterCard({ ...roll, imageUrl: "https://cdn.example.test/gojo.png" });
    assert.equal(withImage.embeds[0].data.image?.url, "https://cdn.example.test/gojo.png");

    const withoutImage = characterCard(roll);
    assert.equal(withoutImage.embeds[0].data.image, undefined);
    assert.ok(
      withoutImage.embeds[0].data.fields?.some(
        (field) => field.name === "Artwork" && field.value === "Artwork coming soon",
      ),
    );
  });

  it("renders a claimed character without a second claim action", () => {
    const card = claimedCharacterCard({
      id: 7,
      name: roll.name,
      series: roll.series,
      rarity: roll.rarity,
      value: roll.value,
      gender: roll.gender,
      popularityRank: roll.popularityRank,
      description: roll.description,
      claimant: "Player One",
    });
    assert.equal("components" in card, false);
    assert.ok(
      card.embeds[0].data.fields?.some(
        (field) => field.name === "Claimed By" && field.value === "Player One",
      ),
    );
  });

  it("shows a collector's aggregate kakera and strongest popularity rank", () => {
    const card = profileCard("Player One", {
      unique_characters: 2, total_copies: 2, favorites: 1, wishlist_count: 1,
      claims_count: 2, rolls_used: 4, available_rolls: 6, roll_replenishment_at: null,
      available_claims: 1, claim_replenishment_at: null, currency: 0,
      total_kakera: 540, best_rank: 1,
    });
    assert.ok(card.embeds[0].data.fields?.some((field) => field.name === "Total Kakera" && field.value === "540"));
    assert.ok(card.embeds[0].data.fields?.some((field) => field.name === "Best Rank" && field.value === "#1"));
  });
});

describe("prefix command parsing", () => {
  it("parses the default prefix, normalized command name, whitespace, and arguments", () => {
    assert.deepEqual(parsePrefixCommand("$Ha    Satoru   Gojo"), {
      command: "ha",
      args: ["Satoru", "Gojo"],
    });
    assert.deepEqual(parsePrefixCommand("$search Goku"), {
      command: "search",
      args: ["Goku"],
    });
  });

  it("supports a configured prefix and ignores empty or unprefixed messages", () => {
    assert.deepEqual(parsePrefixCommand("!wa", "!"), { command: "wa", args: [] });
    assert.equal(parsePrefixCommand("$wa", "!"), null);
    assert.equal(parsePrefixCommand("$"), null);
    assert.equal(parsePrefixCommand("ordinary message"), null);
  });

  it("keeps the supported command surface explicit", () => {
    for (const command of [
      "ha",
      "wa",
      "roll",
      "claim",
      "search",
      "profile",
      "m",
      "marry",
      "pr",
      "harem",
      "wish",
      "fav",
      "left",
      "top",
    ]) {
      assert.equal(prefixCommands.has(command), true);
    }
    assert.equal(prefixCommands.has("unknown"), false);
    assert.equal(canonicalPrefixCommand("marry"), "roll");
    assert.equal(canonicalPrefixCommand("harem"), "collection");
    assert.equal(canonicalPrefixCommand("wish"), "wishlist");
    assert.equal(canonicalPrefixCommand("top"), "top");
  });
});

describe("Mudae-style utility cards", () => {
  it("renders remaining-character and collection-leaderboard summaries", () => {
    const remaining = remainingCharactersCard(11);
    assert.match(remaining.embeds[0].data.description ?? "", /11/);
    assert.equal(remaining.embeds[0].data.color, 0x28b8ff);

    const leaderboard = leaderboardCard([
      { displayName: "Player One", uniqueCharacters: 4, totalCopies: 5, totalKakera: 900 },
    ]);
    assert.match(leaderboard.embeds[0].data.description ?? "", /1\. Player One/);
    assert.match(leaderboard.embeds[0].data.description ?? "", /4 unique/);
    assert.match(leaderboard.embeds[0].data.description ?? "", /900 kakera/);
    assert.equal(leaderboard.embeds[0].data.color, 0xf4c95d);
    assert.match(leaderboard.embeds[0].data.footer?.text ?? "", /Mudae Husbando/);
  });
});