import { drawnIcons, GLYPHS, ICON_IDS, symbolId } from "./glyphs";

// The icons under an allergen sentence or a diet line when the owner turned
// them on (D-189, refining D-27 and D-40). One sprite per page holds every
// glyph as a symbol, and each row is one element of its own right after
// the sentence, hidden from assistive technology: the words beside it are
// the one spoken form (rule 8), and nothing sits inside the sentence, which
// stays one text node (D-182). An icon is sized to the text and drawn in
// currentColor, so it follows the text size, dark mode, and forced colors;
// the paint sits on the row's own svg, not on the symbol's path, since
// forced colors are judged on the element on the page. No title, no
// tooltip, no legend: a diner who scans by icon learns each one from the
// words beside it.

// Zero size and out of the flow, never display none, which older WebKit
// would not draw a use from. The page puts it after the footer, outside
// every landmark, and only when a row draws.
export function IconSprite() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="absolute size-0 overflow-hidden"
    >
      {ICON_IDS.map((id) => (
        <symbol key={id} id={symbolId(id)} viewBox="0 0 24 24">
          <path d={GLYPHS[id].d} />
        </symbol>
      ))}
    </svg>
  );
}

// One row: an icon per id that has a glyph, in the order given, or nothing
// when none has one, so no empty row is ever drawn.
export function IconRow({ ids }: { ids: readonly string[] }) {
  const drawn = drawnIcons(ids);
  if (drawn.length === 0) return null;
  return (
    <div aria-hidden="true" className="mt-1 flex flex-wrap gap-1">
      {drawn.map((id) => (
        <svg
          key={id}
          focusable="false"
          viewBox="0 0 24 24"
          className="size-[1.25em] shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <use href={`#${symbolId(id)}`} />
        </svg>
      ))}
    </div>
  );
}
