"use client";

import type { ReactNode } from "react";
import { Text } from "react-aria-components";

type Props = {
  // The field's validity, from React Aria's render props, so an error the
  // server sent through a Form's validationErrors counts as well.
  isInvalid: boolean;
  className: string;
  children: ReactNode;
};

// A field's hint (D-230). While the field is valid, the words sit in React
// Aria's description slot, which ties them to the field by id. While it is
// invalid, the same words sit in a plain span of the same look, so no
// element holds the slot's id and the field is described by its problem
// alone. React Aria looks the description's id up again whenever validity
// changes (useSlotId, keyed on it, as register entry 5 says for D-147) and
// a checkbox's or a radio's follows its element by a ref (useSlotId2), so
// the tie goes while the problem stands and comes back with the slot. The
// words never move or change on screen: Text renders a span too.
export function FieldHint({ isInvalid, className, children }: Props) {
  return isInvalid ? (
    <span className={className}>{children}</span>
  ) : (
    <Text slot="description" className={className}>
      {children}
    </Text>
  );
}
