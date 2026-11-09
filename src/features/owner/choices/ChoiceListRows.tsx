"use client";

import { RowList } from "../editing/RowList";
import type { ChoiceListRow, ChoiceListRowsState } from "./useChoiceListRows";

type Props = {
  rows: ChoiceListRowsState;
  // The rows sit directly under the page's h1, which carries their heading
  // id (D-222, D-225): a dish's Choice lists page. Then no heading is
  // drawn here and each row is an h2.
  underPageHeading?: boolean;
};

// The choice lists block on a dish's Choice lists page or a section's
// page (D-166, D-222): the heading where the page does not carry it, the
// lead, the rows as an ordered list named by the heading, each with its
// own heading, and the add form. The page's one status sits outside it, so
// the rows do not draw it.
export function ChoiceListRows({ rows, underPageHeading = false }: Props) {
  return (
    <div className="mt-8 flex flex-col">
      {underPageHeading ? null : (
        <h2 id={rows.headingId} className="text-xl font-bold">
          {rows.heading}
        </h2>
      )}
      <RowList<ChoiceListRow, never, never>
        list={rows}
        intro={rows.lead}
        status={false}
        rowHeading={underPageHeading ? 2 : 3}
        labelledBy={rows.headingId}
      />
    </div>
  );
}
