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
import type { ListRow, RowListState, SharedRowListState } from "./useRowList";

type Props<
  Row extends ListRow,
  Field extends string,
  Other extends { kind: string },
  OwnField extends string,
> = {
  list:
    | RowListState<Row, Field, Other, OwnField>
    | SharedRowListState<Row, Field, Other, OwnField>;
  // A lead for the rows, between the status and the list. A page whose
  // own texts come first puts what it says about its rows here, right above
  // them.
  intro?: string;
  // What the screen adds right after its own texts, before the status: a
  // section's page puts its choice lists here (D-166).
  afterOwn?: ReactNode;
  // What the screen adds after the add form: a section's page puts the
  // section's move here, under the same status and the same Undo.
  children?: ReactNode;
  // Whether the page's own texts are drawn here as text fields. A page that
  // draws one of them itself, a choice list's lead as a combo box, says
  // false and draws them before the list (D-166).
  drawOwn?: boolean;
  // Whether the saved status and Undo are drawn here. A list that shares
  // its page's editor says false: the page draws its one status (D-111).
  status?: boolean;
  // The level of each row's heading: 2 on a list page, 3 under a heading
  // of the page's own, as the choice lists sit under "Choice lists".
  rowHeading?: 2 | 3;
  // What each saved row adds after its buttons: an option's allergen group
  // (D-166).
  afterRow?: (row: Row) => ReactNode;
  // What each saved row adds after its texts and before its link and
  // buttons: a menu's publish state, one line of text (Q-115).
  afterFields?: (row: Row) => ReactNode;
  // The id of the heading that names the rows, for a list that sits under
  // a heading of the page's own: the rows are then an ordered list named
  // by it, apart from the page's own rows.
  labelledBy?: string;
};

// One editing list on the page (D-128): the page's own texts when it has
// them (D-135), the saved status and Undo, then the rows, then the add
// form. Every list is drawn here, so every row is the same row: a heading
// with the saved name, the name field, any other text the row has, a line
// the list adds under them when it has one (Q-115), then the link to the
// row's own page, Move up, Move down, and Delete.
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
  OwnField extends string = never,
>({
  list,
  intro,
  afterOwn,
  children,
  drawOwn = true,
  status = true,
  rowHeading = 2,
  afterRow,
  afterFields,
  labelledBy,
}: Props<Row, Field, Other, OwnField>) {
  const { words, fields, link, editing, shown, unsaved, own } = list;
  const { strings, editing: editingWords } = words;
  const RowHeading = rowHeading === 2 ? "h2" : "h3";
  const Rows = labelledBy ? "ol" : "ul";

  return (
    <>
      {own && drawOwn ? (
        // The page is the record these texts belong to, so their labels do
        // not name it.
        <div className="mt-6 flex flex-col gap-4">
          {own.fields.map((field) => {
            const spec = own.words.fields[field];
            return (
              <AutosaveTextField
                key={field}
                {...own.fieldOf(field)}
                label={spec.label}
                description={spec.hint}
                multiline={spec.multiline}
              />
            );
          })}
        </div>
      ) : null}

      {afterOwn}

      {status ? (
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
      ) : null}

      {intro ? <p className="mt-6 text-foreground-muted">{intro}</p> : null}

      {shown.length + unsaved.length > 0 ? (
        <Rows aria-labelledby={labelledBy} className="mt-6 flex flex-col gap-4">
          {shown.map((row, index) => {
            // Every field and button names its row. A field's label holds
            // the whole name, its words then the row, as one node (D-193);
            // a button's name, and the link's, is set whole, as a label,
            // because hidden text after the visible words would be read
            // with a space in front of the comma (D-112). The link is a
            // PageLink, so it waits for a save on its way and stays when
            // one has failed.
            const named = (action: string) =>
              rowAction(words, action, row.name);
            return (
              <li
                key={row.id}
                className="flex flex-col gap-3 rounded border border-border p-4"
              >
                <RowHeading className="text-xl font-bold">
                  {row.name}
                </RowHeading>
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
                      inputMode={spec.inputMode}
                      prefix={spec.prefix}
                    />
                  );
                })}
                {afterFields?.(row)}
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
                {afterRow?.(row)}
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
        </Rows>
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
          description={strings.newHint}
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
          description={list.questionNote ?? undefined}
          keepLabel={strings.keep ?? ""}
          confirmLabel={strings.remove}
          onKeep={list.keep}
          onConfirm={list.confirmDelete}
        />
      ) : null}
    </>
  );
}
