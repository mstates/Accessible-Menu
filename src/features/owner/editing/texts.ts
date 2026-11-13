"use client";

import { startTransition } from "react";
import { commitOf } from "./commit";
import {
  failureSentence,
  notSavedSentence,
  problemText,
  type ListProblem,
  type TextWords,
} from "./list-words";
import type { Editing } from "./useEditing";

// The path every text on an owner page takes when it is committed (D-111,
// D-118): a row's texts on the three lists, a page's own texts above its
// list (D-135), and the texts of a page with no list, the dish page. That
// third use is what module rule 12 waits for, so the path lives here and
// useRowList and the dish page both call it. The page's one editing state
// is handed in, so whatever a page holds, it keeps one queue and one saved
// status.

export type ListRow = { id: string; name: string };

export type ListResult<Value = null> =
  { ok: true; value: Value } | { ok: false; problem: ListProblem };

// Where a text lives, a row of a list or the page's own record, and all a
// save of it needs to know: its key in the editing state, its element id,
// its saved value, its rules and words, and how it is sent.
export type TextHome<F extends string> = {
  row: ListRow;
  words: TextWords<F>;
  key: (field: F) => string;
  id: (field: F) => string;
  saved: (field: F) => string;
  clean: (field: F, value: string) => string;
  rule: (field: F, value: string) => string | null;
  // The row that already has this name, for a row's name only.
  taken: (field: F, value: string) => ListRow | null;
  send: (field: F, value: string) => Promise<ListResult<Record<F, string>>>;
  // A save of this text landed, with the server's answer: for a record that
  // carries more than its texts, what else that answer holds (an option's
  // allergen check, cleared by a rename, D-166).
  landed?: (field: F, value: Record<F, string>) => void;
};

// What one text shows, and what it does when it is typed in or committed.
export type TextState = {
  id: string;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onCommit: () => void;
};

export function failText<F extends string>(
  editing: Editing,
  home: TextHome<F>,
  field: F,
  problem: ListProblem,
  name: string,
  value: string,
): void {
  const text = problemText(home.words, problem, name);
  editing.failField(home.key(field), {
    fieldId: home.id(field),
    kind: problem.kind,
    problem: text,
    sentence: failureSentence(
      notSavedSentence(home.words, field, home.row.name),
      text,
    ),
    value,
  });
}

// One text was committed. Nothing is sent unless the value changed. Try
// again passes force, which sends the value that failed once more.
export function commitText<F extends string>(
  editing: Editing,
  home: TextHome<F>,
  field: F,
  force = false,
): void {
  const key = home.key(field);
  const now = editing.peek();
  const typed = now.drafts[key] ?? null;
  const saved = home.saved(field);
  const decision = commitOf(
    {
      saved,
      draft: typed,
      inFlight: now.sent[key] ?? null,
      failed: force ? null : (now.failures[key]?.value ?? null),
    },
    (value) => home.clean(field, value),
  );
  if (decision.kind === "nothing") return;
  if (decision.kind === "reset") {
    editing.reset(key);
    return;
  }
  const value = decision.value;
  const rule = home.rule(field, value);
  if (rule) {
    failText(editing, home, field, { kind: "invalid", rule }, value, value);
    return;
  }
  const taken = home.taken(field, value);
  if (taken) {
    failText(editing, home, field, { kind: "name-taken" }, taken.name, value);
    return;
  }
  editing.sending(key, value);
  startTransition(async () => {
    await editing.run(async () => {
      const result = await editing.call(() => home.send(field, value));
      editing.answered(key);
      if (!result.ok) {
        failText(editing, home, field, result.problem, value, value);
        return;
      }
      editing.landedField(key, typed);
      home.landed?.(field, result.value);
    });
  });
}

export function textOf<F extends string>(
  editing: Editing,
  home: TextHome<F>,
  field: F,
): TextState {
  const key = home.key(field);
  return {
    id: home.id(field),
    value: editing.drafts[key] ?? home.saved(field),
    error: editing.failures[key]?.problem ?? null,
    onChange: (value: string) => editing.type(key, value),
    onCommit: () => commitText(editing, home, field),
  };
}
