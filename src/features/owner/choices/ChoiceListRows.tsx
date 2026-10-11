"use client";

import { RowList } from "../editing/RowList";
import type { ChoiceListRow, ChoiceListRowsState } from "./useChoiceListRows";

type Props<Entry extends { kind: string }> = {
  rows: ChoiceListRowsState<Entry>;
};

// The choice lists block on a dish's or a section's page (D-166): the
// heading, the lead, the rows as an ordered list named by the heading,
// each with an h3, and the add form. The page's one status and Undo sit
// outside it, so the rows draw neither.
export function ChoiceListRows<Entry extends { kind: string }>({
  rows,
}: Props<Entry>) {
  return (
    <div className="mt-8 flex flex-col">
      <h2 id={rows.headingId} className="text-xl font-bold">
        {rows.heading}
      </h2>
      <RowList<ChoiceListRow, never, Entry, never>
        list={rows}
        intro={rows.lead}
        status={false}
        rowHeading={3}
        labelledBy={rows.headingId}
      />
    </div>
  );
}
