import { DIETARY_TAG_IDS, type DietaryTagId } from "./types";

// A dish's dietary tags (D-66): the three, each once, kept in the enum's
// order so the stored list, the list the page shows, and the text a
// compare-and-set names always agree. The words diners read are built here
// and nowhere else (module rule 8). Pure: no React, no network.

export type DietaryCopy = { names: Record<DietaryTagId, string> };

export function isDietaryTag(value: string): value is DietaryTagId {
  return (DIETARY_TAG_IDS as readonly string[]).includes(value);
}

// The list with one tag on or off, in the fixed order.
export function toggleTag(
  list: readonly DietaryTagId[],
  id: DietaryTagId,
  on: boolean,
): DietaryTagId[] {
  return DIETARY_TAG_IDS.filter((tag) =>
    tag === id ? on : list.includes(tag),
  );
}

export function sameTags(
  a: readonly DietaryTagId[],
  b: readonly DietaryTagId[],
): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

// What diners read with a dish: each tag as its own short sentence,
// "Vegan. Made without gluten ingredients.", or nothing with no tag. The
// tags the words name ride along in the same order: the key of the icon
// row the diner page draws under the line when the owner turned icons on
// (D-189), from the same call as the words (rule 8).
export type DietarySentence = {
  words: string[];
  text: string;
  tags: DietaryTagId[];
};

export function dietarySentence(
  tags: readonly DietaryTagId[],
  copy: DietaryCopy,
): DietarySentence | null {
  const kept = DIETARY_TAG_IDS.filter((tag) => tags.includes(tag));
  const words = kept.map((tag) => copy.names[tag]);
  if (words.length === 0) return null;
  return {
    words,
    text: words.map((word) => `${word}.`).join(" "),
    tags: kept,
  };
}
