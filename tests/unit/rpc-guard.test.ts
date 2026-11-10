import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// D-199: postgrest-js retries a GET and never a POST, and an rpc goes as POST
// unless it is called with get: true. So the functions that only read go as
// GET, under the library's own retry, and every function that writes stays
// POST, since a retried write could land twice. A function joins this list
// only if it is declared stable: a GET runs in a read-only transaction.
const root = fileURLToPath(new URL("../../", import.meta.url));
const reads = [
  "menu_publish_states",
  "menu_snapshot",
  "publish_problems",
  "restaurant_name_by_code",
  "section_dish_counts",
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
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

type Call = { where: string; name: string | null; get: boolean };

// Every .rpc() in a file, from its syntax tree, since prettier breaks these
// calls across lines in more than one way.
function rpcCalls(file: string): Call[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(join(root, file), "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const calls: Call[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "rpc"
    ) {
      const [name, , options] = node.arguments;
      const start = node.expression.name.getStart(source);
      const { line } = source.getLineAndCharacterOfPosition(start);
      calls.push({
        where: `${file}:${line + 1}`,
        name: name !== undefined && ts.isStringLiteral(name) ? name.text : null,
        get:
          options !== undefined &&
          ts.isObjectLiteralExpression(options) &&
          options.properties.some(
            (property) =>
              ts.isPropertyAssignment(property) &&
              ts.isIdentifier(property.name) &&
              property.name.text === "get" &&
              property.initializer.kind === ts.SyntaxKind.TrueKeyword,
          ),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

const calls = ["app", "src", "tests"].flatMap(sourceFiles).flatMap(rpcCalls);

describe("the read-only functions go as GET (D-199)", () => {
  it("finds every read and a write to check", () => {
    expect(calls.map((call) => call.name)).toEqual(
      expect.arrayContaining([...reads, "publish_menu"]),
    );
  });

  it.each(calls)("$where calls $name", ({ name, get }) => {
    expect(name, "an rpc names its function in the call").not.toBeNull();
    expect(get).toBe(reads.includes(name ?? ""));
  });
});
