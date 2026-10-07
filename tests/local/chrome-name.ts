import type { Page } from "@playwright/test";

// The name Chrome itself gives one element, found by its id, read through
// the DevTools Protocol's Accessibility domain (D-140, D-142). What a
// screen reader is handed, not what Playwright computes.
export async function chromeName(page: Page, id: string): Promise<string> {
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
    const value: unknown = nodes[0]?.name?.value;
    return typeof value === "string" ? value : "";
  } finally {
    await cdp.detach();
  }
}
