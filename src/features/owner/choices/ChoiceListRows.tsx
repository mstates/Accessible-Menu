"use client";

import { RowList } from "../editing/RowList";
import type { ChoiceListRow, ChoiceListRowsState } from "./useChoiceListRows";

type Props = {
  rows: ChoiceListRowsState;
};

// The choice lists block on a dish's or a section's page (D-166): the
// heading, the lead, the rows as an ordered list named by the heading,
// each with an h3, and the add form. The page's one status sits outside
// it, so the rows do not draw it.
export function ChoiceListRows({ rows }: Props) {
  return (
    <div className="mt-8 flex flex-col">
      <h2 id={rows.headingId} className="text-xl font-bold">
        {rows.heading}
      </h2>
      <RowList<ChoiceListRow, never, never>
        list={rows}
        intro={rows.lead}
        status={false}
        rowHeading={3}
        labelledBy={rows.headingId}
      />
    </div>
  );
}
