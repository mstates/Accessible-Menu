import { describe, expect, it } from "vitest";
import { en } from "../../src/copy";
import { nameTaken } from "../../src/domain/menu";
import {
  addedSentence,
  failureSentence,
  notDone,
  problemText,
  removedSentence,
  type ListWords,
} from "../../src/features/owner/editing/list-words";
import {
  addFailed,
  addLanded,
  addSentAgain,
  addsAsRows,
  addsShown,
  enterAdd,
  failureKeyOf,
  isAddFailure,
  removeAdd,
  settleAdds,
  type PendingAdd,
} from "../../src/features/owner/editing/pending-adds";
import { saveQueue } from "../../src/features/owner/editing/queue";
import {
  dishList,
  menuList,
  sectionList,
} from "../../src/features/owner/lists";

const editing = en.owner.editing;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("saves wait their turn (D-111, D-125)", () => {
  it("runs saves started without waiting one at a time, in the order made, even when the first answer is the slowest", async () => {
    const queue = saveQueue();
    const events: string[] = [];
    const runs = (
      [
        ["Starters", 30],
        ["Mains", 1],
        ["Desserts", 10],
      ] as const
    ).map(([name, ms]) =>
      queue.run(async () => {
        events.push(`start ${name}`);
        await wait(ms);
        events.push(`end ${name}`);
      }),
    );
    await Promise.all(runs);
    expect(events).toEqual([
      "start Starters",
      "end Starters",
      "start Mains",
      "end Mains",
      "start Desserts",
      "end Desserts",
    ]);
  });

  it("goes on to the next save when one throws", async () => {
    const queue = saveQueue();
    const events: string[] = [];
    const failing = queue.run(async () => {
      await wait(5);
      throw new Error("dropped");
    });
    const next = queue.run(async () => {
      events.push("next");
    });
    await expect(failing).rejects.toThrow("dropped");
    await next;
    expect(events).toEqual(["next"]);
  });

  it("is idle only once every save made before it has finished", async () => {
    const queue = saveQueue();
    const events: string[] = [];
    void queue.run(async () => {
      await wait(15);
      events.push("first");
    });
    void queue.run(async () => {
      await wait(1);
      events.push("second");
    });
    await queue.idle();
    events.push("idle");
    expect(events).toEqual(["first", "second", "idle"]);
  });
});

describe("names sent from the add field (D-125)", () => {
  const entered = ["Starters", "Mains", "Desserts"].reduce<PendingAdd[]>(
    (adds, name, index) => enterAdd(adds, String(index + 1), name),
    [],
  );

  it("shows every name at once, in order, as not saved yet", () => {
    expect(entered.map((add) => [add.name, add.phase])).toEqual([
      ["Starters", "waiting"],
      ["Mains", "waiting"],
      ["Desserts", "waiting"],
    ]);
  });

  it("keeps a failed add in its place until it is sent again or removed", () => {
    const failed = addFailed(entered, "2");
    expect(failed.map((add) => add.phase)).toEqual([
      "waiting",
      "failed",
      "waiting",
    ]);
    expect(settleAdds(failed)).toEqual(failed);
    const again = addSentAgain(failed, "2");
    expect(again.map((add) => [add.name, add.phase])).toEqual([
      ["Starters", "waiting"],
      ["Mains", "waiting"],
      ["Desserts", "waiting"],
    ]);
    expect(removeAdd(failed, "2").map((add) => add.name)).toEqual([
      "Starters",
      "Desserts",
    ]);
  });

  it("removes only a failed add, never one on its way or one that landed", () => {
    expect(removeAdd(entered, "1")).toEqual(entered);
    const landed = addLanded(entered, "1", "id-1");
    expect(removeAdd(landed, "1")).toEqual(landed);
  });

  it("changes a phase only from the one before it", () => {
    expect(addSentAgain(entered, "1")).toEqual(entered);
    const landed = addLanded(entered, "1", "id-1");
    expect(addFailed(landed, "1")).toEqual(landed);
    expect(addLanded(landed, "1", "other")).toEqual(landed);
  });

  it("lets a landed add give way to its real row, and only then", () => {
    const landed = addLanded(entered, "1", "id-1");
    expect(addsShown(landed, new Set()).map((add) => add.name)).toEqual([
      "Starters",
      "Mains",
      "Desserts",
    ]);
    expect(addsShown(landed, new Set(["id-1"])).map((add) => add.name)).toEqual(
      ["Mains", "Desserts"],
    );
    expect(settleAdds(landed).map((add) => add.name)).toEqual([
      "Mains",
      "Desserts",
    ]);
  });

  it("refuses a name that is already on its way, whatever its case or spaces", () => {
    const saved = [{ id: "id-0", name: "Lunch" }];
    expect(
      nameTaken([...saved, ...addsAsRows(entered)], null, " mains "),
    ).toEqual({ id: "2", name: "Mains" });
    expect(
      nameTaken([...saved, ...addsAsRows(entered)], null, "Sides"),
    ).toBeNull();
  });

  it("keeps an add's failure apart from the add field's own", () => {
    expect(failureKeyOf("3")).toBe("add:3");
    expect(isAddFailure(failureKeyOf("3"))).toBe(true);
    expect(isAddFailure("add")).toBe(false);
    expect(isAddFailure("name:3")).toBe(false);
  });
});

// The list's add handler, step for step, against a server that answers the
// first add slowest and fails one. The page's list changes only once every
// save on its way has been answered, as React commits overlapping actions
// together. At every step each name entered must be on the page exactly
// once: as a saved row, or as a row not saved yet.
type Words = {
  added: (name: string, total: number) => string;
  failed: (name: string) => string;
  removed: (name: string) => string;
};

// What a list says about an add, from the words its screen is given.
function wordsOf(words: ListWords): Words {
  return {
    added: (name, total) => addedSentence(words, name, total),
    failed: (name) =>
      failureSentence(
        notDone(words, "notAdded", name),
        problemText(words, { kind: "failed" }, name),
      ),
    removed: (name) => removedSentence(words, name),
  };
}

// The three lists share one add handler now (D-128); each still says its
// own sentences.
const lists: [string, Words][] = [
  ["menus", wordsOf(menuList.words(en.owner.menus, editing))],
  ["sections", wordsOf(sectionList.words(en.owner.sections, editing))],
  ["dishes", wordsOf(dishList.words(en.owner.dishes, editing))],
];

function page(words: Words, failing: string | null) {
  const queue = saveQueue();
  const server: { id: string; name: string }[] = [];
  const received: string[] = [];
  const said: string[] = [];
  const problems = new Map<string, string>();
  const entered: string[] = [];
  let listed: { id: string; name: string }[] = [];
  let adds: PendingAdd[] = [];
  let open = 0;
  let most = 0;
  let last = 0;

  const delays: Record<string, number> = {
    Starters: 25,
    Mains: 1,
    Desserts: 10,
    Sides: 5,
  };

  function onPage(): string[] {
    const saved = new Set(listed.map((row) => row.id));
    return [
      ...listed.map((row) => row.name),
      ...addsShown(adds, saved).map((add) => add.name),
    ];
  }

  function check() {
    const shown = onPage();
    for (const name of entered) {
      expect(shown.filter((one) => one === name)).toEqual([name]);
    }
  }

  async function addOnServer(name: string) {
    open += 1;
    most = Math.max(most, open);
    received.push(name);
    await wait(delays[name] ?? 1);
    open -= 1;
    if (name === failing) return { ok: false as const };
    const row = { id: `id-${name}`, name };
    server.push(row);
    return { ok: true as const, row, total: server.length };
  }

  function send(key: string, name: string) {
    return queue.run(async () => {
      const result = await addOnServer(name);
      if (!result.ok) {
        adds = addFailed(adds, key);
        problems.set(key, editing.problems.failed);
        said.push(words.failed(name));
        check();
        return;
      }
      adds = addLanded(adds, key, result.row.id);
      problems.delete(key);
      said.push(words.added(result.row.name, result.total));
      check();
    });
  }

  return {
    server,
    received,
    said,
    problems,
    get adds() {
      return adds;
    },
    get most() {
      return most;
    },
    onPage,
    // The server takes every name from now on.
    heal() {
      failing = null;
    },
    enter(name: string) {
      expect(nameTaken([...listed, ...addsAsRows(adds)], null, name)).toBe(
        null,
      );
      last += 1;
      const key = String(last);
      entered.push(name);
      adds = enterAdd(adds, key, name);
      check();
      void send(key, name);
    },
    tryAgain() {
      for (const add of adds) {
        if (add.phase !== "failed") continue;
        adds = addSentAgain(adds, add.key);
        void send(add.key, add.name);
      }
      check();
    },
    remove(name: string) {
      const add = adds.find((one) => one.name === name);
      if (!add) throw new Error(`no row for ${name}`);
      adds = removeAdd(adds, add.key);
      problems.delete(add.key);
      entered.splice(entered.indexOf(name), 1);
      said.push(words.removed(name));
      check();
    },
    // Every save on its way is answered, and the page shows the new list.
    async settle() {
      await queue.idle();
      listed = [...server];
      adds = settleAdds(adds);
      check();
    },
  };
}

describe.each(lists)(
  "three names added without waiting, and one that fails, on %s (D-125)",
  (_, words) => {
    it.each([0, 1, 3])(
      "lands every name or keeps it on the page with its error, in order, each said once (the failure at %i)",
      async (at) => {
        const names = ["Starters", "Mains", "Desserts"];
        names.splice(at, 0, "Sides");
        const screen = page(words, "Sides");
        for (const name of names) screen.enter(name);

        expect(screen.onPage()).toEqual(names);
        await screen.settle();

        expect(screen.most).toBe(1);
        expect(screen.received).toEqual(names);
        expect(screen.server.map((row) => row.name)).toEqual([
          "Starters",
          "Mains",
          "Desserts",
        ]);
        expect(screen.onPage()).toEqual([
          "Starters",
          "Mains",
          "Desserts",
          "Sides",
        ]);
        expect(screen.adds.map((add) => [add.name, add.phase])).toEqual([
          ["Sides", "failed"],
        ]);
        expect([...screen.problems.values()]).toEqual([
          editing.problems.failed,
        ]);

        let saved = 0;
        const heard = names.map((name) => {
          if (name === "Sides") return words.failed(name);
          saved += 1;
          return words.added(name, saved);
        });
        expect(screen.said).toEqual(heard);
        expect(new Set(screen.said).size).toBe(screen.said.length);
      },
    );

    it("sends a failed name again from its place, and says it once when it lands", async () => {
      const screen = page(words, "Sides");
      for (const name of ["Starters", "Sides", "Mains"]) screen.enter(name);
      await screen.settle();
      expect(screen.onPage()).toEqual(["Starters", "Mains", "Sides"]);
      const before = screen.said.length;

      // The server takes it now: Try again sends Sides, and only Sides.
      screen.heal();
      screen.tryAgain();
      expect(screen.onPage()).toEqual(["Starters", "Mains", "Sides"]);
      await screen.settle();
      expect(screen.received).toEqual(["Starters", "Sides", "Mains", "Sides"]);
      expect(screen.onPage()).toEqual(["Starters", "Mains", "Sides"]);
      expect(screen.adds).toEqual([]);
      expect(screen.problems.size).toBe(0);
      expect(screen.said.slice(before)).toEqual([words.added("Sides", 3)]);
    });

    it("removes a failed name for good, and says so once", async () => {
      const screen = page(words, "Sides");
      for (const name of ["Starters", "Sides"]) screen.enter(name);
      await screen.settle();
      screen.remove("Sides");
      expect(screen.onPage()).toEqual(["Starters"]);
      expect(screen.adds).toEqual([]);
      expect(screen.said.at(-1)).toBe(words.removed("Sides"));
      expect(screen.server.map((row) => row.name)).toEqual(["Starters"]);
    });
  },
);
