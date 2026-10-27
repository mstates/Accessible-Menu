import { expect, type Page } from "@playwright/test";
import { expectLabelShape, type LabelOptions } from "../a11y/label-shape";

const text = (value: unknown) => (typeof value === "string" ? value : "");

// The name Chrome itself gives one element, found by its id, read through
// the DevTools Protocol's Accessibility domain (D-140, D-142). What a
// screen reader is handed, not what Playwright computes.
export async function chromeName(page: Page, id: string): Promise<string> {
  return (await chromeLabelling(page, id)).name;
}

type Labelling = {
  name: string;
  labels: number;
  // The one labelling element's StaticText pieces, one by one, and joined
  // with nothing between them, which is what VoiceOver on macOS reads from
  // a title element (D-140, D-142); null when no one element labels it.
  list: string[] | null;
  pieces: string | null;
};

// Chrome's reading of one control, by its id: its computed name, how many
// elements label it, and, when exactly one does, that element's pieces.
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
    let list: string[] | null = null;
    const label = labels.length === 1 ? labels[0] : undefined;
    if (label) {
      const read = await cdp.send("Accessibility.queryAXTree", {
        backendNodeId: label.backendDOMNodeId,
        role: "StaticText",
      });
      list = read.nodes
        .filter((piece) => !piece.ignored)
        .map((piece) => text(piece.name?.value));
    }
    return {
      name: text(node?.name?.value),
      labels: labels.length,
      list,
      pieces: list === null ? null : list.join(""),
    };
  } finally {
    await cdp.detach();
  }
}

// A control named by one label, the shape VoiceOver on iOS folds into the
// control (D-188, D-193): the label's shape as the page holds it
// (expectLabelShape), then Chrome's own reading. Chrome names the control
// from that one element, its name is the whole name, and the element is
// exactly one piece of text in Chrome's tree, the whole name, with the
// visible words left out of it when they are hidden from assistive
// technology.
export async function expectNamedByOneLabel(
  page: Page,
  id: string,
  name: string,
  options: LabelOptions = {},
): Promise<void> {
  await expectLabelShape(page, id, name, options);
  const read = await chromeLabelling(page, id);
  expect(read.labels, `${name}: Chrome names it from one element`).toBe(1);
  expect(read.name, `${name}: Chrome's name is the whole name`).toBe(name);
  expect(
    read.list,
    `${name}: one piece in Chrome's tree, the whole name`,
  ).toEqual([name]);
}
