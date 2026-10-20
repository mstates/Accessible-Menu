import { eggs } from "./eggs";
import { fish } from "./fish";
import { milk } from "./milk";
import { peanuts } from "./peanuts";
import { sesame } from "./sesame";
import { shellfish } from "./shellfish";
import { soy } from "./soy";
import { treenuts } from "./tree-nuts";
import { vegan } from "./vegan";
import { vegetarian } from "./vegetarian";
import { wheat } from "./wheat";

// The icons the diner page can draw (D-189): the nine US major allergens
// (D-150) and two of the three dietary tags, each keyed by the id the
// sentence builders carry beside their words. "Made without gluten
// ingredients" has no glyph: a struck wheat ear is the gluten-free pictogram
// and resembles the Crossed Grain certification mark, which the words were
// chosen to avoid (D-66), so a diet line of that tag alone draws no row.
// Twelve files would have been thirteen; this list is pinned by a unit test
// against the domain's lists, so ui carries no domain import.
export type Glyph = { id: string; d: string };

export const ICON_IDS = [
  "milk",
  "eggs",
  "fish",
  "shellfish",
  "tree-nuts",
  "peanuts",
  "wheat",
  "soy",
  "sesame",
  "vegan",
  "vegetarian",
] as const;

export type IconId = (typeof ICON_IDS)[number];

export const GLYPHS: Record<IconId, Glyph> = {
  milk,
  eggs,
  fish,
  shellfish,
  "tree-nuts": treenuts,
  peanuts,
  wheat,
  soy,
  sesame,
  vegan,
  vegetarian,
};

export function isIconId(id: string): id is IconId {
  return (ICON_IDS as readonly string[]).includes(id);
}

// The ids a row draws, in the order given: those with a glyph.
export function drawnIcons(ids: readonly string[]): IconId[] {
  return ids.filter(isIconId);
}

export function symbolId(id: IconId): string {
  return `icon-${id}`;
}
