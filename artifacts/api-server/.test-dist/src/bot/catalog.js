// Curated from the matching public character records on mudae.net.
// Kirby intentionally remains unset because its Mudae record is under
// "Kirby's Dream Land", not the catalog's "Kirby" series.
const mudaeArtworkByName = {
    "Satoru Gojo": "https://mudae.net/uploads/7115130/Z-sFr0e~ZpxD0dS.png",
    "Yuji Itadori": "https://mudae.net/uploads/5073912/mFx9Qrn~S9z6kYs.png",
    "Mikasa Ackerman": "https://mudae.net/uploads/8291922/S0psmB9~R7HWV9q.png",
    "Levi Ackerman": "https://mudae.net/uploads/4734160/KQ9i7iG~vNwupmw.png",
    "Monkey D. Luffy": "https://mudae.net/uploads/7762218/xv3Y1-d~oKHk3YL.png",
    Nami: "https://mudae.net/uploads/1024687/mG6TkmC~g4z9cx95rk7.png",
    "Naruto Uzumaki": "https://mudae.net/uploads/8126169/mdgju66~zxWuZys.png",
    "Sasuke Uchiha": "https://mudae.net/uploads/3573093/eLGeRfx~2dSk1K9.png",
    "Eren Yeager": "https://mudae.net/uploads/3014040/xbBFl3m~uzW2IBY.png",
    Makima: "https://mudae.net/uploads/6905958/ep4kmYu~w7w6cal86ey.png",
    Frieren: "https://mudae.net/uploads/9949210/sxCkz8W~aHZ9NcQ.png",
};
const mudaeAliasesByName = {
    "Levi Ackerman": ["Levi"],
    "Eren Yeager": ["Eren Jaeger"],
};
export const seedCharacters = [
    ["Satoru Gojo", "Jujutsu Kaisen", "anime", "male", 95, "The strongest modern jujutsu sorcerer.", "rare"],
    ["Yuji Itadori", "Jujutsu Kaisen", "anime", "male", 55, "A kind-hearted student carrying a dangerous curse.", "common"],
    ["Mikasa Ackerman", "Attack on Titan", "anime", "female", 85, "An elite soldier and fiercely loyal protector.", "rare"],
    ["Levi Ackerman", "Attack on Titan", "anime", "male", 90, "Humanity's most formidable soldier.", "rare"],
    ["Monkey D. Luffy", "One Piece", "anime", "male", 75, "A rubber-bodied pirate chasing the title of Pirate King.", "uncommon"],
    ["Nami", "One Piece", "anime", "female", 60, "The Straw Hat navigator with a gift for cartography.", "uncommon"],
    ["Naruto Uzumaki", "Naruto", "anime", "male", 70, "A determined ninja who never abandons his way.", "uncommon"],
    ["Sasuke Uchiha", "Naruto", "anime", "male", 72, "A gifted shinobi walking a hard road toward redemption.", "uncommon"],
    ["Eren Yeager", "Attack on Titan", "anime", "male", 68, "A soldier driven by an uncompromising desire for freedom.", "uncommon"],
    ["Makima", "Chainsaw Man", "anime", "female", 88, "A composed and enigmatic devil hunter.", "rare"],
    ["Frieren", "Frieren: Beyond Journey's End", "anime", "female", 82, "An elven mage learning what it means to remember.", "rare"],
    ["Kirby", "Kirby", "game", "unknown", 45, "A cheerful hero with an appetite for impossible adventures.", "common"],
].map(([name, series, mediaType, gender, value, description, rarity]) => ({
    name: name,
    aliases: [],
    series: series,
    mediaType: mediaType,
    gender: gender,
    sourceUrl: "https://mudae.net/search?type=character",
    imageUrl: null,
    description: description,
    rarity: rarity,
    value: value,
    status: "verified",
})).map((character) => ({
    ...character,
    aliases: [...character.aliases, ...(mudaeAliasesByName[character.name] ?? [])],
    imageUrl: mudaeArtworkByName[character.name] ?? null,
}));
