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
  status: "verified";
};

export const seedCharacters: Omit<CatalogCharacter, "id">[] = [
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
  name: name as string,
  aliases: [],
  series: series as string,
  mediaType: mediaType as string,
  gender: gender as string,
  sourceUrl: "https://mudae.net/search?type=character",
  imageUrl: null,
  description: description as string,
  rarity: rarity as string,
  value: value as number,
  status: "verified" as const,
}));