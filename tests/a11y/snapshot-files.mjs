// The committed aria snapshot files (D-194): how one is written from the
// tree Playwright reads, and the rules every file follows. Plain Node, so
// the gate's helper (tests/a11y/aria-snapshot.ts), the local runner
// (tests/local/run.mjs), and the unit guard (tests/unit/aria-snapshots.test.ts)
// all import it.
//
// Why the file is written here and not by Playwright's matcher: its writer
// leaves out a text child that repeats the control's name (a row button's
// "Move up" under "Move up, Lunch", a field's value "Dinner" under "Menu
// name for Dinner", a legend under its group), which its default contain
// mode tolerates and deep-equal, the match the gate makes
// (playwright.config.ts), does not. So an update run takes the raw tree
// (`locator.ariaSnapshot()`, every text child in place) and writes it
// through snapshotFromRaw, using Playwright's own exported renderer for
// what it does to text on a write (ids and numbers of two or more digits
// become patterns, single digits and words stay literal) and for quoting,
// then these rules:
//
// 1. No /url line. Playwright writes every link's href literally; the
//    stand-in's code and ids differ from CI Diner's, and a template with no
//    url matches any href (tests/a11y/aria-snapshot.ts). A link left with
//    nothing under it is written as a leaf, without the colon.
// 2. A date in words, "October 4, 2026", reads /\w+ \d+, \d+/. Playwright
//    leaves the month and a single-digit day literal. Carries "Published on
//    {date}" (owner.publishing) and "Checked by you on {date}" and "Checked
//    on {date}" (owner.dish.allergens): the stand-in's dates are its fake
//    clock's, CI Diner's are the days its data file published and checked,
//    and a later run of the file in another month must not break the files.
// 3. "Signed in as {email}" (owner.signedInAs): the address reads /\S+/.
//    The stand-in's owner is owner@example.test; CI's is Michael's alias,
//    which never enters the repository.
// 4. "Menu link {url}" (owner.restaurants.menuLink): the url reads /\S+/.
//    Locally it is http://localhost:3000 and the stand-in's code; on a
//    preview it is https:// and VERCEL_URL, new on every deployment.
// 5. The dish page's schedule sentence (owner.dish.schedule): what follows
//    the quoted "Diners read" sentence reads
//    /(Shows now, [^.]+|Next shows [^.]+)\./, so "Shows now, until 9 pm."
//    and "Next shows Saturday, October 31." both match, whatever the clock
//    and the date say.
//
// normalizeSnapshot applies the rules to a file as it stands; a written
// file is its own fixed point, which the unit guard holds, so a file edited
// by hand or written another way fails npm test before it fails on CI.
import { createRequire } from "node:module";
import { join } from "node:path";

// Paths resolve from the working directory, the repository's root, where
// every runner starts (the gate's config reads .env.local from it):
// Playwright's loader reads this file as CommonJS, where import.meta is a
// syntax error.
const root = process.cwd();

// Playwright's renderer and quoting, from the installed package. Not a
// public API: if an upgrade moves it, the import fails here first.
const require = createRequire(join(root, "package.json"));
const { iso } = require("playwright-core/lib/coreBundle");

export const SNAPSHOT_DIR = join(root, "tests", "a11y", "snapshots");

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";

// Each rule rewrites a pattern's body: the text between the slashes, with
// its literal parts escaped as Playwright escapes them, so a day Playwright
// left literal and a year it wrote as \d+ are both read.
const RULES = [
  {
    find: new RegExp(
      `(?:${MONTHS}) (?:\\d{1,2}|\\\\d\\+), (?:\\d{4}|\\\\d\\+)`,
      "g",
    ),
    replace: "\\w+ \\d+, \\d+",
  },
  { find: /Signed in as \S+/g, replace: "Signed in as \\S+" },
  { find: /Menu link \S+/g, replace: "Menu link \\S+" },
  {
    find: /(?<=" )(?:Shows now, |Next shows )[^()]*\\\.$/,
    replace: "(Shows now, [^.]+|Next shows [^.]+)\\.",
  },
];

// Playwright's escaping of a literal inside a pattern.
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const isPattern = (text) =>
  text.length > 1 && text.startsWith("/") && text.endsWith("/");

// A value as Playwright writes it on a write: ids and numbers become a
// pattern, or the text stays as it is.
function playwrightPattern(text) {
  const line = iso.renderAriaSnapshotAsYaml([{ role: "text", text }], {
    convertStringsToRegex: true,
  });
  return unquote(line.replace(/^- text: /, ""));
}

// A double-quoted YAML value back to its text (Playwright's own escaping).
function unquote(value) {
  if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) {
    return value;
  }
  return value.slice(1, -1).replace(/\\(x[0-9a-fA-F]{2}|.)/g, (whole, c) => {
    switch (c) {
      case "\\":
        return "\\";
      case '"':
        return '"';
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      default:
        return c.startsWith("x")
          ? String.fromCharCode(parseInt(c.slice(1), 16))
          : whole;
    }
  });
}

// A single-quoted YAML key back to its text, a quote doubled inside it.
function unquoteKey(key) {
  if (key.length < 2 || !key.startsWith("'") || !key.endsWith("'")) {
    return key;
  }
  return key.slice(1, -1).replace(/''/g, "'");
}

// A line's key and value after "- ": the key may be single-quoted, with a
// quote doubled inside it; the value follows ": ".
function splitLine(rest) {
  let keyEnd;
  if (rest.startsWith("'")) {
    let at = 1;
    while (at < rest.length) {
      if (rest[at] === "'" && rest[at + 1] === "'") {
        at += 2;
        continue;
      }
      if (rest[at] === "'") break;
      at += 1;
    }
    keyEnd = at + 1;
  } else {
    const colon = rest.indexOf(": ");
    keyEnd = colon === -1 ? rest.length : colon;
  }
  const key = rest.slice(0, keyEnd);
  const tail = rest.slice(keyEnd);
  if (tail.startsWith(": ")) return { key, value: tail.slice(2) };
  return { key, value: null };
}

// A key's role, its name as Playwright wrote it (a JSON string or a
// pattern), and what follows the name.
function splitKey(key) {
  const space = key.indexOf(" ");
  if (space === -1) return { role: key, name: null, rest: "" };
  const role = key.slice(0, space);
  const after = key.slice(space + 1);
  if (after.startsWith('"')) {
    let end = 1;
    while (end < after.length && after[end] !== '"') {
      end += after[end] === "\\" ? 2 : 1;
    }
    return {
      role,
      name: JSON.parse(after.slice(0, end + 1)),
      rest: after.slice(end + 1),
    };
  }
  if (after.startsWith("/")) {
    const end = after.indexOf("/", 1);
    return { role, name: after.slice(0, end + 1), rest: after.slice(end + 1) };
  }
  return { role, name: null, rest: ` ${after}` };
}

// The rules on a value: unchanged when none touched it, a pattern
// otherwise.
function rewrite(raw) {
  const before = isPattern(raw)
    ? raw.slice(1, -1)
    : new RegExp(escapeRegExp(raw)).source;
  let body = before;
  for (const rule of RULES) body = body.replace(rule.find, rule.replace);
  return body === before ? raw : `/${body}/`;
}

function withoutBareColons(lines) {
  const indentOf = (line) => /^\s*/.exec(line)[0].length;
  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at];
    if (!line.endsWith(":")) continue;
    const next = lines[at + 1];
    if (next === undefined || indentOf(next) <= indentOf(line)) {
      lines[at] = line.slice(0, -1);
    }
  }
  return lines;
}

// A file from the raw tree: url lines gone, every name and value through
// Playwright's write-time patterns, then the rules, quoted as Playwright
// quotes.
export function snapshotFromRaw(raw) {
  const out = [];
  for (const line of raw.split("\n")) {
    const match = /^(\s*- )(.*)$/.exec(line);
    if (!match) {
      if (line.trim() !== "") out.push(line);
      continue;
    }
    const [, lead, rest] = match;
    if (rest.startsWith("/url:")) continue;
    const { key: keyWithColon, value } = splitLine(rest);
    // A key with children ends in a colon, outside the key itself.
    const opens = value === null && keyWithColon.endsWith(":");
    const key = opens ? keyWithColon.slice(0, -1) : keyWithColon;
    let written = key;
    if (!key.startsWith("/") && key !== "text") {
      const { role, name, rest: tail } = splitKey(unquoteKey(key));
      if (typeof name === "string" && !isPattern(name)) {
        const pattern = playwrightPattern(name);
        const shown = isPattern(pattern) ? pattern : JSON.stringify(name);
        written = iso.yamlEscapeKeyIfNeeded(`${role} ${shown}${tail}`);
      }
    }
    if (value === null) {
      out.push(`${lead}${written}${opens ? ":" : ""}`);
      continue;
    }
    if (value === "" || key.startsWith("/")) {
      out.push(`${lead}${written}: ${value}`);
      continue;
    }
    const text = rewrite(playwrightPattern(unquote(value)));
    out.push(`${lead}${written}: ${iso.yamlEscapeValueIfNeeded(text)}`);
  }
  return `${withoutBareColons(out).join("\n")}\n`;
}

// A file as it stands, through the rules: what the guard holds every
// committed file to, and what a hand-edited file fails.
export function normalizeSnapshot(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const match = /^(\s*- )(.*)$/.exec(line);
    if (!match) {
      if (line.trim() !== "") out.push(line);
      continue;
    }
    const [, lead, rest] = match;
    if (rest.startsWith("/url:")) continue;
    const { key, value } = splitLine(rest);
    if (value === null || value === "" || key.startsWith("/")) {
      out.push(line);
      continue;
    }
    const raw = unquote(value);
    const next = rewrite(raw);
    out.push(
      next === raw
        ? line
        : `${lead}${key}: ${iso.yamlEscapeValueIfNeeded(next)}`,
    );
  }
  return `${withoutBareColons(out).join("\n")}\n`;
}
