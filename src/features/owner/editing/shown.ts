// What a text on a page that saves as it goes hands back with its save
// (D-237, rule 2): the value the page showed for it, so the write lands
// only if the server still holds that value. Pure: no React, no network.
//
// Every save on such a page ends with a refresh that brings every row
// again, and a field with typed text shows the typed text, so a value
// changed in another tab arrives under it unseen. A save that named the
// newest value the page was sent would pass its compare and write over a
// change nobody saw. So each field keeps a hold: what the server held when
// the owner began to change it, and the text the field showed then.
//
// 1. The first keystroke records the hold. A later keystroke never
//    replaces it.
// 2. When the field's own save lands, the hold becomes the answer's value,
//    so two saves of one field in a row never refuse each other. It is
//    kept, not dropped: the refreshed rows can arrive well after the
//    answer, while another save is still on its way, and until they do the
//    page's last render holds the older value.
// 3. A field typed back to its saved value, or a row that left the page,
//    drops its hold.
// 4. When new rows arrive, every hold whose field has no typed text is
//    dropped: the field now shows the server's value, and the next
//    keystroke records that one. A hold whose field still has typed text
//    stays, which is the point of it.
// 5. A save reads its hold when the queue sends it (texts.ts).
// 6. A text typed back to its hold's text sends nothing, and the hold's
//    text alone is compared, never the render's saved value, which can be
//    older than a save that landed (commit.ts, Q-199).

// A value handed back: a text, a stored number, the two stored numbers of
// a pair of calories, or nothing.
export type ShownValue =
  | string
  | number
  | null
  | { readonly low: number | null; readonly high: number | null };

// One field's hold: what the server held, and the text the field showed.
export type Hold = { readonly shown: ShownValue; readonly text: string };

export type Holds = Readonly<Record<string, Hold>>;

// Rule 1: the first keystroke records, and no later one replaces.
export function heldAtFirstKey(holds: Holds, key: string, hold: Hold): Holds {
  return key in holds ? holds : { ...holds, [key]: hold };
}

// Rule 2: the field's own save landed with this value.
export function heldAfterLanding(holds: Holds, key: string, hold: Hold): Holds {
  return { ...holds, [key]: hold };
}

// Rule 3: the field has nothing typed in it any more, or is gone.
export function released(holds: Holds, key: string): Holds {
  if (!(key in holds)) return holds;
  const next = { ...holds };
  delete next[key];
  return next;
}

// Rule 4: new rows arrived. Only the fields with typed text keep a hold.
export function settled(
  holds: Holds,
  typed: Readonly<Record<string, unknown>>,
): Holds {
  const kept = Object.entries(holds).filter(([key]) => key in typed);
  return kept.length === Object.keys(holds).length
    ? holds
    : Object.fromEntries(kept);
}
