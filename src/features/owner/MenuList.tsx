"use client";

import {
  startTransition,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
} from "react";
import { Form } from "react-aria-components";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import { Announcer, useAnnounce } from "@/core/a11y/announcer";
import {
  cleanMenuName,
  inOrder,
  menuNameSchema,
  moveInOrder,
  nameTaken,
  type OwnerMenu,
} from "@/domain/menu";
import { Button } from "@/ui/Button";
import { TextField } from "@/ui/TextField";
import { AutosaveTextField } from "./editing/AutosaveTextField";
import { commitOf } from "./editing/commit";
import { SavedStatus } from "./editing/SavedStatus";
import {
  afterUndo,
  newestUndo,
  pushUndo,
  type UndoOutcome,
} from "./editing/undo";
import { useEditing } from "./editing/useEditing";
import { useUndoStack } from "./editing/useUndoStack";
import {
  addMenu,
  deleteMenu,
  orderMenus,
  renameMenu,
  restoreMenu,
} from "./menu-actions";
import {
  edgeSentence,
  failureSentence,
  menuCount,
  menuUndoSchema,
  movedSentence,
  notUndoneSentence,
  problemText,
  undoLabel,
  undoneSentence,
  type MenuProblem,
  type MenuUndo,
} from "./menu-messages";

type Props = {
  strings: Copy["owner"]["menus"];
  editing: Copy["owner"]["editing"];
  pendingLabel: string;
  code: string;
  // The restaurant's menus that are not deleted, in order, as the server
  // holds them. Every save ends with a refresh, so this is always the truth.
  menus: OwnerMenu[];
};

type Direction = "up" | "down";

// What the screen shows before the server has answered: a move and a delete
// happen at once and fall away by themselves if the save fails.
type ListChange =
  { kind: "order"; ids: string[] } | { kind: "remove"; id: string };

function applyChange(menus: OwnerMenu[], change: ListChange): OwnerMenu[] {
  return change.kind === "remove"
    ? menus.filter((menu) => menu.id !== change.id)
    : inOrder(menus, change.ids);
}

const ADD_KEY = "add";
const addFieldId = "menu-new-name";

function fieldKey(id: string): string {
  return `name:${id}`;
}

function nameId(id: string): string {
  return `menu-${id}-name`;
}

function buttonId(id: string, action: Direction | "delete"): string {
  return `menu-${id}-${action}`;
}

// The menus of one restaurant (D-111): each name is a real field that saves
// when focus leaves it or on Enter, and only if it changed. Move up and Move
// down are buttons in every row (D-112); Delete asks nothing and Undo brings
// the menu back. One saved status and one Undo sit above the list. Success
// is quiet; a failure, a move, a delete, an add, and an Undo are said once
// through the log at the end.
export function MenuList(props: Props) {
  return (
    <Announcer>
      <MenuRows {...props} />
    </Announcer>
  );
}

function MenuRows({
  strings,
  editing: words,
  pendingLabel,
  code,
  menus,
}: Props) {
  const announce = useAnnounce();
  const editing = useEditing(words);
  const undo = useUndoStack(`undo:${code}:menus`, menuUndoSchema);
  const [shown, change] = useOptimistic(menus, applyChange);
  const schema = useMemo(
    () => menuNameSchema(strings.errors),
    [strings.errors],
  );
  const [newName, setNewName] = useState("");
  const [blankAdd, setBlankAdd] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Where focus belongs after the list next changes. React moves a row's
  // node when the row travels down, and the browser drops focus when it
  // does; a deleted row takes its button with it. A move keeps focus on the
  // button that was pressed, unless the owner has moved on. A delete sends
  // focus to a field, never to another Delete.
  const focusNext = useRef<{ id: string; force: boolean } | null>(null);
  useLayoutEffect(() => {
    const wanted = focusNext.current;
    if (!wanted) return;
    const element = document.getElementById(wanted.id);
    const active = document.activeElement;
    if (wanted.force) {
      if (!element) return;
      focusNext.current = null;
      if (active !== element) element.focus();
      return;
    }
    if (active === element) return;
    if (active === null || active === document.body) element?.focus();
    else focusNext.current = null;
  });

  function describe(problem: MenuProblem, name: string): string {
    return problemText(strings, words, problem, name);
  }

  function failName(
    menu: OwnerMenu,
    problem: MenuProblem,
    name: string,
    value: string,
  ) {
    const text = describe(problem, name);
    editing.failField(fieldKey(menu.id), {
      fieldId: nameId(menu.id),
      problem: text,
      sentence: failureSentence(
        fill(strings.notSaved, { menu: menu.name }),
        text,
      ),
      value,
    });
  }

  // A name field was committed. Nothing is sent unless the value changed.
  // Try again passes force, which sends the value that failed once more.
  function commitName(menu: OwnerMenu, force = false) {
    const key = fieldKey(menu.id);
    const now = editing.peek();
    const typed = now.drafts[key] ?? null;
    const decision = commitOf(
      {
        saved: menu.name,
        draft: typed,
        inFlight: now.sent[key] ?? null,
        failed: force ? null : (now.failures[key]?.value ?? null),
      },
      cleanMenuName,
    );
    if (decision.kind === "nothing") return;
    if (decision.kind === "reset") {
      editing.reset(key);
      return;
    }
    const value = decision.value;
    if (!schema.safeParse(value).success) {
      const rule = value === "" ? "nameRequired" : "nameLength";
      failName(menu, { kind: "invalid", rule }, value, value);
      return;
    }
    const other = nameTaken(shown, menu.id, value);
    if (other) {
      failName(menu, { kind: "name-taken" }, other.name, value);
      return;
    }
    editing.sending(key, value);
    startTransition(async () => {
      await editing.run(async () => {
        const result = await editing.call(() =>
          renameMenu(code, menu.id, value),
        );
        editing.answered(key);
        if (!result.ok) {
          failName(menu, result.problem, value, value);
          return;
        }
        editing.landedField(key, typed);
        undo.replace(
          pushUndo(undo.peek(), {
            kind: "rename",
            id: menu.id,
            from: menu.name,
            to: result.value.name,
          }),
        );
      });
    });
  }

  function move(menu: OwnerMenu, direction: Direction) {
    const ids = shown.map((entry) => entry.id);
    const next = moveInOrder(ids, menu.id, direction);
    if (!next) {
      announce(edgeSentence(strings, direction, menu.name));
      return;
    }
    focusNext.current = { id: buttonId(menu.id, direction), force: false };
    announce(
      movedSentence(
        strings,
        direction,
        menu.name,
        next.indexOf(menu.id) + 1,
        next.length,
      ),
    );
    startTransition(async () => {
      change({ kind: "order", ids: next });
      await editing.run(async () => {
        const result = await editing.call(() => orderMenus(code, next));
        if (!result.ok) {
          editing.failChange(
            failureSentence(
              fill(strings.notMoved, { menu: menu.name }),
              describe(result.problem, menu.name),
            ),
          );
          return;
        }
        editing.landed();
        undo.replace(
          pushUndo(undo.peek(), {
            kind: "move",
            id: menu.id,
            name: menu.name,
            order: ids,
          }),
        );
      });
    });
  }

  function remove(menu: OwnerMenu, index: number) {
    const ids = shown.map((entry) => entry.id);
    const neighbor = shown[index + 1] ?? shown[index - 1];
    focusNext.current = {
      id: neighbor ? nameId(neighbor.id) : addFieldId,
      force: true,
    };
    announce(fill(strings.deleted, { menu: menu.name }));
    startTransition(async () => {
      change({ kind: "remove", id: menu.id });
      await editing.run(async () => {
        const result = await editing.call(() => deleteMenu(code, menu.id));
        if (!result.ok) {
          focusNext.current = { id: buttonId(menu.id, "delete"), force: true };
          editing.failChange(
            failureSentence(
              fill(strings.notDeleted, { menu: menu.name }),
              describe(result.problem, menu.name),
            ),
          );
          return;
        }
        editing.dropField(fieldKey(menu.id));
        editing.landed();
        undo.replace(
          pushUndo(undo.peek(), {
            kind: "delete",
            id: menu.id,
            name: menu.name,
            order: ids,
          }),
        );
      });
    });
  }

  // The inverse of one change, and where it left the menu in the list.
  async function reverse(
    entry: MenuUndo,
  ): Promise<
    | { ok: true; position: number; total: number }
    | { ok: false; problem: MenuProblem }
  > {
    // A rename and an add say nothing about a place in the list.
    const nowhere = { position: 0, total: 0 };
    switch (entry.kind) {
      case "rename": {
        // Only if the name is still the one that change wrote.
        const result = await editing.call(() =>
          renameMenu(code, entry.id, entry.from, entry.to),
        );
        return result.ok ? { ok: true, ...nowhere } : result;
      }
      case "add": {
        const result = await editing.call(() => deleteMenu(code, entry.id));
        return result.ok ? { ok: true, ...nowhere } : result;
      }
      case "delete": {
        const result = await editing.call(() =>
          restoreMenu(code, entry.id, entry.order),
        );
        if (!result.ok) return result;
        return {
          ok: true,
          position: result.value.position || entry.order.indexOf(entry.id) + 1,
          total: result.value.total || entry.order.length,
        };
      }
      case "move": {
        const result = await editing.call(() => orderMenus(code, entry.order));
        return result.ok
          ? {
              ok: true,
              position: entry.order.indexOf(entry.id) + 1,
              total: entry.order.length,
            }
          : result;
      }
    }
  }

  // Undo waits for saves on their way, then takes back the newest change:
  // it runs in the same queue as every save, so the entry it reads is the
  // newest once the saves before it have recorded theirs. A change that no
  // longer stands is dropped; one blocked by a taken name keeps its entry;
  // either way it says so.
  function undoNewest() {
    if (editing.peek().inFlight === 0 && !newestUndo(undo.peek())) {
      announce(words.nothingToUndo);
      return;
    }
    startTransition(async () => {
      await editing.run(async () => {
        const entry = newestUndo(undo.peek());
        if (!entry) {
          announce(words.nothingToUndo);
          return;
        }
        const result = await reverse(entry);
        if (result.ok) {
          undo.replace(afterUndo(undo.peek(), "applied"));
          editing.landed();
          announce(
            undoneSentence(strings, entry, result.position, result.total),
          );
          return;
        }
        const kind = result.problem.kind;
        const outcome: UndoOutcome =
          kind === "name-taken"
            ? "blocked"
            : kind === "changed" || kind === "gone" || kind === "mismatch"
              ? "stale"
              : "failed";
        undo.replace(afterUndo(undo.peek(), outcome));
        editing.failChange(
          notUndoneSentence(strings, words, entry, result.problem),
        );
      });
    });
  }

  // The add form is an explicit submit, Enter or the button. A name that was
  // typed and not added counts as a failed save: a link stays and the leave
  // warning shows. An empty submit has nothing to lose, so it only says why.
  function add() {
    if (adding) return;
    const value = cleanMenuName(newName);
    const refuse = (problem: MenuProblem, name: string) => {
      const text = describe(problem, name);
      document.getElementById(addFieldId)?.focus();
      if (value === "") {
        setBlankAdd(text);
        announce(text);
        return;
      }
      editing.failField(ADD_KEY, {
        fieldId: addFieldId,
        problem: text,
        sentence: failureSentence(
          fill(strings.notAdded, { menu: value }),
          text,
        ),
        value,
      });
    };
    if (!schema.safeParse(value).success) {
      const rule = value === "" ? "nameRequired" : "nameLength";
      refuse({ kind: "invalid", rule }, value);
      return;
    }
    const other = nameTaken(shown, null, value);
    if (other) {
      refuse({ kind: "name-taken" }, other.name);
      return;
    }
    const count = shown.length + 1;
    setAdding(true);
    startTransition(async () => {
      await editing.run(async () => {
        const result = await editing.call(() => addMenu(code, value));
        setAdding(false);
        if (!result.ok) {
          refuse(result.problem, value);
          return;
        }
        setNewName("");
        editing.reset(ADD_KEY);
        editing.landed();
        undo.replace(
          pushUndo(undo.peek(), {
            kind: "add",
            id: result.value.id,
            name: result.value.name,
          }),
        );
        announce(
          fill(strings.added, {
            menu: result.value.name,
            count: menuCount(strings, count),
          }),
        );
      });
    });
  }

  // Focus goes to the first failed field, so it never rests on a control
  // that is about to leave the page, and every failed field is sent again.
  function tryAgain() {
    editing.focusFirstFailed();
    for (const key of Object.keys(editing.peek().failures)) {
      if (key === ADD_KEY) {
        add();
        continue;
      }
      const menu = shown.find((entry) => fieldKey(entry.id) === key);
      if (menu) commitName(menu, true);
    }
  }

  const newest = newestUndo(undo.stack);
  const addProblem = editing.failures[ADD_KEY]?.problem ?? blankAdd;

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <SavedStatus
          strings={words}
          status={editing.status}
          notice={editing.notice}
          canRetry={Object.keys(editing.failures).length > 0}
          outOfDate={editing.outOfDate}
          onRetry={tryAgain}
        />
        <Button aria-disabled={newest ? undefined : true} onPress={undoNewest}>
          {newest ? undoLabel(strings, newest) : words.undo}
        </Button>
      </div>

      {shown.length > 0 ? (
        <ul className="mt-6 flex flex-col gap-4">
          {shown.map((menu, index) => {
            const key = fieldKey(menu.id);
            // Each row button's name is its visible label, then its menu:
            // "Move up, Dinner". It is set whole, as a label, because hidden
            // text after the visible words would be read with a space in
            // front of the comma.
            const named = (action: string) =>
              fill(strings.rowAction, { action, menu: menu.name });
            return (
              <li
                key={menu.id}
                className="flex flex-col gap-3 rounded border border-border p-4"
              >
                <AutosaveTextField
                  id={nameId(menu.id)}
                  label={strings.nameLabel}
                  labelSuffix={fill(strings.nameFor, { menu: menu.name })}
                  value={editing.drafts[key] ?? menu.name}
                  error={editing.failures[key]?.problem ?? null}
                  onChange={(value) => editing.type(key, value)}
                  onCommit={() => commitName(menu)}
                />
                <div className="flex flex-wrap gap-3">
                  <Button
                    id={buttonId(menu.id, "up")}
                    aria-label={named(strings.moveUp)}
                    aria-disabled={index === 0 ? true : undefined}
                    onPress={() => move(menu, "up")}
                  >
                    {strings.moveUp}
                  </Button>
                  <Button
                    id={buttonId(menu.id, "down")}
                    aria-label={named(strings.moveDown)}
                    aria-disabled={
                      index === shown.length - 1 ? true : undefined
                    }
                    onPress={() => move(menu, "down")}
                  >
                    {strings.moveDown}
                  </Button>
                  <Button
                    id={buttonId(menu.id, "delete")}
                    aria-label={named(strings.remove)}
                    onPress={() => remove(menu, index)}
                  >
                    {strings.remove}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-6">{strings.none}</p>
      )}

      <Form
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
        validationBehavior="aria"
        className="mt-6 flex flex-col gap-3"
      >
        <TextField
          id={addFieldId}
          label={strings.newLabel}
          autoComplete="off"
          value={newName}
          onChange={(value) => {
            setNewName(value);
            setBlankAdd(null);
            if (cleanMenuName(value) === "") editing.reset(ADD_KEY);
            else editing.type(ADD_KEY, value);
          }}
          isInvalid={addProblem ? true : undefined}
          errorMessage={addProblem ?? undefined}
        />
        <div>
          <Button type="submit" isPending={adding} pendingLabel={pendingLabel}>
            {strings.add}
          </Button>
        </div>
      </Form>
    </>
  );
}
