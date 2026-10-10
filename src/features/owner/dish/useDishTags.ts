"use client";

import { startTransition, useOptimistic } from "react";
import { fill } from "@/copy/fill";
import {
  dietarySentence,
  sameTags,
  toggleTag,
  type DietaryCopy,
} from "@/domain/dietary";
import type { OwnerDishDetail } from "@/domain/dish";
import { isDietaryTag } from "@/domain/dietary";
import type { DietaryTagId } from "@/domain/types";
import { useConfirmed } from "../editing/confirmed";
import {
  failureSentence,
  problemText,
  undoOutcome,
  type EditingStrings,
  type TextWords,
} from "../editing/list-words";
import type { TextEditor } from "../editing/texts";
import { pushUndo } from "../editing/undo";
import type { DishStrings, DishUndo } from "./dish-words";
import { setDishTags } from "./schedule-actions";
import {
  tagsUndoneSentence,
  type Reversed,
  type TagsUndo,
} from "./schedule-words";

// The dietary tags on a dish's page (D-66, task 5): three boxes, each a
// save at once through the page's queue, "Saved." once when it lands
// (D-118), and the sentence diners read under them. Every write sends the
// whole list and carries the list the page last showed, read when the
// queue sends it, and lands only if the dish still holds it (D-149's rule,
// widened to tags at the plan): a miss writes nothing, the refreshed page
// shows the tags as they are now, and one sentence says so, with no Try
// again. Undo puts the list back only while the dish still holds the list
// the change left.

type Props = {
  strings: DishStrings;
  editingStrings: EditingStrings;
  code: string;
  dish: OwnerDishDetail;
  editor: TextEditor<DishUndo>;
  // The dish's words, for problems said with the dish's name.
  words: TextWords;
  names: DietaryCopy;
};

export const TAGS_HEADING_ID = "dish-tags-heading";
export const TAGS_SENTENCE_ID = "dish-tags-sentence";
export const tagBoxId = (id: DietaryTagId) => `dish-tag-${id}`;
const tagKey = (id: DietaryTagId) => `tag:${id}`;
const KEY_PREFIX = "tag:";

export function useDishTags({
  strings,
  editingStrings,
  code,
  dish,
  editor,
  words,
  names,
}: Props) {
  const { editing } = editor;
  const copy = strings.tags;
  const confirmedRef = useConfirmed(dish.tags);
  const [shown, show] = useOptimistic(
    dish.tags,
    (
      current: DietaryTagId[],
      patch: (list: DietaryTagId[]) => DietaryTagId[],
    ) => patch(current),
  );

  function record(entry: DishUndo) {
    editor.undo.replace(pushUndo(editor.undo.peek(), entry));
  }

  function setTag(id: DietaryTagId, on: boolean, force = false) {
    const key = tagKey(id);
    editing.sending(key, on ? "on" : "off");
    startTransition(async () => {
      show((list) => toggleTag(list, id, on));
      await editing.run(async () => {
        const before = confirmedRef.current;
        const after = toggleTag(before, id, on);
        if (!force && sameTags(after, before)) {
          editing.answered(key);
          return;
        }
        const result = await editing.call(() =>
          setDishTags(code, dish.id, after, before),
        );
        editing.answered(key);
        if (!result.ok) {
          if (result.problem.kind === "tags-changed") {
            editing.dropField(key);
            editing.failChange(copy.tagsMoved);
            return;
          }
          const text = problemText(words, result.problem, dish.name);
          editing.failField(key, {
            fieldId: tagBoxId(id),
            problem: text,
            sentence: failureSentence(
              fill(copy.notSaved, { dish: dish.name }),
              text,
            ),
            value: on ? "on" : "off",
          });
          return;
        }
        editing.landedField(key, null);
        confirmedRef.current = result.value.tags;
        record({
          kind: "tags",
          id: dish.id,
          name: dish.name,
          tag: id,
          on,
          before,
          after: result.value.tags,
        });
      });
    });
  }

  // The inverse of a tick: the list as it was, while the dish still holds
  // the list the tick left.
  async function reverse(entry: TagsUndo): Promise<Reversed> {
    const result = await editing.call(() =>
      setDishTags(code, dish.id, entry.before, entry.after),
    );
    if (!result.ok) {
      if (result.problem.kind === "tags-changed") {
        return {
          ok: false,
          outcome: "stale",
          sentence: copy.undo.tagsChanged,
        };
      }
      return {
        ok: false,
        outcome: undoOutcome(result.problem),
        sentence: failureSentence(
          editingStrings.notUndone,
          problemText(words, result.problem, dish.name),
        ),
      };
    }
    confirmedRef.current = result.value.tags;
    return { ok: true, sentence: tagsUndoneSentence(copy, names.names, entry) };
  }

  // Sends a failed tick again, with the value that failed.
  function tryAgain(key: string, failedValue: string): boolean {
    if (!key.startsWith(KEY_PREFIX)) return false;
    const id = key.slice(KEY_PREFIX.length);
    if (isDietaryTag(id)) setTag(id, failedValue === "on", true);
    return true;
  }

  return {
    shown,
    set: setTag,
    errorOf: (id: DietaryTagId): string | null =>
      editing.failures[tagKey(id)]?.problem ?? null,
    sentence: dietarySentence(shown, names),
    reverse,
    tryAgain,
  };
}

export type DishTagsState = ReturnType<typeof useDishTags>;
