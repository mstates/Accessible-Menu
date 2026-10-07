"use client";

import { startTransition, useState } from "react";
import { useAnnounce } from "@/core/a11y/announcer";
import { Button } from "@/ui/Button";
import { Select, type SelectGroup } from "@/ui/Select";
import type { EditingStrings } from "../editing/list-words";
import type { Editing } from "../editing/useEditing";
import { moveDish } from "./actions";
import {
  movedSentence,
  notMovedSentence,
  type DishUndo,
  type MoveStrings,
} from "./dish-words";

type Props = {
  strings: MoveStrings;
  editing: EditingStrings;
  // The page's sentence for a dish that is no longer here.
  dishGone: string;
  code: string;
  dish: { id: string; name: string };
  // The section the dish is in now, and its menu.
  section: { id: string; name: string };
  menu: { id: string; name: string };
  // The sections it can move to, each under its menu, in order: every live
  // section of every live menu of the restaurant but this one.
  targets: SelectGroup[];
  // The page's one editing state and its one Undo (D-111).
  saves: Editing;
  record: (entry: DishUndo) => void;
  // Says a sentence once the page shows the dish in that section.
  sayOnceIn: (sectionId: string, sentence: string) => void;
};

// Moves the dish to another section of the restaurant (D-129). The sections
// are listed under their menus, so a reader says which menu a section sits
// in. Choosing a section sends nothing; the button does, so nothing happens
// on input alone. The move waits its turn behind every save on its way, the
// dish goes last in the section it moves to, with its sizes, and it is said
// once, with focus still on the button. The page stays where it is: its
// address names the dish, so only the breadcrumb, the title, and the next
// dish link change (D-128). The move's sentence is left to the page, which
// says it once the breadcrumb has changed (D-141). A restaurant with no
// other section has nowhere to move a dish, so the group is not there at
// all.
export function MoveDish({
  strings,
  editing: words,
  dishGone,
  code,
  dish,
  section,
  menu,
  targets,
  saves,
  record,
  sayOnceIn,
}: Props) {
  const announce = useAnnounce();
  const [choice, setChoice] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  function move() {
    const group = targets.find((candidate) =>
      candidate.items.some((item) => item.id === choice),
    );
    const target = group?.items.find((item) => item.id === choice);
    if (!group || !target) {
      setMissing(true);
      announce(strings.choose);
      return;
    }
    startTransition(async () => {
      await saves.run(async () => {
        const result = await saves.call(() =>
          moveDish(code, dish.id, target.id),
        );
        if (!result.ok) {
          saves.failChange(
            notMovedSentence(
              strings,
              words,
              dishGone,
              result.problem,
              dish.name,
              target.label,
            ),
          );
          return;
        }
        saves.landed();
        record({
          kind: "relocate",
          id: dish.id,
          name: dish.name,
          from: {
            id: section.id,
            name: section.name,
            menu: menu.name,
            order: result.value.order,
          },
          to: { id: target.id, name: target.label, menu: group.label },
        });
        setChoice(null);
        sayOnceIn(
          target.id,
          movedSentence(strings, dish.name, target.label, group.label),
        );
      });
    });
  }

  if (targets.length === 0) return null;

  return (
    <div className="mt-10 flex flex-col gap-3">
      <h2 className="text-xl font-bold">{strings.heading}</h2>
      <Select
        label={strings.label}
        placeholder={strings.placeholder}
        groups={targets}
        selectedKey={choice}
        onSelectionChange={(key) => {
          setChoice(key === null ? null : String(key));
          setMissing(false);
        }}
        validationBehavior="aria"
        isInvalid={missing ? true : undefined}
        errorMessage={missing ? strings.choose : undefined}
      />
      <div>
        <Button onPress={move}>{strings.submit}</Button>
      </div>
    </div>
  );
}
