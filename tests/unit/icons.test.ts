import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { US_MAJOR_ALLERGENS } from "../../src/domain/allergens";
import { DIETARY_TAG_IDS } from "../../src/domain/types";
import {
  drawnIcons,
  GLYPHS,
  ICON_IDS,
  isIconId,
  symbolId,
} from "../../src/ui/icons/glyphs";
import { IconRow, IconSprite } from "../../src/ui/icons/IconRow";

// The icons under the allergen and diet lines (D-189): eleven glyphs in one
// hand, the nine US major allergens and two of the three tags, and no
// struck wheat ear for "Made without gluten ingredients", the gluten-free
// pictogram the words were chosen to avoid (D-66); then the sprite and the
// row as the page draws them.

const COMMAND = /^[MLHVCQAZ]$/;

function tokens(d: string): string[] {
  return d
    .replace(/([A-Za-z])/g, " $1 ")
    .trim()
    .split(/[\s,]+/);
}

describe("the glyphs (D-189)", () => {
  it("are the nine US major allergens, vegan, and vegetarian, with no glyph for made-without-gluten (D-66)", () => {
    expect([...ICON_IDS]).toEqual([
      ...US_MAJOR_ALLERGENS,
      "vegan",
      "vegetarian",
    ]);
    expect(DIETARY_TAG_IDS).toContain("made-without-gluten");
    expect(isIconId("made-without-gluten")).toBe(false);
    expect(isIconId("celery")).toBe(false);
    expect(drawnIcons(["made-without-gluten"])).toEqual([]);
    expect(drawnIcons(["wheat", "celery", "milk"])).toEqual(["wheat", "milk"]);
    expect(Object.keys(GLYPHS).sort()).toEqual([...ICON_IDS].sort());
  });

  it.each(ICON_IDS)(
    "%s is one outline path on the 24 grid, absolute commands only, with no paint of its own",
    (id) => {
      const glyph = GLYPHS[id];
      expect(glyph.id).toBe(id);
      const parts = tokens(glyph.d);
      expect(parts[0]).toBe("M");
      for (const part of parts) {
        if (COMMAND.test(part)) continue;
        const number = Number(part);
        expect(Number.isFinite(number), `${id}: ${part}`).toBe(true);
        expect(number, `${id}: ${part}`).toBeGreaterThanOrEqual(0);
        expect(number, `${id}: ${part}`).toBeLessThanOrEqual(24);
      }
      expect(glyph.d).not.toMatch(/[<>"]/);
    },
  );
});

describe("the sprite and the row (D-189)", () => {
  it("draws one symbol per glyph in the sprite, hidden and out of the flow, with no title and no paint of its own", () => {
    const html = renderToStaticMarkup(createElement(IconSprite));
    expect(html).toMatch(
      /^<svg aria-hidden="true" focusable="false" class="[^"]*size-0[^"]*"/,
    );
    const symbols = [
      ...html.matchAll(
        /<symbol id="([^"]+)" viewBox="0 0 24 24"><path d="[^"]+"><\/path><\/symbol>/g,
      ),
    ].map((match) => match[1]);
    expect(symbols).toEqual(ICON_IDS.map(symbolId));
    expect(html).not.toMatch(/<title|fill=|stroke=/);
  });

  it("draws a row of one use per id that has a glyph, in order, hidden, each svg painted in currentColor and sized to the text, and nothing for ids without one", () => {
    const html = renderToStaticMarkup(
      createElement(IconRow, {
        ids: ["wheat", "celery", "milk", "made-without-gluten"],
      }),
    );
    expect(html).toMatch(/^<div aria-hidden="true"/);
    const uses = [...html.matchAll(/<use href="#([^"]+)"><\/use>/g)].map(
      (match) => match[1],
    );
    expect(uses).toEqual(["icon-wheat", "icon-milk"]);
    const svgs = html.match(/<svg[^>]*>/g) ?? [];
    expect(svgs).toHaveLength(2);
    for (const svg of svgs) {
      expect(svg).toContain('focusable="false"');
      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg).toContain('fill="none"');
      expect(svg).toContain('stroke="currentColor"');
      expect(svg).toContain('stroke-linecap="round"');
      expect(svg).toContain("size-[1.25em]");
    }
    expect(html.replace(/<[^>]+>/g, ""), "no text in a row").toBe("");
    expect(html).not.toMatch(/<title/);
    expect(
      renderToStaticMarkup(createElement(IconRow, { ids: ["celery"] })),
    ).toBe("");
    expect(renderToStaticMarkup(createElement(IconRow, { ids: [] }))).toBe("");
  });
});
