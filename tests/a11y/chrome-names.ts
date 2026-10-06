import { expect, type Page } from "@playwright/test";

// The names Chrome itself gives a page's links, buttons, and fields, read
// through the DevTools Protocol and held against the names Playwright
// computes (D-140, D-142). Playwright computes names on its own, so its
// checks can pass while Chrome tells a screen reader something else. Not a
// spec: pageChecks in checks.ts runs it on every page the gate visits, in
// Chromium only, since only Chromium speaks the protocol.
//
// Two readings for every control:
//
// The name. Chrome's computed name must be Playwright's, with runs of
// white space read as one space.
//
// The label's pieces. When Chrome names a control from exactly one other
// element, a label, it hands that element to VoiceOver on macOS, and
// VoiceOver reads the element's own pieces of text joined with nothing
// between them. A visually hidden span takes its first space out of the
// pieces, so "Menu name" and " for Dinner" were heard as "Menu namefor
// Dinner" in Michael's sitting, while Chrome's computed name, and
// Playwright's, said "Menu name for Dinner" (D-140). This reading joins the
// pieces the same way and holds them against Playwright's name. It is a
// model of what was heard in that sitting, not a documented rule. A name
// set whole on the control itself, with aria-label, has no pieces to read.

type Reading = "name" | "label pieces";

export type Allowed = {
  // The page, by its path and query.
  path: RegExp;
  role: string;
  reading: Reading;
  // What Chrome gives: its computed name, or the label's pieces joined.
  chrome: string;
  // What Playwright computes.
  playwright: string;
  // Why this difference is not one a reader hears. Every entry has one.
  reason: string;
};

// Differences that are known and harmless, each with its reason.
export const ALLOWED: readonly Allowed[] = [];

// The roles a link, a button, or a form control takes in Chrome's tree.
const CONTROLS = new Set([
  "link",
  "button",
  "textbox",
  "searchbox",
  "checkbox",
  "radio",
  "switch",
  "combobox",
  "ComboBoxSelect",
  "listbox",
  "spinbutton",
  "slider",
  "tab",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
]);

type Related = { backendDOMNodeId: number };
type AXNode = {
  ignored: boolean;
  role?: { value?: unknown };
  name?: { value?: unknown };
  properties?: { name: string; value: { relatedNodes?: Related[] } }[];
  backendDOMNodeId?: number;
};

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

const text = (value: unknown) => (typeof value === "string" ? value : "");

// Playwright's name for one element, from the first line of its aria
// snapshot: `- role "name"`, the name written as a JSON string, the whole
// key in single quotes when YAML needs them. Null when the element is not
// in Playwright's tree at all.
function snapshotName(snapshot: string): string | null {
  let key = (snapshot.split("\n")[0] ?? "").replace(/^- /, "");
  if (key === "") return null;
  if (key.startsWith("'")) {
    let inner = "";
    for (let at = 1; at < key.length; at += 1) {
      if (key[at] === "'" && key[at + 1] === "'") {
        inner += "'";
        at += 1;
      } else if (key[at] === "'") {
        break;
      } else {
        inner += key[at];
      }
    }
    key = inner;
  }
  const space = key.indexOf(" ");
  if (space === -1 || key[space + 1] !== '"') return "";
  let end = space + 2;
  while (end < key.length && key[end] !== '"') {
    end += key[end] === "\\" ? 2 : 1;
  }
  return JSON.parse(key.slice(space + 1, end + 1)) as string;
}

function allowed(
  path: string,
  role: string,
  reading: Reading,
  chrome: string,
  playwright: string,
): boolean {
  return ALLOWED.some(
    (entry) =>
      entry.path.test(path) &&
      entry.role === role &&
      entry.reading === reading &&
      collapse(entry.chrome) === chrome &&
      collapse(entry.playwright) === playwright,
  );
}

// Marks a control so Playwright can find the element Chrome named, unless
// it sits inside Vercel's toolbar on a preview, which is not our page.
const MARK = `function (key) {
  let root = this.getRootNode();
  while (root instanceof ShadowRoot) {
    if (root.host.tagName.toLowerCase().startsWith("vercel-")) return false;
    root = root.host.getRootNode();
  }
  this.setAttribute("data-name-sweep", key);
  return true;
}`;

export async function expectChromeNamesAgree(page: Page): Promise<void> {
  const url = new URL(page.url());
  const path = `${url.pathname}${url.search}`;
  const cdp = await page.context().newCDPSession(page);
  const problems: string[] = [];
  let read = 0;
  try {
    const { nodes } = (await cdp.send("Accessibility.getFullAXTree")) as {
      nodes: AXNode[];
    };
    for (const node of nodes) {
      const role = text(node.role?.value);
      if (node.ignored || !CONTROLS.has(role) || !node.backendDOMNodeId) {
        continue;
      }
      const { object } = await cdp.send("DOM.resolveNode", {
        backendNodeId: node.backendDOMNodeId,
      });
      if (!object.objectId) continue;
      const key = String(read);
      const marked = await cdp.send("Runtime.callFunctionOn", {
        objectId: object.objectId,
        functionDeclaration: MARK,
        arguments: [{ value: key }],
        returnByValue: true,
      });
      if (marked.result.value !== true) continue;
      read += 1;

      const theirs = snapshotName(
        await page.locator(`[data-name-sweep="${key}"]`).ariaSnapshot(),
      );
      const chrome = collapse(text(node.name?.value));
      const playwright = theirs === null ? null : collapse(theirs);
      const report = (reading: Reading, given: string) => {
        if (playwright !== null && given === playwright) return;
        if (
          playwright !== null &&
          allowed(path, role, reading, given, playwright)
        ) {
          return;
        }
        const what =
          reading === "name"
            ? `Chrome names it "${given}"`
            : `named from one label, whose pieces read "${given}"`;
        const against =
          playwright === null
            ? "Playwright leaves it out of its tree"
            : `Playwright names it "${playwright}"`;
        problems.push(`${role}: ${what}, ${against}`);
      };

      report("name", chrome);

      const labels =
        node.properties?.find((property) => property.name === "labelledby")
          ?.value.relatedNodes ?? [];
      const label = labels.length === 1 ? labels[0] : undefined;
      if (label) {
        const pieces = (await cdp.send("Accessibility.queryAXTree", {
          backendNodeId: label.backendDOMNodeId,
          role: "StaticText",
        })) as { nodes: AXNode[] };
        const shown = pieces.nodes
          .filter((piece) => !piece.ignored)
          .map((piece) => text(piece.name?.value));
        // A label with no text of its own in the tree, one that is hidden,
        // is not handed over to be read in pieces.
        if (shown.length > 0) report("label pieces", collapse(shown.join("")));
      }
    }
  } finally {
    await cdp.detach();
  }
  expect(read, `${path} has links, buttons, or fields to read`).toBeGreaterThan(
    0,
  );
  expect(
    problems,
    `${path}: where Chrome and Playwright differ\n${problems.join("\n")}`,
  ).toEqual([]);
}
