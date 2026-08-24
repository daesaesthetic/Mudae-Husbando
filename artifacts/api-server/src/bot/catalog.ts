export type CatalogCharacter = {
  id: number;
  name: string;
  aliases: string[];
  series: string;
  mediaType: string;
  gender: string;
  sourceUrl: string;
  imageUrl: string | null;
  description: string;
  rarity: string;
  value: number;
  popularityRank: number;
  rollWeight: number;
  status: "verified";
};

// Curated from the matching public character records on mudae.net.
// The catalog's "Kirby" series is the broader franchise label for Mudae's
// exact Kirby record, whose primary series association is "Kirby's Dream Land".
const mudaeArtworkByName: Record<string, string> = {
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
  Kirby: "https://mudae.net/uploads/7502166/hw-q1lu~qEk1Egg.png",
  "Son Goku": "https://mudae.net/uploads/5299501/AVJfF95~0mbtqju.png",
  "Ichigo Kurosaki": "https://mudae.net/uploads/9808092/A-IIVW1~8PuWxPG.png",
  "Edward Elric": "https://mudae.net/uploads/9666899/dLfIijb~ABIQPkl.png",
  "Tanjirou Kamado": "https://mudae.net/uploads/2599355/Z_F_T9E~GqQVlFx.png",
  Denji: "https://mudae.net/uploads/2955765/IQE4-BV~T40vzVM.png",
  "Killua Zoldyck": "https://mudae.net/uploads/4071235/Xp5hbLf~Zfczd8A.png",
  "Yor Forger": "https://mudae.net/uploads/1142220/ge7hpVs~okjAGpA.png",
  "Nezuko Kamado": "https://mudae.net/uploads/8395836/QQxaOU7~sjy1Bna.png",
  "Marin Kitagawa": "https://mudae.net/uploads/6349347/1I_j-46~Pni0y2d.png",
  Rem: "https://mudae.net/uploads/4190198/bZZfHPc~bFtvJih.png",
  "Usagi Tsukino": "https://mudae.net/uploads/2365375/4Z4lE6n~NHa5BWV.png",
  "Anya Forger": "https://mudae.net/uploads/7630102/BBk5HCW~omw8wtg.png",
};

const mudaeAliasesByName: Record<string, string[]> = {
  "Levi Ackerman": ["Levi"],
  "Eren Yeager": ["Eren Jaeger"],
  "Son Goku": ["Goku"],
  "Ichigo Kurosaki": ["Ichigo"],
  "Edward Elric": ["Edward"],
  "Tanjirou Kamado": ["Tanjiro", "Tanjiro Kamado"],
  "Usagi Tsukino": ["Sailor Moon"],
};

const characterStats: Record<string, { value: number; popularityRank: number; rollWeight: number }> = {
  "Satoru Gojo": { value: 275, popularityRank: 1, rollWeight: 1 },
  "Yuji Itadori": { value: 145, popularityRank: 8, rollWeight: 5 },
  "Mikasa Ackerman": { value: 240, popularityRank: 3, rollWeight: 2 },
  "Levi Ackerman": { value: 265, popularityRank: 2, rollWeight: 1 },
  "Monkey D. Luffy": { value: 220, popularityRank: 4, rollWeight: 2 },
  Nami: { value: 180, popularityRank: 6, rollWeight: 3 },
  "Naruto Uzumaki": { value: 205, popularityRank: 5, rollWeight: 3 },
  "Sasuke Uchiha": { value: 195, popularityRank: 7, rollWeight: 3 },
  "Eren Yeager": { value: 170, popularityRank: 9, rollWeight: 4 },
  Makima: { value: 250, popularityRank: 10, rollWeight: 2 },
  Frieren: { value: 235, popularityRank: 11, rollWeight: 2 },
  Kirby: { value: 120, popularityRank: 12, rollWeight: 6 },
  "Son Goku": { value: 260, popularityRank: 13, rollWeight: 1 },
  "Ichigo Kurosaki": { value: 210, popularityRank: 14, rollWeight: 3 },
  "Edward Elric": { value: 190, popularityRank: 15, rollWeight: 3 },
  "Tanjirou Kamado": { value: 185, popularityRank: 16, rollWeight: 4 },
  "Denji": { value: 155, popularityRank: 17, rollWeight: 5 },
  "Killua Zoldyck": { value: 215, popularityRank: 18, rollWeight: 2 },
  "Yor Forger": { value: 245, popularityRank: 19, rollWeight: 2 },
  "Nezuko Kamado": { value: 200, popularityRank: 20, rollWeight: 3 },
  "Marin Kitagawa": { value: 175, popularityRank: 21, rollWeight: 4 },
  "Rem": { value: 230, popularityRank: 22, rollWeight: 2 },
  "Usagi Tsukino": { value: 165, popularityRank: 23, rollWeight: 4 },
  "Anya Forger": { value: 135, popularityRank: 24, rollWeight: 6 },
};

export const seedCharacters: Omit<CatalogCharacter, "id">[] = [
  ["Satoru Gojo", "Jujutsu Kaisen", "anime", "male", "The strongest modern jujutsu sorcerer.", "rare"],
  ["Yuji Itadori", "Jujutsu Kaisen", "anime", "male", "A kind-hearted student carrying a dangerous curse.", "common"],
  ["Mikasa Ackerman", "Attack on Titan", "anime", "female", "An elite soldier and fiercely loyal protector.", "rare"],
  ["Levi Ackerman", "Attack on Titan", "anime", "male", "Humanity's most formidable soldier.", "rare"],
  ["Monkey D. Luffy", "One Piece", "anime", "male", "A rubber-bodied pirate chasing the title of Pirate King.", "uncommon"],
  ["Nami", "One Piece", "anime", "female", "The Straw Hat navigator with a gift for cartography.", "uncommon"],
  ["Naruto Uzumaki", "Naruto", "anime", "male", "A determined ninja who never abandons his way.", "uncommon"],
  ["Sasuke Uchiha", "Naruto", "anime", "male", "A gifted shinobi walking a hard road toward redemption.", "uncommon"],
  ["Eren Yeager", "Attack on Titan", "anime", "male", "A soldier driven by an uncompromising desire for freedom.", "uncommon"],
  ["Makima", "Chainsaw Man", "anime", "female", "A composed and enigmatic devil hunter.", "rare"],
  ["Frieren", "Frieren: Beyond Journey's End", "anime", "female", "An elven mage learning what it means to remember.", "rare"],
  ["Kirby", "Kirby", "game", "unknown", "A cheerful hero with an appetite for impossible adventures.", "common"],
  ["Son Goku", "Dragon Ball", "anime", "male", "A cheerful martial artist who protects Earth from impossible threats.", "rare"],
  ["Ichigo Kurosaki", "BLEACH", "anime", "male", "A substitute Soul Reaper defending both the living and the dead.", "uncommon"],
  ["Edward Elric", "Fullmetal Alchemist", "anime", "male", "A gifted alchemist searching for a way to restore what was lost.", "uncommon"],
  ["Tanjirou Kamado", "Kimetsu no Yaiba", "anime", "male", "A compassionate demon slayer fighting to save his sister.", "uncommon"],
  ["Denji", "Chainsaw Man", "anime", "male", "A devil hunter with a chainsaw-powered transformation.", "common"],
  ["Killua Zoldyck", "Hunter x Hunter", "anime", "male", "A lightning-fast assassin choosing friendship over his family legacy.", "rare"],
  ["Yor Forger", "SPY×FAMILY", "anime", "female", "A devoted fake wife with an extraordinary secret profession.", "rare"],
  ["Nezuko Kamado", "Kimetsu no Yaiba", "anime", "female", "A resilient sister protecting humanity despite her transformation.", "uncommon"],
  ["Marin Kitagawa", "My Dress-Up Darling", "anime", "female", "A joyful cosplayer who celebrates every character she loves.", "uncommon"],
  ["Rem", "Re:Zero kara Hajimeru Isekai Seikatsu", "anime", "female", "A loyal oni maid with formidable courage and devotion.", "rare"],
  ["Usagi Tsukino", "Pretty Soldier Sailor Moon", "anime", "female", "A guardian of love and justice defending the world.", "uncommon"],
  ["Anya Forger", "SPY×FAMILY", "anime", "female", "A telepathic child determined to keep her unusual family together.", "common"],
].map(([name, series, mediaType, gender, description, rarity]) => ({
  name,
  aliases: [],
  series,
  mediaType,
  gender,
  sourceUrl: "https://mudae.net/search?type=character",
  imageUrl: null,
  description,
  rarity,
  ...characterStats[name],
  status: "verified" as const,
})).map((character) => ({
  ...character,
  aliases: [...character.aliases, ...(mudaeAliasesByName[character.name] ?? [])],
  imageUrl: mudaeArtworkByName[character.name] ?? null,
}));