import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Checkbox } from "../../src/ui/CheckboxGroup";
import { ComboBox, suggestionItems } from "../../src/ui/ComboBox";
import { OneNode } from "../../src/ui/OneNode";
import { Select } from "../../src/ui/Select";
import { TextField } from "../../src/ui/TextField";

// The one-node label (D-193). VoiceOver on iOS folds a label into its
// control only when the label's accessible text is one text node, so a
// field named with words beyond its visible ones is named by one label
// holding the whole name as a single clipped text node, with the visible
// words inside the same label hidden from assistive technology. The guard:
// the retired primitive is gone, the node renders as the hearing had it,
// and each of the four primitives with a suffix renders a label of exactly
// one text node, the whole name, with its visible words the start of that
// name (or the end, after a Select's value), as the page renders them.

const root = fileURLToPath(new URL("../../", import.meta.url));
const thisFile = "tests/unit/one-node.test.ts";
const retired = "Hidden" + "Words";
const primitives = [
  "src/ui/TextField.tsx",
  "src/ui/ComboBox.tsx",
  "src/ui/Select.tsx",
  "src/ui/CheckboxGroup.tsx",
];

function sourceFiles(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx", ".mjs"].includes(extname(entry.name)) ? [path] : [];
  });
}

const files = [
  ...sourceFiles("app"),
  ...sourceFiles("src"),
  ...sourceFiles("tests"),
]
  .map((file) => relative(root, join(root, file)))
  .filter((file) => file !== thisFile);

// The label in some markup: the texts of its aria-hidden spans (a drawn
// mark's svg taken out first, so the box's span reads as empty), the
// markup left once those spans are out, and the text of that remainder.
function readLabel(html: string) {
  const label = /<label\b[^>]*>([\s\S]*?)<\/label>/.exec(html)?.[1];
  if (label === undefined) throw new Error("no label in the markup");
  const hidden: string[] = [];
  const rest = label
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(
      /<span aria-hidden="true"[^>]*>([^<]*)<\/span>/g,
      (_, text: string) => {
        if (text !== "") hidden.push(text);
        return "";
      },
    );
  return { hidden, rest, text: rest.replace(/<[^>]+>/g, "") };
}

const clipped = (whole: string) => `<span class="sr-only">${whole}</span>`;

function expectOneNode(
  html: string,
  {
    visible,
    whole,
    required = false,
  }: { visible: string; whole: string; required?: boolean },
) {
  const label = readLabel(html);
  expect(
    label.hidden,
    "the visible words, hidden from assistive technology",
  ).toEqual(required ? [visible, " *"] : [visible]);
  expect(label.text, "one text node, the whole name").toBe(whole);
  expect(label.rest, "the whole name in one clipped span").toContain(
    clipped(whole),
  );
  expect(label.rest.match(/sr-only/g), "one clipped span").toHaveLength(1);
}

describe("the one-node label (D-193)", () => {
  it("renders the visible words hidden from assistive technology and the whole name as one clipped node, nothing else", () => {
    expect(
      renderToStaticMarkup(
        createElement(OneNode, {
          visible: "Menu name",
          whole: "Menu name for Dinner",
        }),
      ),
    ).toBe(
      '<span aria-hidden="true" class="min-w-0">Menu name</span><span class="sr-only">Menu name for Dinner</span>',
    );
  });

  it("a text field with a suffix is named by one label holding the whole name as one node", () => {
    const html = renderToStaticMarkup(
      createElement(TextField, {
        id: "field",
        label: "Menu name",
        labelSuffix: "for Dinner",
        defaultValue: "Dinner",
      }),
    );
    expectOneNode(html, {
      visible: "Menu name",
      whole: "Menu name for Dinner",
    });
    expect(html).toContain('for="field"');
  });

  it("a text field with no suffix keeps its label as the visible words alone", () => {
    const label = readLabel(
      renderToStaticMarkup(
        createElement(TextField, {
          id: "name",
          label: "Restaurant name",
          isRequired: true,
        }),
      ),
    );
    expect(label.hidden).toEqual([" *"]);
    expect(label.text).toBe("Restaurant name");
    expect(label.rest).not.toContain("sr-only");
  });

  it("a combo box with a suffix is named by one label holding the whole name as one node", () => {
    const html = renderToStaticMarkup(
      createElement(ComboBox, {
        id: "size",
        label: "Size name",
        labelSuffix: "for Cup",
        buttonLabel: "Show size names for Cup",
        items: suggestionItems(["Cup", "Bowl"]),
        value: "Cup",
        onChange: () => {},
      }),
    );
    expectOneNode(html, { visible: "Size name", whole: "Size name for Cup" });
    expect(html).toContain('for="size"');
  });

  it("a checkbox with a suffix is named by its wrapping label holding the whole name as one node, beside the drawn box", () => {
    // A suffixed box types its visible words as its children, a string.
    const props: Parameters<typeof Checkbox>[0] = {
      id: "box",
      labelSuffix: "on Monday",
      children: "Open 24 hours",
    };
    const html = renderToStaticMarkup(createElement(Checkbox, props));
    expectOneNode(html, {
      visible: "Open 24 hours",
      whole: "Open 24 hours on Monday",
    });
    expect(html).toMatch(/<label\b[^>]*>[\s\S]*<svg[\s\S]*<\/label>/);
  });

  it("a select is named by one label holding its value then its visible words as one node", () => {
    const html = renderToStaticMarkup(
      createElement(Select, {
        triggerId: "state",
        label: "State",
        items: [
          { id: "PA", label: "Pennsylvania" },
          { id: "NJ", label: "New Jersey" },
        ],
        defaultSelectedKey: "PA",
        isRequired: true,
      }),
    );
    expectOneNode(html, {
      visible: "State",
      whole: "Pennsylvania State",
      required: true,
    });
    expect(html).toContain('for="state"');
  });

  it("the retired primitive is gone, and the four primitives take the one node and hide nothing on their own", () => {
    expect(existsSync(join(root, "src/ui", `${retired}.tsx`))).toBe(false);
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source, `${file} names the retired primitive`).not.toContain(
        retired,
      );
    }
    for (const file of primitives) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source, `${file} takes the one node`).toContain(
        'from "./OneNode"',
      );
      expect(source, `${file} hides text on its own`).not.toMatch(
        /sr-only|size-0|fontSize: 0|font-size: 0/,
      );
    }
  });
});
