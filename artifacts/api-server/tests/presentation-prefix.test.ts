import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { characterCard, claimedCharacterCard } from "../src/bot/presentation.js";
import { parsePrefixCommand, prefixCommands } from "../src/bot/prefix.js";

describe("character presentation", () => {
  const roll = {
    id: "00000000-0000-0000-0000-000000000001",
    characterId: 7,
    name: "Satoru Gojo",
    series: "Jujutsu Kaisen",
    rarity: "rare",
    value: 95,
    description: "The strongest modern jujutsu sorcerer.",
    expiresAt: new Date("2026-08-24T08:00:00.000Z"),
    rollerName: "Player One",
  };

  it("renders character identity and a claim action", () => {
    const card = characterCard(roll);
    const embed = card.embeds[0].data;
    assert.equal(embed.title, "Satoru Gojo · #7");
    assert.equal(embed.description, roll.description);
    assert.ok(embed.fields?.some((field) => field.name === "Series" && field.value === roll.series));
    assert.ok(embed.fields?.some((field) => field.name === "Rolled By" && field.value === roll.rollerName));
    assert.ok(embed.fields?.some((field) => field.name === "Claim Expires"));
    assert.match(
      JSON.stringify(card.components[0].toJSON()),
      new RegExp(`claim:${roll.id}`),
    );
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
    for (const command of ["ha", "wa", "roll", "claim", "search", "profile"]) {
      assert.equal(prefixCommands.has(command), true);
    }
    assert.equal(prefixCommands.has("unknown"), false);
  });
});