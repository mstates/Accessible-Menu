import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const tokensFile = "src/ui/tokens.css";
const css = readFileSync(join(root, tokensFile), "utf8");

type Palette = Record<string, string>;

function parseDeclarations(block: string): Palette {
  const palette: Palette = {};
  for (const match of block.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name && value) palette[name] = value.trim();
  }
  return palette;
}

const darkMatch = css.match(
  /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/,
);
const withoutDark = darkMatch ? css.replace(darkMatch[0], "") : css;
const lightMatch = withoutDark.match(/:root\s*\{([^}]*)\}/);

const schemes: Record<string, Palette> = {
  light: parseDeclarations(lightMatch?.[1] ?? ""),
  dark: parseDeclarations(darkMatch?.[1] ?? ""),
};

const names = Object.keys(schemes.light ?? {});

const isBackground = (name: string) =>
  name === "background" || name.startsWith("background-");
const isText = (name: string) =>
  name === "foreground" ||
  name.startsWith("foreground-") ||
  name === "link" ||
  name.startsWith("link-");
const nonText = ["focus", "border"];

const TEXT_MINIMUM = 4.5;
const NON_TEXT_MINIMUM = 3;

function channel(hex: string, offset: number): number {
  const linear = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return linear <= 0.04045 ? linear / 12.92 : ((linear + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return (
    0.2126 * channel(hex, 1) +
    0.7152 * channel(hex, 3) +
    0.0722 * channel(hex, 5)
  );
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

function value(palette: Palette, name: string): string {
  const found = palette[name];
  if (!found) throw new Error(`token ${name} is missing`);
  return found;
}

describe("design tokens", () => {
  it("declares at least one background and one text color", () => {
    expect(names.some(isBackground)).toBe(true);
    expect(names.some(isText)).toBe(true);
  });

  it("declares the same token names in light and dark", () => {
    expect(Object.keys(schemes.dark ?? {}).sort()).toEqual([...names].sort());
  });

  it("classifies every color as background, text, or non-text", () => {
    const unclassified = names.filter(
      (name) => !isBackground(name) && !isText(name) && !nonText.includes(name),
    );
    expect(unclassified).toEqual([]);
  });

  for (const [scheme, palette] of Object.entries(schemes)) {
    describe(`${scheme} scheme`, () => {
      it.each(names)("%s is a six-digit hex color", (name) => {
        expect(value(palette, name)).toMatch(/^#[0-9a-f]{6}$/);
      });

      const backgrounds = names.filter(isBackground);
      const texts = names.filter(isText);
      const textPairs = texts.flatMap((text) =>
        backgrounds.map((background) => [text, background] as const),
      );
      it.each(textPairs)(
        `%s on %s is at least ${TEXT_MINIMUM}:1`,
        (text, background) => {
          const ratio = contrast(
            value(palette, text),
            value(palette, background),
          );
          expect(
            ratio,
            `${text} on ${background} is ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(TEXT_MINIMUM);
        },
      );

      const nonTextPairs = nonText.flatMap((name) =>
        backgrounds.map((background) => [name, background] as const),
      );
      it.each(nonTextPairs)(
        `%s on %s is at least ${NON_TEXT_MINIMUM}:1`,
        (name, background) => {
          const ratio = contrast(
            value(palette, name),
            value(palette, background),
          );
          expect(
            ratio,
            `${name} on ${background} is ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(NON_TEXT_MINIMUM);
        },
      );
    });
  }
});

function cssFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)));
}

describe("no italics in styles (D-39)", () => {
  const files = [...cssFiles("app"), ...cssFiles("src")];

  it("finds the token file", () => {
    expect(files).toContain(tokensFile);
  });

  it.each(files)("%s sets no italic or oblique font style", (file) => {
    const source = readFileSync(join(root, file), "utf8");
    expect(source).not.toMatch(/font-style\s*:\s*(italic|oblique)/i);
  });

  it("tokens carry no italic anywhere outside comments", () => {
    const declarations = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(declarations).not.toMatch(/italic|oblique/i);
  });
});
