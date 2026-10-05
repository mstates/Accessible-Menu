"use client";

import {
  startTransition,
  useLayoutEffect,
  useOptimistic,
  useRef,
  useState,
} from "react";
import { Form } from "react-aria-components";
import type { Copy } from "@/copy";
import { fill } from "@/copy/fill";
import { Announcer, useAnnounce } from "@/core/a11y/announcer";
import { inOrder, moveInOrder, nameTaken } from "@/domain/menu";
import {
  cleanSectionText,
  SECTION_TEXTS,
  sectionTextProblem,
  type OwnerSection,
  type SectionText,
} from "@/domain/section";
import { Button } from "@/ui/Button";
import { TextField } from "@/ui/TextField";
import { AutosaveTextField } from "./editing/AutosaveTextField";
import { commitOf } from "./editing/commit";
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
} from "./editing/pending-adds";
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
  addSection,
  deleteSection,
  orderSections,
  restoreSection,
  setSectionText,
} from "./section-actions";
import {
  addedSentence,
  edgeSentence,
  failureSentence,
  movedSentence,
  notSavedSentence,
  notUndoneSentence,
  problemText,
  sectionUndoSchema,
  undoLabel,
  undoneSentence,
  type SectionProblem,
  type SectionUndo,
} from "./section-messages";

type Props = {
  strings: Copy["owner"]["sections"];
  editing: Copy["owner"]["editing"];
  code: string;
  menuId: string;
  // The menu's sections that are not deleted, in order, as the server holds
  // them. Every save ends with a refresh, so this is always the truth.
  sections: OwnerSection[];
};

type Direction = "up" | "down";

// What the screen shows before the server has answered: a move and a delete
// happen at once and fall away by themselves if the save fails.
type ListChange =
  { kind: "order"; ids: string[] } | { kind: "remove"; id: string };

function applyChange(
  sections: OwnerSection[],
  change: ListChange,
): OwnerSection[] {
  return change.kind === "remove"
    ? sections.filter((section) => section.id !== change.id)
    : inOrder(sections, change.ids);
}

const ADD_KEY = "add";
const addFieldId = "section-new-name";

function fieldKey(field: SectionText, id: string): string {
  return `${field}:${id}`;
}

function fieldId(field: SectionText, id: string): string {
  return `section-${id}-${field}`;
}

function buttonId(id: string, action: Direction | "delete"): string {
  return `section-${id}-${action}`;
}

// The sections of one menu (D-111, D-120). It is the menus list again with
// three fields in a row: the name, the note, which takes several lines and
// saves only when it is left, and the line shown with every dish. Each is a
// real field that saves when it is committed, and only if it changed. Move
// up and Move down are buttons in every row (D-112). Delete asks nothing: a
// section holds no dishes yet, and Undo brings it back (D-119). One saved
// status and one Undo sit above the list. The status is never spoken; a
// field that saves, a failure, a move, a delete, an add, and an Undo are
// said once through the log at the end (D-118). A name added with Enter
// leaves the field at once and shows as a row marked not saved yet, its add
// waiting its turn behind every save before it; nothing typed is dropped or
// erased (D-125).
//
// The handlers below repeat MenuList's, in the same order under the same
// names. This is their second use; the third, the dishes inside a section,
// is where they become one shared piece (module rule 12).
export function SectionList(props: Props) {
  return (
    <Announcer>
      <SectionRows {...props} />
    </Announcer>
  );
}

function SectionRows({
  strings,
  editing: words,
  code,
  menuId,
  sections,
}: Props) {
  const announce = useAnnounce();
  const editing = useEditing(words);
  const undo = useUndoStack(`undo:${code}:menu:${menuId}`, sectionUndoSchema);
  const [shown, change] = useOptimistic(sections, applyChange);
  const [newName, setNewName] = useState("");
  const [blankAdd, setBlankAdd] = useState<string | null>(null);

  // Names sent from the add field that the list does not show yet (D-125).
  // Each new list from the server holds every add that had landed by then,
  // so those rows give way to their real ones in the same render.
  const [adds, setAdds] = useState<PendingAdd[]>([]);
  const [listed, setListed] = useState(sections);
  if (listed !== sections) {
    setListed(sections);
    setAdds(settleAdds);
  }
  const lastAdd = useRef(0);

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

  function describe(problem: SectionProblem, name: string): string {
    return problemText(strings, words, problem, name);
  }

  function failText(
    section: OwnerSection,
    field: SectionText,
    problem: SectionProblem,
    name: string,
    value: string,
  ) {
    const text = describe(problem, name);
    editing.failField(fieldKey(field, section.id), {
      fieldId: fieldId(field, section.id),
      problem: text,
      sentence: failureSentence(
        notSavedSentence(strings, field, section.name),
        text,
      ),
      value,
    });
  }

  // One of a section's three fields was committed. Nothing is sent unless
  // the value changed. Try again passes force, which sends the value that
  // failed once more.
  function commitText(
    section: OwnerSection,
    field: SectionText,
    force = false,
  ) {
    const key = fieldKey(field, section.id);
    const now = editing.peek();
    const typed = now.drafts[key] ?? null;
    const decision = commitOf(
      {
        saved: section[field],
        draft: typed,
        inFlight: now.sent[key] ?? null,
        failed: force ? null : (now.failures[key]?.value ?? null),
      },
      (value) => cleanSectionText(field, value),
    );
    if (decision.kind === "nothing") return;
    if (decision.kind === "reset") {
      editing.reset(key);
      return;
    }
    const value = decision.value;
    const rule = sectionTextProblem(field, value);
    if (rule) {
      failText(section, field, { kind: "invalid", rule }, value, value);
      return;
    }
    if (field === "name") {
      const other = nameTaken(shown, section.id, value);
      if (other) {
        failText(section, field, { kind: "name-taken" }, other.name, value);
        return;
      }
    }
    editing.sending(key, value);
    startTransition(async () => {
      await editing.run(async () => {
        const result = await editing.call(() =>
          setSectionText(code, menuId, section.id, field, value),
        );
        editing.answered(key);
        if (!result.ok) {
          failText(section, field, result.problem, value, value);
          return;
        }
        editing.landedField(key, typed);
        undo.replace(
          pushUndo<SectionUndo>(
            undo.peek(),
            field === "name"
              ? {
                  kind: "rename",
                  id: section.id,
                  from: section.name,
                  to: result.value.name,
                }
              : {
                  kind: "text",
                  field,
                  id: section.id,
                  name: section.name,
                  from: section[field],
                  to: result.value[field],
                },
          ),
        );
      });
    });
  }

  function move(section: OwnerSection, direction: Direction) {
    const ids = shown.map((entry) => entry.id);
    const next = moveInOrder(ids, section.id, direction);
    if (!next) {
      announce(edgeSentence(strings, direction, section.name));
      return;
    }
    focusNext.current = { id: buttonId(section.id, direction), force: false };
    announce(
      movedSentence(
        strings,
        direction,
        section.name,
        next.indexOf(section.id) + 1,
        next.length,
      ),
    );
    startTransition(async () => {
      change({ kind: "order", ids: next });
      await editing.run(async () => {
        const result = await editing.call(() =>
          orderSections(code, menuId, next),
        );
        if (!result.ok) {
          editing.failChange(
            failureSentence(
              fill(strings.notMoved, { section: section.name }),
              describe(result.problem, section.name),
            ),
          );
          return;
        }
        editing.landed();
        undo.replace(
          pushUndo<SectionUndo>(undo.peek(), {
            kind: "move",
            id: section.id,
            name: section.name,
            order: ids,
          }),
        );
      });
    });
  }

  function remove(section: OwnerSection, index: number) {
    const ids = shown.map((entry) => entry.id);
    const neighbor = shown[index + 1] ?? shown[index - 1];
    focusNext.current = {
      id: neighbor ? fieldId("name", neighbor.id) : addFieldId,
      force: true,
    };
    announce(fill(strings.deleted, { section: section.name }));
    startTransition(async () => {
      change({ kind: "remove", id: section.id });
      await editing.run(async () => {
        const result = await editing.call(() =>
          deleteSection(code, menuId, section.id),
        );
        if (!result.ok) {
          focusNext.current = {
            id: buttonId(section.id, "delete"),
            force: true,
          };
          editing.failChange(
            failureSentence(
              fill(strings.notDeleted, { section: section.name }),
              describe(result.problem, section.name),
            ),
          );
          return;
        }
        for (const field of SECTION_TEXTS) {
          editing.dropField(fieldKey(field, section.id));
        }
        editing.landed();
        undo.replace(
          pushUndo<SectionUndo>(undo.peek(), {
            kind: "delete",
            id: section.id,
            name: section.name,
            order: ids,
          }),
        );
      });
    });
  }

  // The inverse of one change, and where it left the section in the list.
  async function reverse(
    entry: SectionUndo,
  ): Promise<
    | { ok: true; position: number; total: number }
    | { ok: false; problem: SectionProblem }
  > {
    // A text and an add say nothing about a place in the list.
    const nowhere = { position: 0, total: 0 };
    switch (entry.kind) {
      case "rename": {
        // Only if the name is still the one that change wrote.
        const result = await editing.call(() =>
          setSectionText(code, menuId, entry.id, "name", entry.from, entry.to),
        );
        return result.ok ? { ok: true, ...nowhere } : result;
      }
      case "text": {
        // Only if the field still holds what that change wrote.
        const result = await editing.call(() =>
          setSectionText(
            code,
            menuId,
            entry.id,
            entry.field,
            entry.from,
            entry.to,
          ),
        );
        return result.ok ? { ok: true, ...nowhere } : result;
      }
      case "add": {
        const result = await editing.call(() =>
          deleteSection(code, menuId, entry.id),
        );
        return result.ok ? { ok: true, ...nowhere } : result;
      }
      case "delete": {
        const result = await editing.call(() =>
          restoreSection(code, menuId, entry.id, entry.order),
        );
        if (!result.ok) return result;
        return {
          ok: true,
          position: result.value.position || entry.order.indexOf(entry.id) + 1,
          total: result.value.total || entry.order.length,
        };
      }
      case "move": {
        const result = await editing.call(() =>
          orderSections(code, menuId, entry.order),
        );
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
  // A name that passes leaves the field at once and shows as a row marked
  // not saved yet; its add is sent in turn, behind every save before it, so
  // an add pressed while another is on its way is never dropped (D-125).
  function add() {
    const value = cleanSectionText("name", newName);
    const refuse = (problem: SectionProblem, name: string) => {
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
          fill(strings.notAdded, { section: value }),
          text,
        ),
        value,
      });
    };
    const rule = sectionTextProblem("name", value);
    if (rule) {
      refuse({ kind: "invalid", rule }, value);
      return;
    }
    const other = nameTaken([...shown, ...addsAsRows(adds)], null, value);
    if (other) {
      refuse({ kind: "name-taken" }, other.name);
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
        const result = await editing.call(() =>
          addSection(code, menuId, value),
        );
        if (!result.ok) {
          const text = describe(result.problem, value);
          setAdds((current) => addFailed(current, key));
          editing.failField(failureKeyOf(key), {
            fieldId: addFieldId,
            problem: text,
            sentence: failureSentence(
              fill(strings.notAdded, { section: value }),
              text,
            ),
            value,
          });
          return;
        }
        const { section, total } = result.value;
        setAdds((current) => addLanded(current, key, section.id));
        editing.reset(failureKeyOf(key));
        editing.landed();
        undo.replace(
          pushUndo<SectionUndo>(undo.peek(), {
            kind: "add",
            id: section.id,
            name: section.name,
          }),
        );
        announce(addedSentence(strings, section.name, total));
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
    announce(fill(strings.removed, { section: entry.name }));
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
      for (const section of shown) {
        const field = SECTION_TEXTS.find(
          (candidate) => fieldKey(candidate, section.id) === key,
        );
        if (field) commitText(section, field, true);
      }
    }
  }

  const newest = newestUndo(undo.stack);
  const addProblem = editing.failures[ADD_KEY]?.problem ?? blankAdd;
  const unsaved = addsShown(adds, new Set(shown.map((section) => section.id)));

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

      {shown.length + unsaved.length > 0 ? (
        <ul className="mt-6 flex flex-col gap-4">
          {shown.map((section, index) => {
            // Every field and button names its section. A field's label is
            // followed by the section in hidden text; a button's name is set
            // whole, as a label, because hidden text after the visible words
            // would be read with a space in front of the comma (D-112).
            const forSection = fill(strings.labelFor, {
              section: section.name,
            });
            const named = (action: string) =>
              fill(strings.rowAction, { action, section: section.name });
            const field = (text: SectionText) => {
              const key = fieldKey(text, section.id);
              return {
                id: fieldId(text, section.id),
                value: editing.drafts[key] ?? section[text],
                error: editing.failures[key]?.problem ?? null,
                onChange: (value: string) => editing.type(key, value),
                onCommit: () => commitText(section, text),
              };
            };
            return (
              <li
                key={section.id}
                className="flex flex-col gap-3 rounded border border-border p-4"
              >
                <AutosaveTextField
                  {...field("name")}
                  label={strings.nameLabel}
                  labelSuffix={forSection}
                />
                <AutosaveTextField
                  {...field("note")}
                  label={strings.noteLabel}
                  labelSuffix={forSection}
                  description={strings.noteHint}
                  multiline
                />
                <AutosaveTextField
                  {...field("everyItem")}
                  label={strings.everyItemLabel}
                  labelSuffix={fill(strings.everyItemIn, {
                    section: section.name,
                  })}
                  description={strings.everyItemHint}
                />
                <div className="flex flex-wrap gap-3">
                  <Button
                    id={buttonId(section.id, "up")}
                    aria-label={named(strings.moveUp)}
                    aria-disabled={index === 0 ? true : undefined}
                    onPress={() => move(section, "up")}
                  >
                    {strings.moveUp}
                  </Button>
                  <Button
                    id={buttonId(section.id, "down")}
                    aria-label={named(strings.moveDown)}
                    aria-disabled={
                      index === shown.length - 1 ? true : undefined
                    }
                    onPress={() => move(section, "down")}
                  >
                    {strings.moveDown}
                  </Button>
                  <Button
                    id={buttonId(section.id, "delete")}
                    aria-label={named(strings.remove)}
                    onPress={() => remove(section, index)}
                  >
                    {strings.remove}
                  </Button>
                </div>
              </li>
            );
          })}
          {unsaved.map((entry) => {
            // A name sent from the add field, not in the list yet (D-125).
            // Until it lands it is text only: no field and no buttons, so
            // nothing can rename, move, or delete it. A failed one shows its
            // error and the one button that takes it out.
            const problem =
              entry.phase === "failed"
                ? editing.failures[failureKeyOf(entry.key)]?.problem
                : undefined;
            return (
              <li
                key={`add-${entry.key}`}
                className="flex flex-col gap-3 rounded border border-dashed border-border p-4"
              >
                <p className="font-semibold">{entry.name}</p>
                {entry.phase === "landed" ? null : (
                  <p className="text-sm text-foreground-muted">
                    {words.notSavedYet}
                  </p>
                )}
                {problem ? (
                  <p className="text-sm font-semibold">{problem}</p>
                ) : null}
                {entry.phase === "failed" ? (
                  <div className="flex flex-wrap gap-3">
                    <Button
                      aria-label={fill(strings.rowAction, {
                        action: words.removeUnsaved,
                        section: entry.name,
                      })}
                      onPress={() => removeUnsaved(entry)}
                    >
                      {words.removeUnsaved}
                    </Button>
                  </div>
                ) : null}
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
            if (cleanSectionText("name", value) === "") editing.reset(ADD_KEY);
            else editing.type(ADD_KEY, value);
          }}
          isInvalid={addProblem ? true : undefined}
          errorMessage={addProblem ?? undefined}
        />
        <div>
          <Button type="submit">{strings.add}</Button>
        </div>
      </Form>
    </>
  );
}
