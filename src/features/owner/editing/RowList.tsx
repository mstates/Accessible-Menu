"use client";

import type { ReactNode } from "react";
import { Form } from "react-aria-components";
import { AlertDialog } from "@/ui/AlertDialog";
import { Button } from "@/ui/Button";
import { PageLink } from "@/ui/PageLink";
import { TextField } from "@/ui/TextField";
import { AutosaveTextField } from "./AutosaveTextField";
import { fieldSuffix, rowAction } from "./list-words";
import { SavedStatus } from "./SavedStatus";
import type { ListRow, RowListState } from "./useRowList";

type Props<
  Row extends ListRow,
  Field extends string,
  Other extends { kind: string },
> = {
  list: RowListState<Row, Field, Other>;
  // What the screen adds after the add form: a section's page puts the
  // section's move here, under the same status and the same Undo.
  children?: ReactNode;
};

// One editing list on the page (D-128): the saved status and Undo, then the
// rows, then the add form. Every list is drawn here, so every row is the
// same row: a heading with the saved name, the name field, any other text
// the row has, then the link to the row's own page, Move up, Move down, and
// Delete.
//
// The heading is what a screen reader moves by, row to row, once a list is
// long. It shows the saved name, never what is being typed, as the buttons'
// names do. A row not saved yet (D-125) is text only: no heading, no field,
// and no buttons, so nothing can rename, move, or delete it, and neither
// Tab nor the headings list lands on it.
export function RowList<
  Row extends ListRow,
  Field extends string,
  Other extends { kind: string } = never,
>({ list, children }: Props<Row, Field, Other>) {
  const { words, fields, link, editing, shown, unsaved } = list;
  const { strings, editing: editingWords } = words;

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <SavedStatus
          strings={editingWords}
          status={editing.status}
          notice={editing.notice}
          canRetry={Object.keys(editing.failures).length > 0}
          outOfDate={editing.outOfDate}
          onRetry={list.tryAgain}
        />
        <Button
          aria-disabled={list.undoText ? undefined : true}
          onPress={list.undoNewest}
        >
          {list.undoText ?? editingWords.undo}
        </Button>
      </div>

      {shown.length + unsaved.length > 0 ? (
        <ul className="mt-6 flex flex-col gap-4">
          {shown.map((row, index) => {
            // Every field and button names its row. A field's label is
            // followed by the row in hidden text; a button's name, and the
            // link's, is set whole, as a label, because hidden text after
            // the visible words would be read with a space in front of the
            // comma (D-112). The link is a PageLink, so it waits for a save
            // on its way and stays when one has failed.
            const named = (action: string) =>
              rowAction(words, action, row.name);
            return (
              <li
                key={row.id}
                className="flex flex-col gap-3 rounded border border-border p-4"
              >
                <h2 className="text-xl font-bold">{row.name}</h2>
                {fields.map((field) => {
                  const spec = words.fields[field];
                  return (
                    <AutosaveTextField
                      key={field}
                      {...list.fieldOf(row, field)}
                      label={spec.label}
                      labelSuffix={fieldSuffix(words, field, row.name)}
                      description={spec.hint}
                      multiline={spec.multiline}
                    />
                  );
                })}
                <div className="flex flex-wrap gap-3">
                  {link ? (
                    <PageLink
                      href={link.href(row)}
                      aria-label={named(link.label)}
                      className="inline-flex min-h-11 items-center text-link underline"
                    >
                      {link.label}
                    </PageLink>
                  ) : null}
                  <Button
                    id={list.buttonId(row.id, "up")}
                    aria-label={named(strings.moveUp)}
                    aria-disabled={index === 0 ? true : undefined}
                    onPress={() => list.move(row, "up")}
                  >
                    {strings.moveUp}
                  </Button>
                  <Button
                    id={list.buttonId(row.id, "down")}
                    aria-label={named(strings.moveDown)}
                    aria-disabled={
                      index === shown.length - 1 ? true : undefined
                    }
                    onPress={() => list.move(row, "down")}
                  >
                    {strings.moveDown}
                  </Button>
                  <Button
                    id={list.buttonId(row.id, "delete")}
                    aria-label={named(strings.remove)}
                    onPress={() => list.pressDelete(row, index)}
                  >
                    {strings.remove}
                  </Button>
                </div>
              </li>
            );
          })}
          {unsaved.map((entry) => {
            // A name sent from the add field, not in the list yet (D-125).
            // A failed one shows its error and the one button that takes it
            // out.
            const problem = list.unsavedProblem(entry);
            return (
              <li
                key={`add-${entry.key}`}
                className="flex flex-col gap-3 rounded border border-dashed border-border p-4"
              >
                <p className="font-semibold">{entry.name}</p>
                {entry.phase === "landed" ? null : (
                  <p className="text-sm text-foreground-muted">
                    {editingWords.notSavedYet}
                  </p>
                )}
                {problem ? (
                  <p className="text-sm font-semibold">{problem}</p>
                ) : null}
                {entry.phase === "failed" ? (
                  <div className="flex flex-wrap gap-3">
                    <Button
                      aria-label={rowAction(
                        words,
                        editingWords.removeUnsaved,
                        entry.name,
                      )}
                      onPress={() => list.removeUnsaved(entry)}
                    >
                      {editingWords.removeUnsaved}
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
          list.add();
        }}
        validationBehavior="aria"
        className="mt-6 flex flex-col gap-3"
      >
        <TextField
          id={list.addFieldId}
          label={strings.newLabel}
          autoComplete="off"
          value={list.newName}
          onChange={list.typeNewName}
          isInvalid={list.addProblem ? true : undefined}
          errorMessage={list.addProblem ?? undefined}
        />
        <div>
          <Button type="submit">{strings.add}</Button>
        </div>
      </Form>

      {children}

      {list.asks ? (
        <AlertDialog
          isOpen={list.question !== null}
          title={list.question ?? ""}
          keepLabel={strings.keep ?? ""}
          confirmLabel={strings.remove}
          onKeep={list.keep}
          onConfirm={list.confirmDelete}
        />
      ) : null}
    </>
  );
}
