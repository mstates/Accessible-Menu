import { expect, type Page } from "@playwright/test";

const text = (value: unknown) => (typeof value === "string" ? value : "");

// The name Chrome itself gives one element, found by its id, read through
// the DevTools Protocol's Accessibility domain (D-140, D-142). What a
// screen reader is handed, not what Playwright computes.
export async function chromeName(page: Page, id: string): Promise<string> {
  return (await chromeLabelling(page, id)).name;
}

type Labelling = { name: string; labels: number; pieces: string | null };

// Chrome's reading of one control, by its id: its computed name, how many
// elements label it, and, when exactly one does, that element's text pieces
// joined with nothing between them, which is what VoiceOver on macOS reads
// from a title element (D-140, D-142); null when no one element labels it.
export async function chromeLabelling(
  page: Page,
  id: string,
): Promise<Labelling> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await cdp.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector: `[id="${id}"]`,
    });
    const { nodes } = await cdp.send("Accessibility.getPartialAXTree", {
      nodeId,
      fetchRelatives: false,
    });
    const node = nodes[0];
    const labels =
      node?.properties?.find((property) => property.name === "labelledby")
        ?.value.relatedNodes ?? [];
    let pieces: string | null = null;
    const label = labels.length === 1 ? labels[0] : undefined;
    if (label) {
      const read = await cdp.send("Accessibility.queryAXTree", {
        backendNodeId: label.backendDOMNodeId,
        role: "StaticText",
      });
      pieces = read.nodes
        .filter((piece) => !piece.ignored)
        .map((piece) => text(piece.name?.value))
        .join("");
    }
    return { name: text(node?.name?.value), labels: labels.length, pieces };
  } finally {
    await cdp.detach();
  }
}

// A control named by one label, the shape VoiceOver on iOS folds into the
// control (D-188): no aria-label on the control; one label element names
// it, pointing back at it with for, or wrapping it; Chrome names it from
// that one element; and the label's text pieces, joined with nothing
// between them as VoiceOver on macOS reads a title element, are the whole
// name, its space included (D-140).
export async function expectNamedByOneLabel(
  page: Page,
  id: string,
  name: string,
  wrapping = false,
): Promise<void> {
  const control = page.locator(`[id="${id}"]`);
  await expect(
    control,
    `${name}: no name on the control itself`,
  ).not.toHaveAttribute("aria-label");
  if (wrapping) {
    await expect(control).not.toHaveAttribute("aria-labelledby");
    expect(
      await control.evaluate((element) => element.closest("label") !== null),
      `${name}: inside its label`,
    ).toBe(true);
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
  const read = await chromeLabelling(page, id);
  expect(read.labels, `${name}: Chrome names it from one element`).toBe(1);
  expect(read.name, `${name}: Chrome's name is the whole name`).toBe(name);
  expect(read.pieces, `${name}: the label's pieces carry the space`).toBe(name);
}
