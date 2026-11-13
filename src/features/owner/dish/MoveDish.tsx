"use client";

import { unstable_isUnrecognizedActionError } from "next/navigation";
import { useState, useTransition } from "react";
import { useAnnounce } from "@/core/a11y/announcer";
import { AreaHeading } from "@/ui/AreaHeading";
import { Button } from "@/ui/Button";
import { Select, type SelectGroup } from "@/ui/Select";
import type { EditingStrings } from "../editing/list-words";
import { moveDish, type DishMoveResult } from "./actions";
import {
  movedSentence,
  notMovedSentence,
  type DishMoveProblem,
  type MoveStrings,
} from "./dish-words";

type Props = {
  strings: MoveStrings;
  editing: EditingStrings;
  // The hold's words, "in progress" (D-209).
  pendingLabel: string;
  // The page's sentence for a dish that is no longer here.
  dishGone: string;
  code: string;
  dish: { id: string; name: string };
  // The sections it can move to, each under its menu, in order: every live
  // section of every live menu of the restaurant but this one.
  targets: SelectGroup[];
  // The form above holds unsaved changes: the button says to save first
  // and sends nothing (D-237).
  saveFirst: boolean;
  // A save of the form above is on its way, and the page with it.
  held: boolean;
  // Tells the page a move is on its way, so an owner link holds for it.
  onMoving: (moving: boolean) => void;
  // Says a sentence once the page shows the dish in that section.
  sayOnceIn: (sectionId: string, sentence: string) => void;
};

// Moves the dish to another section of the restaurant (D-129), a press of
// its own under the General form (D-237). The sections are listed under
// their menus, so a reader says which menu a section sits in. Choosing a
// section sends nothing; the button does, so nothing happens on input
// alone. While the form holds unsaved changes the button is an inactive
// one: it keeps focus, says "Save general first.", and sends nothing, as
// Apply does on Allergens. A move on its way holds its button (D-209) and
// holds an owner link. The dish goes last in the section it moves to, with
// its sizes, and it is said once, with focus still on the button. The page
// stays where it is: its address names the dish, so only the breadcrumb,
// the title, and the next dish link change (D-128). The move's sentence is
// left to the page, which says it once the breadcrumb has changed (D-141).
// A move that fails says its sentence once and keeps it on a line under
// the button; the page has no saved status and no Try again, since the
// button is still there to press. A restaurant with no other section has
// nowhere to move a dish, so the group is not there at all.
export function MoveDish({
  strings,
  editing: words,
  pendingLabel,
  dishGone,
  code,
  dish,
  targets,
  saveFirst,
  held,
  onMoving,
  sayOnceIn,
}: Props) {
  const announce = useAnnounce();
  const [moving, startMove] = useTransition();
  const [choice, setChoice] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  function move() {
    if (saveFirst) {
      announce(strings.saveFirst);
      return;
    }
    if (held || moving) return;
    const group = targets.find((candidate) =>
      candidate.items.some((item) => item.id === choice),
    );
    const target = group?.items.find((item) => item.id === choice);
    if (!group || !target) {
      setMissing(true);
      announce(strings.choose);
      return;
    }
    setFailure(null);
    onMoving(true);
    startMove(async () => {
      let result: DishMoveResult | { ok: false; problem: DishMoveProblem };
      try {
        result = await moveDish(code, dish.id, target.id);
      } catch (error) {
        const stale = unstable_isUnrecognizedActionError(error);
        result = {
          ok: false,
          problem: { kind: stale ? "out-of-date" : "unreachable" },
        };
      }
      onMoving(false);
      if (!result.ok) {
        const text = notMovedSentence(
          strings,
          words,
          dishGone,
          result.problem,
          dish.name,
          target.label,
        );
        setFailure(text);
        announce(text);
        return;
      }
      setChoice(null);
      sayOnceIn(
        target.id,
        movedSentence(strings, dish.name, target.label, group.label),
      );
    });
  }

  if (targets.length === 0) return null;

  return (
    <div className="mt-10 flex flex-col gap-3">
      <AreaHeading>{strings.heading}</AreaHeading>
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
        <Button
          aria-disabled={saveFirst ? true : undefined}
          isPending={moving}
          pendingLabel={pendingLabel}
          onPress={move}
        >
          {strings.submit}
        </Button>
      </div>
      {failure !== null ? <p>{failure}</p> : null}
    </div>
  );
}
