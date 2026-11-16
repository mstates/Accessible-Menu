import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// D-237, rule 2, held for the next writer too: a write carries what its
// page showed, and its own statement refuses when the row holds something
// else. Every .update( in app and src is read here from its syntax tree and
// must be on the list below, by the function it is in, with what its
// statement compares or why it compares nothing. A writer that says it
// compares must hand its statement to holding(), and one that says it
// compares nothing must not, so a line here cannot say more than the code
// does. A new writer fails this test until it has its line.
//
// The functions that write through the database (the order of a list, a
// move, a delete with its counts, General's save, publish) are not read
// here: each is a migration, and what each compares is in its own SQL.
const root = fileURLToPath(new URL("../../", import.meta.url));

type Entry = { table: string | null } & (
  { compares: string } | { none: string }
);

const deleted =
  "It writes deleted_at alone, and its statement names that the row is not deleted yet. The name its question showed is not compared: a rename typed in the same tab can land behind the question, and a compare would refuse that one tab (Michael, November 15, 2026).";

const writers: Record<string, Entry> = {
  "src/core/supabase/restaurants.ts updateOwnerRestaurant": {
    table: "restaurants",
    compares:
      "The twelve columns Details writes, each as the page read it, hours as the column's own text. Past the address budget a column this save leaves as it was drops out of the write and the compare together. Past that, the compare on the longest column this save changes is shed and its name logged: rule 2's one named exception.",
  },
  "src/core/supabase/menus.ts renameOwnerMenu": {
    table: "menus",
    compares: "The name the page showed.",
  },
  "src/core/supabase/sections.ts setOwnerSectionText": {
    table: "sections",
    compares: "The name or the note the page showed, a blank note as null.",
  },
  "src/core/supabase/dishes.ts renameOwnerDish": {
    table: "items",
    compares: "The name the page showed.",
  },
  "src/core/supabase/dishes.ts deleteOwnerDish": {
    table: "items",
    none: deleted,
  },
  "src/core/supabase/dishes.ts writeOwnerDishAllergens": {
    table: "items",
    compares:
      "Both allergen lists as the page showed them, or the check for an untick (D-149), and the dish's name when the same-named Apply writes onto it.",
  },
  "src/core/supabase/dishes.ts writeOwnerDishTagsPage": {
    table: "items",
    compares: "The dietary tags in their stored order, and Cooked to order.",
  },
  "src/core/supabase/dishes.ts writeOwnerDishShowing": {
    table: "items",
    compares:
      "The schedule, the available flag, and the sold out mark as the text it was read as.",
  },
  "src/core/supabase/choices.ts setOwnerChoiceListLead": {
    table: "choice_lists",
    compares: "The lead the page showed.",
  },
  "src/core/supabase/choices.ts writeOption": {
    table: "choice_options",
    compares:
      "Every column the write sets, as stored: the name, the added price in cents, or the two calorie columns.",
  },
  "src/core/supabase/choices.ts removeOwnerOption": {
    table: "choice_options",
    none: deleted,
  },
  "src/core/supabase/choices.ts writeOwnerOptionAllergens": {
    table: "choice_options",
    compares:
      "The option's name and both allergen lists as the page showed them, and the check for an untick (D-153).",
  },
  "src/features/billing/store.ts createBillingStore.update": {
    table: "restaurants",
    none: "The Stripe webhook's write, as the service role: the status and the customer id, which no owner page shows or writes.",
  },
  "src/features/owner/menu/review-token.ts reviewToken": {
    table: null,
    none: "Not a table: a hash's own update.",
  },
};

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
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

function named(node: ts.Node): string | null {
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isMethodDeclaration(node)) &&
    node.name !== undefined &&
    ts.isIdentifier(node.name)
  ) {
    return node.name.text;
  }
  // const save = async () => { ... }
  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    ts.isVariableDeclaration(node.parent) &&
    ts.isIdentifier(node.parent.name)
  ) {
    return node.parent.name.text;
  }
  return null;
}

// The named functions a node is inside, outermost first, and the outermost
// one itself: a writer's whole statement is built inside it.
function home(node: ts.Node): { path: string; outer: ts.Node | null } {
  const names: string[] = [];
  let outer: ts.Node | null = null;
  for (let at = node.parent; at !== undefined; at = at.parent) {
    const name = named(at);
    if (name === null) continue;
    names.unshift(name);
    outer = at;
  }
  return { path: names.join("."), outer };
}

function calls(node: ts.Node, name: string): boolean {
  let found = false;
  const visit = (each: ts.Node): void => {
    if (
      ts.isCallExpression(each) &&
      ts.isIdentifier(each.expression) &&
      each.expression.text === name
    ) {
      found = true;
    }
    if (!found) ts.forEachChild(each, visit);
  };
  visit(node);
  return found;
}

// The table a call chain starts from: the text handed to its .from(), when
// the chain has one.
function tableOf(node: ts.Expression): string | null {
  let at: ts.Expression = node;
  for (;;) {
    if (ts.isCallExpression(at)) {
      if (
        ts.isPropertyAccessExpression(at.expression) &&
        at.expression.name.text === "from"
      ) {
        const [table] = at.arguments;
        return table !== undefined && ts.isStringLiteral(table)
          ? table.text
          : null;
      }
      at = at.expression;
    } else if (ts.isPropertyAccessExpression(at)) {
      at = at.expression;
    } else {
      return null;
    }
  }
}

type Write = {
  where: string;
  line: string;
  method: string;
  table: string | null;
  holds: boolean;
};

function writesIn(file: string): Write[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(join(root, file), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const writes: Write[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["update", "upsert"].includes(node.expression.name.text)
    ) {
      const { path, outer } = home(node);
      const start = node.expression.name.getStart(source);
      const { line } = source.getLineAndCharacterOfPosition(start);
      writes.push({
        where: `${file} ${path}`,
        line: `${file}:${line + 1}`,
        method: node.expression.name.text,
        table: tableOf(node.expression.expression),
        holds: outer !== null && calls(outer, "holding"),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return writes;
}

const writes = ["app", "src"].flatMap(sourceFiles).flatMap(writesIn);

describe("every write names what its page showed, or says why it names nothing (D-237)", () => {
  it("finds the writers", () => {
    expect(writes.map((write) => write.where).sort()).toEqual(
      Object.keys(writers).sort(),
    );
  });

  it("finds no upsert: an upsert writes over a row and names nothing it held", () => {
    expect(writes.filter((write) => write.method === "upsert")).toEqual([]);
  });

  it.each(writes)("$line, in $where", ({ where, table, holds }) => {
    const entry = writers[where];
    expect(
      entry,
      "a new .update( needs a line in this test: what its statement compares, or why it compares nothing",
    ).toBeDefined();
    if (!entry) return;
    expect(table).toBe(entry.table);
    expect(holds).toBe("compares" in entry);
  });

  it("says something for every writer", () => {
    for (const [where, entry] of Object.entries(writers)) {
      const words = "compares" in entry ? entry.compares : entry.none;
      expect(words.length, where).toBeGreaterThan(20);
    }
  });
});
