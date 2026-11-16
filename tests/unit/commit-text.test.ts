import { describe, expect, it, vi } from "vitest";
import { en } from "../../src/copy";
import {
  heldAfterLanding,
  heldAtFirstKey,
  released,
  settled,
  type Holds,
  type ShownValue,
} from "../../src/features/owner/editing/shown";
import {
  commitText,
  textOf,
  type ListResult,
  type TextHome,
} from "../../src/features/owner/editing/texts";
import type { Editing } from "../../src/features/owner/editing/useEditing";

// What a text's save hands back (D-237, rule 2), on the path every text on
// a page that saves as the owner goes takes (texts.ts), with the page's
// editing state stood in by the same pure rules it keeps (shown.ts). The
// value handed back is the field's hold, recorded at its first keystroke
// and read when the save is sent; a commit that finds no hold hands back
// what its own render showed, so no save is ever sent with nothing to
// compare.

type Field = "name" | "price";
type Sent = { field: Field; value: string; shown: ShownValue };

// The page's editing state, as much of it as a text's commit reads and
// writes. Saves run one after another, as the page's queue runs them.
function editingState() {
  const live = {
    drafts: {} as Record<string, string>,
    sent: {} as Record<string, string>,
    failures: {} as Record<string, { value: string }>,
    shown: {} as Holds,
  };
  let queue = Promise.resolve();
  const failField = vi.fn((key: string, failure: { value: string }) => {
    live.failures[key] = failure;
  });
  const editing = {
    get drafts() {
      return live.drafts;
    },
    get failures() {
      return live.failures;
    },
    peek: () => live,
    type: (key: string, value: string) => {
      live.drafts = { ...live.drafts, [key]: value };
    },
    hold: (key: string, shown: ShownValue, text: string) => {
      live.shown = heldAtFirstKey(live.shown, key, { shown, text });
    },
    landedShown: (key: string, shown: ShownValue, text: string) => {
      live.shown = heldAfterLanding(live.shown, key, { shown, text });
    },
    settle: () => {
      live.shown = settled(live.shown, live.drafts);
    },
    reset: (key: string) => {
      const { [key]: gone, ...drafts } = live.drafts;
      void gone;
      live.drafts = drafts;
      live.shown = released(live.shown, key);
    },
    sending: (key: string, value: string) => {
      live.sent = { ...live.sent, [key]: value };
    },
    answered: (key: string) => {
      const { [key]: gone, ...sent } = live.sent;
      void gone;
      live.sent = sent;
    },
    landedField: (key: string, typed: string | null) => {
      if (live.drafts[key] !== typed) return;
      const { [key]: gone, ...drafts } = live.drafts;
      void gone;
      live.drafts = drafts;
    },
    failField,
    run: (work: () => Promise<void>) => {
      queue = queue.then(work);
      return queue;
    },
    call: <Result>(action: () => Promise<Result>) => action(),
  };
  return {
    editing: editing as unknown as Editing,
    live,
    failField,
    idle: () => queue,
  };
}

// A row's texts as one render shows them: the name, and a price whose
// field shows dollars while the row holds cents.
function home(
  row: { name: string; price: string; cents: number | null },
  sent: Sent[],
  answer: (each: Sent) => ListResult<Record<Field, string>> = (each) => ({
    ok: true,
    value: { name: row.name, price: row.price, [each.field]: each.value },
  }),
): TextHome<Field> {
  return {
    row: { id: "row", name: row.name },
    words: {
      noun: "menu",
      strings: { errors: en.owner.menus.errors },
      editing: en.owner.editing,
      rules: {},
      fields: {
        name: { label: "Name", suffix: "", notSaved: "Name was not saved." },
        price: { label: "Price", suffix: "", notSaved: "Price not saved." },
      },
    },
    key: (field) => `row:${field}`,
    id: (field) => `row-${field}`,
    saved: (field) => row[field],
    shown: (field) => (field === "price" ? row.cents : row.name),
    clean: (_field, value) => value.trim(),
    rule: () => null,
    taken: () => null,
    send: async (field, value, shown) => {
      const each = { field, value, shown };
      sent.push(each);
      return answer(each);
    },
    shownIn: (field, value) =>
      field === "price" ? Math.round(Number(value.price) * 100) : value.name,
  };
}

const soup = { name: "Soup", price: "", cents: null };
// The same row after a refresh brought another tab's values.
const renamed = { name: "Bisque", price: "2.00", cents: 200 };

describe("what a text's save hands back (D-237)", () => {
  it("hands back the value the field showed at its first keystroke, not the newer one a refresh put under the typed text", async () => {
    const sent: Sent[] = [];
    const state = editingState();
    textOf(state.editing, home(soup, sent), "name").onChange("Soup of the day");
    // The refresh arrives; the typed text covers the other tab's name.
    state.editing.settle();
    const now = textOf(state.editing, home(renamed, sent), "name");
    expect(now.value).toBe("Soup of the day");
    now.onChange("Soup of the day!");
    now.onCommit();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      field: "name",
      value: "Soup of the day!",
      shown: "Soup",
    });
  });

  it("hands back the stored value behind a field that shows a reading of it: the cents, never the dollars", async () => {
    const sent: Sent[] = [];
    const state = editingState();
    const price = textOf(state.editing, home(renamed, sent), "price");
    price.onChange("2.50");
    price.onCommit();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.shown).toBe(200);

    const none = textOf(state.editing, home(soup, sent), "price");
    state.editing.reset("row:price");
    none.onChange("1");
    none.onCommit();
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]?.shown, "no price is null, a value of its own").toBeNull();
  });

  it("a commit that finds no hold hands back what its own render showed, so nothing is sent with no value to compare", async () => {
    const sent: Sent[] = [];
    const state = editingState();
    // Typed text with no hold beside it, as no path leaves it: the commit
    // still names a value.
    state.editing.type("row:name", "Chowder");
    commitText(state.editing, home(renamed, sent), "name");
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.shown).toBe("Bisque");
    expect(sent.every((each) => each.shown !== undefined)).toBe(true);
  });

  it("a second save of the field, typed while the first is on its way, hands back what the first answered", async () => {
    const sent: Sent[] = [];
    const state = editingState();
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const field = () =>
      textOf(
        state.editing,
        {
          ...home(soup, sent),
          send: async (name, value, shown) => {
            sent.push({ field: name, value, shown });
            if (sent.length === 1) await held;
            return {
              ok: true,
              value: { name: value, price: "" },
            };
          },
        },
        "name",
      );
    field().onChange("Soup one");
    field().onCommit();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    // The first save is on its way; the page still renders the old name.
    field().onChange("Soup two");
    field().onCommit();
    release();
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(sent.map((each) => [each.value, each.shown])).toEqual([
      ["Soup one", "Soup"],
      ["Soup two", "Soup one"],
    ]);
    await state.idle();
    expect(state.live.drafts).toEqual({});
    expect(state.failField).not.toHaveBeenCalled();
  });

  it("once the refreshed rows arrive in a field with nothing typed, its next save hands back the value they brought", async () => {
    const sent: Sent[] = [];
    const state = editingState();
    const first = textOf(state.editing, home(soup, sent), "name");
    first.onChange("Soup one");
    first.onCommit();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    await state.idle();
    // The rows arrive, another tab's rename among them.
    state.editing.settle();
    expect(state.live.shown).toEqual({});
    const next = textOf(state.editing, home(renamed, sent), "name");
    expect(next.value).toBe("Bisque");
    next.onChange("Bisque two");
    next.onCommit();
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]?.shown).toBe("Bisque");
  });

  it("typed back to the text the field showed, with a newer value under it, sends nothing and lets the hold go", async () => {
    const sent: Sent[] = [];
    const state = editingState();
    textOf(state.editing, home(soup, sent), "name").onChange("Soupx");
    state.editing.settle();
    const now = textOf(state.editing, home(renamed, sent), "name");
    now.onChange("Soup");
    now.onCommit();
    await state.idle();
    expect(sent).toEqual([]);
    expect(state.live.drafts).toEqual({});
    expect(state.live.shown).toEqual({});
    expect(
      textOf(state.editing, home(renamed, sent), "name").value,
      "the field shows the newer name",
    ).toBe("Bisque");
  });

  it("a refused save keeps what was typed and what the field showed, so a second commit names the same value", async () => {
    const sent: Sent[] = [];
    const state = editingState();
    const refusing = () =>
      home(soup, sent, () => ({ ok: false, problem: { kind: "moved" } }));
    textOf(state.editing, refusing(), "name").onChange("Chowder");
    textOf(state.editing, refusing(), "name").onCommit();
    await vi.waitFor(() => expect(state.failField).toHaveBeenCalledTimes(1));
    expect(state.failField.mock.calls[0]?.[1]).toMatchObject({
      kind: "moved",
      value: "Chowder",
    });
    expect(state.live.drafts).toEqual({ "row:name": "Chowder" });
    state.editing.settle();
    expect(state.live.shown["row:name"]?.shown).toBe("Soup");
    // Changed and committed again: still named against what it showed.
    textOf(state.editing, home(renamed, sent), "name").onChange("Chowder two");
    commitText(state.editing, home(renamed, sent), "name");
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]?.shown).toBe("Soup");
  });
});
