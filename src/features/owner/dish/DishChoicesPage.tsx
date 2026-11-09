"use client";

import { Announcer } from "@/core/a11y/announcer";
import type { OwnerChoiceList } from "@/domain/choices";
import type { ChoiceStrings } from "../choices/choice-words";
import { ChoiceListRows } from "../choices/ChoiceListRows";
import { useChoiceListRows } from "../choices/useChoiceListRows";
import type { EditingStrings } from "../editing/list-words";
import { PageSavedStatus } from "../editing/SavedStatus";
import { useEditing } from "../editing/useEditing";

type Props = {
  strings: ChoiceStrings;
  editing: EditingStrings;
  code: string;
  dish: { id: string };
  // The dish's choice lists, in order, each with how many options it
  // holds (D-166).
  lists: OwnerChoiceList[];
};

// A dish's Choice lists page (D-166, D-222): the lead and the rows
// directly under the h1 that names them, each row an h2 with its link and
// buttons, the add form, then the saved status. The rows share the page's
// one editing state, so the page keeps one queue and one status (D-111,
// D-145).
export function DishChoicesPage(props: Props) {
  return (
    <Announcer>
      <ChoicesEditor {...props} />
    </Announcer>
  );
}

function ChoicesEditor({
  strings,
  editing: editingStrings,
  code,
  dish,
  lists,
}: Props) {
  const editing = useEditing(editingStrings);
  const rows = useChoiceListRows({
    strings,
    editingStrings,
    code,
    home: { kind: "dish", id: dish.id },
    lists,
    shared: editing,
  });

  return (
    <>
      <ChoiceListRows rows={rows} underPageHeading />
      <PageSavedStatus
        strings={editingStrings}
        editing={editing}
        onRetry={rows.tryAgain}
      />
    </>
  );
}
