"use client";

import { startTransition, useState } from "react";
import type { Copy } from "@/copy";
import { useAnnounce } from "@/core/a11y/announcer";
import type { OwnerMenu } from "@/domain/menu";
import { Button } from "@/ui/Button";
import { Select } from "@/ui/Select";
import { moveSection } from "./dish-actions";
import type { Editing } from "./editing/useEditing";
import {
  movedSentence,
  notMovedSentence,
  type MoveStrings,
  type SectionMove,
} from "./section-move";

type Props = {
  strings: MoveStrings;
  editing: Copy["owner"]["editing"];
  // The page's sentence for a section that is no longer here.
  sectionGone: string;
  code: string;
  section: { id: string; name: string };
  // The menu the section is in now, and the restaurant's other menus, in
  // order: the ones it can move to.
  menu: OwnerMenu;
  otherMenus: OwnerMenu[];
  // The page's one editing state and its one Undo, which the dishes above
  // share (D-111).
  saves: Editing;
  record: (entry: SectionMove) => void;
  // Says a sentence once the page shows the section in that menu.
  sayOnceIn: (menuId: string, sentence: string) => void;
};

// Moves the section to another menu of the restaurant (D-129). Choosing a
// menu sends nothing; the button does, so nothing happens on input alone.
// The move waits its turn behind every save on its way, the section goes
// last in the menu it moves to, with its dishes, and it is said once, with
// focus still on the button. The page stays where it is: its address names
// the section, not the menu, so only the breadcrumb and the title change
// (D-128). The move's sentence is left to the page, which says it once the
// breadcrumb has changed. A restaurant with one menu has nowhere to move a
// section, so the group is not there at all.
export function MoveSection({
  strings,
  editing: words,
  sectionGone,
  code,
  section,
  menu,
  otherMenus,
  saves,
  record,
  sayOnceIn,
}: Props) {
  const announce = useAnnounce();
  const [choice, setChoice] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  function move() {
    const target = otherMenus.find((candidate) => candidate.id === choice);
    if (!target) {
      setMissing(true);
      announce(strings.choose);
      return;
    }
    startTransition(async () => {
      await saves.run(async () => {
        const result = await saves.call(() =>
          moveSection(code, section.id, target.id),
        );
        if (!result.ok) {
          saves.failChange(
            notMovedSentence(
              strings,
              words,
              sectionGone,
              result.problem,
              section.name,
              target.name,
            ),
          );
          return;
        }
        saves.landed();
        record({
          kind: "relocate",
          id: section.id,
          name: section.name,
          from: { id: menu.id, name: menu.name, order: result.value.order },
          to: { id: target.id, name: target.name },
        });
        setChoice(null);
        sayOnceIn(target.id, movedSentence(strings, section.name, target.name));
      });
    });
  }

  if (otherMenus.length === 0) return null;

  return (
    <div className="mt-10 flex flex-col gap-3">
      <h2 className="text-xl font-bold">{strings.heading}</h2>
      <Select
        label={strings.label}
        placeholder={strings.placeholder}
        items={otherMenus.map((other) => ({ id: other.id, label: other.name }))}
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
