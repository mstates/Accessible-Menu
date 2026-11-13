import type { ReactNode } from "react";

type Props = {
  // For a group the heading names through aria-labelledby, as the dish
  // page's Price heading names its radio group.
  id?: string;
  children: ReactNode;
};

// The heading of one area of an owner page (D-236): an h2 with a rule
// under it, then the area's controls, as GitHub's settings pages have
// them. The page nav picks the page and these move inside it. The rule is
// a border, so it is drawn in forced colors too. A dish's General page is
// its first user, with three (rule 12); the other owner pages take it in
// D-236's own task.
export function AreaHeading({ id, children }: Props) {
  return (
    <h2 id={id} className="border-b border-border pb-2 text-xl font-bold">
      {children}
    </h2>
  );
}
