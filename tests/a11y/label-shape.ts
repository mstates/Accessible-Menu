import { expect, type Page } from "@playwright/test";

// The shape of the one label that names a control, read from the page in
// every engine (D-193). Two hearings on the iPhone settled the rule:
// VoiceOver on iOS folds a label into its control, a checkbox, a button,
// or a text field alike, only when the label's accessible text is one text
// node; a label of two pieces never folds, whatever hides the second piece
// and wherever the label sits. So a field named with words beyond its
// visible ones is named by one label holding the whole name as a single
// text node, clipped out of the flow (sr-only, not 0px), with the visible
// short words inside the same label hidden from assistive technology
// (src/ui/OneNode.tsx). The readings here hold that shape and its cost:
// the visible words begin the name, or, for a Select's button, end it
// after the button's own visible value (D-188's order), so what the eye
// reads is in what is heard (2.5.3).

export type Piece = { text: string; hidden: "size" | "clip" | null };

export type LabelShape = {
  tag: string;
  wraps: boolean;
  for: string | null;
  // The label's text nodes outside aria-hidden subtrees, in order, each
  // marked by what hides it: no size at all (0 by 0), the clip (a box of a
  // pixel), or nothing.
  pieces: Piece[];
  // The words of each aria-hidden descendant that holds a letter or a
  // digit; a required asterisk and a drawn mark hold none.
  hiddenWords: string[];
  // The control's own visible text, a Select button's value.
  controlText: string;
} | null;

// Runs in the page, so it names nothing outside itself. The label the
// control is named from: aria-labelledby's one id, else the label around
// it.
export function labelShape(control: Element): LabelShape {
  const collapse = (text: string) => text.replace(/\s+/g, " ").trim();
  const byRef = control.getAttribute("aria-labelledby");
  const label = byRef
    ? document.getElementById(byRef.split(/\s+/)[0] ?? "")
    : control.closest("label");
  if (!label) return null;
  const pieces: Piece[] = [];
  const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    if (text.trim() === "") continue;
    const parent = node.parentElement;
    if (!parent || parent.closest('[aria-hidden="true"]')) continue;
    const rect = parent.getBoundingClientRect();
    const hidden =
      rect.width === 0 && rect.height === 0
        ? "size"
        : rect.width <= 1 && rect.height <= 1
          ? "clip"
          : null;
    pieces.push({ text, hidden });
  }
  const hiddenWords: string[] = [];
  for (const element of label.querySelectorAll('[aria-hidden="true"]')) {
    if (element.parentElement?.closest('[aria-hidden="true"]')) continue;
    const words = collapse(element.textContent ?? "");
    if (/[\p{L}\p{N}]/u.test(words)) hiddenWords.push(words);
  }
  return {
    tag: label.tagName,
    wraps: label.contains(control),
    for: label.getAttribute("for"),
    pieces,
    hiddenWords,
    controlText: collapse(control.textContent ?? ""),
  };
}

export type LabelOptions = {
  // The control sits inside its label, a checkbox, rather than being
  // pointed at by the label's for.
  wrapping?: boolean;
  // The visible words hidden from assistive technology when the label
  // holds the whole name as its one clipped node; absent for a label of
  // plain visible words, which is one node already.
  visible?: string;
  // Where the visible words sit in the name: first (a suffixed field or
  // box), or last, after the control's own visible value (a Select).
  order?: "first" | "last";
};

// A control named by one label, as the page holds it: no aria-label on
// the control; one label element names it, pointing back at it with for
// or wrapping it; and the label is one text node, the whole name. With
// visible words, that node is clipped, the visible words are the one run
// hidden from assistive technology, and the name begins with them, or
// ends with them after the control's own words.
export async function expectLabelShape(
  page: Page,
  id: string,
  name: string,
  { wrapping = false, visible, order = "first" }: LabelOptions = {},
): Promise<void> {
  const control = page.locator(`[id="${id}"]`);
  await expect(
    control,
    `${name}: no name on the control itself`,
  ).not.toHaveAttribute("aria-label");
  if (wrapping) {
    await expect(control).not.toHaveAttribute("aria-labelledby");
  } else {
    const labelledBy = (await control.getAttribute("aria-labelledby")) ?? "";
    expect(labelledBy, `${name}: named by one label`).toMatch(/^\S+$/);
    const label = page.locator(`[id="${labelledBy}"]`);
    expect(
      await label.evaluate((element) => element.tagName),
      `${name}: a label element`,
    ).toBe("LABEL");
    await expect(
      label,
      `${name}: the label is for the control`,
    ).toHaveAttribute("for", id);
  }
  const shape = await control.evaluate(labelShape);
  expect(shape, `${name}: a label names it`).not.toBeNull();
  if (!shape) return;
  expect(shape.tag, `${name}: a label element`).toBe("LABEL");
  expect(
    shape.wraps,
    `${name}: ${wrapping ? "inside" : "beside"} its label`,
  ).toBe(wrapping);
  if (visible === undefined) {
    expect(shape.pieces, `${name}: one visible text node, the name`).toEqual([
      { text: name, hidden: null },
    ]);
    expect(
      shape.hiddenWords,
      `${name}: no words hidden from assistive technology`,
    ).toEqual([]);
    return;
  }
  expect(
    shape.pieces,
    `${name}: one clipped text node, the whole name`,
  ).toEqual([{ text: name, hidden: "clip" }]);
  expect(
    shape.hiddenWords,
    `${name}: the visible words, hidden from assistive technology`,
  ).toEqual([visible]);
  if (order === "first") {
    expect(
      name.startsWith(`${visible} `),
      `${name}: begins with the visible words "${visible}"`,
    ).toBe(true);
  } else {
    expect(
      name,
      `${name}: the control's own visible words, then the label's`,
    ).toBe(`${shape.controlText} ${visible}`);
  }
}
