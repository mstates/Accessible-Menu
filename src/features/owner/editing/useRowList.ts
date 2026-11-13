"use client";

import { startTransition, useOptimistic, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useAnnounce } from "@/core/a11y/announcer";
import {
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
  movedSentence,
  notDone,
  problemText,
  removedSentence,
  type ListProblem,
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
  type TextHome,
} from "./texts";
import { remedyOf } from "./status";
import { useEditing, type Editing } from "./useEditing";
import { useFocusNext } from "./useFocusNext";

// A row and a save's answer are texts.ts's, where every text's commit path
// lives; they are named here too, since every list reads them from here.
export type { ListResult, ListRow } from "./texts";

// One editing list (D-111, D-128): the menus of a restaurant, the sections
// of a menu, the dishes of a section, the options of a choice list, and the
// choice lists of a dish or a section (D-166). This is the state and the
// handlers they share (module rule 12); RowList.tsx draws them. A list page
// owns its editing state (useRowList); a list that sits on a page which
// already has one, the choice lists on a dish's or a section's page, shares
// the page's (useSharedRowList), so a screen keeps one queue and one status
// whatever it holds (D-111, D-145). Every editing key a list uses starts
// with its id prefix, so two lists in one editor never share a key.
//
// Each text of a row is a real field that saves when it is committed, and
// only if it changed. Move up and Move down are buttons in every row
// (D-112). Delete asks first on every row of a list that says so, naming
// what goes with a row that holds content (D-119, D-221); the row stays in
// the database, marked deleted. One saved status sits above the list. The
// status is never spoken; a field that saves, a failure, a move, a delete,
// and an add are said once through the page's log (D-118). A name added
// with Enter leaves the field at once and shows as a row marked not saved
// yet, its add waiting its turn behind every save before it; nothing typed
// is dropped or erased (D-125).

// The four saves of a list, as its server actions answer them.
export type ListActions<Field extends string> = {
  // The added row, and how many rows the list has now that it is in.
  add: (name: string) => Promise<ListResult<{ row: ListRow; total: number }>>;
  setText: (
    id: string,
    field: Field,
    value: string,
  ) => Promise<ListResult<Record<Field, string>>>;
  // told is what the owner was told goes with the row (D-119).
  remove: (id: string, told: Held) => Promise<ListResult>;
  order: (ids: string[]) => Promise<ListResult>;
};

// The page's own texts, when the page is about one record and lists what it
// holds: on a section's page, the section's note above its dishes (D-135).
// They are not a row of the list, but they share its saved status and its
// queue (D-111), and they save, fail, and are tried again the way a row's
// texts are.
export type OwnTexts<OwnField extends string> = {
  // The record: its id, and the name its sentences carry.
  row: ListRow;
  fields: readonly OwnField[];
  words: ListWords<OwnField>;
  valueOf: (field: OwnField) => string;
  clean: (field: OwnField, value: string) => string;
  rule: (field: OwnField, value: string) => string | null;
  // The record that already has this value, when one of these texts must
  // be unique among its kind: a choice list's lead on its home (D-166).
  taken?: (field: OwnField, value: string) => ListRow | null;
  setText: (
    field: OwnField,
    value: string,
  ) => Promise<ListResult<Record<OwnField, string>>>;
  // A save of one of these texts landed, with the server's answer.
  landed?: (field: OwnField, value: Record<OwnField, string>) => void;
};

export type RowListConfig<
  Row extends ListRow,
  Field extends string,
  OwnField extends string = never,
> = {
  words: ListWords<Field>;
  // The start of every element id: "menu-<id>-name", "menu-new-name".
  idPrefix: string;
  // The rows that are not deleted, in order, as the server holds them. Every
  // save ends with a refresh, so this is always the truth.
  rows: Row[];
  // The texts of a row, the name first.
  fields: readonly Field[];
  valueOf: (row: Row, field: Field) => string;
  clean: (field: Field, value: string) => string;
  rule: (field: Field, value: string) => string | null;
  actions: ListActions<Field>;
  // Whether a row's Delete asks first (D-221): yes for every row with a page
  // of its own, a menu, a section, a dish, a choice list; no for the parts
  // of a form, a list's options, which go on the press as a dish's sizes
  // do.
  deleteAsksFirst: boolean;
  // What a row holds, which the question names and the server is told
  // (D-119). Absent, the question names the row alone.
  held?: (row: Row) => Held;
  // One more sentence the confirmation shows under its question for this
  // row, or null: that a published menu leaves diners at once (D-82).
  describeDelete?: (row: Row) => string | null;
  // The link to the row's own page, one level down.
  link?: { label: string; href: (row: Row) => string };
  own?: OwnTexts<OwnField>;
  // Sends a failed save of something else on the page again, when the key
  // is its: a shared list's, or an option's allergen group (D-166). Asked
  // first.
  tryAgain?: (key: string, value: string) => boolean;
  // A save of a row's text landed, with the server's answer: for a row that
  // carries more than its texts, what else that answer holds (an option's
  // allergen check, cleared by a rename, D-166).
  rowLanded?: (row: Row, field: Field, value: Record<Field, string>) => void;
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

// A list page's list: it owns the page's editing state.
export function useRowList<
  Row extends ListRow,
  Field extends string,
  OwnField extends string = never,
>(config: RowListConfig<Row, Field, OwnField>) {
  const editing = useEditing(config.words.editing);
  return useRows<Row, Field, OwnField>(config, editing);
}

// A list on a page that already has an editing state: it takes the page's,
// and hands the page what it needs to send a failed save again
// (tryAgainKey).
export function useSharedRowList<
  Row extends ListRow,
  Field extends string,
  OwnField extends string = never,
>(config: RowListConfig<Row, Field, OwnField>, editing: Editing) {
  return useRows<Row, Field, OwnField>(config, editing);
}

function useRows<
  Row extends ListRow,
  Field extends string,
  OwnField extends string,
>(config: RowListConfig<Row, Field, OwnField>, editing: Editing) {
  const { words, idPrefix, rows, fields, actions, own } = config;
  const announce = useAnnounce();
  const ADD_KEY = `${idPrefix}:add`;
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
  const fieldKey = (field: Field, id: string) => `${idPrefix}:${field}:${id}`;
  const fieldId = (field: Field, id: string) => `${idPrefix}-${id}-${field}`;
  const buttonId = (id: string, action: Direction | "delete") =>
    `${idPrefix}-${id}-${action}`;
  const nameField = NAME as Field;

  // Where focus belongs after the list next changes. A move keeps focus on
  // the button that was pressed, unless the owner has moved on. A delete
  // sends focus to a field, never to another Delete.
  const focusNextRef = useFocusNext();

  function describe(problem: ListProblem, name: string): string {
    return problemText(words, problem, name);
  }

  // A row's texts live in the row, and save through the list's own action.
  function rowHome(row: Row): TextHome<Field> {
    const rowLanded = config.rowLanded;
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
      landed: rowLanded
        ? (field, value) => {
            rowLanded(row, field, value);
          }
        : undefined,
    };
  }

  // The page's own texts live on the page, above the list, and save
  // through their own action.
  function ownHome(texts: OwnTexts<OwnField>): TextHome<OwnField> {
    return {
      row: texts.row,
      words: texts.words,
      key: (field) => `${idPrefix}:own:${field}`,
      id: (field) => `${idPrefix}-own-${field}`,
      saved: texts.valueOf,
      clean: texts.clean,
      rule: texts.rule,
      taken: (field, value) => texts.taken?.(field, value) ?? null,
      send: (field, value) => texts.setText(field, value),
      landed: texts.landed,
    };
  }

  function move(row: Row, direction: Direction) {
    const ids = shown.map((entry) => entry.id);
    const next = moveInOrder(ids, row.id, direction);
    if (!next) {
      announce(edgeSentence(words, direction, row.name));
      return;
    }
    focusNextRef.current = { id: buttonId(row.id, direction), force: false };
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
            result.problem.kind,
          );
          return;
        }
        editing.landed();
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
  // the confirmation's numbers, zeros for a row that holds nothing. The
  // database counts again in the statement that marks the row, and refuses
  // a delete that would take more (D-119).
  function remove(row: Row, index: number, told: Held) {
    focusNextRef.current = { id: afterDelete(index), force: true };
    announce(deletedSentence(words, row.name));
    startTransition(async () => {
      change({ kind: "remove", id: row.id });
      await editing.run(async () => {
        const result = await editing.call(() => actions.remove(row.id, told));
        if (!result.ok) {
          focusNextRef.current = {
            id: buttonId(row.id, "delete"),
            force: true,
          };
          editing.failChange(
            failureSentence(
              notDone(words, "notDeleted", row.name),
              describe(result.problem, row.name),
            ),
            result.problem.kind,
          );
          return;
        }
        for (const field of fields) {
          editing.dropField(fieldKey(field, row.id));
        }
        editing.landed();
      });
    });
  }

  // The sentence under the confirmation's question for the row it asks
  // about, read from the list as it is now.
  function askingNote(id: string): string | null {
    const row = shown.find((entry) => entry.id === id);
    return row ? (config.describeDelete?.(row) ?? null) : null;
  }

  // A row's Delete button. A list that asks first opens the confirmation,
  // which names what the row holds when the list counts it (D-119, D-221);
  // a list that does not removes the row on the press.
  function pressDelete(row: Row, index: number) {
    if (!config.deleteAsksFirst) {
      remove(row, index, HOLDS_NOTHING);
      return;
    }
    setAsking({
      id: row.id,
      name: row.name,
      held: config.held?.(row) ?? HOLDS_NOTHING,
    });
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
  // delete runs, carrying the numbers the question named.
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
        "gone",
      );
      return;
    }
    leaveAsking(afterDelete(index));
    remove(row, index, asking.held);
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
        kind: problem.kind,
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
    const key = `${idPrefix}-${lastAdd.current}`;
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
            kind: result.problem.kind,
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
        announce(addedSentence(words, row.name, total));
      });
    });
  }

  // A failed add's Remove. It was never saved, so nothing is sent. Focus
  // goes to the add field, where it can be typed again.
  function removeUnsaved(entry: PendingAdd) {
    setAdds((current) => removeAdd(current, entry.key));
    editing.reset(failureKeyOf(entry.key));
    document.getElementById(addFieldId)?.focus();
    announce(removedSentence(words, entry.name));
  }

  // Sends the list's own failed saves again, by key: a failed add, from its
  // own place in the list; the add field's refused name; one of the page's
  // own texts; a row's text. True when the key was this list's.
  function tryAgainKey(key: string, failedValue: string): boolean {
    if (isAddFailure(key)) {
      const entry = adds.find(
        (each) => failureKeyOf(each.key) === key && each.phase === "failed",
      );
      if (!entry) return false;
      setAdds((current) => addSentAgain(current, entry.key));
      send(entry.key, entry.name);
      return true;
    }
    if (key === ADD_KEY) {
      add();
      return true;
    }
    if (own) {
      const home = ownHome(own);
      const field = own.fields.find((candidate) => home.key(candidate) === key);
      if (field) {
        commitText(editing, home, field, true);
        return true;
      }
    }
    for (const row of shown) {
      const field = fields.find(
        (candidate) => fieldKey(candidate, row.id) === key,
      );
      if (field) {
        commitText(editing, rowHome(row), field, true);
        return true;
      }
    }
    void failedValue;
    return false;
  }

  // Focus goes to the first failed field, so it never rests on a control
  // that is about to leave the page, and every failed field a retry could
  // land is sent again: the page's other failures first, when the page
  // asked to be asked, then the list's own. A failure only a reload can
  // fix, a row or its parent gone, is never sent again (D-237).
  function tryAgain() {
    editing.focusFirstFailed();
    const { failures } = editing.peek();
    for (const key of Object.keys(failures)) {
      if (remedyOf(failures[key]?.kind ?? "") === "reload") continue;
      const value = failures[key]?.value ?? "";
      if (config.tryAgain?.(key, value)) continue;
      tryAgainKey(key, value);
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
    return textOf(editing, rowHome(row), field);
  }

  // The page's own texts, drawn above the list, or null when it has none.
  const ownTexts = own
    ? {
        fields: own.fields,
        words: own.words,
        fieldOf: (field: OwnField) => textOf(editing, ownHome(own), field),
      }
    : null;

  return {
    words,
    fields,
    link: config.link,
    // The page's one editing state, for another list or group on the same
    // page to share (D-145).
    editing,
    shown,
    // The rows not saved yet, after the saved ones (D-125).
    unsaved: addsShown(adds, new Set(shown.map((row) => row.id))),
    addFieldId,
    newName,
    addProblem: editing.failures[ADD_KEY]?.problem ?? blankAdd,
    // The question the confirmation asks, or null while it is closed, and
    // the sentence under it when the row has one.
    question: asking ? deleteQuestion(words, asking.name, asking.held) : null,
    questionNote: asking ? askingNote(asking.id) : null,
    asks: config.deleteAsksFirst,
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
    tryAgainKey,
    // Where focus belongs after the page next changes, for something else
    // on the page that moves focus the way the list does.
    focusNextRef,
  };
}

export type RowListState<
  Row extends ListRow,
  Field extends string,
  OwnField extends string = never,
> = ReturnType<typeof useRowList<Row, Field, OwnField>>;
