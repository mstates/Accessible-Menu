"use client";

import {
  startTransition,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { z } from "zod";
import { useAnnounce } from "@/core/a11y/announcer";
import {
  deleteAsksFirst,
  HOLDS_NOTHING,
  inOrder,
  moveInOrder,
  nameTaken,
  type Held,
} from "@/domain/menu";
import {
  addedSentence,
  deletedSentence,
  deleteQuestion,
  edgeSentence,
  failureSentence,
  isListUndo,
  listUndoSchema,
  movedSentence,
  notDone,
  notUndoneSentence,
  problemText,
  removedSentence,
  undoLabel,
  undoneSentence,
  undoOutcome,
  type ListProblem,
  type ListUndo,
  type ListWords,
} from "./list-words";
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
} from "./pending-adds";
import {
  commitText,
  textOf,
  type ListResult,
  type ListRow,
  type TextEditor,
  type TextHome,
} from "./texts";
import { afterUndo, newestUndo, pushUndo, type UndoOutcome } from "./undo";
import { useEditing, type Editing } from "./useEditing";
import { useUndoStack } from "./useUndoStack";

// A row and a save's answer are texts.ts's, where every text's commit path
// lives; they are named here too, since every list reads them from here.
export type { ListResult, ListRow } from "./texts";

// One editing list (D-111, D-128): the menus of a restaurant, the sections
// of a menu, or the dishes of a section. This is the state and the handlers
// all three share, their third use (module rule 12); RowList.tsx draws them.
//
// Each text of a row is a real field that saves when it is committed, and
// only if it changed. Move up and Move down are buttons in every row
// (D-112). Delete on a row that holds nothing asks nothing; on a row that
// holds content it asks first, and either way Undo brings the row back with
// everything under it (D-119). One saved status and one Undo sit above the
// list. The status is never spoken; a field that saves, a failure, a move,
// a delete, an add, and an Undo are said once through the page's log
// (D-118). A name added with Enter leaves the field at once and shows as a
// row marked not saved yet, its add waiting its turn behind every save
// before it; nothing typed is dropped or erased (D-125).

// The five saves of a list, as its server actions answer them.
export type ListActions<Field extends string> = {
  // The added row, and how many rows the list has now that it is in.
  add: (name: string) => Promise<ListResult<{ row: ListRow; total: number }>>;
  // With expected, the write is an Undo: it happens only if the text is
  // still the one the change wrote.
  setText: (
    id: string,
    field: Field,
    value: string,
    expected?: string,
  ) => Promise<ListResult<Record<Field, string>>>;
  // told is what the owner was told goes with the row (D-119).
  remove: (id: string, told: Held) => Promise<ListResult>;
  restore: (
    id: string,
    order: string[],
  ) => Promise<ListResult<{ position: number; total: number }>>;
  order: (ids: string[]) => Promise<ListResult>;
};

// A change the screen can take back that is not the list's own: a section
// moved to another menu, from its own page. It shares the screen's one Undo
// (D-111), so the list keeps its entries and asks the screen to reverse
// them.
export type OtherUndo<Other> = {
  schema: z.ZodType<Other>;
  label: (entry: Other) => string;
  // Takes the change back. It runs in the queue every save runs in, sends
  // its save through call, as every save is sent, and answers with what
  // becomes of the entry and the sentence to say. A change that was taken
  // back may answer with no sentence, when the screen says it itself.
  undo: (
    entry: Other,
    call: Editing["call"],
  ) => Promise<
    | { outcome: "applied"; sentence: string | null }
    | { outcome: Exclude<UndoOutcome, "applied">; sentence: string }
  >;
};

// The page's own texts, when the page is about one record and lists what it
// holds: on a section's page, the section's note and its every-dish line
// above its dishes (D-135). They are not a row of the list, but they share
// its saved status, its queue, and its Undo (D-111), and they save, fail,
// and are tried again the way a row's texts are.
export type OwnTexts<OwnField extends string> = {
  // The record: its id, and the name its sentences carry.
  row: ListRow;
  fields: readonly OwnField[];
  words: ListWords<OwnField>;
  valueOf: (field: OwnField) => string;
  clean: (field: OwnField, value: string) => string;
  rule: (field: OwnField, value: string) => string | null;
  // With expected, the write is an Undo, as for a row's text.
  setText: (
    field: OwnField,
    value: string,
    expected?: string,
  ) => Promise<ListResult<Record<OwnField, string>>>;
};

export type RowListConfig<
  Row extends ListRow,
  Field extends string,
  Other extends { kind: string } = never,
  OwnField extends string = never,
> = {
  words: ListWords<Field>;
  // The start of every element id: "menu-<id>-name", "menu-new-name".
  idPrefix: string;
  // Where the screen's Undo stack is kept in the tab's session storage.
  undoKey: string;
  // The rows that are not deleted, in order, as the server holds them. Every
  // save ends with a refresh, so this is always the truth.
  rows: Row[];
  // The texts of a row, the name first.
  fields: readonly Field[];
  valueOf: (row: Row, field: Field) => string;
  clean: (field: Field, value: string) => string;
  rule: (field: Field, value: string) => string | null;
  actions: ListActions<Field>;
  // What a row holds that a delete would take with it. Absent: a row holds
  // nothing, and every delete goes at once.
  held?: (row: Row) => Held;
  // The link to the row's own page, one level down.
  link?: { label: string; href: (row: Row) => string };
  other?: OtherUndo<Other>;
  own?: OwnTexts<OwnField>;
};

type Direction = "up" | "down";

// What the screen shows before the server has answered: a move and a delete
// happen at once and fall away by themselves if the save fails.
type ListChange =
  { kind: "order"; ids: string[] } | { kind: "remove"; id: string };

function applyChange<Row extends ListRow>(
  rows: Row[],
  change: ListChange,
): Row[] {
  return change.kind === "remove"
    ? rows.filter((row) => row.id !== change.id)
    : inOrder(rows, change.ids);
}

// The delete the confirmation is asking about: which row, and the name and
// the numbers its question shows, which stay as they were while it is open.
type Asking = { id: string; name: string; held: Held };

const NAME = "name";
const ADD_KEY = "add";

export function useRowList<
  Row extends ListRow,
  Field extends string,
  Other extends { kind: string } = never,
  OwnField extends string = never,
>(config: RowListConfig<Row, Field, Other, OwnField>) {
  const { words, idPrefix, rows, fields, actions, other, own } = config;
  const announce = useAnnounce();
  const editing = useEditing(words.editing);
  const otherSchema = other?.schema;
  const ownFields = own?.fields;
  const schema = useMemo(() => {
    const list = listUndoSchema(
      fields.filter((field) => field !== NAME),
      ownFields,
    );
    return (otherSchema ? z.union([list, otherSchema]) : list) as z.ZodType<
      ListUndo | Other
    >;
  }, [fields, ownFields, otherSchema]);
  const undo = useUndoStack(config.undoKey, schema);
  // The page's one editing state and one Undo, which every text's commit
  // path takes (texts.ts).
  const editor: TextEditor<ListUndo | Other> = { editing, undo };
  const [shown, change] = useOptimistic(rows, applyChange<Row>);
  const [newName, setNewName] = useState("");
  const [blankAdd, setBlankAdd] = useState<string | null>(null);
  const [asking, setAsking] = useState<Asking | null>(null);

  // Names sent from the add field that the list does not show yet (D-125).
  // Each new list from the server holds every add that had landed by then,
  // so those rows give way to their real ones in the same render.
  const [adds, setAdds] = useState<PendingAdd[]>([]);
  const [listed, setListed] = useState(rows);
  if (listed !== rows) {
    setListed(rows);
    setAdds(settleAdds);
  }
  const lastAdd = useRef(0);

  const addFieldId = `${idPrefix}-new-name`;
  const fieldKey = (field: Field, id: string) => `${field}:${id}`;
  const fieldId = (field: Field, id: string) => `${idPrefix}-${id}-${field}`;
  const buttonId = (id: string, action: Direction | "delete") =>
    `${idPrefix}-${id}-${action}`;
  const nameField = NAME as Field;

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

  function describe(problem: ListProblem, name: string): string {
    return problemText(words, problem, name);
  }

  // A row's texts live in the row, and save through the list's own action.
  function rowHome(row: Row): TextHome<Field, ListUndo | Other> {
    return {
      row,
      words,
      key: (field) => fieldKey(field, row.id),
      id: (field) => fieldId(field, row.id),
      saved: (field) => config.valueOf(row, field),
      clean: config.clean,
      rule: config.rule,
      taken: (field, value) =>
        field === NAME ? nameTaken(shown, row.id, value) : null,
      send: (field, value) => actions.setText(row.id, field, value),
      entry: (field, from, to) =>
        field === NAME
          ? { kind: "rename", id: row.id, from, to }
          : { kind: "text", field, id: row.id, name: row.name, from, to },
    };
  }

  // The page's own texts live on the page, above the list, and save
  // through their own action.
  function ownHome(
    texts: OwnTexts<OwnField>,
  ): TextHome<OwnField, ListUndo | Other> {
    return {
      row: texts.row,
      words: texts.words,
      key: (field) => `own:${field}`,
      id: (field) => `${idPrefix}-own-${field}`,
      saved: texts.valueOf,
      clean: texts.clean,
      rule: texts.rule,
      taken: () => null,
      send: (field, value) => texts.setText(field, value),
      entry: (field, from, to) => ({
        kind: "own",
        field,
        id: texts.row.id,
        name: texts.row.name,
        from,
        to,
      }),
    };
  }

  function move(row: Row, direction: Direction) {
    const ids = shown.map((entry) => entry.id);
    const next = moveInOrder(ids, row.id, direction);
    if (!next) {
      announce(edgeSentence(words, direction, row.name));
      return;
    }
    focusNext.current = { id: buttonId(row.id, direction), force: false };
    announce(
      movedSentence(
        words,
        direction,
        row.name,
        next.indexOf(row.id) + 1,
        next.length,
      ),
    );
    startTransition(async () => {
      change({ kind: "order", ids: next });
      await editing.run(async () => {
        const result = await editing.call(() => actions.order(next));
        if (!result.ok) {
          editing.failChange(
            failureSentence(
              notDone(words, "notMoved", row.name),
              describe(result.problem, row.name),
            ),
          );
          return;
        }
        editing.landed();
        undo.replace(
          pushUndo<ListUndo | Other>(undo.peek(), {
            kind: "move",
            id: row.id,
            name: row.name,
            order: ids,
          }),
        );
      });
    });
  }

  // Where a delete sends focus: the next row's name field, the one before
  // it for the last row, the add field when no row is left.
  function afterDelete(index: number): string {
    const neighbor = shown[index + 1] ?? shown[index - 1];
    return neighbor ? fieldId(nameField, neighbor.id) : addFieldId;
  }

  // The delete itself. told is what the owner was told goes with the row:
  // nothing for a delete at once, the confirmation's numbers otherwise. The
  // database counts again in the statement that marks the row, and refuses
  // a delete that would take more (D-119).
  function remove(row: Row, index: number, told: Held) {
    const ids = shown.map((entry) => entry.id);
    focusNext.current = { id: afterDelete(index), force: true };
    announce(deletedSentence(words, row.name));
    startTransition(async () => {
      change({ kind: "remove", id: row.id });
      await editing.run(async () => {
        const result = await editing.call(() => actions.remove(row.id, told));
        if (!result.ok) {
          focusNext.current = { id: buttonId(row.id, "delete"), force: true };
          editing.failChange(
            failureSentence(
              notDone(words, "notDeleted", row.name),
              describe(result.problem, row.name),
            ),
          );
          return;
        }
        for (const field of fields) {
          editing.dropField(fieldKey(field, row.id));
        }
        editing.landed();
        undo.replace(
          pushUndo<ListUndo | Other>(undo.peek(), {
            kind: "delete",
            id: row.id,
            name: row.name,
            order: ids,
          }),
        );
      });
    });
  }

  // A row's Delete button. A row that holds content asks first, and names
  // what goes; an empty one goes at once (D-119).
  function pressDelete(row: Row, index: number) {
    const held = config.held?.(row) ?? HOLDS_NOTHING;
    if (!deleteAsksFirst(held)) {
      remove(row, index, HOLDS_NOTHING);
      return;
    }
    setAsking({ id: row.id, name: row.name, held });
  }

  // Every way out of the confirmation is this one: the dialog closes first,
  // in its own commit, and only then is focus placed, by id. While a React
  // Aria modal is open the page behind it is inert, so a focus call made
  // before it has closed moves nothing and is lost. React Aria's own
  // restore runs a frame later and only if focus fell to the body, and it
  // returns to whatever had focus when the dialog opened, which is not
  // always the Delete button: Safari does not focus a clicked button, and a
  // screen reader's click may not move focus. Placed here, focus lands the
  // same way in every browser, and that restore finds nothing to do.
  function leaveAsking(focusId: string) {
    flushSync(() => setAsking(null));
    const target =
      document.getElementById(focusId) ?? document.getElementById(addFieldId);
    target?.focus();
  }

  // Keep, or Escape: nothing is sent, and focus is back on the Delete
  // button that asked.
  function keep() {
    if (asking) leaveAsking(buttonId(asking.id, "delete"));
  }

  // The owner said Delete. The row is read from the list as it is now, not
  // as it was when the dialog opened; a save landing behind the dialog may
  // have shown it is gone. Focus goes where a delete sends it, and then the
  // same delete runs that an empty row gets, carrying the numbers the
  // question named.
  function confirmDelete() {
    if (!asking) return;
    const index = shown.findIndex((entry) => entry.id === asking.id);
    const row = shown[index];
    if (!row) {
      leaveAsking(addFieldId);
      editing.failChange(
        failureSentence(
          notDone(words, "notDeleted", asking.name),
          words.strings.errors.gone,
        ),
      );
      return;
    }
    leaveAsking(afterDelete(index));
    remove(row, index, asking.held);
  }

  // The words an entry's sentences are said in: the page's own texts have
  // theirs, and every other change is the list's.
  function wordsOf(entry: ListUndo): ListWords {
    return entry.kind === "own" && own ? own.words : words;
  }

  // The inverse of one change, and where it left the row in the list.
  async function reverse(
    entry: ListUndo,
  ): Promise<
    | { ok: true; position: number; total: number }
    | { ok: false; problem: ListProblem }
  > {
    // A text and an add say nothing about a place in the list.
    const nowhere = { position: 0, total: 0 };
    switch (entry.kind) {
      case "rename": {
        // Only if the name is still the one that change wrote.
        const result = await editing.call(() =>
          actions.setText(entry.id, nameField, entry.from, entry.to),
        );
        return result.ok ? { ok: true, ...nowhere } : result;
      }
      case "text": {
        // Only if the field still holds what that change wrote.
        const result = await editing.call(() =>
          actions.setText(entry.id, entry.field as Field, entry.from, entry.to),
        );
        return result.ok ? { ok: true, ...nowhere } : result;
      }
      case "own": {
        // The same, for a text of the page's own record.
        if (!own) return { ok: false, problem: { kind: "gone" } };
        const result = await editing.call(() =>
          own.setText(entry.field as OwnField, entry.from, entry.to),
        );
        return result.ok ? { ok: true, ...nowhere } : result;
      }
      case "add": {
        // Undo never deletes content: it says the row holds nothing, and
        // the database refuses if it does by now (D-119).
        const result = await editing.call(() =>
          actions.remove(entry.id, HOLDS_NOTHING),
        );
        return result.ok ? { ok: true, ...nowhere } : result;
      }
      case "delete": {
        const result = await editing.call(() =>
          actions.restore(entry.id, entry.order),
        );
        if (!result.ok) return result;
        return {
          ok: true,
          position: result.value.position || entry.order.indexOf(entry.id) + 1,
          total: result.value.total || entry.order.length,
        };
      }
      case "move": {
        const result = await editing.call(() => actions.order(entry.order));
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
  // longer stands is dropped, and so is an added row that holds content by
  // now; one blocked by a taken name keeps its entry; either way it says
  // so.
  function undoNewest() {
    if (editing.peek().inFlight === 0 && !newestUndo(undo.peek())) {
      announce(words.editing.nothingToUndo);
      return;
    }
    startTransition(async () => {
      await editing.run(async () => {
        const entry = newestUndo(undo.peek());
        if (!entry) {
          announce(words.editing.nothingToUndo);
          return;
        }
        if (!isListUndo(entry)) {
          if (!other) return;
          const result = await other.undo(entry, editing.call);
          undo.replace(afterUndo(undo.peek(), result.outcome));
          if (result.outcome === "applied") {
            editing.landed();
            if (result.sentence !== null) announce(result.sentence);
          } else {
            editing.failChange(result.sentence);
          }
          return;
        }
        const said = wordsOf(entry);
        const result = await reverse(entry);
        if (result.ok) {
          undo.replace(afterUndo(undo.peek(), "applied"));
          editing.landed();
          announce(undoneSentence(said, entry, result.position, result.total));
          return;
        }
        undo.replace(afterUndo(undo.peek(), undoOutcome(result.problem)));
        editing.failChange(notUndoneSentence(said, entry, result.problem));
      });
    });
  }

  // The add form is an explicit submit, Enter or the button. A name that was
  // typed and not added counts as a failed save: a link stays and the leave
  // warning shows. An empty submit has nothing to lose, so it only says why.
  // A name that passes leaves the field at once and shows as a row marked
  // not saved yet; its add is sent in turn, behind every save before it, so
  // an add pressed while another is on its way is never dropped (D-125).
  function add() {
    const value = config.clean(nameField, newName);
    const refuse = (problem: ListProblem, name: string) => {
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
        sentence: failureSentence(notDone(words, "notAdded", value), text),
        value,
      });
    };
    const rule = config.rule(nameField, value);
    if (rule) {
      refuse({ kind: "invalid", rule }, value);
      return;
    }
    const taken = nameTaken([...shown, ...addsAsRows(adds)], null, value);
    if (taken) {
      refuse({ kind: "name-taken" }, taken.name);
      return;
    }
    lastAdd.current += 1;
    const key = String(lastAdd.current);
    setNewName("");
    editing.reset(ADD_KEY);
    setAdds((current) => enterAdd(current, key, value));
    send(key, value);
  }

  // One add, sent once every save before it has finished. It says its own
  // sentence when it lands, with the count the server gives. A failure keeps
  // the row, with its error, and leaves focus where the owner has it.
  function send(key: string, value: string) {
    startTransition(async () => {
      await editing.run(async () => {
        const result = await editing.call(() => actions.add(value));
        if (!result.ok) {
          const text = describe(result.problem, value);
          setAdds((current) => addFailed(current, key));
          editing.failField(failureKeyOf(key), {
            fieldId: addFieldId,
            problem: text,
            sentence: failureSentence(notDone(words, "notAdded", value), text),
            value,
          });
          return;
        }
        const { row, total } = result.value;
        setAdds((current) => addLanded(current, key, row.id));
        editing.reset(failureKeyOf(key));
        editing.landed();
        undo.replace(
          pushUndo<ListUndo | Other>(undo.peek(), {
            kind: "add",
            id: row.id,
            name: row.name,
          }),
        );
        announce(addedSentence(words, row.name, total));
      });
    });
  }

  // A failed add's Remove. It was never saved, so nothing is sent and there
  // is nothing to undo. Focus goes to the add field, where it can be typed
  // again.
  function removeUnsaved(entry: PendingAdd) {
    setAdds((current) => removeAdd(current, entry.key));
    editing.reset(failureKeyOf(entry.key));
    document.getElementById(addFieldId)?.focus();
    announce(removedSentence(words, entry.name));
  }

  // Focus goes to the first failed field, so it never rests on a control
  // that is about to leave the page, and every failed field is sent again.
  // Failed adds go first, in the order they were added, each from its own
  // place in the list.
  function tryAgain() {
    editing.focusFirstFailed();
    for (const entry of adds) {
      if (entry.phase !== "failed") continue;
      setAdds((current) => addSentAgain(current, entry.key));
      send(entry.key, entry.name);
    }
    for (const key of Object.keys(editing.peek().failures)) {
      if (isAddFailure(key)) continue;
      if (key === ADD_KEY) {
        add();
        continue;
      }
      if (own) {
        const home = ownHome(own);
        const field = own.fields.find(
          (candidate) => home.key(candidate) === key,
        );
        if (field) {
          commitText(editor, home, field, true);
          continue;
        }
      }
      for (const row of shown) {
        const field = fields.find(
          (candidate) => fieldKey(candidate, row.id) === key,
        );
        if (field) commitText(editor, rowHome(row), field, true);
      }
    }
  }

  // The add field as it is typed in. A name that is typed and not added
  // counts as unsaved work, until the field is emptied again.
  function typeNewName(value: string) {
    setNewName(value);
    setBlankAdd(null);
    if (config.clean(nameField, value) === "") editing.reset(ADD_KEY);
    else editing.type(ADD_KEY, value);
  }

  function fieldOf(row: Row, field: Field) {
    return textOf(editor, rowHome(row), field);
  }

  // The page's own texts, drawn above the list, or null when it has none.
  const ownTexts = own
    ? {
        fields: own.fields,
        words: own.words,
        fieldOf: (field: OwnField) => textOf(editor, ownHome(own), field),
      }
    : null;

  // A change the screen made that is not the list's own goes on the same
  // Undo stack.
  function record(entry: Other) {
    undo.replace(pushUndo<ListUndo | Other>(undo.peek(), entry));
  }

  const newest = newestUndo(undo.stack);

  return {
    words,
    fields,
    link: config.link,
    editing,
    shown,
    // The rows not saved yet, after the saved ones (D-125).
    unsaved: addsShown(adds, new Set(shown.map((row) => row.id))),
    // The Undo control's whole name, or null when there is nothing to undo.
    undoText: newest
      ? isListUndo(newest)
        ? undoLabel(wordsOf(newest), newest)
        : (other?.label(newest) ?? null)
      : null,
    addFieldId,
    newName,
    addProblem: editing.failures[ADD_KEY]?.problem ?? blankAdd,
    // The question the confirmation asks, or null while it is closed.
    question: asking ? deleteQuestion(words, asking.name, asking.held) : null,
    asks: config.held !== undefined,
    fieldOf,
    own: ownTexts,
    buttonId,
    unsavedProblem: (entry: PendingAdd) =>
      entry.phase === "failed"
        ? editing.failures[failureKeyOf(entry.key)]?.problem
        : undefined,
    typeNewName,
    add,
    move,
    pressDelete,
    keep,
    confirmDelete,
    removeUnsaved,
    tryAgain,
    undoNewest,
    record,
  };
}

export type RowListState<
  Row extends ListRow,
  Field extends string,
  Other extends { kind: string } = never,
  OwnField extends string = never,
> = ReturnType<typeof useRowList<Row, Field, Other, OwnField>>;
