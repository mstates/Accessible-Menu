import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The checkbox and the radio in React Aria Components' documented field
// shape (D-206): CheckboxField around CheckboxButton and RadioField around
// RadioButton, each hint in the field's description slot, so React Aria
// ties it by id and its words stay out of the control's name. Plain
// Checkbox and Radio are deprecated in react-aria-components 1.22.1 and
// carry no slot, so nothing under app or src imports them or their props.
const root = fileURLToPath(new URL("../../", import.meta.url));
const checkbox = "src/ui/CheckboxGroup.tsx";
const radio = "src/ui/RadioGroup.tsx";
const deprecated = ["Checkbox", "Radio", "CheckboxProps", "RadioProps"];

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(path);
      return [".ts", ".tsx", ".mjs"].includes(extname(entry.name))
        ? [path]
        : [];
    },
  );
}

const read = (file: string) => readFileSync(join(root, file), "utf8");

// The names a source takes from react-aria-components, or any of its
// entry points, by import or re-export: each the library's own name, the
// part before any "as", with "type" taken off.
function namesFromLibrary(source: string): string[] {
  const statement =
    /\b(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']react-aria-components(?:\/[\w-]+)?["']/g;
  return [...source.matchAll(statement)].flatMap((match) =>
    (match[1] ?? "")
      .split(",")
      .map((name) =>
        name
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)[0]
          ?.trim(),
      )
      .filter((name): name is string => Boolean(name)),
  );
}

describe("Checkbox and Radio in React Aria's field shape (D-206)", () => {
  it("reads the library's own name through an alias, a type, and an entry point", () => {
    expect(
      namesFromLibrary(
        [
          "import {",
          "  Checkbox as AriaCheckbox,",
          "  type CheckboxProps,",
          '} from "react-aria-components";',
          'import type { RadioProps } from "react-aria-components/RadioGroup";',
          'import { Checkbox } from "./CheckboxGroup";',
        ].join("\n"),
      ),
    ).toEqual(["Checkbox", "CheckboxProps", "RadioProps"]);
  });

  it("never takes the deprecated Checkbox or Radio, or their props", () => {
    const files = [...sourceFiles("app"), ...sourceFiles("src")];
    expect(files.length).toBeGreaterThan(10);
    const taking = files.filter(
      (file) => namesFromLibrary(read(file)).length > 0,
    );
    expect(taking.length, "files that import React Aria").toBeGreaterThan(5);
    expect(
      taking.flatMap((file) =>
        namesFromLibrary(read(file))
          .filter((name) => deprecated.includes(name))
          .map((name) => `${file}: ${name}`),
      ),
    ).toEqual([]);
  });

  it("builds the checkbox on CheckboxField and CheckboxButton", () => {
    expect(namesFromLibrary(read(checkbox))).toEqual(
      expect.arrayContaining(["CheckboxField", "CheckboxButton"]),
    );
  });

  it("builds the radio on RadioField and RadioButton", () => {
    expect(namesFromLibrary(read(radio))).toEqual(
      expect.arrayContaining(["RadioField", "RadioButton"]),
    );
  });
});
